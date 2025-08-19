// api-gateway/src/middleware/metrics.js
// Prometheus metrics collection for SmartOps AI Agent Platform

const client = require('prom-client');

// Create a custom registry for our metrics
const register = new client.Registry();

// Add default Node.js metrics
client.collectDefaultMetrics({ register });

// Custom metrics for HPC Simulation Platform
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [1, 5, 15, 50, 100, 200, 300, 400, 500, 1000, 2000, 5000]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const simulationJobsTotal = new client.Counter({
  name: 'simulation_jobs_total',
  help: 'Total number of simulation jobs processed',
  labelNames: ['status', 'topology_type']
});

const simulationJobDuration = new client.Histogram({
  name: 'simulation_job_duration_seconds',
  help: 'Duration of simulation jobs in seconds',
  labelNames: ['topology_type', 'status'],
  buckets: [1, 5, 10, 30, 60, 120, 300, 600, 1200, 1800, 3600]
});

const activeSimulationJobs = new client.Gauge({
  name: 'active_simulation_jobs',
  help: 'Number of currently active simulation jobs',
  labelNames: ['status']
});

const databaseConnectionPool = new client.Gauge({
  name: 'database_connection_pool_size',
  help: 'Current database connection pool size'
});

const redisConnectionStatus = new client.Gauge({
  name: 'redis_connection_status',
  help: 'Redis connection status (1 = connected, 0 = disconnected)'
});

const websocketConnections = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Number of active WebSocket connections'
});

const aiRequestsTotal = new client.Counter({
  name: 'ai_requests_total',
  help: 'Total number of AI service requests',
  labelNames: ['endpoint', 'status']
});

const aiResponseDuration = new client.Histogram({
  name: 'ai_response_duration_ms',
  help: 'Duration of AI service responses in milliseconds',
  labelNames: ['endpoint'],
  buckets: [100, 500, 1000, 2000, 5000, 10000, 20000, 30000]
});

// Register all metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(simulationJobsTotal);
register.registerMetric(simulationJobDuration);
register.registerMetric(activeSimulationJobs);
register.registerMetric(databaseConnectionPool);
register.registerMetric(redisConnectionStatus);
register.registerMetric(websocketConnections);
register.registerMetric(aiRequestsTotal);
register.registerMetric(aiResponseDuration);

// Middleware function to collect HTTP metrics
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const route = req.route ? req.route.path : req.path;
    const labels = {
      method: req.method,
      route: route,
      status_code: res.statusCode
    };
    
    httpRequestDuration.observe(labels, duration);
    httpRequestsTotal.inc(labels);
  });
  
  next();
};

// Helper functions for simulation metrics
const recordSimulationJob = (status, topologyType, duration = null) => {
  simulationJobsTotal.inc({ status, topology_type: topologyType });
  
  if (duration !== null) {
    simulationJobDuration.observe(
      { topology_type: topologyType, status },
      duration
    );
  }
};

const updateActiveJobs = async (db) => {
  try {
    const result = await db.query(`
      SELECT status, COUNT(*) as count 
      FROM simulation_jobs 
      WHERE status IN ('queued', 'running') 
      GROUP BY status
    `);
    
    // Reset gauges
    activeSimulationJobs.reset();
    
    // Set current values
    result.rows.forEach(row => {
      activeSimulationJobs.set({ status: row.status }, parseInt(row.count));
    });
  } catch (error) {
    console.error('Error updating active jobs metric:', error);
  }
};

const updateConnectionStatus = (redisClient, dbPool) => {
  // Redis connection status
  redisConnectionStatus.set(redisClient && redisClient.connected ? 1 : 0);
  
  // Database connection pool
  if (dbPool && dbPool.totalCount !== undefined) {
    databaseConnectionPool.set(dbPool.totalCount);
  }
};

const recordAIRequest = (endpoint, status, duration = null) => {
  aiRequestsTotal.inc({ endpoint, status });
  
  if (duration !== null) {
    aiResponseDuration.observe({ endpoint }, duration);
  }
};

// Metrics endpoint handler
const getMetrics = async (req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).end('Error generating metrics');
  }
};

// WebSocket metrics tracking
let wsConnections = 0;

const incrementWebSocketConnections = () => {
  wsConnections++;
  websocketConnections.set(wsConnections);
};

const decrementWebSocketConnections = () => {
  wsConnections = Math.max(0, wsConnections - 1);
  websocketConnections.set(wsConnections);
};

module.exports = {
  metricsMiddleware,
  getMetrics,
  recordSimulationJob,
  updateActiveJobs,
  updateConnectionStatus,
  recordAIRequest,
  incrementWebSocketConnections,
  decrementWebSocketConnections,
  register
};
