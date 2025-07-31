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
  res.json({
    message: 'WebSocket Test Client',
    websocketEnabled: !!wsServer,
    endpoint: wsServer ? '/socket.io/' : 'WebSocket not available',
    instructions: [
      '1. Get JWT token by logging in via API (POST /api/v1/auth/login)',
      '2. Use the token to connect to WebSocket endpoint',
      '3. Subscribe to job updates and monitor real-time progress'
    ],
    testCommands: {
      login: 'curl -X POST http://localhost:3000/api/v1/auth/login -H "Content-Type: application/json" -d \'{"email":"user@example.com","password":"password"}\'',
      websocketUrl: wsServer ? 'ws://localhost:3000/socket.io/' : 'Not available'
    },
    documentation: '/api/docs'
  });
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

// Serve WebSocket test client (optional)
if (wsServer) {
  app.get('/websocket-test', (req, res) => {
    // Serve the client.html file if it exists
    try {
      const fs = require('fs');
      const path = require('path');
      const clientPath = path.join(__dirname, '..', 'client.html');
      
      if (fs.existsSync(clientPath)) {
        res.sendFile(clientPath);
      } else {
        res.json({
          message: 'WebSocket test client not found',
          info: 'WebSocket endpoint available at /socket.io/',
          documentation: '/api/docs'
        });
      }
    } catch (error) {
      res.json({
        message: 'WebSocket is enabled',
        endpoint: '/socket.io/',
        authentication: 'JWT token required',
        documentation: '/api/docs'
      });
    }
  });
}

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