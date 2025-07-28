// api-gateway/src/websocket/websocketServer.ts - FIXED VERSION
import { Server } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Pool } from 'pg';

// Use require for JWT to avoid type issues
const jwt = require('jsonwebtoken');

// Import Redis conditionally
let Redis: any = null;
try {
  Redis = require('redis');
} catch (error) {
  console.warn('⚠️ Redis not available, real-time updates will use polling');
}

interface AuthenticatedSocket extends Socket {
  userId?: number;
  userEmail?: string;
}

export class WebSocketServer {
  private io: SocketIOServer;
  private dbPool: Pool;
  private redisClient: any;
  private connectedUsers: Map<number, Set<string>> = new Map();

  constructor(server: Server) {
    // Initialize Socket.IO with CORS
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
        credentials: true
      },
      path: '/socket.io/'
    });

    // Initialize database connection
    this.dbPool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    // Initialize Redis for pub/sub
    this.initializeRedis();
    
    // Set up authentication middleware
    this.setupAuthentication();
    
    // Set up connection handling
    this.setupConnectionHandling();
    
    // Set up Redis pub/sub for job updates
    this.setupJobUpdateSubscription();

    console.log('🔗 WebSocket server initialized');
  }

  private async initializeRedis() {
    if (!Redis) {
      console.warn('⚠️ Redis not available, using database polling for updates');
      this.setupDatabasePolling();
      return;
    }

    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisClient = Redis.createClient({ url: redisUrl });
      this.redisClient.on('error', (err: any) => console.log('Redis Client Error', err));
      await this.redisClient.connect();
      console.log('✅ WebSocket Redis client connected');
    } catch (error) {
      console.warn('⚠️ WebSocket Redis connection failed, using database polling:', error);
      this.setupDatabasePolling();
    }
  }

  private setupAuthentication() {
    // Authentication middleware for WebSocket connections
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                     socket.handshake.headers.authorization?.split(' ')[1];
        
        if (!token) {
          return next(new Error('Authentication token required'));
        }

        const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
          return next(new Error('JWT configuration error'));
        }

        // Verify JWT token
        const decoded: any = jwt.verify(token, jwtSecret);
        
        // Attach user info to socket
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        
        console.log(`🔐 WebSocket authenticated: ${decoded.email} (ID: ${decoded.userId})`);
        next();
        
      } catch (error: any) {
        console.error('💥 WebSocket authentication failed:', error.message);
        next(new Error('Invalid authentication token'));
      }
    });
  }

  private setupConnectionHandling() {
    this.io.on('connection', (socket: AuthenticatedSocket) => {
      const userId = socket.userId!;
      const userEmail = socket.userEmail!;

      console.log(`👋 User connected via WebSocket: ${userEmail} (${socket.id})`);

      // Track connected users
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      this.connectedUsers.get(userId)!.add(socket.id);

      // Join user-specific room for targeted updates
      socket.join(`user-${userId}`);

      // Handle subscription to specific jobs
      socket.on('subscribe-job', (jobId: string) => {
        this.handleJobSubscription(socket, jobId, userId);
      });

      // Handle unsubscription from jobs
      socket.on('unsubscribe-job', (jobId: string) => {
        socket.leave(`job-${jobId}`);
        console.log(`📤 User ${userEmail} unsubscribed from job ${jobId}`);
      });

      // Handle getting current job status
      socket.on('get-job-status', (jobId: string) => {
        this.sendCurrentJobStatus(socket, jobId, userId);
      });

      // Handle getting user's active jobs
      socket.on('get-active-jobs', () => {
        this.sendActiveJobs(socket, userId);
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`👋 User disconnected: ${userEmail} (${reason})`);
        
        // Remove from connected users tracking
        const userSockets = this.connectedUsers.get(userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.connectedUsers.delete(userId);
          }
        }
      });

      // Send initial connection success
      socket.emit('connected', {
        message: 'WebSocket connected successfully',
        userId,
        userEmail,
        timestamp: new Date().toISOString()
      });
    });
  }

  private async handleJobSubscription(socket: AuthenticatedSocket, jobId: string, userId: number) {
    try {
      // Verify user owns this job
      const result = await this.dbPool.query(
        'SELECT id, name, status FROM simulation_jobs WHERE id = $1 AND user_id = $2',
        [jobId, userId]
      );

      if (result.rows.length === 0) {
        socket.emit('error', {
          message: 'Job not found or access denied',
          jobId
        });
        return;
      }

      // Join job-specific room
      socket.join(`job-${jobId}`);
      
      console.log(`📩 User ${socket.userEmail} subscribed to job ${jobId}`);
      
      // Send confirmation and current status
      socket.emit('job-subscribed', {
        jobId,
        jobName: result.rows[0].name,
        currentStatus: result.rows[0].status,
        timestamp: new Date().toISOString()
      });

      // Send current job status immediately
      await this.sendCurrentJobStatus(socket, jobId, userId);

    } catch (error) {
      console.error('💥 Job subscription error:', error);
      socket.emit('error', {
        message: 'Failed to subscribe to job updates',
        jobId
      });
    }
  }

  private async sendCurrentJobStatus(socket: AuthenticatedSocket, jobId: string, userId: number) {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          sj.id, sj.name, sj.status, sj.created_at, sj.started_at, sj.completed_at,
          sj.total_throughput, sj.average_latency, sj.error_message,
          sj.simulation_time
        FROM simulation_jobs sj
        WHERE sj.id = $1 AND sj.user_id = $2
      `, [jobId, userId]);

      if (result.rows.length === 0) {
        return;
      }

      const job = result.rows[0];
      
      // Calculate progress for running jobs
      let progress = 0;
      if (job.status === 'completed') {
        progress = 100;
      } else if (job.status === 'running' && job.started_at) {
        const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
        const simTime = parseFloat(job.simulation_time);
        progress = Math.min(95, (elapsed / simTime) * 100); // Max 95% until actually complete
      }

      // Get recent logs
      const logsResult = await this.dbPool.query(`
        SELECT log_level, message, component, simulation_time, created_at
        FROM job_logs 
        WHERE job_id = $1 
        ORDER BY created_at DESC 
        LIMIT 5
      `, [jobId]);

      // Get recent metrics if completed
      let metrics = [];
      if (job.status === 'completed') {
        const metricsResult = await this.dbPool.query(`
          SELECT metric_type, value, unit, timestamp_sec
          FROM simulation_metrics 
          WHERE job_id = $1 
          ORDER BY timestamp_sec DESC 
          LIMIT 20
        `, [jobId]);
        metrics = metricsResult.rows;
      }

      const statusUpdate = {
        jobId,
        status: job.status,
        progress: Math.round(progress),
        name: job.name,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
        results: job.status === 'completed' ? {
          totalThroughput: job.total_throughput,
          averageLatency: job.average_latency
        } : null,
        errorMessage: job.error_message,
        recentLogs: logsResult.rows,
        metrics: metrics,
        timestamp: new Date().toISOString()
      };

      socket.emit('job-status-update', statusUpdate);

    } catch (error) {
      console.error('💥 Error sending job status:', error);
    }
  }

  private async sendActiveJobs(socket: AuthenticatedSocket, userId: number) {
    try {
      const result = await this.dbPool.query(`
        SELECT id, name, status, created_at, started_at, simulation_time
        FROM simulation_jobs 
        WHERE user_id = $1 AND status IN ('queued', 'running')
        ORDER BY created_at DESC
      `, [userId]);

      const activeJobs = result.rows.map(job => {
        let progress = 0;
        if (job.status === 'running' && job.started_at) {
          const elapsed = (Date.now() - new Date(job.started_at).getTime()) / 1000;
          const simTime = parseFloat(job.simulation_time);
          progress = Math.min(95, (elapsed / simTime) * 100);
        }

        return {
          id: job.id,
          name: job.name,
          status: job.status,
          progress: Math.round(progress),
          createdAt: job.created_at,
          startedAt: job.started_at
        };
      });

      socket.emit('active-jobs', {
        jobs: activeJobs,
        count: activeJobs.length,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('💥 Error sending active jobs:', error);
    }
  }

  private setupJobUpdateSubscription() {
    if (!this.redisClient) {
      console.warn('⚠️ Redis not available, using database polling for job updates');
      this.setupDatabasePolling();
      return;
    }

    try {
      // Subscribe to job update notifications from Redis
      const subscriber = this.redisClient.duplicate();
      subscriber.connect().then(() => {
        subscriber.subscribe('job-updates', (message: string) => {
          try {
            const update = JSON.parse(message);
            this.broadcastJobUpdate(update);
          } catch (error) {
            console.error('💥 Error processing job update:', error);
          }
        });
      });

      console.log('📡 Subscribed to Redis job updates');
    } catch (error) {
      console.error('💥 Redis subscription error:', error);
      this.setupDatabasePolling();
    }
  }

  private setupDatabasePolling() {
    // Fallback: Poll database for job status changes
    setInterval(async () => {
      try {
        // Get all running jobs that might have updates
        const result = await this.dbPool.query(`
          SELECT DISTINCT user_id, id as job_id 
          FROM simulation_jobs 
          WHERE status IN ('running', 'queued') 
          AND updated_at > NOW() - INTERVAL '1 minute'
        `);

        for (const row of result.rows) {
          // Send updates to connected users for their jobs
          if (this.connectedUsers.has(row.user_id)) {
            this.io.to(`user-${row.user_id}`).emit('job-poll-update', {
              jobId: row.job_id,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (error) {
        console.error('💥 Database polling error:', error);
      }
    }, 10000); // Poll every 10 seconds
  }

  public broadcastJobUpdate(update: any) {
    const { jobId, userId, status, progress, message, results } = update;

    console.log(`📡 Broadcasting job update: ${jobId} - ${status}`);

    // Broadcast to job-specific room
    this.io.to(`job-${jobId}`).emit('job-update', {
      jobId,
      status,
      progress,
      message,
      results,
      timestamp: new Date().toISOString()
    });

    // Also broadcast to user-specific room
    if (userId) {
      this.io.to(`user-${userId}`).emit('job-update', {
        jobId,
        status,
        progress,
        message,
        results,
        timestamp: new Date().toISOString()
      });
    }
  }

  public async notifyJobStatusChange(jobId: string, status: string, userId?: number, results?: any) {
    // Publish to Redis for other instances (if available)
    if (this.redisClient) {
      try {
        await this.redisClient.publish('job-updates', JSON.stringify({
          jobId,
          userId,
          status,
          results,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error('💥 Failed to publish job update to Redis:', error);
      }
    }

    // Direct broadcast for current instance
    this.broadcastJobUpdate({
      jobId,
      userId,
      status,
      results
    });
  }

  public getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  public getConnectionsCount(): number {
    return this.io.engine.clientsCount;
  }
}