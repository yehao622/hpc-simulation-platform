// api-gateway/src/controllers/simulationController.ts - COMPLETE IMPLEMENTATION
import { Request, Response } from 'express';
import { Pool } from 'pg';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'redis';

// Database and Redis connections - singleton pattern
let dbPool: Pool;
let redisClient: any;

const getDbPool = (): Pool => {
  if (!dbPool) {
    dbPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }
  return dbPool;
};

const getRedisClient = async (): Promise<any> => {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = Redis.createClient({ url: redisUrl });
    redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
    await redisClient.connect();
  }
  return redisClient;
};

// Validation schemas
const createSimulationSchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  description: Joi.string().max(1000).optional(),
  topologyId: Joi.number().integer().positive().required(),
  workloadId: Joi.number().integer().positive().required(),
  simulationTime: Joi.number().positive().max(300).default(10.0),
  randomSeed: Joi.number().integer().optional(),
  
  // Network configuration
  numComputeNodes: Joi.number().integer().min(1).max(1000).default(16),
  numStorageNodes: Joi.number().integer().min(1).max(100).default(8),
  numCoreSwitches: Joi.number().integer().min(1).max(50).default(2),
  numAggrSwitches: Joi.number().integer().min(1).max(100).default(8),
  numEdgeSwitches: Joi.number().integer().min(1).max(100).default(8),
  
  // Performance parameters
  infinibandBandwidth: Joi.number().positive().default(25.0),
  pcieBandwidth: Joi.number().positive().default(24.0),
  sasBandwidth: Joi.number().positive().default(10.0),
  
  // Workload parameters
  workType: Joi.string().valid('read', 'write', 'mixed').default('read'),
  dataSizeMb: Joi.number().positive().default(128.0),
  readProbability: Joi.number().min(0).max(1).default(0.5),
  requestRate: Joi.number().positive().default(0.001),
  
  // Custom parameters
  customParameters: Joi.object().optional()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid('queued', 'running', 'completed', 'failed', 'cancelled').optional(),
  sortBy: Joi.string().valid('created_at', 'name', 'status', 'simulation_time').default('created_at'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc')
});

// Create new simulation job
export const createSimulation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    console.log('🚀 Creating simulation job for user:', userId);

    // Validate input
    const { error, value } = createSimulationSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => detail.message)
      });
      return;
    }

    // Verify topology and workload exist
    const pool = getDbPool();
    const topologyCheck = await pool.query(
      'SELECT id, name FROM topology_templates WHERE id = $1 AND (is_public = true OR created_by = $2)',
      [value.topologyId, userId]
    );

    const workloadCheck = await pool.query(
      'SELECT id, name FROM workload_patterns WHERE id = $1 AND (is_public = true OR created_by = $2)',
      [value.workloadId, userId]
    );

    if (topologyCheck.rows.length === 0) {
      res.status(404).json({
        error: 'Topology not found',
        message: 'Specified topology template does not exist or is not accessible'
      });
      return;
    }

    if (workloadCheck.rows.length === 0) {
      res.status(404).json({
        error: 'Workload not found',
        message: 'Specified workload pattern does not exist or is not accessible'
      });
      return;
    }

    // Generate job ID and random seed if not provided
    const jobId = uuidv4();
    const randomSeed = value.randomSeed || Math.floor(Math.random() * 1000000);

    // Insert simulation job
    const result = await pool.query(`
      INSERT INTO simulation_jobs (
        id, user_id, name, description, topology_id, workload_id,
        simulation_time, random_seed, num_compute_nodes, num_storage_nodes,
        num_core_switches, num_aggr_switches, num_edge_switches,
        infiniband_bandwidth, pcie_bandwidth, sas_bandwidth,
        work_type, data_size_mb, read_probability, request_rate,
        custom_parameters, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      ) RETURNING *
    `, [
      jobId, userId, value.name, value.description, value.topologyId, value.workloadId,
      value.simulationTime, randomSeed, value.numComputeNodes, value.numStorageNodes,
      value.numCoreSwitches, value.numAggrSwitches, value.numEdgeSwitches,
      value.infinibandBandwidth, value.pcieBandwidth, value.sasBandwidth,
      value.workType, value.dataSizeMb, value.readProbability, value.requestRate,
      JSON.stringify(value.customParameters || {}), 'queued'
    ]);

    const job = result.rows[0];

    // Add to job queue
    await pool.query(
      'INSERT INTO job_queue (job_id, priority) VALUES ($1, $2)',
      [jobId, 0]
    );

    // Add to Redis queue for processing
    try {
      const redis = await getRedisClient();
      await redis.lPush('simulation_queue', JSON.stringify({
        jobId,
        userId,
        priority: 0,
        queuedAt: new Date().toISOString()
      }));
    } catch (redisError) {
      console.warn('Redis queue error:', redisError);
      // Continue without Redis - job is still in database queue
    }

    console.log('✅ Simulation job created:', jobId);

    res.status(201).json({
      message: 'Simulation job created successfully',
      job: {
        id: job.id,
        name: job.name,
        description: job.description,
        status: job.status,
        topologyName: topologyCheck.rows[0].name,
        workloadName: workloadCheck.rows[0].name,
        simulationTime: parseFloat(job.simulation_time),
        createdAt: job.created_at,
        estimatedCompletion: new Date(Date.now() + (parseFloat(job.simulation_time) * 1000 + 30000)).toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Create simulation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to create simulation job'
    });
  }
};

