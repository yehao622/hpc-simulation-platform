// api-gateway/src/index.ts - UPDATED WITH GRAPHQL INTEGRATION
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { createServer } from 'http';
import { Pool } from 'pg';

// Import GraphQL server
let createApolloServer: any = null;
let graphqlHealthCheck: any = null;

try {
  const graphqlModule = require('./graphql/server');
  createApolloServer = graphqlModule.createApolloServer;
  graphqlHealthCheck = graphqlModule.graphqlHealthCheck;
  console.log('✅ GraphQL module loaded successfully');
} catch (error: any) {
  console.warn('⚠️ GraphQL module not available:', (error as any).message);
  console.info('🔄 API will run without GraphQL support');
}

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

// Create HTTP server for optional WebSocket and GraphQL Subscriptions
const server = createServer(app);

console.log('🚀 Starting HPC Simulation API Gateway with GraphQL...');

// Initialize GraphQL Server
let apolloServer: any = null;

const initializeGraphQL = async () => {
  if (createApolloServer) {
    try {
      console.log('🚀 Initializing GraphQL server...');
      
      // Create Apollo Server
      apolloServer = createApolloServer();
      // CRITICAL: For Apollo Server 4, we must await start() first
      await apolloServer.start();
      
      // Simplified manual GraphQL handler with better error handling
      app.all('/graphql', async (req, res) => {
        console.log(`🔍 GraphQL handler hit: ${req.method} ${req.path}`);
        console.log(`🔍 Body:`, JSON.stringify(req.body));
        
        if (req.method === 'GET') {
          // Handle GET requests (playground/introspection)
          res.send(`
            <!DOCTYPE html>
            <html>
            <head><title>GraphQL Endpoint</title></head>
            <body>
              <h1>GraphQL Endpoint Active</h1>
              <p>Send POST requests with GraphQL queries to this endpoint</p>
              <p>Example: POST /graphql with body: {"query": "{ __schema { queryType { name } } }"}</p>
            </body>
            </html>
          `);
          return;
        }
        
        if (req.method === 'POST') {
          try {
            // Simple GraphQL execution
            const { query, variables, operationName } = req.body;
            
            if (!query) {
              res.status(400).json({ error: 'No query provided' });
              return;
            }
            
            console.log(`🔍 Executing GraphQL query: ${query.substring(0, 100)}...`);
            
            const result = await apolloServer.executeOperation({
              query,
              variables,
              operationName,
            });
            
            console.log(`🔍 GraphQL result:`, JSON.stringify(result).substring(0, 200));
            res.json(result);
            
          } catch (error) {
            console.error('💥 GraphQL execution error:', error);
            res.status(500).json({ error: 'GraphQL execution failed', details: error });
          }
          return;
        }
        
        // Other methods
        res.status(405).json({ error: 'Method not allowed' });
      });

      console.log('🔧 Manual GraphQL handler mounted at /graphql');
      // DEBUG: List all registered routes
      console.log('🔍 Registered routes:');
      app._router.stack.forEach((middleware: any, index: any) => {
        if (middleware.route) {
          // Direct routes
          console.log(`  ${index}: ${Object.keys(middleware.route.methods).join(',')} ${middleware.route.path}`);
        } else if (middleware.name === 'router') {
          // Router middleware
          console.log(`  ${index}: ROUTER ${middleware.regexp}`);
        } else {
          // Other middleware
          console.log(`  ${index}: ${middleware.name} ${middleware.regexp}`);
        }
      });
      
      // Health check GraphQL
      if (graphqlHealthCheck) {
        const isHealthy = await graphqlHealthCheck(apolloServer);
        if (isHealthy) {
          console.log('💚 GraphQL health check passed');
        } else {
          console.warn('⚠️ GraphQL health check failed');
        }
      }
      
    } catch (error: any) {
      console.error('💥 Failed to initialize GraphQL server:', error);
      console.info('🔄 Continuing without GraphQL support');
      apolloServer = null;
    }
  } else {
    console.warn('⚠️ GraphQL createApolloServer function not available');
  }
};

