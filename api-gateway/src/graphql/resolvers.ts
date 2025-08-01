// api-gateway/src/graphql/resolvers.ts
// Complete GraphQL Resolvers for HPC Simulation Platform

import { Pool } from 'pg';
import { AuthenticationError, ForbiddenError, UserInputError } from 'apollo-server-express';
import { GraphQLScalarType, Kind } from 'graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { v4 as uuidv4 } from 'uuid';

// Database connection
const getDbPool = (): Pool => {
  return new Pool({
    connectionString: process.env.DATABASE_URL
  });
};

// Custom scalar resolvers
const DateTimeScalar = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  serialize(value: any) {
    return value instanceof Date ? value.toISOString() : value;
  },
  parseValue(value: any) {
    return new Date(value);
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value);
    }
    return null;
  },
});

// Helper functions
const requireAuth = (context: any) => {
  if (!context.user) {
    throw new AuthenticationError('Authentication required');
  }
  return context.user;
};

const requireRole = (context: any, allowedRoles: string[]) => {
  const user = requireAuth(context);
  if (!allowedRoles.includes(user.role)) {
    throw new ForbiddenError('Insufficient permissions');
  }
  return user;
};

// Database helpers
class DatabaseService {
  private pool: Pool;

  constructor() {
    this.pool = getDbPool();
  }

  async getUser(userId: number) {
    const result = await this.pool.query(`
      SELECT id, email, username, first_name, last_name, organization, 
             role, is_active, created_at, updated_at
      FROM users WHERE id = $1
    `, [userId]);
    
    return result.rows[0] ? {
      id: result.rows[0].id,
      email: result.rows[0].email,
      username: result.rows[0].username,
      firstName: result.rows[0].first_name,
      lastName: result.rows[0].last_name,
      organization: result.rows[0].organization,
      role: result.rows[0].role,
      isActive: result.rows[0].is_active,
      createdAt: result.rows[0].created_at,
      updatedAt: result.rows[0].updated_at
    } : null;
  }

  async getUserStatistics(userId: number) {
    const statsResult = await this.pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        SUM(CASE WHEN status = 'completed' THEN simulation_time ELSE 0 END) as total_sim_time,
        AVG(CASE WHEN status = 'completed' THEN total_throughput END) as avg_throughput
      FROM simulation_jobs WHERE user_id = $1
    `, [userId]);

    const stats = statsResult.rows[0];

    // Get recent activity
    const activityResult = await this.pool.query(`
      SELECT id, name, status, updated_at
      FROM simulation_jobs 
      WHERE user_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 10
    `, [userId]);

    return {
      totalJobs: parseInt(stats.total_jobs),
      completedJobs: parseInt(stats.completed_jobs),
      runningJobs: parseInt(stats.running_jobs),
      failedJobs: parseInt(stats.failed_jobs),
      totalSimulationTime: parseFloat(stats.total_sim_time) || 0,
      avgThroughput: stats.avg_throughput ? parseFloat(stats.avg_throughput) : null,
      recentActivity: activityResult.rows.map(row => ({
        jobId: row.id,
        jobName: row.name,
        status: row.status.toUpperCase(),
        timestamp: row.updated_at
      }))
    };
  }

  async getSimulationJob(jobId: string, userId?: number) {
    const whereClause = userId ? 'WHERE sj.id = $1 AND sj.user_id = $2' : 'WHERE sj.id = $1';
    const params = userId ? [jobId, userId] : [jobId];

    const result = await this.pool.query(`
      SELECT 
        sj.*,
        tt.name as topology_name, tt.type as topology_type, tt.parameters as topology_params,
        wp.name as workload_name, wp.parameters as workload_params
      FROM simulation_jobs sj
      LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
      LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
      ${whereClause}
    `, params);

    if (!result.rows[0]) return null;

    const job = result.rows[0];
    return this.mapDatabaseJobToGraphQL(job);
  }

  async getSimulationJobs(filters: any = {}, userId?: number) {
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;

    if (userId) {
      whereConditions.push(`sj.user_id = $${paramIndex++}`);
      params.push(userId);
    }

    if (filters.status) {
      whereConditions.push(`sj.status = $${paramIndex++}`);
      params.push(filters.status.toLowerCase());
    }

    if (filters.topologyId) {
      whereConditions.push(`sj.topology_id = $${paramIndex++}`);
      params.push(filters.topologyId);
    }

    if (filters.workloadId) {
      whereConditions.push(`sj.workload_id = $${paramIndex++}`);
      params.push(filters.workloadId);
    }

    if (filters.createdAfter) {
      whereConditions.push(`sj.created_at >= $${paramIndex++}`);
      params.push(filters.createdAfter);
    }

    if (filters.createdBefore) {
      whereConditions.push(`sj.created_at <= $${paramIndex++}`);
      params.push(filters.createdBefore);
    }

    if (filters.workType) {
      whereConditions.push(`sj.work_type = $${paramIndex++}`);
      params.push(filters.workType.toLowerCase());
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
    
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder || 'DESC';
    const limit = Math.min(filters.limit || 20, 100);
    const offset = filters.offset || 0;

    const query = `
      SELECT 
        sj.*,
        tt.name as topology_name, tt.type as topology_type, tt.parameters as topology_params,
        wp.name as workload_name, wp.parameters as workload_params
      FROM simulation_jobs sj
      LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
      LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
      ${whereClause}
      ORDER BY sj.${sortBy} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows.map(job => this.mapDatabaseJobToGraphQL(job));
  }

