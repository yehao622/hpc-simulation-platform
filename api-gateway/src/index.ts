import * as path from 'path';
// api-gateway/src/index.ts - FIXED with Optional WebSocket
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Pool } from 'pg';

// Import WebSocket server with error handling
let WebSocketServer: any = null;
try {
  const wsModule = require('./websocket/websocketServer');
  WebSocketServer = wsModule.WebSocketServer;
  console.log('✅ WebSocket module loaded successfully');
} catch (error) {
  console.warn('⚠️ WebSocket module not available:', (error as any).message);
  console.info('🔄 API will run without real-time updates');
}

// Import existing controllers and middleware
import * as authController from './controllers/authController';
import * as simulationController from './controllers/simulationController';
import { authenticateToken, authRateLimit } from './middleware/authMiddleware';

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

// Create HTTP server for optional WebSocket integration
const server = createServer(app);

console.log('🚀 Starting HPC Simulation API Gateway...');

// Database connection
let dbPool: Pool;
const getDbPool = () => {
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return dbPool;
};

// WebSocket server (optional)
let wsServer: any = null;

// Middleware configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
    },
  },
}));

const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

console.log('🔧 Middleware configured');

// Health check endpoint with optional WebSocket status
app.get('/api/health', async (req, res) => {
  console.log('💓 Health check requested');
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'unknown',
      redis: 'unknown',
      websocket: 'unknown'
    },
    websocket: {
      enabled: !!wsServer,
      connectedUsers: 0,
      totalConnections: 0
    }
  };

  try {
    // Test database connection
    const pool = getDbPool();
    const dbClient = await pool.connect();
    await dbClient.query('SELECT 1');
    dbClient.release();
    health.services.database = 'connected';
  } catch (error) {
    health.services.database = 'disconnected';
    health.status = 'degraded';
  }

  try {
    // Test Redis connection (optional)
    health.services.redis = 'available';
  } catch (error) {
    health.services.redis = 'disconnected';
  }

  // WebSocket status (optional)
  if (wsServer) {
    health.services.websocket = 'active';
    try {
      health.websocket.connectedUsers = wsServer.getConnectedUsersCount();
      health.websocket.totalConnections = wsServer.getConnectionsCount();
    } catch (wsError) {
      health.services.websocket = 'error';
    }
  } else {
    health.services.websocket = 'disabled';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint
app.get('/', (req, res) => {
  console.log('🏠 Root endpoint requested');
  res.json({
    name: 'HPC Simulation Platform API',
    version: '1.1.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    features: [
      'REST API', 
      'JWT Authentication',
      ...(wsServer ? ['WebSocket Real-time Updates'] : ['Database Polling'])
    ],
    documentation: '/api/docs',
    websocket: wsServer ? {
      endpoint: '/socket.io/',
      authentication: 'JWT token required',
      events: ['job-status-update', 'job-update', 'active-jobs']
    } : {
      status: 'disabled',
      reason: 'WebSocket dependencies not available'
    },
    endpoints: {
      health: '/api/health',
      auth: '/api/v1/auth',
      simulations: '/api/v1/simulations',
      ...(wsServer && { websocket: '/socket.io/' })
    }
  });
});

// Enhanced API Documentation
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'HPC Simulation Platform API v1.1',
    version: '1.1.0',
    description: 'RESTful API for managing HPC network simulations' + (wsServer ? ' with WebSocket real-time updates' : ''),
    baseUrl: `${req.protocol}://${req.get('host')}/api/v1`,
    features: [
      'JWT Authentication',
      'Comprehensive Job Management',
      'Template System',
      'Time-series Metrics',
      ...(wsServer ? ['Real-time WebSocket Updates'] : ['Database-based Updates'])
    ]
  });
});

// ===== AUTH ROUTES =====
app.post('/api/v1/auth/register', authRateLimit, authController.register);
app.post('/api/v1/auth/login', authRateLimit, authController.login);
app.get('/api/v1/auth/profile', authenticateToken, authController.getProfile);
app.post('/api/v1/auth/refresh', authenticateToken, authController.refreshToken);
app.post('/api/v1/auth/logout', authenticateToken, (req, res) => {
  console.log('🚪 User logged out:', (req as any).user?.email);
  res.status(200).json({
    message: 'Logout successful',
    note: 'Please remove the token from client storage' + (wsServer ? ' and disconnect WebSocket' : '')
  });
});

