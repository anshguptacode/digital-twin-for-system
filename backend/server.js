require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const pino = require('pino');

// Phase 2 Additions
const { InfluxDB, Point } = require('@influxdata/influxdb-client');
const { createAdapter } = require('@socket.io/redis-adapter');
const { createClient } = require('redis');

// Setup Logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' }
  }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3000;
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_FALLBACK_BROKER = process.env.MQTT_FALLBACK_BROKER || 'mqtt://broker.emqx.io:1883';
const MQTT_TOPIC_ENV = 'digital_twin_anshh_991/server_room/env';
const MQTT_TOPIC_CONTROL = 'digital_twin_anshh_991/server_room/control';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_twin_key_123';
const DB_PATH = process.env.DB_PATH || './digital_twin.db';
const DB_DRIVER = process.env.DB_DRIVER || 'sqlite'; // 'sqlite' or 'influxdb'

// Redis Config
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// InfluxDB Config
const INFLUX_URL = process.env.INFLUX_URL || 'http://localhost:8086';
const INFLUX_TOKEN = process.env.INFLUX_TOKEN || 'super_secret_influx_token_123';
const INFLUX_ORG = process.env.INFLUX_ORG || 'digital_twin_org';
const INFLUX_BUCKET = process.env.INFLUX_BUCKET || 'telemetry_bucket';

let writeApi, queryApi;
if (DB_DRIVER === 'influxdb') {
  const influxDB = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
  writeApi = influxDB.getWriteApi(INFLUX_ORG, INFLUX_BUCKET, 'ms');
  queryApi = influxDB.getQueryApi(INFLUX_ORG);
  logger.info(`InfluxDB Driver selected. URL: ${INFLUX_URL}`);
}

// Connect Redis Adapter
const pubClient = createClient({ url: REDIS_URL });
const subClient = pubClient.duplicate();

pubClient.on('error', (err) => logger.warn({err: err.message}, 'Redis Pub Error (Is Redis running?)'));
subClient.on('error', (err) => logger.warn({err: err.message}, 'Redis Sub Error'));

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  logger.info(`Socket.io Redis adapter connected at ${REDIS_URL}`);
}).catch(err => {
  logger.warn('Could not connect to Redis, continuing with in-memory adapter');
});