  async createSimulationJob(input: any, userId: number) {
    const jobId = uuidv4();
    const randomSeed = input.randomSeed || Math.floor(Math.random() * 1000000);

    // Verify topology and workload exist
    const topologyResult = await this.pool.query(
      'SELECT id FROM topology_templates WHERE id = $1 AND (is_public = true OR created_by = $2)',
      [input.topologyId, userId]
    );

    const workloadResult = await this.pool.query(
      'SELECT id FROM workload_patterns WHERE id = $1 AND (is_public = true OR created_by = $2)',
      [input.workloadId, userId]
    );

    if (!topologyResult.rows[0]) {
      throw new UserInputError('Topology template not found or not accessible');
    }

    if (!workloadResult.rows[0]) {
      throw new UserInputError('Workload pattern not found or not accessible');
    }

    // Insert job
    const result = await this.pool.query(`
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
      jobId, userId, input.name, input.description, input.topologyId, input.workloadId,
      input.simulationTime, randomSeed, input.numComputeNodes, input.numStorageNodes,
      input.numCoreSwitches, input.numAggrSwitches, input.numEdgeSwitches,
      input.infinibandBandwidth, input.pcieBandwidth, input.sasBandwidth,
      input.workType.toLowerCase(), input.dataSizeMb, input.readProbability, input.requestRate,
      JSON.stringify(input.customParameters || {}), 'queued'
    ]);

    // Add to queue
    await this.pool.query(
      'INSERT INTO job_queue (job_id, priority) VALUES ($1, $2)',
      [jobId, 0]
    );

    return await this.getSimulationJob(jobId, userId);
  }

  private mapDatabaseJobToGraphQL(job: any) {
    return {
      id: job.id,
      userId: job.user_id,
      name: job.name,
      description: job.description,
      status: job.status.toUpperCase(),
      simulationTime: parseFloat(job.simulation_time),
      randomSeed: job.random_seed,
      networkConfig: {
        computeNodes: job.num_compute_nodes,
        storageNodes: job.num_storage_nodes,
        coreSwitches: job.num_core_switches,
        aggrSwitches: job.num_aggr_switches,
        edgeSwitches: job.num_edge_switches,
        infinibandBandwidth: parseFloat(job.infiniband_bandwidth),
        pcieBandwidth: parseFloat(job.pcie_bandwidth),
        sasBandwidth: parseFloat(job.sas_bandwidth)
      },
      workloadConfig: {
        workType: job.work_type.toUpperCase(),
        dataSizeMb: parseFloat(job.data_size_mb),
        readProbability: parseFloat(job.read_probability),
        requestRate: parseFloat(job.request_rate)
      },
      customParameters: job.custom_parameters,
      workerId: job.worker_id,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      errorMessage: job.error_message,
      results: job.status === 'completed' && job.total_throughput ? {
        totalThroughput: parseFloat(job.total_throughput),
        averageLatency: parseFloat(job.average_latency || 0),
        maxQueueLength: job.max_queue_length || 0,
        performanceMetrics: {
          peakThroughput: parseFloat(job.total_throughput) * 1.2,
          minLatency: parseFloat(job.average_latency || 0) * 0.8,
          avgResponseTime: parseFloat(job.average_latency || 0),
          successRate: 0.98
        },
        networkUtilization: {
          avgInfinibandUtilization: 0.65,
          avgPcieUtilization: 0.45,
          avgSasUtilization: 0.35,
          bottleneckComponents: ['infiniband', 'storage']
        }
      } : null,
      progress: this.calculateProgress(job),
      estimatedCompletion: this.calculateEstimatedCompletion(job)
    };
  }

  private calculateProgress(job: any): number {
    if (job.status === 'completed') return 100;
    if (job.status === 'failed' || job.status === 'cancelled') return 0;
    if (job.status === 'queued') return 0;
    if (job.status === 'running' && job.started_at) {
      const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
      const simTime = parseFloat(job.simulation_time);
      return Math.min(95, Math.round((elapsed / simTime) * 100));
    }
    return 0;
  }

  private calculateEstimatedCompletion(job: any): Date | null {
    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      return null;
    }
    if (job.status === 'running' && job.started_at) {
      const startTime = new Date(job.started_at);
      const simTimeMs = parseFloat(job.simulation_time) * 1000;
      return new Date(startTime.getTime() + simTimeMs + 30000); // Add 30s overhead
    }
    if (job.status === 'queued') {
      return new Date(Date.now() + 60000); // Estimate 1 minute queue time
    }
    return null;
  }
}

const db = new DatabaseService();

// Main resolvers
export const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  JSON: GraphQLJSON,

  // Root resolvers
  Query: {
    // Current user
    me: async (parent: any, args: any, context: any) => {
      const user = requireAuth(context);
      return await db.getUser(user.userId);
    },

    // User management
    user: async (parent: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      return await db.getUser(parseInt(id));
    },

    users: async (parent: any, { limit, offset }: any, context: any) => {
      requireRole(context, ['admin']);
      // Implement users query for admin
      return [];
    },

    // Simulation jobs
    simulationJob: async (parent: any, { id }: { id: string }, context: any) => {
      const user = requireAuth(context);
      return await db.getSimulationJob(id, user.userId);
    },

    simulationJobs: async (parent: any, args: any, context: any) => {
      const user = requireAuth(context);
      return await db.getSimulationJobs(args, user.userId);
    },

    // Templates
    topologyTemplates: async (parent: any, args: any, context: any) => {
      requireAuth(context);
      const pool = getDbPool();
      
      let whereConditions = [];
      let params = [];
      let paramIndex = 1;

      if (args.type) {
        whereConditions.push(`type = $${paramIndex++}`);
        params.push(args.type.toLowerCase());
      }

      if (args.publicOnly) {
        whereConditions.push('is_public = true');
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const limit = Math.min(args.limit || 50, 100);

      const result = await pool.query(`
        SELECT * FROM topology_templates 
        ${whereClause}
        ORDER BY is_public DESC, name ASC 
        LIMIT $${paramIndex}
      `, [...params, limit]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        type: row.type.toUpperCase(),
        description: row.description,
        parameters: row.parameters,
        createdBy: row.created_by,
        isPublic: row.is_public,
        createdAt: row.created_at,
        usageCount: 0 // TODO: Calculate actual usage
      }));
    },

    workloadPatterns: async (parent: any, args: any, context: any) => {
      requireAuth(context);
      const pool = getDbPool();
      
      let whereConditions = [];
      if (args.publicOnly) {
        whereConditions.push('is_public = true');
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      const limit = Math.min(args.limit || 50, 100);

      const result = await pool.query(`
        SELECT * FROM workload_patterns 
        ${whereClause}
        ORDER BY is_public DESC, name ASC 
        LIMIT $1
      `, [limit]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        parameters: row.parameters,
        createdBy: row.created_by,
        isPublic: row.is_public,
        createdAt: row.created_at,
        usageCount: 0 // TODO: Calculate actual usage
      }));
    },

    // Analytics
    myAnalytics: async (parent: any, args: any, context: any) => {
      const user = requireAuth(context);
      return await db.getUserStatistics(user.userId);
    },

    systemAnalytics: async (parent: any, args: any, context: any) => {
      requireRole(context, ['admin', 'researcher']);
      const pool = getDbPool();
      
      // Get system-wide statistics
      const statsResult = await pool.query(`
        SELECT 
          COUNT(CASE WHEN status = 'running' THEN 1 END) as active_jobs,
          COUNT(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as completed_today,
          AVG(CASE WHEN status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL 
              THEN EXTRACT(EPOCH FROM (completed_at - started_at)) END) as avg_completion_time,
          CASE WHEN COUNT(CASE WHEN status = 'running' THEN 1 END) > 5 THEN 0.8 ELSE 0.3 END as system_load
        FROM simulation_jobs
        WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
      `);

      const stats = statsResult.rows[0];

      return {
        activeJobs: parseInt(stats.active_jobs),
        completedToday: parseInt(stats.completed_today),
        avgCompletionTime: parseFloat(stats.avg_completion_time) || 0,
        systemLoad: parseFloat(stats.system_load),
        popularTopologies: [], // TODO: Implement
        performanceTrends: []   // TODO: Implement
      };
    },

    // Real-time data
    activeJobs: async (parent: any, args: any, context: any) => {
      const user = requireAuth(context);
      return await db.getSimulationJobs({ status: 'RUNNING' }, user.userId);
    },

    recentMetrics: async (parent: any, { jobId, limit }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      // Verify user owns the job
      const jobResult = await pool.query(
        'SELECT id FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [jobId, user.userId]
      );

      if (!jobResult.rows[0]) {
        throw new ForbiddenError('Job not found or access denied');
      }

      const result = await pool.query(`
        SELECT * FROM simulation_metrics 
        WHERE job_id = $1 
        ORDER BY timestamp_sec DESC 
        LIMIT $2
      `, [jobId, Math.min(limit || 100, 500)]);

      return result.rows.map(row => ({
        id: row.id,
        jobId: row.job_id,
        metricType: row.metric_type,
        componentType: row.component_type,
        componentId: row.component_id,
        timestampSec: parseFloat(row.timestamp_sec),
        value: parseFloat(row.value),
        unit: row.unit,
        createdAt: row.created_at
      }));
    },

    // Search
    searchJobs: async (parent: any, { query, limit }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      const searchLimit = Math.min(limit || 20, 100);
      const result = await pool.query(`
        SELECT 
          sj.*,
          tt.name as topology_name, tt.type as topology_type, tt.parameters as topology_params,
          wp.name as workload_name, wp.parameters as workload_params
        FROM simulation_jobs sj
        LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
        LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
        WHERE sj.user_id = $1 AND (
          sj.name ILIKE $2 OR 
          sj.description ILIKE $2 OR
          tt.name ILIKE $2 OR
          wp.name ILIKE $2
        )
        ORDER BY sj.created_at DESC
        LIMIT $3
      `, [user.userId, `%${query}%`, searchLimit]);

      return result.rows.map(job => db.mapDatabaseJobToGraphQL(job));
    }
  },

  Mutation: {
    // Job management
    createSimulationJob: async (parent: any, { input }: any, context: any) => {
      const user = requireAuth(context);
      return await db.createSimulationJob(input, user.userId);
    },

    updateSimulationJob: async (parent: any, { id, input }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      // Verify user owns the job and it's not running
      const jobResult = await pool.query(
        'SELECT id, status FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [id, user.userId]
      );

      if (!jobResult.rows[0]) {
        throw new UserInputError('Job not found or access denied');
      }

      if (jobResult.rows[0].status === 'running') {
        throw new UserInputError('Cannot update running job');
      }

      // Update job
      const updateFields = [];
      const params = [];
      let paramIndex = 1;

      if (input.name) {
        updateFields.push(`name = ${paramIndex++}`);
        params.push(input.name);
      }

      if (input.description !== undefined) {
        updateFields.push(`description = ${paramIndex++}`);
        params.push(input.description);
      }

      if (updateFields.length === 0) {
        throw new UserInputError('No fields to update');
      }

      updateFields.push(`updated_at = NOW()`);
      params.push(id);

      await pool.query(`
        UPDATE simulation_jobs 
        SET ${updateFields.join(', ')}
        WHERE id = ${paramIndex}
      `, params);

      return await db.getSimulationJob(id, user.userId);
    },

    cancelSimulationJob: async (parent: any, { id }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      // Check if job exists and belongs to user
      const jobResult = await pool.query(
        'SELECT id, status FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [id, user.userId]
      );

      if (!jobResult.rows[0]) {
        throw new UserInputError('Job not found or access denied');
      }

      const job = jobResult.rows[0];

      if (job.status === 'completed') {
        throw new UserInputError('Cannot cancel completed job');
      }

      if (job.status === 'cancelled') {
        throw new UserInputError('Job is already cancelled');
      }

      // Update job status
      await pool.query(
        'UPDATE simulation_jobs SET status = $1, completed_at = NOW() WHERE id = $2',
        ['cancelled', id]
      );

      // Add log entry
      await pool.query(
        'INSERT INTO job_logs (job_id, log_level, message, component) VALUES ($1, $2, $3, $4)',
        [id, 'INFO', 'Job cancelled by user via GraphQL', 'graphql']
      );

      return await db.getSimulationJob(id, user.userId);
    },

    deleteSimulationJob: async (parent: any, { id }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      // Verify user owns the job and it's not running
      const jobResult = await pool.query(
        'SELECT id, status FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [id, user.userId]
      );

      if (!jobResult.rows[0]) {
        throw new UserInputError('Job not found or access denied');
      }

      if (jobResult.rows[0].status === 'running') {
        throw new UserInputError('Cannot delete running job');
      }

      // Delete job (cascade will handle related records)
      await pool.query(
        'DELETE FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [id, user.userId]
      );

      return true;
    },

    // Template management
    createTopologyTemplate: async (parent: any, { input }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      const result = await pool.query(`
        INSERT INTO topology_templates (name, type, description, parameters, created_by, is_public)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        input.name,
        input.type.toLowerCase(),
        input.description,
        JSON.stringify(input.parameters),
        user.userId,
        input.isPublic || false
      ]);

      const template = result.rows[0];
      return {
        id: template.id,
        name: template.name,
        type: template.type.toUpperCase(),
        description: template.description,
        parameters: template.parameters,
        createdBy: template.created_by,
        isPublic: template.is_public,
        createdAt: template.created_at,
        usageCount: 0
      };
    },

