import React, { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, ShieldCheck } from 'lucide-react';

function AlertLog({ token }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    fetch('http://localhost:3000/api/alerts', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => setAlerts(data))
      .catch(err => console.error(err));
  }, [token]);

  return (
    <div className="glass-card alert-log-card">
      <div className="card-header">
        <h3 className="card-title">Incident Alert Log</h3>
        <ShieldCheck className="card-icon" />
      </div>
      
      <div className="alert-list">
        {alerts.length === 0 ? (
          <div className="no-alerts">No incidents recorded. Infrastructure is healthy.</div>
        ) : (
          alerts.map(alert => (
            <div key={alert.id} className={`alert-item ${alert.severity.toLowerCase()}`}>
              <div className="alert-icon">
                {alert.severity === 'Critical' ? <AlertCircle size={20} /> : <AlertTriangle size={20} />}
              </div>
              <div className="alert-content">
                <div className="alert-meta">
                  <span className="alert-rack">{alert.sensor_id}</span>
                  <span className="alert-time">{new Date(alert.timestamp).toLocaleString()}</span>
                </div>
                <div className="alert-message">{alert.message}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default AlertLog;