// Setup SQLite (always used for users and alerts)
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) logger.error({ err }, 'Failed to connect to SQLite database');
  else logger.info(`Connected to the SQLite database at ${DB_PATH}`);
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'viewer'
  )`);
  // Try to add role column if table existed before Phase 2
  db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'viewer'", (err) => { /* ignore if exists */ });

  db.run(`CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id TEXT,
    temperature_c REAL,
    humidity_percent REAL,
    cpu_load REAL,
    ram_usage REAL,
    network_tx REAL,
    network_rx REAL,
    disk_usage REAL,
    ac_on INTEGER,
    timestamp TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sensor_id TEXT,
    severity TEXT,
    message TEXT,
    timestamp TEXT
  )`);

  // Seed user if none exists
  db.get("SELECT * FROM users WHERE username = 'admin'", [], (err, row) => {
    if (!row) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync('password', salt);
      db.run("INSERT INTO users (username, password, role) VALUES (?, ?, ?)", ['admin', hash, 'admin']);
      logger.info("Seeded default admin user");
    }
  });
});

// Schemas
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
const controlSchema = z.object({
  action: z.enum(['TOGGLE_AC', 'TOGGLE_GLOBAL_AC', 'KILL_RACK']),
  target: z.string().optional(),
  state: z.boolean()
});

// Rate Limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many login attempts from this IP, please try again after 15 minutes" },
  standardHeaders: true, legacyHeaders: false,
});

// Phase 3 Intelligence Layer Init
const { GoogleGenAI } = require('@google/genai');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'dummy';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Auth Routes
app.post('/api/login', loginLimiter, (req, res) => {
  const parseResult = loginSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload format' });
  }
  const { username, password } = parseResult.data;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    if (bcrypt.compareSync(password, user.password)) {
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role || 'viewer' }, JWT_SECRET, { expiresIn: '24h' });
      logger.info({ username }, "User logged in successfully");
      res.json({ token, username: user.username, role: user.role || 'viewer' });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  });
});

// Middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token == null) return res.sendStatus(401);
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Phase 3: Ask the Twin Endpoint
app.post('/api/chat', authenticateToken, async (req, res) => {
  if (GEMINI_API_KEY === 'dummy') return res.status(501).json({ error: 'Gemini API Key not configured in .env' });
  try {
    const prompt = req.body.prompt;
    const systemInstruction = "You are the AI assistant for a Server Room Digital Twin. Here is the latest state of the racks: " + JSON.stringify(latestMetrics);
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { systemInstruction }
    });
    res.json({ reply: response.text });
  } catch (err) {
    logger.error({err: err.message}, 'Gemini API error');
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db_driver: DB_DRIVER,
    mqtt_connected: mqttClient.connected,
    redis_connected: pubClient.isReady
  });
});

app.get('/api/export', authenticateToken, (req, res) => {
  if (DB_DRIVER === 'influxdb') {
     return res.status(501).json({ error: 'Export not yet implemented for InfluxDB' });
  }
  db.all("SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT 5000", [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    res.json(rows);
  });
});

app.get('/api/history', authenticateToken, (req, res) => {
  if (DB_DRIVER === 'influxdb' && queryApi) {
    const fluxQuery = `
      from(bucket:"${INFLUX_BUCKET}") 
      |> range(start: -1h)
      |> filter(fn: (r) => r._measurement == "rack_telemetry")
      |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> sort(columns: ["_time"], desc: true)
      |> limit(n: 300)
    `;
    const results = [];
    queryApi.queryRows(fluxQuery, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        results.push({
          sensor_id: o.sensor_id,
          temperature_c: o.temperature_c,
          humidity_percent: o.humidity_percent,
          cpu_load: o.cpu_load,
          ram_usage: o.ram_usage,
          network_tx: o.network_tx,
          network_rx: o.network_rx,
          disk_usage: o.disk_usage,
          ac_on: o.ac_on,
          timestamp: o._time
        });
      },
      error(error) {
        logger.error({ error }, "InfluxDB Query Error");
        res.status(500).json({ error: 'Internal server error' });
      },
      complete() {
        res.json(results.reverse());
      },
    });
  } else {
    db.all("SELECT * FROM telemetry ORDER BY timestamp DESC LIMIT 300", [], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      rows.forEach(row => row.ac_on = !!row.ac_on);
      res.json(rows.reverse());
    });
  }
});

app.get('/api/alerts', authenticateToken, (req, res) => {
  db.all("SELECT * FROM alerts ORDER BY timestamp DESC LIMIT 50", [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Internal server error' });
    res.json(rows);
  });
});

// MQTT Logic
let mqttClient = mqtt.connect(MQTT_BROKER, { protocolVersion: 4, connectTimeout: 3000 });

mqttClient.on('connect', () => {
  logger.info(`Connected to primary MQTT broker at ${MQTT_BROKER}`);
  mqttClient.subscribe(MQTT_TOPIC_ENV, (err) => {
    if (!err) logger.info(`Subscribed to topic: ${MQTT_TOPIC_ENV}`);
  });
});

mqttClient.on('error', (err) => {
  logger.warn(`Primary broker connection failed (${MQTT_BROKER}), falling back to ${MQTT_FALLBACK_BROKER}...`);
  mqttClient.end();
  
  mqttClient = mqtt.connect(MQTT_FALLBACK_BROKER, { protocolVersion: 4 });
  mqttClient.on('connect', () => {
    logger.info(`Connected to fallback MQTT broker at ${MQTT_FALLBACK_BROKER}`);
    mqttClient.subscribe(MQTT_TOPIC_ENV);
  });
  mqttClient.on('message', handleMqttMessage);
});

// Nodemailer Setup
const nodemailer = require('nodemailer');
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.ethereal.email';
const SMTP_PORT = process.env.SMTP_PORT || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ALERT_EMAIL = process.env.ALERT_EMAIL;

let mailTransporter;
if (SMTP_USER && SMTP_PASS) {
  mailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  logger.info('Nodemailer configured');
}

// Alert Escalation & Intelligence State
const recentCriticalAlerts = {};
const rackHistory = {};
const latestMetrics = {};

function handleMqttMessage(topic, message) {
  if (topic === MQTT_TOPIC_ENV) {
    try {
      const payload = JSON.parse(message.toString());
      
      // Update global metrics for PUE and Chat Assistant
      latestMetrics[payload.sensor_id] = payload;
      
      // PUE Calculation
      let itPower = 0;
      let coolingPower = 0;
      Object.values(latestMetrics).forEach(m => {
        itPower += Math.max(m.cpu_load, 1) * 5;
        coolingPower += m.ac_on ? 1000 : 100;
      });
      payload.pue = parseFloat(((itPower + coolingPower) / (itPower || 1)).toFixed(2));

      // Predictive Maintenance (Moving Average)
      if (!rackHistory[payload.sensor_id]) rackHistory[payload.sensor_id] = [];
      rackHistory[payload.sensor_id].push({ temp: payload.temperature_c, time: new Date(payload.timestamp).getTime() });
      if (rackHistory[payload.sensor_id].length > 5) rackHistory[payload.sensor_id].shift();

      let timeTo28C = -1;
      if (rackHistory[payload.sensor_id].length === 5) {
        const first = rackHistory[payload.sensor_id][0];
        const last = rackHistory[payload.sensor_id][4];
        const dt = (last.time - first.time) / 1000;
        const dTemp = last.temp - first.temp;
        if (dTemp > 0) {
          const slope = dTemp / dt;
          const remainingTemp = 28.0 - last.temp;
          if (remainingTemp > 0) timeTo28C = Math.round(remainingTemp / slope);
        }
      }
      payload.time_to_critical_sec = timeTo28C;

      // Save Telemetry
      if (DB_DRIVER === 'influxdb' && writeApi) {
        const point = new Point('rack_telemetry')
          .tag('sensor_id', payload.sensor_id)
          .floatField('temperature_c', payload.temperature_c)
          .floatField('humidity_percent', payload.humidity_percent)
          .floatField('cpu_load', payload.cpu_load)
          .floatField('ram_usage', payload.ram_usage)
          .floatField('network_tx', payload.network_tx || 0)
          .floatField('network_rx', payload.network_rx || 0)
          .floatField('disk_usage', payload.disk_usage || 0)
          .booleanField('ac_on', payload.ac_on ? true : false)
          .timestamp(new Date(payload.timestamp));
        writeApi.writePoint(point);
      } else {
        const stmt = db.prepare(`INSERT INTO telemetry 
          (sensor_id, temperature_c, humidity_percent, cpu_load, ram_usage, network_tx, network_rx, disk_usage, ac_on, timestamp) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(
          payload.sensor_id, payload.temperature_c, payload.humidity_percent, payload.cpu_load, 
          payload.ram_usage, payload.network_tx || 0, payload.network_rx || 0, payload.disk_usage || 0, 
          payload.ac_on ? 1 : 0, payload.timestamp,
          (err) => { if (err) logger.error({ err: err.message }, 'SQLite Telemetry Insert Error'); }
        );
        stmt.finalize();
      }

      // Anomaly Detection & Escalation
      if (payload.temperature_c > 28.0) {
        // Track for escalation
        const now = new Date(payload.timestamp).getTime();
        if (!recentCriticalAlerts[payload.sensor_id]) recentCriticalAlerts[payload.sensor_id] = [];
        recentCriticalAlerts[payload.sensor_id].push(now);
        recentCriticalAlerts[payload.sensor_id] = recentCriticalAlerts[payload.sensor_id].filter(t => now - t <= 5 * 60 * 1000);
        
        const isEscalated = recentCriticalAlerts[payload.sensor_id].length > 3;
        const severity = isEscalated ? 'Fatal' : 'Critical';
        const msg = isEscalated ? `FATAL: Repeated critical temperatures on ${payload.sensor_id}` : `Temperature critically high: ${payload.temperature_c.toFixed(1)}°C`;
        
        db.run("INSERT INTO alerts (sensor_id, severity, message, timestamp) VALUES (?, ?, ?, ?)",
          [payload.sensor_id, severity, msg, payload.timestamp],
          (err) => { if (err) logger.error({ err: err.message }, 'SQLite Alert Insert Error'); }
        );
        io.emit('alert', { sensor_id: payload.sensor_id, severity, message: msg, timestamp: payload.timestamp });
        
        if (isEscalated) {
          recentCriticalAlerts[payload.sensor_id] = []; // reset after fatal
          if (mailTransporter && ALERT_EMAIL) {
            mailTransporter.sendMail({
              from: SMTP_USER,
              to: ALERT_EMAIL,
              subject: `FATAL ALERT: ${payload.sensor_id}`,
              text: `The digital twin detected a fatal alert on ${payload.sensor_id}. Temperature: ${payload.temperature_c}C`
            }).catch(e => logger.error({err: e.message}, 'Failed to send alert email'));
          }
        }
      } else if (payload.cpu_load > 95) {
         db.run("INSERT INTO alerts (sensor_id, severity, message, timestamp) VALUES (?, ?, ?, ?)",
          [payload.sensor_id, 'Warning', `CPU load spiking: ${payload.cpu_load.toFixed(1)}%`, payload.timestamp],
          (err) => { if (err) logger.error({ err: err.message }, 'SQLite Alert Insert Error'); }
        );
         io.emit('alert', { sensor_id: payload.sensor_id, severity: 'Warning', message: `CPU load spiking: ${payload.cpu_load.toFixed(1)}%`, timestamp: payload.timestamp });
      }

      io.emit('telemetry', payload);
    } catch (error) {
      logger.error({ error }, 'Error processing MQTT message');
    }
  }
}
mqttClient.on('message', handleMqttMessage);

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Authentication error"));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Authentication error"));
        socket.user = decoded; // { id, username, role }
        next();
    });
});

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id, user: socket.user.username, role: socket.user.role }, 'Frontend client connected');
  
  socket.on('control', (command) => {
    if (socket.user.role !== 'admin') {
      logger.warn({ user: socket.user.username }, 'Unauthorized control attempt');
      socket.emit('alert', { severity: 'Warning', message: 'Unauthorized: Admin role required for AC control.' });
      return;
    }

    const parseResult = controlSchema.safeParse(command);
    if (!parseResult.success) return;
    
    logger.info({ command: parseResult.data, user: socket.user.username }, 'Received verified control command');
    mqttClient.publish(MQTT_TOPIC_CONTROL, JSON.stringify(parseResult.data));
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    logger.info(`Backend server listening on port ${PORT}`);
  });
}

module.exports = app;
