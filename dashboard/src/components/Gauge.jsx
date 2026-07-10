import React from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export default function Gauge({ value, min, max, label, unit, color, isAlert }) {
  // Calculate percentage
  const percentage = Math.min(Math.max((value - min) / (max - min), 0), 1);
  
  // Create data for the pie chart (acting as a semi-circle gauge)
  const data = [
    { name: 'Value', value: percentage },
    { name: 'Empty', value: 1 - percentage }
  ];

  const COLORS = [color, 'rgba(255, 255, 255, 0.1)'];

  return (
    <div className={`glass-card ${isAlert ? 'alert' : ''}`}>
      <div className="card-header">
        <h3 className="card-title">{label}</h3>
      </div>
      
      <div className="gauge-container">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="70%"
              startAngle={180}
              endAngle={0}
              innerRadius="70%"
              outerRadius="100%"
              paddingAngle={0}
              dataKey="value"
              stroke="none"
              cornerRadius={8}
              isAnimationActive={false}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        
        <div style={{ position: 'absolute', bottom: '15%', textAlign: 'center' }}>
          <div className="metric-value" style={{ color: isAlert ? '#ef4444' : '#f8fafc' }}>
            {value.toFixed(1)}<span className="metric-unit">{unit}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
