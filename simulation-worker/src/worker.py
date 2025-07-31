#!/usr/bin/env python3
"""
Enhanced Simulation Worker with WebSocket Real-time Updates
Sends live progress updates to connected clients via Redis pub/sub
"""

import os
import json
import time
import random
import logging
import psycopg2
from datetime import datetime

# Redis for real-time updates
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    print("⚠️ Redis not available, real-time updates disabled")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class RealtimeSimulationWorker:
    def __init__(self):
        self.worker_id = f"realtime-worker-{os.getpid()}-{int(time.time())}"
        self.db_connection = None
        self.redis_client = None
        self.redis_publisher = None
        self.running = False
        
    def initialize(self):
        """Initialize database and Redis connections"""
        try:
            # Database connection (required)
            db_url = os.getenv('DATABASE_URL', 'postgresql://hpc_user:hpc_password@postgres:5432/hpc_simulation')
            self.db_connection = psycopg2.connect(db_url)
            self.db_connection.autocommit = True
            logger.info(f"✅ Connected to PostgreSQL")
            
            # Redis connection (optional for real-time updates)
            if REDIS_AVAILABLE:
                try:
                    redis_url = os.getenv('REDIS_URL', 'redis://redis:6379')
                    self.redis_client = redis.Redis.from_url(redis_url, decode_responses=True)
                    self.redis_client.ping()
                    
                    # Separate client for publishing to avoid blocking
                    self.redis_publisher = redis.Redis.from_url(redis_url, decode_responses=True)
                    self.redis_publisher.ping()
                    
                    logger.info(f"✅ Connected to Redis for real-time updates")
                except Exception as redis_error:
                    logger.warning(f"⚠️ Redis connection failed: {redis_error}")
                    logger.info("📦 Real-time updates disabled")
                    self.redis_client = None
                    self.redis_publisher = None
            
            logger.info(f"🔧 Realtime Worker initialized: {self.worker_id}")
            return True
            
        except Exception as e:
            logger.error(f"💥 Failed to initialize worker: {e}")
            return False
    
    def send_realtime_update(self, job_id, status, progress=None, message=None, user_id=None, results=None):
        """Send real-time update via Redis pub/sub"""
        if not self.redis_publisher:
            return
        
        try:
            update = {
                'jobId': job_id,
                'userId': user_id,
                'status': status,
                'progress': progress,
                'message': message,
                'results': results,
                'workerId': self.worker_id,
                'timestamp': datetime.now().isoformat()
            }
            
            # Publish to job-updates channel for WebSocket server
            self.redis_publisher.publish('job-updates', json.dumps(update))
            logger.info(f"📡 Sent real-time update for job {job_id}: {status} ({progress}%)")
            
        except Exception as e:
            logger.error(f"💥 Failed to send real-time update: {e}")
    
    def process_queue(self):
        """Main queue processing loop with real-time updates"""
        self.running = True
        logger.info("🚀 Starting realtime queue processing...")
        
        while self.running:
            try:
                # Get job from database queue
                job_id = self.get_job_from_database()
                
                if job_id:
                    logger.info(f"🎯 Processing job: {job_id}")
                    self.process_job(job_id)
                else:
                    logger.info("😴 No jobs found, sleeping...")
                    time.sleep(5)
                
            except KeyboardInterrupt:
                logger.info("🛑 Received shutdown signal")
                self.running = False
                break
            except Exception as e:
                logger.error(f"💥 Queue processing error: {e}")
                time.sleep(10)
    
    def get_job_from_database(self):
        """Get next job from database queue"""
        try:
            cursor = self.db_connection.cursor()
            
            # Get the oldest unclaimed job
            cursor.execute("""
                UPDATE job_queue 
                SET claimed_at = NOW(), worker_id = %s
                WHERE id = (
                    SELECT id FROM job_queue 
                    WHERE claimed_at IS NULL 
                    ORDER BY queued_at ASC 
                    LIMIT 1
                    FOR UPDATE SKIP LOCKED
                )
                RETURNING job_id
            """, (self.worker_id,))
            
            result = cursor.fetchone()
            return result[0] if result else None
            
        except Exception as e:
            logger.error(f"💥 Database queue error: {e}")
            return None
    
    def process_job(self, job_id):
        """Process a simulation job with real-time updates"""
        try:
            # Get job details and user info
            cursor = self.db_connection.cursor()
            cursor.execute("""
                SELECT 
                    sj.id, sj.user_id, sj.name, sj.simulation_time, sj.num_compute_nodes, 
                    sj.work_type, sj.data_size_mb, sj.custom_parameters,
                    tt.parameters as topology_params, 
                    wp.parameters as workload_params
                FROM simulation_jobs sj
                LEFT JOIN topology_templates tt ON sj.topology_id = tt.id
                LEFT JOIN workload_patterns wp ON sj.workload_id = wp.id
                WHERE sj.id = %s AND sj.status = 'queued'
            """, (job_id,))
            
            job = cursor.fetchone()
            if not job:
                logger.warning(f"❌ Job {job_id} not found or not queued")
                return
            
            # Extract job data
            job_id = job[0]
            user_id = job[1]
            job_name = job[2]
            sim_time = float(job[3])
            compute_nodes = job[4]
            work_type = job[5]
            data_size = float(job[6])
            
            # Handle JSON fields safely
            custom_params = self.safe_json_parse(job[7], {})
            topology_params = self.safe_json_parse(job[8], {})
            workload_params = self.safe_json_parse(job[9], {})
            
            logger.info(f"📊 Job details: {job_name}, {sim_time}s, {compute_nodes} nodes, {work_type} workload")
            
            # Update status to running and send real-time update
            cursor.execute("""
                UPDATE simulation_jobs 
                SET status = 'running', worker_id = %s, started_at = NOW()
                WHERE id = %s
            """, (self.worker_id, job_id))
            
            cursor.execute("""
                INSERT INTO job_logs (job_id, log_level, message, component)
                VALUES (%s, 'INFO', %s, 'worker')
            """, (job_id, f'Job started by {self.worker_id}'))
            
            # Send real-time update: Job started
            self.send_realtime_update(
                job_id, 'running', 0, 
                f'Simulation started: {job_name}', 
                user_id
            )
            
            # Run simulation with progress updates
            results = self.run_simulation_with_updates(job_id, job_name, sim_time, compute_nodes, work_type, data_size, user_id)
            
            # Update job with results
            cursor.execute("""
                UPDATE simulation_jobs 
                SET status = 'completed', 
                    completed_at = NOW(),
                    total_throughput = %s,
                    average_latency = %s,
                    max_queue_length = %s
                WHERE id = %s
            """, (results['throughput'], results['latency'], results['queue_length'], job_id))
            
            # Add completion log
            cursor.execute("""
                INSERT INTO job_logs (job_id, log_level, message, component)
                VALUES (%s, 'INFO', %s, 'worker')
            """, (job_id, f'Simulation completed. Throughput: {results["throughput"]:.2f} MB/s, Latency: {results["latency"]:.2f} ms'))
            
            # Remove from queue
            cursor.execute("DELETE FROM job_queue WHERE job_id = %s", (job_id,))
            
            # Send final real-time update: Job completed
            self.send_realtime_update(
                job_id, 'completed', 100, 
                f'Simulation completed successfully', 
                user_id, results
            )
            
            logger.info(f"✅ Job {job_id} completed successfully - Throughput: {results['throughput']:.2f} MB/s")
            
        except Exception as e:
            logger.error(f"💥 Job processing error for {job_id}: {e}")
            import traceback
            logger.error(f"📍 Full traceback: {traceback.format_exc()}")
            
            try:
                cursor.execute("""
                    UPDATE simulation_jobs 
                    SET status = 'failed', completed_at = NOW(), error_message = %s
                    WHERE id = %s
                """, (str(e), job_id))
                cursor.execute("DELETE FROM job_queue WHERE job_id = %s", (job_id,))
                cursor.execute("""
                    INSERT INTO job_logs (job_id, log_level, message, component)
                    VALUES (%s, 'ERROR', %s, 'worker')
                """, (job_id, f'Job failed: {str(e)}'))
                
                # Send real-time update: Job failed
                self.send_realtime_update(
                    job_id, 'failed', None, 
                    f'Simulation failed: {str(e)}', 
                    user_id
                )
                
            except Exception as cleanup_error:
                logger.error(f"💥 Failed to update failed job status: {cleanup_error}")
    
    def run_simulation_with_updates(self, job_id, job_name, sim_time, compute_nodes, work_type, data_size, user_id):
        """Run simulation with real-time progress updates"""
        logger.info(f"🧮 Running simulation: {job_name} for {sim_time} seconds")
        
        cursor = self.db_connection.cursor()
        
        # Simulation parameters
        steps = max(10, int(sim_time * 2))  # At least 10 steps, 2 per second
        step_duration = sim_time / steps
        
        # Generate realistic results based on parameters
        base_throughput = compute_nodes * 0.8  # MB/s per node
        base_latency = 20.0  # Base latency in ms
        
        # Workload type effects
        if work_type == 'read':
            throughput_multiplier = 1.2
            latency_multiplier = 0.8
        elif work_type == 'write':
            throughput_multiplier = 0.8
            latency_multiplier = 1.3
        else:  # mixed
            throughput_multiplier = 1.0
            latency_multiplier = 1.0
        
        max_queue_length = 0
        total_throughput = 0
        total_latency = 0
        
        # Run simulation steps with progress updates
        for step in range(steps):
            current_time = step * step_duration
            progress = int((step + 1) / steps * 100)
            
            # Add some randomness
            throughput_variation = random.uniform(0.8, 1.2)
            latency_variation = random.uniform(0.9, 1.1)
            
            # Calculate current metrics
            current_throughput = base_throughput * throughput_multiplier * throughput_variation
            current_latency = base_latency * latency_multiplier * latency_variation
            queue_length = max(0, int(random.gauss(compute_nodes / 4, 2)))
            
            max_queue_length = max(max_queue_length, queue_length)
            total_throughput += current_throughput
            total_latency += current_latency
            
            # Store metrics every few steps
            if step % max(1, steps // 15) == 0:  # Store ~15 data points
                cursor.execute("""
                    INSERT INTO simulation_metrics 
                    (job_id, metric_type, component_type, timestamp_sec, value, unit)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (job_id, 'throughput', 'network', current_time, current_throughput, 'MB/s'))
                
                cursor.execute("""
                    INSERT INTO simulation_metrics 
                    (job_id, metric_type, component_type, timestamp_sec, value, unit)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (job_id, 'latency', 'network', current_time, current_latency, 'ms'))
                
                # Log progress
                logger.info(f"📈 Job {job_id} progress: {progress}% - Throughput: {current_throughput:.2f} MB/s")
                
                cursor.execute("""
                    INSERT INTO job_logs (job_id, log_level, message, component, simulation_time)
                    VALUES (%s, 'INFO', %s, 'simulator', %s)
                """, (job_id, f'Progress: {progress}% - Throughput: {current_throughput:.2f} MB/s', current_time))
                
                # Send real-time progress update
                self.send_realtime_update(
                    job_id, 'running', progress,
                    f'Simulation progress: {progress}% - Current throughput: {current_throughput:.2f} MB/s',
                    user_id
                )
            
            # Sleep to simulate processing time
            time.sleep(max(0.1, step_duration))
        
        # Calculate final averages
        avg_throughput = total_throughput / steps
        avg_latency = total_latency / steps
        
        results = {
            'throughput': round(avg_throughput, 6),
            'latency': round(avg_latency, 6),
            'queue_length': max_queue_length
        }
        
        logger.info(f"📊 Simulation results: {results}")
        return results
    
    def safe_json_parse(self, data, default):
        """Safely parse JSON data handling both string and dict types"""
        try:
            if data is None:
                return default
            if isinstance(data, str):
                return json.loads(data)
            elif isinstance(data, dict):
                return data
            else:
                return default
        except:
            return default
    
    def shutdown(self):
        """Shutdown worker with cleanup"""
        logger.info("🛑 Shutting down realtime worker...")
        self.running = False
        
        if self.db_connection:
            self.db_connection.close()
        
        if self.redis_client:
            self.redis_client.close()
        
        if self.redis_publisher:
            self.redis_publisher.close()

def main():
    logger.info("🚀 Starting Realtime Simulation Worker with WebSocket Updates")
    
    worker = RealtimeSimulationWorker()
    
    if not worker.initialize():
        logger.error("💥 Failed to initialize worker")
        return
    
    try:
        worker.process_queue()
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal")
    finally:
        worker.shutdown()

if __name__ == "__main__":
    main()