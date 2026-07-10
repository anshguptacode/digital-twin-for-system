import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { Activity, AlertTriangle, Server, Thermometer, Droplets, Cpu, MemoryStick, Fan, HardDrive, Wifi, LogOut } from 'lucide-react';
import Gauge from './components/Gauge';
import Login from './components/Login';
import AlertLog from './components/AlertLog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || '';
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined;

import WebGLMap from './components/WebGLMap';

function App() {
  const [token, setToken] = useState(localStorage.getItem('twin_token'));
  const [userRole, setUserRole] = useState(localStorage.getItem('twin_role') || 'viewer');
  const [telemetry, setTelemetry] = useState({});
  const [history, setHistory] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedRack, setSelectedRack] = useState('rack_A');
  const [globalAc, setGlobalAc] = useState(false);
  const [theme, setTheme] = useState('dark');
  const [socket, setSocket] = useState(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');

  useEffect(() => {
    if (!token) return;

    fetch(`${API_URL}/api/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) throw new Error('Unauthorized');
        return res.json();
      })
      .then(data => setHistory(data))
      .catch(err => {
        console.error("Failed to fetch history", err);
        handleLogout();
      });

    fetch(`${API_URL}/api/alerts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAlerts(data))
      .catch(err => console.error("Failed to fetch alerts", err));

    const newSocket = io(SOCKET_URL, { auth: { token } });
    setSocket(newSocket);

    newSocket.on('connect', () => setIsConnected(true));
    newSocket.on('connect_error', (err) => {
      if (err.message === 'Authentication error') handleLogout();
    });
    newSocket.on('disconnect', () => setIsConnected(false));

    newSocket.on('alert', (alertData) => {
      setAlerts(prev => [alertData, ...prev]);
    });

    newSocket.on('telemetry', (data) => {
      setTelemetry(prev => ({ ...prev, [data.sensor_id]: data }));
      setHistory(prev => {
        const newHistory = [...prev, data];
        if (newHistory.length > 200) newHistory.shift();
        return newHistory;
      });
    });

    return () => newSocket.disconnect();
  }, [token]);

  const handleLogout = () => {
    localStorage.removeItem('twin_token');
    localStorage.removeItem('twin_role');
    setToken(null);
  };

  const toggleGlobalAC = () => {
    const newState = !globalAc;
    setGlobalAc(newState);
    if (socket) socket.emit('control', { action: 'TOGGLE_GLOBAL_AC', state: newState });
  };

  const toggleRackAC = (rackId, currentState) => {
    if (socket) socket.emit('control', { action: 'TOGGLE_AC', target: rackId, state: !currentState });
  };
  
  const killRack = (rackId) => {
    if (socket) socket.emit('control', { action: 'KILL_RACK', target: rackId, state: true });
  }

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  useEffect(() => { document.body.className = theme; }, [theme]);

  const sendChatMessage = async () => {
    if (!chatInput) return;
    setChatResponse('Thinking...');
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ prompt: chatInput })
      });
      const data = await res.json();
      setChatResponse(data.reply || data.error);
    } catch (e) {
      setChatResponse('Error generating response.');
    }
  };

  const currentData = telemetry[selectedRack] || {
    temperature_c: 24, humidity_percent: 50, cpu_load: 0, ram_usage: 0, 
    network_tx: 0, network_rx: 0, disk_usage: 0, ac_on: false, timestamp: new Date().toISOString()
  };

  const isTempCritical = currentData.temperature_c > 28.0;

  const chartData = useMemo(() => {
    return history
      .filter(item => item.sensor_id === selectedRack)
      .map(item => ({
        time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        Temperature: item.temperature_c,
        Humidity: item.humidity_percent
      }));
  }, [history, selectedRack]);

  if (!token) {
    return <Login onLoginSuccess={(t, r) => { setToken(t); setUserRole(r); localStorage.setItem('twin_role', r); }} />;
  }

  return (
    <div className={`dashboard-container ${theme}`}>
      <header className="header">
        <div>
          <h1>Server Room Digital Twin</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Advanced Monitoring & Control (Role: {userRole})</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          {userRole === 'admin' && (
            <button className={`ac-button ${globalAc ? 'active' : ''}`} onClick={toggleGlobalAC}>
              <Fan size={18} className={globalAc ? 'spin' : ''} />
              {globalAc ? 'Global AC: ON' : 'Global AC: OFF'}
            </button>
          )}
          <div className={`status-badge ${!isConnected ? 'critical' : ''}`}>
            <div className="status-dot"></div>
            {isConnected ? 'Live' : 'Offline'}
          </div>
          <button onClick={handleLogout} className="logout-btn"><LogOut size={18} /></button>
        </div>
      </header>

      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <button className={`tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        <button className={`tab-btn ${activeTab === 'assistant' ? 'active' : ''}`} onClick={() => setActiveTab('assistant')}>Ask the Twin</button>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <div className="glass-card map-card" style={{ marginBottom: '2rem' }}>
            <div className="card-header">
              <h3 className="card-title">Server Room Floor Plan (WebGL)</h3>
            </div>
            <WebGLMap telemetry={telemetry} selectedRack={selectedRack} setSelectedRack={setSelectedRack} />
          </div>

      {isTempCritical && (
        <div className="alert-banner">
          <AlertTriangle color="#ef4444" size={24} />
          <div>
            <strong>Critical Alert for {selectedRack}:</strong> Temperature exceeded safe threshold (28°C). Current: {currentData.temperature_c.toFixed(1)}°C
          </div>
        </div>
      )}

      {/* Details for Selected Rack */}
      <div className="selected-rack-header">
        <h2>{selectedRack.replace('_', ' ').toUpperCase()} Details</h2>
        <button 
          className={`ac-button small ${currentData.ac_on ? 'active' : ''}`}
          onClick={() => toggleRackAC(selectedRack, currentData.ac_on)}
        >
          <Fan size={14} className={currentData.ac_on ? 'spin' : ''} />
          {currentData.ac_on ? 'Rack AC ON' : 'Rack AC OFF'}
        </button>
      </div>

      <div className="grid-container">
        <Gauge 
          value={currentData.temperature_c} 
          min={15} max={40} 
          label="Temperature" 
          unit="°C" 
          color={isTempCritical ? '#ef4444' : '#3b82f6'} 
          isAlert={isTempCritical}
        />
        <Gauge 
          value={currentData.humidity_percent} 
          min={20} max={80} 
          label="Humidity" 
          unit="%" 
          color="#10b981" 
          isAlert={false}
        />
        
        <div className="glass-card">
          <div className="card-header">
            <h3 className="card-title">Server Metrics</h3>
            <Server className="card-icon" />
          </div>
          <div className="metrics-list">
            <div className="metric-row">
              <Cpu size={20} color="#a855f7" />
              <span>CPU Load</span>
              <strong>{currentData.cpu_load}%</strong>
            </div>
            <div className="metric-progress-bar">
              <div className="progress-fill" style={{ width: `${currentData.cpu_load}%`, backgroundColor: '#a855f7' }}></div>
            </div>

            <div className="metric-row mt-4">
              <MemoryStick size={20} color="#f59e0b" />
              <span>RAM Usage</span>
              <strong>{currentData.ram_usage}%</strong>
            </div>
            <div className="metric-progress-bar">
              <div className="progress-fill" style={{ width: `${currentData.ram_usage}%`, backgroundColor: '#f59e0b' }}></div>
            </div>

            <div className="metric-row mt-4">
              <HardDrive size={20} color="#6366f1" />
              <span>Disk Usage</span>
              <strong>{currentData.disk_usage || 0}%</strong>
            </div>
            <div className="metric-progress-bar">
              <div className="progress-fill" style={{ width: `${currentData.disk_usage || 0}%`, backgroundColor: '#6366f1' }}></div>
            </div>

            <div className="metric-row mt-4">
              <Wifi size={20} color="#0ea5e9" />
              <span>Network I/O</span>
              <strong style={{ fontSize: '0.85rem' }}>↑{currentData.network_tx?.toFixed(1)}MB ↓{currentData.network_rx?.toFixed(1)}MB</strong>
            </div>
          </div>
        </div>
      </div>

        <div className="grid-container" style={{ gridTemplateColumns: '2fr 1fr' }}>
          {/* Historical Chart */}
          <div className="glass-card">
             <div className="card-header">
              <h3 className="card-title">Historical Trends ({selectedRack})</h3>
              <Activity className="card-icon" />
            </div>
            <div className="history-chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} />
                  <YAxis yAxisId="left" stroke="#3b82f6" fontSize={12} domain={['dataMin - 2', 'dataMax + 2']} />
                  <YAxis yAxisId="right" orientation="right" stroke="#10b981" fontSize={12} domain={[20, 80]} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.9)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="Temperature" stroke="#3b82f6" strokeWidth={3} dot={false} activeDot={{ r: 8 }} />
                  <Line yAxisId="right" type="monotone" dataKey="Humidity" stroke="#10b981" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Alert Log */}
          <AlertLog alerts={alerts} />
        </div>
        </>
      )}

      {activeTab === 'assistant' && (
        <div className="glass-card">
          <div className="card-header">
            <h3 className="card-title">Ask the Twin (AI Assistant)</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '300px' }}>
            <div style={{ flex: 1, backgroundColor: 'var(--surface)', padding: '1rem', borderRadius: '8px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
              {chatResponse || 'Hello! I am your AI assistant. Ask me about the server room state or anomaly alerts.'}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                placeholder="Ask something (e.g. 'What is the current PUE?')" 
                style={{ flex: 1, padding: '0.75rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'var(--background)', color: 'var(--text)' }}
              />
              <button onClick={sendChatMessage} className="ac-button active">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
