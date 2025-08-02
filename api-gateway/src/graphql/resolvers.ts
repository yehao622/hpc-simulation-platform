// api-gateway/src/graphql/resolvers.ts
// Final Fixed GraphQL Resolvers for HPC Simulation Platform

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
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        SUM(simulation_time) as total_simulation_time,
        AVG(CASE WHEN total_throughput > 0 THEN total_throughput END) as avg_throughput
      FROM simulation_jobs 
      WHERE user_id = $1
    `, [userId]);
    
    const stats = result.rows[0];
    return {
      totalJobs: parseInt(stats.total_jobs) || 0,
      completedJobs: parseInt(stats.completed_jobs) || 0,
      runningJobs: parseInt(stats.running_jobs) || 0,
      failedJobs: parseInt(stats.failed_jobs) || 0,
      totalSimulationTime: parseFloat(stats.total_simulation_time) || 0,
      avgThroughput: parseFloat(stats.avg_throughput) || null
    };
  }

  async getSimulationJob(jobId: string) {
    const result = await this.pool.query(`
      SELECT id, user_id, name, description, status, simulation_time,
             created_at, started_at, completed_at, progress,
             total_throughput, average_latency, max_queue_length
      FROM simulation_jobs WHERE id = $1
    `, [jobId]);
    
    return result.rows[0] ? this.formatSimulationJob(result.rows[0]) : null;
  }

  async getSimulationJobs(limit: number, offset: number, status?: string, userId?: number) {
    let query = `
      SELECT id, user_id, name, description, status, simulation_time,
             created_at, started_at, completed_at, progress,
             total_throughput, average_latency, max_queue_length
      FROM simulation_jobs
    `;
    
    const conditions = [];
    const params: any[] = [];
    let paramCount = 0;
    
    if (status) {
      paramCount++;
      conditions.push(`status = $${paramCount}`);
      params.push(status);
    }
    
    if (userId) {
      paramCount++;
      conditions.push(`user_id = $${paramCount}`);
      params.push(userId);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);
    
    const result = await this.pool.query(query, params);
    return result.rows.map(row => this.formatSimulationJob(row));
  }

  async createSimulationJob(input: any, userId: number) {
    const jobId = uuidv4();
    
    const result = await this.pool.query(`
      INSERT INTO simulation_jobs (
        id, user_id, name, description, topology_id, workload_id,
        simulation_time, num_compute_nodes, num_storage_nodes,
        work_type, data_size_mb, read_probability, request_rate,
        status, progress, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'queued', 0, NOW()
      ) RETURNING *
    `, [
      jobId, userId, input.name, input.description || null,
      input.topologyId, input.workloadId, input.simulationTime,
      input.numComputeNodes, input.numStorageNodes, input.workType,
      input.dataSizeMb, input.readProbability, input.requestRate
    ]);
    
    return this.formatSimulationJob(result.rows[0]);
  }

  private formatSimulationJob(row: any) {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      description: row.description,
      status: row.status.toUpperCase(),
      simulationTime: parseFloat(row.simulation_time),
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      progress: parseInt(row.progress) || 0,
      results: (row.total_throughput || row.average_latency || row.max_queue_length) ? {
        totalThroughput: parseFloat(row.total_throughput) || 0,
        averageLatency: parseFloat(row.average_latency) || 0,
        maxQueueLength: parseInt(row.max_queue_length) || 0
      } : null
    };
  }

  async getTopologyTemplates(limit: number, offset: number) {
    const result = await this.pool.query(`
      SELECT id, name, type, description, parameters, is_public, created_at
      FROM topology_templates
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      description: row.description,
      parameters: row.parameters,
      isPublic: row.is_public,
      createdAt: row.created_at
    }));
  }

  async getWorkloadPatterns(limit: number, offset: number) {
    const result = await this.pool.query(`
      SELECT id, name, description, parameters, is_public, created_at
      FROM workload_patterns
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      parameters: row.parameters,
      isPublic: row.is_public,
      createdAt: row.created_at
    }));
  }

  async searchJobs(query: string, limit: number, userId?: number) {
    let searchQuery = `
      SELECT id, user_id, name, description, status, simulation_time,
             created_at, started_at, completed_at, progress,
             total_throughput, average_latency, max_queue_length
      FROM simulation_jobs
      WHERE (name ILIKE $1 OR description ILIKE $1)
    `;
    
    const params: any[] = [`%${query}%`];
    
    if (userId) {
      searchQuery += ' AND user_id = $2 LIMIT $3';
      params.push(userId.toString(), limit.toString());
    } else {
      searchQuery += ' LIMIT $2';
      params.push(limit.toString());
    }
    
    searchQuery += ' ORDER BY created_at DESC';
    
    const result = await this.pool.query(searchQuery, params);
    return result.rows.map(row => this.formatSimulationJob(row));
  }
}

// Create database service instance
const db = new DatabaseService();

// GraphQL Resolvers
export const resolvers = {
  // Custom scalars
  DateTime: DateTimeScalar,
  JSON: GraphQLJSON,

  // Query resolvers
  Query: {
    me: async (_: any, __: any, context: any) => {
      const user = requireAuth(context);
      return await db.getUser(user.userId);
    },

    user: async (_: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      return await db.getUser(parseInt(id, 10));
    },

    users: async (_: any, { limit, offset }: { limit: number; offset: number }, context: any) => {
      requireRole(context, ['admin']);
      
      const result = await context.db.query(`
        SELECT id, email, username, first_name, last_name, organization, 
               role, is_active, created_at, updated_at
        FROM users 
        ORDER BY created_at DESC 
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
      
      return result.rows.map((row: any) => ({
        id: row.id,
        email: row.email,
        username: row.username,
        firstName: row.first_name,
        lastName: row.last_name,
        organization: row.organization,
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    },

    simulationJob: async (_: any, { id }: { id: string }, context: any) => {
      requireAuth(context);
      return await db.getSimulationJob(id);
    },

    simulationJobs: async (_: any, { limit, offset, status }: { limit: number; offset: number; status?: string }, context: any) => {
      const user = requireAuth(context);
      return await db.getSimulationJobs(limit, offset, status, user.userId);
    },

    topologyTemplates: async (_: any, { limit, offset }: { limit: number; offset: number }, context: any) => {
      requireAuth(context);
      return await db.getTopologyTemplates(limit, offset);
    },

    workloadPatterns: async (_: any, { limit, offset }: { limit: number; offset: number }, context: any) => {
      requireAuth(context);
      return await db.getWorkloadPatterns(limit, offset);
    },

    searchJobs: async (_: any, { query, limit }: { query: string; limit: number }, context: any) => {
      const user = requireAuth(context);
      return await db.searchJobs(query, limit, user.userId);
    },
  },

  // Mutation resolvers
  Mutation: {
    createSimulationJob: async (_: any, { input }: { input: any }, context: any) => {
      const user = requireAuth(context);
      
      // Validate input
      if (!input.name || input.name.length < 3) {
        throw new UserInputError('Job name must be at least 3 characters long');
      }
      
      if (input.simulationTime <= 0 || input.simulationTime > 3600) {
        throw new UserInputError('Simulation time must be between 0 and 3600 seconds');
      }
      
      return await db.createSimulationJob(input, user.userId);
    },

    updateSimulationJobStatus: async (_: any, { id, status }: { id: string; status: string }, context: any) => {
      const user = requireAuth(context);
      
      // Check if user owns the job or is admin
      const job = await db.getSimulationJob(id);
      if (!job) {
        throw new UserInputError('Job not found');
      }
      
      if (job.userId !== user.userId && user.role !== 'admin') {
        throw new ForbiddenError('Not authorized to update this job');
      }
      
      const result = await context.db.query(`
        UPDATE simulation_jobs 
        SET status = $1, updated_at = NOW()
        WHERE id = $2 
        RETURNING *
      `, [status.toLowerCase(), id]);
      
      if (result.rows.length === 0) {
        throw new UserInputError('Job not found');
      }
      
      return db.getSimulationJob(id);
    },

    cancelSimulationJob: async (_: any, { id }: { id: string }, context: any) => {
      const user = requireAuth(context);
      
      // Check if user owns the job
      const job = await db.getSimulationJob(id);
      if (!job) {
        throw new UserInputError('Job not found');
      }
      
      if (job.userId !== user.userId && user.role !== 'admin') {
        throw new ForbiddenError('Not authorized to cancel this job');
      }
      
      await context.db.query(`
        UPDATE simulation_jobs 
        SET status = 'cancelled', updated_at = NOW()
        WHERE id = $1 AND status IN ('queued', 'running')
      `, [id]);
      
      return await db.getSimulationJob(id);
    },
  },

  // Type resolvers
  User: {
    statistics: async (parent: any, _: any, context: any) => {
      return await db.getUserStatistics(parent.id);
    },
  },

  SimulationJob: {
    user: async (parent: any, _: any, context: any) => {
      return await db.getUser(parent.userId);
    },
  },

  // Subscription resolvers (placeholder)
  Subscription: {
    jobUpdated: {
      // This would be implemented with a pub/sub system like Redis
      subscribe: () => {
        throw new Error('Subscriptions not implemented yet');
      },
    },
    userJobsUpdated: {
      subscribe: () => {
        throw new Error('Subscriptions not implemented yet');
      },
    },
  },
};