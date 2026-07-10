# Server Room Digital Twin (Enterprise Edition)

An industry-grade, real-time 3-tier Server Room Digital Twin demonstrating IoT telemetry, predictive analytics, and spatial visualization.

## 🌟 Key Features

### Edge Layer (Python Sensor Simulator)
- Real-world telemetry using `psutil`
- Thermal physics modeling for simulated racks
- Scikit-Learn Isolation Forest for ML Anomaly Detection

### Backend (Node.js & Express)
- Horizontal Scalability with Socket.io Redis Adapter
- Dual Database Support (SQLite & InfluxDB)
- Role-Based Access Control (RBAC) via JWT
- Predictive Maintenance Engine
- Gemini AI Chat Assistant Integration ("Ask the Twin")
- Alert Escalation (Critical -> Fatal) & Email Notifications via Nodemailer

### Frontend (React & WebGL)
- 3D Spatial Floor Plan via React Three Fiber
- Real-time gauge metrics (Temperature, Humidity, CPU, RAM, Disk, Net I/O)
- Progressive Web App (PWA) Support
- Chaos Engineering UI ("Kill Rack")

## 🚀 Quick Start (Docker Compose)

The easiest way to run the entire stack is via Docker Compose:

```bash
docker-compose up --build
```
Services exposed:
- Frontend: `http://localhost:80` (NGINX)
- Backend: `http://localhost:3000`
- InfluxDB: `http://localhost:8086`

## 🛠️ Local Development

### Prerequisites
- Node.js (v20+)
- Python (3.10+)
- Redis & MQTT Broker (EMQX or Mosquitto)

### 1. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
npm start
```

### 2. Edge Agent
```bash
cd sensor-simulator
pip install -r requirements.txt
python sensor.py
```

### 3. Frontend Dashboard
```bash
cd dashboard
npm install
npm run dev
```

## 🧪 Testing

We use Jest and Pytest for validation:

```bash
# Backend
cd backend && npm test

# Edge
cd sensor-simulator && pytest
```

## ☸️ Kubernetes Deployment
Check out the `k8s/` folder for `frontend.yaml` and `backend.yaml` manifests.

---
Built as a portfolio-grade demonstration of full-stack engineering, DevOps, and ML integration.