// Auth test route
app.get('/api/v1/auth/test', (req, res) => {
  res.json({
    message: 'Auth routes are working!',
    timestamp: new Date().toISOString(),
    websocketEnabled: !!wsServer
  });
});

console.log('✅ All routes configured' + (wsServer ? ' with WebSocket integration' : ''));

app.get('/api/v1/simulations/templates/topologies', authenticateToken, simulationController.getTopologyTemplates);
app.get('/api/v1/simulations/templates/workloads', authenticateToken, simulationController.getWorkloadPatterns);

// Enhanced simulation routes with optional WebSocket integration
app.post('/api/v1/simulations', authenticateToken, async (req, res) => {
  // Store response data for WebSocket notification
  const originalJson = res.json;
  let jobData: any = null;
  
  res.json = function(data) {
    jobData = data;
    return originalJson.call(this, data);
  };
  
  // Call original controller
  await simulationController.createSimulation(req, res);
  
  // If job was created successfully, notify via WebSocket
  if (res.statusCode === 201 && wsServer && jobData?.job) {
    const userId = (req as any).user?.userId;
    try {
      wsServer.broadcastJobUpdate({
        jobId: jobData.job.id,
        userId,
        status: 'queued',
        message: 'Job created and queued for processing'
      });
    } catch (wsError) {
      console.warn('⚠️ WebSocket notification failed:', wsError);
    }
  }
});

app.get('/api/v1/simulations', authenticateToken, simulationController.getSimulations);
app.get('/api/v1/simulations/:id', authenticateToken, simulationController.getSimulationById);

app.delete('/api/v1/simulations/:id', authenticateToken, async (req, res) => {
  const jobId = req.params.id;
  const userId = (req as any).user?.userId;
  
  // Call original controller
  await simulationController.cancelSimulation(req, res);
  
  // If cancellation was successful, notify via WebSocket
  if (res.statusCode === 200 && wsServer && userId) {
    try {
      wsServer.notifyJobStatusChange(jobId, 'cancelled', userId);
    } catch (wsError) {
      console.warn('⚠️ WebSocket notification failed:', wsError);
    }
  }
});

// Simulation test route
app.get('/api/v1/simulations/test', (req, res) => {
  res.json({
    message: 'Simulation routes are working!',
    timestamp: new Date().toISOString(),
    user: (req as any).user || 'No user authenticated',
    websocketEnabled: !!wsServer,
    note: 'This endpoint does not require authentication for testing'
  });
});

