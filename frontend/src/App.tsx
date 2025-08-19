// frontend/src/App.tsx
// SmartOps AI Agent - React Frontend Dashboard

import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';

// Components
import Navbar from './components/Navbar';
import Dashboard from './components/Dashboard';
import AIChat from './components/AIChat';
import MonitoringDashboard from './components/MonitoringDashboard';
import SimulationManager from './components/SimulationManager';
import LoginForm from './components/LoginForm';

// Hooks and utilities
import { useAuth } from './hooks/useAuth';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';

// Styles
import './App.css';

// Create QueryClient for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
    },
  },
});

function App() {
  const [systemHealth, setSystemHealth] = useState('Checking...');
  const [aiResponse, setAiResponse] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    // Check AI service health
    fetch('/api/ai/health')
      .then(res => res.json())
      .then(data => setSystemHealth(data.status))
      .catch(() => setSystemHealth('Disconnected'));
  }, []);

  const handleAiQuery = async () => {
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const data = await response.json();
      setAiResponse(data.response);
    } catch (error) {
      setAiResponse('Error connecting to AI service');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>SmartOps AI Agent Platform</h1>
        <p>System Status: <span className={systemHealth === 'healthy' ? 'healthy' : 'error'}>{systemHealth}</span></p>

        <div className="ai-chat">
          <h2>AI Monitoring Assistant</h2>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about system health, performance, etc."
            onKeyPress={(e) => e.key === 'Enter' && handleAiQuery()}
          />
          <button onClick={handleAiQuery}>Ask AI</button>
          {aiResponse && <div className="ai-response">{aiResponse}</div>}
        </div>
      </header>
    </div>
  );
}

function AppContent() {
  const { isAuthenticated, loading } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      // Initialize WebSocket connection
      const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3000', {
        auth: {
          token: localStorage.getItem('token')
        }
      });

      newSocket.on('connect', () => {
        console.log('🔌 Connected to WebSocket server');
      });

      newSocket.on('disconnect', () => {
        console.log('🔌 Disconnected from WebSocket server');
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [isAuthenticated]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <SocketProvider socket={socket}>
      <div className="flex flex-col min-h-screen">
        <Navbar />
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/monitoring" element={<MonitoringDashboard />} />
            <Route path="/simulations" element={<SimulationManager />} />
            <Route path="/ai-chat" element={<AIChat />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </SocketProvider>
  );
}

export default App;
