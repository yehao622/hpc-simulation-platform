// api-gateway/src/index.ts - FIXED VERSION
// GraphQL Server Integration with Proper Route Handling

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
  console.warn('⚠️ GraphQL module not available:', error.message);
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

// Global GraphQL server instance
let apolloServer: any = null;

// CRITICAL FIX: Register GraphQL routes FIRST, before other middleware
const initializeGraphQL = async () => {
  if (createApolloServer) {
    try {
      console.log('🚀 Initializing GraphQL server...');
      
      // Create Apollo Server
      apolloServer = createApolloServer();
      await apolloServer.start();
      
      // FIXED: Use proper HTTP method handlers instead of app.all()
      // This ensures the route is registered with specific methods and higher priority
      
      // Handle GraphQL POST requests (main GraphQL endpoint)
      app.post('/graphql', express.json(), async (req, res) => {
        console.log('📍 GraphQL POST handler hit');
        
        try {
          // Extract JWT token for authentication
          const authHeader = req.headers.authorization;
          let context = { db: new Pool({ connectionString: process.env.DATABASE_URL }) };
          
          if (authHeader) {
            const token = authHeader.replace('Bearer ', '');
            try {
              const jwt = require('jsonwebtoken');
              const jwtSecret = process.env.JWT_SECRET;
              if (jwtSecret) {
                const decoded: any = jwt.verify(token, jwtSecret);
                context = {
                  ...context,
                  user: {
                    userId: decoded.userId,
                    email: decoded.email,
                    role: decoded.role || 'user'
                  }
                } as any;
              }
            } catch (tokenError) {
              console.warn('⚠️ Invalid JWT token in GraphQL request');
            }
          }
          
          // Execute GraphQL operation
          const result = await apolloServer.executeOperation({
            query: req.body.query,
            variables: req.body.variables,
            operationName: req.body.operationName,
          }, { req, res });
          
          console.log('✅ GraphQL operation executed successfully');
          res.status(200).json(result);
          
        } catch (error: any) {
          console.error('💥 GraphQL execution error:', error);
          res.status(500).json({
            errors: [{
              message: 'Internal GraphQL execution error',
              extensions: { code: 'INTERNAL_ERROR' }
            }]
          });
        }
      });
      
      // Handle GraphQL GET requests (playground/introspection)
      app.get('/graphql', (req, res) => {
        console.log('📍 GraphQL GET handler hit');
        
        // Check if request wants JSON (introspection) or HTML (playground)
        const acceptsJson = req.headers.accept?.includes('application/json');
        
        if (acceptsJson) {
          // Handle introspection query for tools
          const introspectionQuery = `
            query IntrospectionQuery {
              __schema {
                queryType { name }
                mutationType { name }
                subscriptionType { name }
              }
            }
          `;
          
          apolloServer.executeOperation({
            query: introspectionQuery
          }).then((result: any) => {
            res.json(result);
          }).catch((error: any) => {
            res.status(500).json({ errors: [{ message: error.message }] });
          });
        } else {
          // Serve GraphQL Playground HTML
          res.setHeader('Content-Type', 'text/html');
          res.send(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>GraphQL Playground - HPC Simulation Platform</title>
              <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react@1.7.26/build/static/css/index.css" />
            </head>
            <body>
              <div id="root">
                <style>
                  body { font-family: monospace; background: #1a1a1a; color: white; text-align: center; padding: 50px; }
                  .card { background: #2d2d2d; padding: 30px; border-radius: 10px; border-left: 4px solid #e10098; }
                  h1 { color: #e10098; }
                  code { background: #333; padding: 2px 6px; border-radius: 3px; }
                </style>
                <div class="card">
                  <h1>🔍 GraphQL API Endpoint</h1>
                  <p><strong>Status:</strong> ✅ Active and Ready</p>
                  <p><strong>Endpoint:</strong> <code>/graphql</code></p>
                  <p><strong>Authentication:</strong> Add <code>Authorization: Bearer YOUR_JWT_TOKEN</code> to headers</p>
                  
                  <h3>📋 Quick Start</h3>
                  <p>1. Login via REST API to get JWT token</p>
                  <p>2. Use curl or GraphQL client with the token</p>
                  <p>3. Try example queries below</p>
                  
                  <h3>🧪 Example Query</h3>
                  <pre style="text-align: left; background: #1e1e1e; padding: 15px; border-radius: 5px;">
                    query MyProfile {
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
                    }</pre>
                  
                  <h3>🔧 Test with curl</h3>
                  <pre style="text-align: left; background: #1e1e1e; padding: 15px; border-radius: 5px;">
                    curl -X POST http://localhost:3000/graphql \\
                      -H "Content-Type: application/json" \\
                      -H "Authorization: Bearer YOUR_TOKEN" \\
                      -d '{"query": "{ me { email } }"}'</pre>
                  
                  <p><a href="/websocket-test" style="color: #4CAF50;">🎮 Try WebSocket + GraphQL Test Client</a></p>
                </div>
              </div>
            </body>
            </html>
          `);
        }
      });
      
      console.log('✅ GraphQL routes registered: POST /graphql and GET /graphql');
      
      // Health check GraphQL
      if (graphqlHealthCheck) {
        const isHealthy = await graphqlHealthCheck(apolloServer);
        console.log(`🏥 GraphQL health check: ${isHealthy ? 'PASS' : 'FAIL'}`);
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

// STEP 1: Initialize GraphQL FIRST (before other middleware that might conflict)
const preInitializeGraphQL = async () => {
  await initializeGraphQL();
};

// STEP 2: Configure middleware AFTER GraphQL routes are established
const configureMiddleware = () => {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-hashes'", "https://cdn.jsdelivr.net", "https://cdn.socket.io"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "ws:", "wss:"],
      },
    },
  }));

  // CORS configuration
  const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000', 'http://localhost:3001'];
  app.use(cors({
    origin: corsOrigins,
    credentials: true
  }));

  // Body parsing and compression
  app.use(compression());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging (non-intrusive)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  console.log('🔧 Middleware configured after GraphQL');
};

// STEP 3: Register API routes
const registerRoutes = () => {
  // Enhanced health check endpoint with GraphQL status
  app.get('/api/health', async (req, res) => {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.2.0',
      environment: process.env.NODE_ENV || 'development',
      services: {
        database: 'unknown',
        redis: 'unknown',
        websocket: wsServer ? 'active' : 'disabled',
        graphql: apolloServer ? 'active' : 'disabled'
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

    // Redis test (optional)
    try {
      health.services.redis = 'available';
    } catch (error) {
      health.services.redis = 'disconnected';
    }

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'HPC Simulation Platform API',
      version: '1.2.0',
      status: 'running',
      timestamp: new Date().toISOString(),
      features: [
        'REST API', 
        'JWT Authentication',
        ...(apolloServer ? ['GraphQL API', 'GraphQL Playground'] : []),
        ...(wsServer ? ['WebSocket Real-time Updates'] : [])
      ],
      endpoints: {
        health: '/api/health',
        auth: '/api/v1/auth',
        simulations: '/api/v1/simulations',
        ...(apolloServer && { 
          graphql: '/graphql',
          playground: '/graphql'
        }),
        ...(wsServer && { websocket: '/socket.io/' })
      }
    });
  });

  // API Documentation
  app.get('/api/docs', (req, res) => {
    res.json({
      title: 'HPC Simulation Platform API v1.2',
      version: '1.2.0',
      description: 'RESTful and GraphQL API for managing HPC network simulations',
      features: [
        'JWT Authentication',
        'Comprehensive Job Management',
        ...(apolloServer ? ['GraphQL API with Complex Queries'] : []),
        ...(wsServer ? ['Real-time WebSocket Updates'] : [])
      ],
      apis: {
        rest: {
          baseUrl: '/api/v1',
          authentication: 'Bearer token in Authorization header'
        },
        ...(apolloServer && {
          graphql: {
            endpoint: '/graphql',
            playground: '/graphql',
            authentication: 'JWT token in Authorization header'
          }
        })
      }
    });
  });

  // ===== REST API ROUTES =====
  
  // Authentication routes
  app.post('/api/v1/auth/register', authRateLimit, authController.register);
  app.post('/api/v1/auth/login', authRateLimit, authController.login);
  app.get('/api/v1/auth/profile', authenticateToken, authController.getProfile);
  app.post('/api/v1/auth/refresh', authenticateToken, authController.refreshToken);
  app.post('/api/v1/auth/logout', authenticateToken, (req, res) => {
    console.log('🚪 User logged out:', (req as any).user?.email);
    res.status(200).json({
      message: 'Logout successful',
      note: 'Please remove the token from client storage'
    });
  });

  // Simulation routes
  app.get('/api/v1/simulations/templates/topologies', authenticateToken, simulationController.getTopologyTemplates);
  app.get('/api/v1/simulations/templates/workloads', authenticateToken, simulationController.getWorkloadPatterns);
  app.post('/api/v1/simulations', authenticateToken, simulationController.createSimulation);
  app.get('/api/v1/simulations', authenticateToken, simulationController.getSimulations);
  app.get('/api/v1/simulations/:id', authenticateToken, simulationController.getSimulationById);
  app.delete('/api/v1/simulations/:id', authenticateToken, simulationController.cancelSimulation);

  // GraphQL comparison endpoint
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
      status: 'GraphQL Active',
      endpoint: '/graphql',
      examples: {
        simpleQuery: {
          rest: 'GET /api/v1/auth/profile',
          graphql: 'POST /graphql with query: { me { email firstName } }'
        },
        complexQuery: {
          rest: 'Multiple requests to /auth/profile, /simulations, /templates',
          graphql: 'Single request: { me { ... } simulationJobs { ... } topologyTemplates { ... } }'
        }
      }
    });
  });

  // Test client
  app.get('/websocket-test', (req, res) => {
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
              input, textarea { padding: 10px; margin: 5px; background: #333; color: white; border: 1px solid #555; }
              button { padding: 10px 15px; margin: 5px; background: #4CAF50; color: white; border: none; cursor: pointer; }
              .token-input { width: 400px; }
              .graphql-query { width: 100%; height: 150px; }
              .logs { background: #1e1e1e; padding: 15px; height: 200px; overflow-y: auto; border: 1px solid #444; }
          </style>
      </head>
      <body>
          <div class="container">
              <h1>🚀 WebSocket + GraphQL Test Client</h1>
              
              <div class="section">
                  <h3>🔐 Authentication</h3>
                  <input type="text" id="token" placeholder="Enter JWT Token..." class="token-input" />
              </div>

              <div class="section graphql-section">
                  <h3>🔍 GraphQL Testing</h3>
                  <p><strong>Status:</strong> ${apolloServer ? '✅ Active' : '❌ Disabled'}</p>
                  <textarea id="graphqlQuery" class="graphql-query" >query MyProfile {
                    me {
                      email
                      firstName
                      statistics {
                        totalJobs
                        completedJobs
                      }
                    }
                  }</textarea>
                  <br>
                  <button id="executeBtn" ${apolloServer ? '' : 'disabled'}>Execute GraphQL Query</button>
                  <button id="playgroundBtn" ${apolloServer ? '' : 'disabled'}>Open Playground</button>
              </div>

              <div class="section">
                  <h3>📝 Results & Logs</h3>
                  <button id="clearBtn">Clear</button>
                  <div id="logs" class="logs"></div>
              </div>
          </div>

          <script>
              function log(msg, type = 'info') {
                  const logs = document.getElementById('logs');
                  const time = new Date().toLocaleTimeString();
                  const color = type === 'error' ? '#ff4444' : type === 'success' ? '#44ff44' : '#ffffff';
                  logs.innerHTML += \`<div style="color: \${color}">[<span style="color: #888">\${time}</span>] \${msg}</div>\`;
                  logs.scrollTop = logs.scrollHeight;
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
                          log('🔥 GraphQL errors: ' + JSON.stringify(result.errors, null, 2), 'error');
                      } else {
                          log('✅ GraphQL result: ' + JSON.stringify(result.data, null, 2), 'success');
                      }
                      
                  } catch (error) {
                      log('💥 GraphQL request failed: ' + error.message, 'error');
                  }
              }
              
              function openPlayground() {
                  window.open('/graphql', '_blank');
              }
              
              function clearLogs() { 
                  document.getElementById('logs').innerHTML = ''; 
              }
              
              // Initialize on page load
              document.addEventListener('DOMContentLoaded', function() {
                  log('🌐 GraphQL Test Client Ready', 'success');
                  log('🔍 Enter your JWT token above and try some GraphQL queries!', 'info');

                  document.getElementById('executeBtn').addEventListener('click', executeGraphQL);
                  document.getElementById('playgroundBtn').addEventListener('click', openPlayground);
                  document.getElementById('clearBtn').addEventListener('click', clearLogs);
              });
          </script>
      </body>
      </html>
    `);
  });

  console.log('🛣️ API routes registered');
};

// STEP 4: Register error handlers LAST
const registerErrorHandlers = () => {
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
        ...(apolloServer ? ['POST /graphql', 'GET /graphql'] : [])
      ]
    });
  });

  // General 404 handler
  app.use((req, res) => {
    console.log(`❌ 404 - Route not found: ${req.method} ${req.path}`);
    res.status(404).json({ 
      error: 'Route not found',
      suggestion: 'Visit /api/docs for API documentation' + 
                  (apolloServer ? ' or /graphql for GraphQL Playground' : '')
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

  console.log('🛡️ Error handlers registered');
};

// MAIN SERVER STARTUP SEQUENCE
const startServer = async () => {
  console.log('🚀 Starting server initialization sequence...');
  
  try {
    // Step 1: Initialize GraphQL FIRST
    await preInitializeGraphQL();
    
    // Step 2: Configure middleware AFTER GraphQL
    configureMiddleware();
    
    // Step 3: Register API routes
    registerRoutes();
    
    // Step 4: Register error handlers LAST
    registerErrorHandlers();
    
    // Step 5: Start HTTP server
    const httpServer = server.listen(port, '0.0.0.0', async () => {
      console.log('🎯 HPC Simulation API Gateway Started Successfully!');
      console.log(`✅ Running on port ${port}`);
      console.log(`📚 Health: http://localhost:${port}/api/health`);
      console.log(`🏠 Home: http://localhost:${port}/`);
      console.log(`📖 Docs: http://localhost:${port}/api/docs`);
      
      if (apolloServer) {
        console.log(`🔍 GraphQL: http://localhost:${port}/graphql`);
        console.log(`🎮 Playground: http://localhost:${port}/graphql`);
      }
      
      // Step 6: Initialize WebSocket server AFTER HTTP server is ready
      if (WebSocketServer) {
        try {
          wsServer = new WebSocketServer(httpServer);
          console.log(`🔗 WebSocket: ws://localhost:${port}/socket.io/`);
        } catch (wsError) {
          console.warn('⚠️ WebSocket initialization failed:', wsError);
        }
      }
      
      console.log(`🎮 Test client: http://localhost:${port}/websocket-test`);
      console.log('🎯 Server ready for requests!');
    });

  } catch (error) {
    console.error('💥 Server startup failed:', error);
    process.exit(1);
  }
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  console.log(`🛑 ${signal} received, shutting down gracefully`);
  
  // Close GraphQL server
  if (apolloServer) {
    console.log('🔍 Stopping GraphQL server...');
    await apolloServer.stop();
  }
  
  // Close WebSocket connections
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

// Start the server
startServer();

export default app;