// Get simulation jobs for user
export const getSimulations = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate query parameters
    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: 'Invalid query parameters',
        details: error.details.map(detail => detail.message)
      });
      return;
    }

    const { page, limit, status, sortBy, sortOrder } = value;
    const offset = (page - 1) * limit;

    // Build query
    let whereClause = 'WHERE sj.user_id = $1';
    const params = [userId];
    
    if (status) {
      whereClause += ' AND sj.status = $2';
      params.push(status);
    }

    const query = `
      SELECT 
        sj.id, sj.name, sj.description, sj.status,
        sj.simulation_time, sj.created_at, sj.started_at, sj.completed_at,
        sj.total_throughput, sj.average_latency, sj.error_message,
        tt.name as topology_name, wp.name as workload_name,
        COUNT(*) OVER() as total_count
      FROM simulation_jobs sj
      LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
      LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
      ${whereClause}
      ORDER BY sj.${sortBy} ${sortOrder}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    params.push(limit, offset);

    const pool = getDbPool();
    const result = await pool.query(query, params);
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(totalCount / limit);

    console.log(`📋 Retrieved ${result.rows.length} jobs for user ${userId}`);

    res.status(200).json({
      jobs: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        status: row.status,
        topologyName: row.topology_name,
        workloadName: row.workload_name,
        simulationTime: parseFloat(row.simulation_time),
        createdAt: row.created_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        totalThroughput: row.total_throughput ? parseFloat(row.total_throughput) : null,
        averageLatency: row.average_latency ? parseFloat(row.average_latency) : null,
        errorMessage: row.error_message
      })),
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('💥 Get simulations error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve simulation jobs'
    });
  }
};

// Get specific simulation job details
export const getSimulationById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const jobId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    console.log(`🔍 Fetching simulation details: ${jobId} for user: ${userId}`);

    // Get job details
    const pool = getDbPool();
    const result = await pool.query(`
      SELECT 
        sj.*,
        tt.name as topology_name, tt.parameters as topology_params,
        wp.name as workload_name, wp.parameters as workload_params
      FROM simulation_jobs sj
      LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
      LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
      WHERE sj.id = $1 AND sj.user_id = $2
    `, [jobId, userId]);

    if (result.rows.length === 0) {
      res.status(404).json({
        error: 'Simulation not found',
        message: 'Simulation job not found or access denied'
      });
      return;
    }

    const job = result.rows[0];

    // Get recent metrics if job is completed
    let metrics: any[] = [];
    if (job.status === 'completed') {
      const metricsResult = await pool.query(`
        SELECT metric_type, component_type, timestamp_sec, value, unit
        FROM simulation_metrics 
        WHERE job_id = $1 
        ORDER BY timestamp_sec DESC 
        LIMIT 100
      `, [jobId]);
      metrics = metricsResult.rows;
    }

    // Get recent logs
    const logsResult = await pool.query(`
      SELECT log_level, message, component, simulation_time, created_at
      FROM job_logs 
      WHERE job_id = $1 
      ORDER BY created_at DESC 
      LIMIT 50
    `, [jobId]);

    res.status(200).json({
      job: {
        id: job.id,
        name: job.name,
        description: job.description,
        status: job.status,
        
        // Configuration
        topology: {
          id: job.topology_id,
          name: job.topology_name,
          parameters: job.topology_params
        },
        workload: {
          id: job.workload_id,
          name: job.workload_name,
          parameters: job.workload_params
        },
        
        // Simulation parameters
        simulationTime: parseFloat(job.simulation_time),
        randomSeed: job.random_seed,
        
        // Network configuration
        network: {
          computeNodes: job.num_compute_nodes,
          storageNodes: job.num_storage_nodes,
          coreSwitches: job.num_core_switches,
          aggrSwitches: job.num_aggr_switches,
          edgeSwitches: job.num_edge_switches,
          infinibandBandwidth: parseFloat(job.infiniband_bandwidth),
          pcieBandwidth: parseFloat(job.pcie_bandwidth),
          sasBandwidth: parseFloat(job.sas_bandwidth)
        },
        
        // Workload configuration
        workloadConfig: {
          workType: job.work_type,
          dataSizeMb: parseFloat(job.data_size_mb),
          readProbability: parseFloat(job.read_probability),
          requestRate: parseFloat(job.request_rate)
        },
        
        // Custom parameters
        customParameters: job.custom_parameters,
        
        // Execution details
        workerId: job.worker_id,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        errorMessage: job.error_message,
        
        // Results
        results: job.status === 'completed' ? {
          totalThroughput: job.total_throughput ? parseFloat(job.total_throughput) : null,
          averageLatency: job.average_latency ? parseFloat(job.average_latency) : null,
          maxQueueLength: job.max_queue_length
        } : null
      },
      metrics: metrics.map(m => ({
        type: m.metric_type,
        component: m.component_type,
        timestamp: parseFloat(m.timestamp_sec),
        value: parseFloat(m.value),
        unit: m.unit
      })),
      logs: logsResult.rows.map(log => ({
        level: log.log_level,
        message: log.message,
        component: log.component,
        simulationTime: log.simulation_time ? parseFloat(log.simulation_time) : null,
        timestamp: log.created_at
      }))
    });

  } catch (error) {
    console.error('💥 Get simulation by ID error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve simulation details'
    });
  }
};

// Cancel simulation job
export const cancelSimulation = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    const jobId = req.params.id;

    if (!userId) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    console.log(`🛑 Cancelling simulation: ${jobId} for user: ${userId}`);

    // Check if job exists and belongs to user
    const pool = getDbPool();
    const jobResult = await pool.query(
      'SELECT id, status, user_id FROM simulation_jobs WHERE id = $1 AND user_id = $2',
      [jobId, userId]
    );

    if (jobResult.rows.length === 0) {
      res.status(404).json({
        error: 'Simulation not found',
        message: 'Simulation job not found or access denied'
      });
      return;
    }

    const job = jobResult.rows[0];

    // Check if job can be cancelled
    if (job.status === 'completed') {
      res.status(400).json({
        error: 'Cannot cancel completed job',
        message: 'Simulation job has already completed'
      });
      return;
    }

    if (job.status === 'cancelled') {
      res.status(400).json({
        error: 'Already cancelled',
        message: 'Simulation job is already cancelled'
      });
      return;
    }

    // Update job status
    await pool.query(
      'UPDATE simulation_jobs SET status = $1, completed_at = NOW() WHERE id = $2',
      ['cancelled', jobId]
    );

    // Add log entry
    await pool.query(`
      INSERT INTO job_logs (job_id, log_level, message, component) 
      VALUES ($1, $2, $3, $4)
    `, [jobId, 'INFO', 'Job cancelled by user', 'system']);

    // Remove from Redis queue if still queued
    if (job.status === 'queued') {
      try {
        const redis = await getRedisClient();
        // Note: This is a simplified removal - in production you'd want a more robust queue management
        await redis.lRem('simulation_queue', 1, JSON.stringify({ jobId }));
      } catch (redisError) {
        console.warn('Could not remove from Redis queue:', redisError);
      }
    }

    console.log('✅ Simulation cancelled:', jobId);

    res.status(200).json({
      message: 'Simulation job cancelled successfully',
      jobId,
      status: 'cancelled'
    });

  } catch (error) {
    console.error('💥 Cancel simulation error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to cancel simulation job'
    });
  }
};

// Get available topology templates
export const getTopologyTemplates = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;

    const pool = getDbPool();
    const result = await pool.query(`
      SELECT id, name, type, description, parameters, created_by, is_public, created_at
      FROM topology_templates 
      WHERE is_public = true OR created_by = $1
      ORDER BY is_public DESC, name ASC
    `, [userId]);

    res.status(200).json({
      templates: result.rows.map(template => ({
        id: template.id,
        name: template.name,
        type: template.type,
        description: template.description,
        parameters: template.parameters,
        isPublic: template.is_public,
        isOwned: template.created_by === userId,
        createdAt: template.created_at
      }))
    });

  } catch (error) {
    console.error('💥 Get topology templates error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve topology templates'
    });
  }
};

// Get available workload patterns
export const getWorkloadPatterns = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;

    const pool = getDbPool();
    const result = await pool.query(`
      SELECT id, name, description, parameters, created_by, is_public, created_at
      FROM workload_patterns 
      WHERE is_public = true OR created_by = $1
      ORDER BY is_public DESC, name ASC
    `, [userId]);

    res.status(200).json({
      patterns: result.rows.map(pattern => ({
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        parameters: pattern.parameters,
        isPublic: pattern.is_public,
        isOwned: pattern.created_by === userId,
        createdAt: pattern.created_at
      }))
    });

  } catch (error) {
    console.error('💥 Get workload patterns error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve workload patterns'
    });
  }
};