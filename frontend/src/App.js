// frontend/src/App.js
// Simplified React App for initial deployment

import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [systemHealth, setSystemHealth] = useState('Checking...');
  const [aiResponse, setAiResponse] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    // Check system health
    fetch('/api/health')
      .catch(() => setSystemHealth('Connecting...'));
  }, []);

  const handleAiQuery = async () => {
    if (!query.trim()) return;
    
    try {
      setAiResponse('AI service is starting up...');
      // This will be connected to actual AI service later
      setTimeout(() => {
        setAiResponse(`Mock response for: "${query}". AI monitoring service will be available once all services are running.`);
      }, 1000);
    } catch (error) {
      setAiResponse('AI service is initializing...');
    }
    setQuery('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleAiQuery();
    }
  };

  return (
    <div className="App">
      <header className="header">
        <h1>🚀 SmartOps AI Agent Platform</h1>
        <p>AI-Powered HPC Monitoring & Analysis Dashboard</p>
        <p>System Status: <span className={systemHealth === 'healthy' ? 'status-healthy' : 'status-loading'}>{systemHealth}</span></p>
      </header>

      <div className="container">
        {/* Service Status Grid */}
        <div className="services-grid">
          <div className="service-card">
            <h3>🔗 API Gateway</h3>
            <p className="status-healthy">Operational</p>
            <p>Core API services and routing</p>
          </div>
          
          <div className="service-card">
            <h3>🗄️ Database</h3>
            <p className="status-healthy">Connected</p>
            <p>PostgreSQL simulation data</p>
          </div>
          
          <div className="service-card">
            <h3>⚡ Redis Cache</h3>
            <p className="status-healthy">Active</p>
            <p>Real-time pub/sub system</p>
          </div>
          
          <div className="service-card">
            <h3>🤖 AI Service</h3>
            <p className="status-loading">Initializing</p>
            <p>LangChain + monitoring analysis</p>
          </div>
          
          <div className="service-card">
            <h3>📊 Prometheus</h3>
            <p className="status-loading">Starting</p>
            <p>Metrics collection system</p>
          </div>
          
          <div className="service-card">
            <h3>📈 Grafana</h3>
            <p className="status-loading">Starting</p>
            <p>Visualization dashboards</p>
          </div>
        </div>

        {/* AI Chat Interface */}
        <div className="ai-chat">
          <h2>🧠 AI Monitoring Assistant</h2>
          <p>Ask questions about system performance, metrics, and analysis</p>
          
          <div className="chat-input">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask about system health, performance, simulations..."
            />
            <button onClick={handleAiQuery}>Send</button>
          </div>
          
          {aiResponse && (
            <div className="ai-response">
              <strong>AI Assistant:</strong> {aiResponse}
            </div>
          )}
        </div>

        {/* Quick Metrics */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-value">5</div>
            <div className="metric-label">Active Services</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">0</div>
            <div className="metric-label">Running Simulations</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">99.9%</div>
            <div className="metric-label">System Uptime</div>
          </div>
          
          <div className="metric-card">
            <div className="metric-value">< 50ms</div>
            <div className="metric-label">API Response Time</div>
          </div>
        </div>

        <div style={{marginTop: '40px', textAlign: 'center', color: '#666'}}>
          <p>🔄 Session 5: React Migration & AI Integration Active</p>
          <p>Access Grafana: <a href="http://localhost:3002" target="_blank" rel="noopener noreferrer">localhost:3002</a> | 
             Prometheus: <a href="http://localhost:9090" target="_blank" rel="noopener noreferrer">localhost:9090</a></p>
        </div>
      </div>
    </div>
  );
}

export default App;