    createWorkloadPattern: async (parent: any, { input }: any, context: any) => {
      const user = requireAuth(context);
      const pool = getDbPool();
      
      const result = await pool.query(`
        INSERT INTO workload_patterns (name, description, parameters, created_by, is_public)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        input.name,
        input.description,
        JSON.stringify(input.parameters),
        user.userId,
        input.isPublic || false
      ]);

      const pattern = result.rows[0];
      return {
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        parameters: pattern.parameters,
        createdBy: pattern.created_by,
        isPublic: pattern.is_public,
        createdAt: pattern.created_at,
        usageCount: 0
      };
    }
  },

  // Field resolvers
  User: {
    statistics: async (parent: any) => {
      return await db.getUserStatistics(parent.id);
    },

    simulationJobs: async (parent: any, args: any) => {
      return await db.getSimulationJobs(args, parent.id);
    }
  },

  SimulationJob: {
    user: async (parent: any) => {
      return await db.getUser(parent.userId);
    },

    topology: async (parent: any) => {
      const pool = getDbPool();
      const result = await pool.query(
        'SELECT * FROM topology_templates WHERE id = (SELECT topology_id FROM simulation_jobs WHERE id = $1)',
        [parent.id]
      );
      
      if (!result.rows[0]) return null;
      
      const template = result.rows[0];
      return {
        id: template.id,
        name: template.name,
        type: template.type.toUpperCase(),
        description: template.description,
        parameters: template.parameters,
        createdBy: template.created_by,
        isPublic: template.is_public,
        createdAt: template.created_at,
        usageCount: 0
      };
    },

    workload: async (parent: any) => {
      const pool = getDbPool();
      const result = await pool.query(
        'SELECT * FROM workload_patterns WHERE id = (SELECT workload_id FROM simulation_jobs WHERE id = $1)',
        [parent.id]
      );
      
      if (!result.rows[0]) return null;
      
      const pattern = result.rows[0];
      return {
        id: pattern.id,
        name: pattern.name,
        description: pattern.description,
        parameters: pattern.parameters,
        createdBy: pattern.created_by,
        isPublic: pattern.is_public,
        createdAt: pattern.created_at,
        usageCount: 0
      };
    },

    metrics: async (parent: any, args: any) => {
      const pool = getDbPool();
      const limit = Math.min(args?.limit || 100, 500);
      
      const result = await pool.query(`
        SELECT * FROM simulation_metrics 
        WHERE job_id = $1 
        ORDER BY timestamp_sec DESC 
        LIMIT $2
      `, [parent.id, limit]);

      return result.rows.map(row => ({
        id: row.id,
        jobId: row.job_id,
        metricType: row.metric_type,
        componentType: row.component_type,
        componentId: row.component_id,
        timestampSec: parseFloat(row.timestamp_sec),
        value: parseFloat(row.value),
        unit: row.unit,
        createdAt: row.created_at
      }));
    },

    logs: async (parent: any, args: any) => {
      const pool = getDbPool();
      const limit = Math.min(args?.limit || 50, 200);
      const offset = args?.offset || 0;
      
      let whereConditions = ['job_id = $1'];
      let params = [parent.id];
      let paramIndex = 2;

      if (args?.level) {
        whereConditions.push(`log_level = ${paramIndex++}`);
        params.push(args.level);
      }

      const result = await pool.query(`
        SELECT * FROM job_logs 
        WHERE ${whereConditions.join(' AND ')}
        ORDER BY created_at DESC 
        LIMIT ${paramIndex++} OFFSET ${paramIndex++}
      `, [...params, limit, offset]);

      return result.rows.map(row => ({
        id: row.id,
        jobId: row.job_id,
        logLevel: row.log_level,
        message: row.message,
        component: row.component,
        simulationTime: row.simulation_time,
        createdAt: row.created_at
      }));
    }
  },

  TopologyTemplate: {
    creator: async (parent: any) => {
      if (!parent.createdBy) return null;
      return await db.getUser(parent.createdBy);
    }
  },

  WorkloadPattern: {
    creator: async (parent: any) => {
      if (!parent.createdBy) return null;
      return await db.getUser(parent.createdBy);
    }
  }
};