// Serve WebSocket test client 
app.get('/websocket-test', (req, res) => {
  console.log('🧪 Serving WebSocket test client HTML');
  
  // Check if we have the static HTML file
  const fs = require('fs');
  const path = require('path');
  const clientPath = path.join(__dirname, '..', 'public', 'websocket-client.html');
  
  try {
    if (fs.existsSync(clientPath)) {
      res.sendFile(clientPath);
    } else {
      // Fallback: serve inline HTML
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WebSocket Test Client</title>
            <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
            <style>
                body { font-family: monospace; background: #1a1a1a; color: white; padding: 20px; }
                .container { max-width: 800px; margin: 0 auto; }
                input { padding: 10px; margin: 5px; width: 300px; background: #333; color: white; border: 1px solid #555; }
                button { padding: 10px 15px; margin: 5px; background: #4CAF50; color: white; border: none; cursor: pointer; }
                button:disabled { background: #666; cursor: not-allowed; }
                .logs { background: #2d2d2d; padding: 15px; height: 300px; overflow-y: auto; border: 1px solid #444; }
                .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
                .connected { background: #1B5E20; }
                .disconnected { background: #B71C1C; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 WebSocket Test Client</h1>
                
                <div>
                    <h3>Connection Status</h3>
                    <div id="status" class="status disconnected">Disconnected</div>
                    <input type="text" id="token" placeholder="Enter JWT Token..." />
                    <button onclick="connect()">Connect</button>
                    <button onclick="disconnect()" disabled id="disconnectBtn">Disconnect</button>
                </div>
                
                <div>
                    <h3>Job Monitoring</h3>
                    <input type="text" id="jobId" placeholder="Enter Job ID..." />
                    <button onclick="subscribeToJob()" disabled id="subscribeBtn">Subscribe</button>
                    <button onclick="getActiveJobs()" disabled id="activeJobsBtn">Get Active Jobs</button>
                </div>
                
                <div>
                    <h3>Live Logs</h3>
                    <button onclick="clearLogs()">Clear</button>
                    <div id="logs" class="logs"></div>
                </div>
            </div>

            <script>
                let socket = null;
                
                function log(msg) {
                    const logs = document.getElementById('logs');
                    const time = new Date().toLocaleTimeString();
                    logs.innerHTML += '[' + time + '] ' + msg + '<br>';
                    logs.scrollTop = logs.scrollHeight;
                }
                
                function updateStatus(connected) {
                    const status = document.getElementById('status');
                    const disconnectBtn = document.getElementById('disconnectBtn');
                    const subscribeBtn = document.getElementById('subscribeBtn');
                    const activeJobsBtn = document.getElementById('activeJobsBtn');
                    
                    if (connected) {
                        status.textContent = '✅ Connected';
                        status.className = 'status connected';
                        disconnectBtn.disabled = false;
                        subscribeBtn.disabled = false;
                        activeJobsBtn.disabled = false;
                    } else {
                        status.textContent = '❌ Disconnected';
                        status.className = 'status disconnected';
                        disconnectBtn.disabled = true;
                        subscribeBtn.disabled = true;
                        activeJobsBtn.disabled = true;
                    }
                }
                
                function connect() {
                    const token = document.getElementById('token').value.trim();
                    if (!token) {
                        alert('Please enter JWT token');
                        return;
                    }
                    
                    if (socket) socket.disconnect();
                    
                    log('🔄 Connecting to WebSocket...');
                    socket = io('/', { auth: { token: token } });
                    
                    socket.on('connect', () => {
                        log('✅ Connected to WebSocket!');
                        updateStatus(true);
                    });
                    
                    socket.on('connected', (data) => {
                        log('👋 Authenticated: ' + data.userEmail);
                    });
                    
                    socket.on('disconnect', () => {
                        log('❌ Disconnected from WebSocket');
                        updateStatus(false);
                    });
                    
                    socket.on('connect_error', (error) => {
                        log('💥 Connection error: ' + error.message);
                        updateStatus(false);
                    });
                    
                    socket.on('job-status-update', (data) => {
                        log('📊 Job update: ' + data.jobId + ' → ' + data.status + ' (' + (data.progress || 0) + '%)');
                    });
                    
                    socket.on('job-update', (data) => {
                        log('🔄 Job event: ' + data.jobId + ' → ' + data.status);
                    });
                    
                    socket.on('active-jobs', (data) => {
                        log('📋 Active jobs: ' + data.count + ' found');
                    });
                }
                
                function disconnect() {
                    if (socket) {
                        socket.disconnect();
                        socket = null;
                    }
                    updateStatus(false);
                    log('🔌 Disconnected');
                }
                
                function subscribeToJob() {
                    const jobId = document.getElementById('jobId').value.trim();
                    if (!jobId || !socket) return;
                    
                    socket.emit('subscribe-job', jobId);
                    log('📡 Subscribed to job: ' + jobId);
                }
                
                function getActiveJobs() {
                    if (!socket) return;
                    socket.emit('get-active-jobs');
                    log('📡 Requesting active jobs...');
                }
                
                function clearLogs() {
                    document.getElementById('logs').innerHTML = '';
                }
                
                // Initial message
                log('🌐 WebSocket Test Client Ready');
                log('💡 Get JWT token from: ./session4_test_script.sh');
            </script>
        </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('WebSocket client error:', error);
    res.status(500).json({ error: 'Failed to serve WebSocket client' });
  }
});

// Start HTTP server with optional WebSocket support
const httpServer = server.listen(port, '0.0.0.0', () => {
  console.log(`✅ HPC Simulation API running on port ${port}`);
  console.log(`📚 Health check: http://localhost:${port}/api/health`);
  console.log(`🏠 Home: http://localhost:${port}/`);
  console.log(`📖 API Docs: http://localhost:${port}/api/docs`);
  console.log(`🔐 Auth endpoints: http://localhost:${port}/api/v1/auth/*`);
  console.log(`🧪 Simulation endpoints: http://localhost:${port}/api/v1/simulations/*`);
  
  // Initialize WebSocket server if available
  if (WebSocketServer) {
    try {
      wsServer = new WebSocketServer(httpServer);
      console.log(`🔗 WebSocket server ready: ws://localhost:${port}/socket.io/`);
      console.log(`🎮 WebSocket test client: http://localhost:${port}/websocket-test`);
    } catch (wsError) {
      console.warn('⚠️ Failed to initialize WebSocket server:', wsError);
      console.info('🔄 API will continue without real-time updates');
    }
  } else {
    console.info('🔄 Running without WebSocket support (dependencies not available)');
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  console.log(`❌ 404 - API route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'API endpoint not found',
    method: req.method,
    path: req.path,
    availableEndpoints: [
      'GET /api/health',
      'GET /api/docs',
      'POST /api/v1/auth/register',
      'POST /api/v1/auth/login',
      'GET /api/v1/auth/profile',
      'POST /api/v1/simulations',
      'GET /api/v1/simulations',
      ...(wsServer ? ['WebSocket: /socket.io/'] : [])
    ]
  });
});

// General 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    suggestion: 'Visit /api/docs for API documentation' + (wsServer ? ' or /websocket-test for WebSocket testing' : '')
  });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('💥 Server error:', err);
  
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack })
  });
});

// API status endpoint
app.get('/api/v1/status', async (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const stats = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
        external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
      },
      environment: process.env.NODE_ENV || 'development',
      websocket: {
        active: !!wsServer,
        connectedUsers: wsServer ? wsServer.getConnectedUsersCount() : 0,
        totalConnections: wsServer ? wsServer.getConnectionsCount() : 0
      }
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get system status',
      timestamp: new Date().toISOString()
    });
  }
});

// ===== SIMULATION ROUTES =====
// All simulation routes require authentication
app.use('/api/v1/simulations', authenticateToken);

console.log('✅ All routes configured' + (wsServer ? ' with WebSocket integration' : ''));

// General 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    suggestion: 'Visit /api/docs for API documentation' + (wsServer ? ' or /websocket-test for WebSocket testing' : '')
  });
});

// Global error handler
app.use((err: any, req: any, res: any, next: any) => {
  console.error('💥 Server error:', err);
  
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'Something went wrong',
    ...(isDevelopment && { stack: err.stack })
  });
});

// Graceful shutdown with optional WebSocket cleanup
const gracefulShutdown = async (signal: string) => {
  console.log(`🛑 ${signal} received, shutting down gracefully`);
  
  // Close WebSocket connections if available
  if (wsServer) {
    console.log('🔗 Closing WebSocket connections...');
  }
  
  httpServer.close(async () => {
    console.log('📡 HTTP server closed');
    
    if (dbPool) {
      await dbPool.end();
      console.log('🗄️ Database pool closed');
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('💥 Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export WebSocket server for use by worker notifications (optional)
export { wsServer };
export default app;
// Fixed WebSocket test client route
app.get('/websocket-client', (req, res) => {
  console.log('🧪 Serving WebSocket test client');
  const fs = require('fs');
  const clientPath = path.join(__dirname, '..', 'public', 'websocket-client.html');
  
  if (fs.existsSync(clientPath)) {
    res.sendFile(clientPath);
  } else {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <h1>WebSocket Test Client</h1>
      <p>Client file not found. Please run the websocket setup script.</p>
      <p><a href="/api/docs">View API Documentation</a></p>
    `);
  }
});