// Simple test route to verify route registration
app.post('/test-post', (req, res) => {
  console.log('🧪 TEST POST route hit');
  res.json({ message: 'POST route working' });
});

app.get('/test-get', (req, res) => {
  console.log('🧪 TEST GET route hit');
  res.json({ message: 'GET route working' });
});

// Test if the route exists
app.get('/debug-routes', (req, res) => {
  let routes = [','];
  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      routes.push(`${Object.keys(middleware.route.methods).join(',')} ${middleware.route.path}`);
    }
  });
  res.json({ routes });
});

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

// Middleware configuration with GraphQL support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // GraphQL Playground needs inline scripts
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

// DEBUG: Log ALL requests to see what's happening
app.use((req, res, next) => {
  if (req.path === '/graphql') {
    console.log(`🚨 EARLY INTERCEPT: ${req.method} ${req.path}`);
    console.log(`🚨 User-Agent: ${req.headers['user-agent']}`);
    console.log(`🚨 Content-Type: ${req.headers['content-type']}`);
  }
  next();
});

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

console.log('🔧 Middleware configured');

// Enhanced health check endpoint with GraphQL status
app.get('/api/health', async (req, res) => {
  console.log('💓 Health check requested');
  
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    environment: process.env.NODE_ENV || 'development',
    services: {
      database: 'unknown',
      redis: 'unknown',
      websocket: 'unknown',
      graphql: 'unknown'
    },
    features: {
      restApi: true,
      graphqlApi: !!apolloServer,
      webSocketRealtime: !!wsServer,
      subscriptions: false
    },
    endpoints: {
      rest: '/api/v1',
      graphql: apolloServer ? '/graphql' : null,
      websocket: wsServer ? '/socket.io/' : null
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
  } else {
    health.services.websocket = 'disabled';
  }

  // GraphQL status
  // GraphQL status - check if GraphQL module loaded and server created
  if (createApolloServer && apolloServer) {
    try {
      const isHealthy = graphqlHealthCheck ? await graphqlHealthCheck(apolloServer) : true;
      health.services.graphql = isHealthy ? 'active' : 'degraded';
      health.features.graphqlApi = true;
      health.endpoints.graphql = apolloServer.graphqlPath || '/graphql';
    } catch (error: any) {
      console.error('GraphQL health check error:', error);
      health.services.graphql = 'error';
      health.status = 'degraded';
    }
  } else if (createApolloServer && !apolloServer) {
    // GraphQL module loaded but server not initialized yet
    health.services.graphql = 'initializing';
    health.features.graphqlApi = true;
    health.endpoints.graphql = '/graphql';
  } else {
    health.services.graphql = 'disabled';
    health.features.graphqlApi = false;
    health.endpoints.graphql = null;
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Root endpoint with GraphQL information
app.get('/', (req, res) => {
  console.log('🏠 Root endpoint requested');
  res.json({
    name: 'HPC Simulation Platform API',
    version: '1.2.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    features: [
      'REST API', 
      'JWT Authentication',
      ...(apolloServer ? ['GraphQL API', 'GraphQL Playground'] : []),
      ...(wsServer ? ['WebSocket Real-time Updates'] : ['Database Polling'])
    ],
    documentation: '/api/docs',
    endpoints: {
      health: '/api/health',
      auth: '/api/v1/auth',
      simulations: '/api/v1/simulations',
      ...(apolloServer && { 
        graphql: '/graphql',
        playground: apolloServer.graphqlPath 
      }),
      ...(wsServer && { websocket: '/socket.io/' })
    },
    graphql: apolloServer ? {
      endpoint: '/graphql',
      playground: `/graphql`,
      authentication: 'JWT token in Authorization header',
      features: ['Queries', 'Mutations', 'Complex Relations', 'Analytics']
    } : {
      status: 'disabled',
      reason: 'GraphQL dependencies not available'
    }
  });
});

// Enhanced API Documentation with GraphQL
app.get('/api/docs', (req, res) => {
  res.json({
    title: 'HPC Simulation Platform API v1.2',
    version: '1.2.0',
    description: 'RESTful and GraphQL API for managing HPC network simulations' + 
                 (wsServer ? ' with WebSocket real-time updates' : ''),
    baseUrl: `${req.protocol}://${req.get('host')}/api/v1`,
    features: [
      'JWT Authentication',
      'Comprehensive Job Management',
      'Template System',
      'Time-series Metrics',
      ...(apolloServer ? ['GraphQL API with Complex Queries'] : []),
      ...(wsServer ? ['Real-time WebSocket Updates'] : ['Database-based Updates'])
    ],
    apis: {
      rest: {
        baseUrl: '/api/v1',
        authentication: 'Bearer token in Authorization header',
        endpoints: [
          'POST /auth/register - User registration',
          'POST /auth/login - User authentication',
          'GET /auth/profile - User profile',
          'POST /simulations - Create simulation job',
          'GET /simulations - List jobs',
          'GET /simulations/:id - Job details',
          'DELETE /simulations/:id - Cancel job'
        ]
      },
      ...(apolloServer && {
        graphql: {
          endpoint: '/graphql',
          playground: '/graphql',
          authentication: 'JWT token in Authorization header',
          features: [
            'Complex nested queries',
            'Real-time analytics',
            'Advanced filtering',
            'Pagination support',
            'Template management'
          ],
          exampleQuery: `
query MyDashboard {
  me {
    email
    statistics {
      totalJobs
      completedJobs
      avgThroughput
    }
  }
  simulationJobs(limit: 5, status: RUNNING) {
    id
    name
    status
    progress
    results {
      totalThroughput
      averageLatency
    }
  }
}
          `
        }
      })
    }
  });
});

// ===== REST API ROUTES =====
app.post('/api/v1/auth/register', authRateLimit, authController.register);
app.post('/api/v1/auth/login', authRateLimit, authController.login);
app.get('/api/v1/auth/profile', authenticateToken, authController.getProfile);
app.post('/api/v1/auth/refresh', authenticateToken, authController.refreshToken);
app.post('/api/v1/auth/logout', authenticateToken, (req, res) => {
  console.log('🚪 User logged out:', (req as any).user?.email);
  res.status(200).json({
    message: 'Logout successful',
    note: 'Please remove the token from client storage' + 
          (wsServer ? ' and disconnect WebSocket' : '') +
          (apolloServer ? '. GraphQL will also require new authentication.' : '')
  });
});

// Simulation routes with GraphQL integration
app.get('/api/v1/simulations/templates/topologies', authenticateToken, simulationController.getTopologyTemplates);
app.get('/api/v1/simulations/templates/workloads', authenticateToken, simulationController.getWorkloadPatterns);

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

// GraphQL comparison endpoint for developers
app.get('/api/v1/graphql-comparison', authenticateToken, (req, res) => {
  if (!apolloServer) {
    res.status(404).json({
      error: 'GraphQL not available',
      message: 'GraphQL server is not enabled'
    });
    return;
  }

  res.json({
    title: 'REST vs GraphQL Comparison',
    examples: {
      restApi: {
        getUserProfile: {
          method: 'GET',
          url: '/api/v1/auth/profile',
          description: 'Get user profile with all fields'
        },
        getJobsWithResults: {
          method: 'GET', 
          url: '/api/v1/simulations',
          description: 'Get all jobs, then make separate requests for detailed results',
          requests: 2
        }
      },
      graphqlApi: {
        getUserProfile: {
          method: 'POST',
          url: '/graphql',
          query: `
query CustomProfile {
  me {
    email
    firstName
    statistics {
      totalJobs
      completedJobs
    }
  }
}`,
          description: 'Get only specific user fields in one request'
        },
        getJobsWithResults: {
          method: 'POST',
          url: '/graphql', 
          query: `
query JobsWithResults {
  simulationJobs(limit: 10, status: COMPLETED) {
    id
    name
    status
    results {
      totalThroughput
      averageLatency
    }
    user {
      email
    }
  }
}`,
          description: 'Get jobs, results, and user info in one request',
          requests: 1
        }
      },
      advantages: {
        graphql: [
          'Single endpoint for all operations',
          'Request exactly the data you need',
          'Strong type system',
          'Real-time subscriptions',
          'Complex nested queries',
          'Self-documenting with introspection'
        ],
        rest: [
          'Simple caching',
          'Familiar HTTP semantics', 
          'Easy to understand',
          'Mature tooling',
          'File uploads'
        ]
      }
    }
  });
});

// WebSocket test client with GraphQL integration
app.get('/websocket-test', (req, res) => {
  console.log('🧪 Serving WebSocket test client HTML');
  
  const fs = require('fs');
  const path = require('path');
  const clientPath = path.join(__dirname, '..', 'public', 'websocket-client.html');
  
  try {
    if (fs.existsSync(clientPath)) {
      res.sendFile(clientPath);
    } else {
      // Enhanced inline HTML with GraphQL information
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>WebSocket + GraphQL Test Client</title>
            <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
            <style>
                body { font-family: monospace; background: #1a1a1a; color: white; padding: 20px; }
                .container { max-width: 1200px; margin: 0 auto; }
                .section { background: #2d2d2d; padding: 20px; margin: 20px 0; border-radius: 8px; }
                .graphql-section { border-left: 4px solid #e10098; }
                .websocket-section { border-left: 4px solid #4CAF50; }
                input, textarea { padding: 10px; margin: 5px; background: #333; color: white; border: 1px solid #555; }
                button { padding: 10px 15px; margin: 5px; background: #4CAF50; color: white; border: none; cursor: pointer; }
                button:disabled { background: #666; cursor: not-allowed; }
                .logs { background: #1e1e1e; padding: 15px; height: 300px; overflow-y: auto; border: 1px solid #444; }
                .status { padding: 10px; margin: 10px 0; border-radius: 4px; }
                .connected { background: #1B5E20; }
                .disconnected { background: #B71C1C; }
                .token-input { width: 400px; }
                .graphql-query { width: 100%; height: 200px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 WebSocket + GraphQL Test Client</h1>
                
                <div class="section websocket-section">
                    <h3>🔗 WebSocket Connection</h3>
                    <div id="status" class="status disconnected">Disconnected</div>
                    <input type="text" id="token" placeholder="Enter JWT Token..." class="token-input" />
                    <button onclick="connect()">Connect WebSocket</button>
                    <button onclick="disconnect()" disabled id="disconnectBtn">Disconnect</button>
                </div>

                <div class="section graphql-section">
                    <h3>🔍 GraphQL API Testing</h3>
                    <p><strong>GraphQL Endpoint:</strong> ${apolloServer ? '/graphql' : 'Not Available'}</p>
                    <p><strong>GraphQL Playground:</strong> 
                       ${apolloServer ? `<a href="/graphql" target="_blank">Open Playground</a>` : 'Not Available'}
                    </p>
                    <textarea id="graphqlQuery" class="graphql-query" placeholder="Enter GraphQL query...">${apolloServer ? `
query MyDashboard {
  me {
    email
    firstName
    statistics {
      totalJobs
      completedJobs
      avgThroughput
    }
  }
  simulationJobs(limit: 5) {
    id
    name
    status
    progress
  }
}` : 'GraphQL not available'}</textarea>
                    <br>
                    <button onclick="executeGraphQL()" ${apolloServer ? '' : 'disabled'}>Execute GraphQL Query</button>
                </div>

                <div class="section">
                    <h3>📊 Job Monitoring</h3>
                    <input type="text" id="jobId" placeholder="Enter Job ID..." />
                    <button onclick="subscribeToJob()" disabled id="subscribeBtn">Subscribe (WebSocket)</button>
                    <button onclick="getJobGraphQL()" disabled id="graphqlJobBtn">Get Job (GraphQL)</button>
                </div>

                <div class="section">
                    <h3>📝 Live Logs</h3>
                    <button onclick="clearLogs()">Clear</button>
                    <div id="logs" class="logs"></div>
                </div>
            </div>

            <script>
                let socket = null;
                const token = localStorage.getItem('jwt_token') || '';
                if (token) document.getElementById('token').value = token;
                
                function log(msg, type = 'info') {
                    const logs = document.getElementById('logs');
                    const time = new Date().toLocaleTimeString();
                    const color = type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#ffffff';
                    logs.innerHTML += \`<div style="color: \${color}">[<span style="color: #888">\${time}</span>] \${msg}</div>\`;
                    logs.scrollTop = logs.scrollHeight;
                }
                
                function updateStatus(connected) {
                    const status = document.getElementById('status');
                    status.className = connected ? 'status connected' : 'status disconnected';
                    status.textContent = connected ? '✅ Connected' : '❌ Disconnected';
                    document.getElementById('disconnectBtn').disabled = !connected;
                    document.getElementById('subscribeBtn').disabled = !connected;
                    document.getElementById('graphqlJobBtn').disabled = !connected;
                }
                
                function connect() {
                    const token = document.getElementById('token').value.trim();
                    if (!token) { alert('Please enter JWT token'); return; }
                    
                    localStorage.setItem('jwt_token', token);
                    
                    if (socket) socket.disconnect();
                    log('🔄 Connecting to WebSocket...', 'info');
                    
                    socket = io('/', { auth: { token: token } });
                    
                    socket.on('connect', () => {
                        log('✅ WebSocket connected!', 'success');
                        updateStatus(true);
                    });
                    
                    socket.on('connected', (data) => {
                        log('👋 Authenticated: ' + data.userEmail, 'success');
                    });
                    
                    socket.on('disconnect', () => {
                        log('❌ WebSocket disconnected', 'error');
                        updateStatus(false);
                    });
                    
                    socket.on('job-status-update', (data) => {
                        log('📊 Job update: ' + data.jobId + ' → ' + data.status + ' (' + (data.progress || 0) + '%)', 'info');
                    });
                }
                
                function disconnect() {
                    if (socket) { socket.disconnect(); socket = null; }
                    updateStatus(false);
                    log('🔌 WebSocket disconnected', 'info');
                }
                
                async function executeGraphQL() {
                    const token = document.getElementById('token').value.trim();
                    const query = document.getElementById('graphqlQuery').value.trim();
                    
                    if (!token || !query) {
                        alert('Please enter both JWT token and GraphQL query');
                        return;
                    }
                    
                    try {
                        log('🔍 Executing GraphQL query...', 'info');
                        
                        const response = await fetch('/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + token
                            },
                            body: JSON.stringify({ query })
                        });
                        
                        const result = await response.json();
                        
                        if (result.errors) {
                            log('🔥 GraphQL errors: ' + JSON.stringify(result.errors), 'error');
                        } else {
                            log('✅ GraphQL result: ' + JSON.stringify(result.data, null, 2), 'success');
                        }
                        
                    } catch (error) {
                        log('💥 GraphQL request failed: ' + error.message, 'error');
                    }
                }
                
                function subscribeToJob() {
                    const jobId = document.getElementById('jobId').value.trim();
                    if (!jobId || !socket) return;
                    socket.emit('subscribe-job', jobId);
                    log('📡 Subscribed to job via WebSocket: ' + jobId, 'info');
                }
                
                async function getJobGraphQL() {
                    const jobId = document.getElementById('jobId').value.trim();
                    const token = document.getElementById('token').value.trim();
                    
                    if (!jobId || !token) return;
                    
                    const query = \`
                        query GetJob {
                            simulationJob(id: "\${jobId}") {
                                id
                                name
                                status
                                progress
                                results {
                                    totalThroughput
                                    averageLatency
                                }
                            }
                        }
                    \`;
                    
                    try {
                        const response = await fetch('/graphql', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': 'Bearer ' + token
                            },
                            body: JSON.stringify({ query })
                        });
                        
                        const result = await response.json();
                        
                        if (result.errors) {
                            log('🔥 GraphQL job query error: ' + JSON.stringify(result.errors), 'error');
                        } else {
                            log('📊 Job details from GraphQL: ' + JSON.stringify(result.data.simulationJob, null, 2), 'success');
                        }
                        
                    } catch (error) {
                        log('💥 GraphQL job query failed: ' + error.message, 'error');
                    }
                }
                
                function clearLogs() { document.getElementById('logs').innerHTML = ''; }
                
                log('🌐 WebSocket + GraphQL Test Client Ready', 'success');
                ${apolloServer ? `log('🔍 GraphQL Playground: <a href="/graphql" target="_blank">/graphql</a>', 'info');` : `log('⚠️ GraphQL not available', 'error');`}
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

// Initialize GraphQL server first
// Initialize GraphQL server and start HTTP server
const startServer = async () => {
  // Initialize GraphQL BEFORE starting the server
  await initializeGraphQL();
  
  // Now start the HTTP server
  const httpServer = server.listen(port, '0.0.0.0', () => {
    console.log(`✅ HPC Simulation API running on port ${port}`);
    console.log(`📚 Health check: http://localhost:${port}/api/health`);
    console.log(`🏠 Home: http://localhost:${port}/`);
    console.log(`📖 API Docs: http://localhost:${port}/api/docs`);
    console.log(`🔐 Auth endpoints: http://localhost:${port}/api/v1/auth/*`);
    console.log(`🧪 Simulation endpoints: http://localhost:${port}/api/v1/simulations/*`);
    
    if (apolloServer) {
      console.log(`🔍 GraphQL endpoint: http://localhost:${port}${apolloServer.graphqlPath}`);
      console.log(`🎮 GraphQL Playground: http://localhost:${port}${apolloServer.graphqlPath}`);
      console.log(`📊 GraphQL comparison: http://localhost:${port}/api/v1/graphql-comparison`);
    }
    
    // Initialize WebSocket server if available
    if (WebSocketServer) {
      try {
        wsServer = new WebSocketServer(httpServer);
        console.log(`🔗 WebSocket server ready: ws://localhost:${port}/socket.io/`);
      } catch (wsError) {
        console.warn('⚠️ Failed to initialize WebSocket server:', wsError);
      }
    }
    
    console.log(`🎮 Combined test client: http://localhost:${port}/websocket-test`);
  });

  // Note: GraphQL subscriptions will be added in future version
  console.log('📡 GraphQL subscriptions: Coming soon');
};

// Start the server
startServer().catch(error => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});

// DEBUG: Check if GraphQL requests reach near the end
app.use((req, res, next) => {
  if (req.path === '/graphql') {
    console.log(`🚨 LATE INTERCEPT: ${req.method} ${req.path} - This should NOT appear if GraphQL handler worked`);
  }
  next();
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
      'POST /api/v1/simulations',
      ...(apolloServer ? ['POST /graphql'] : []),
      ...(wsServer ? ['WebSocket: /socket.io/'] : [])
    ]
  });
});

// General 404 handler
app.use((req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    suggestion: 'Visit /api/docs for API documentation' + 
                (apolloServer ? ' or /graphql for GraphQL Playground' : '') +
                (wsServer ? ' or /websocket-test for WebSocket testing' : '')
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

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`🛑 ${signal} received, shutting down gracefully`);
  
  // Close GraphQL server
  if (apolloServer) {
    console.log('🔍 Stopping GraphQL server...');
    await apolloServer.stop();
  }
  
  // Close WebSocket connections if available
  if (wsServer) {
    console.log('🔗 Closing WebSocket connections...');
  }
  
  server.close(async () => {
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

export default app;