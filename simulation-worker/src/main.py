#!/usr/bin/env python3
# Simulation Worker - Process HPC simulation jobs

import asyncio
import asyncpg
import redis.asyncio as redis
import json
import logging
import os
import time
import random
from datetime import datetime, timedelta
from typing import Dict, Any, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class SimulationWorker:
    def __init__(self):
        self.db_pool = None
        self.redis_client = None
        self.running = False
        
    async def initialize(self):
        """Initialize database and Redis connections"""
        try:
            # Database connection
            self.db_pool = await asyncpg.create_pool(
                host=os.getenv('DB_HOST', 'postgres'),
                port=int(os.getenv('DB_PORT', 5432)),
                user=os.getenv('DB_USER', 'smartops'),
                password=os.getenv('DB_PASSWORD', 'smartops123'),
                database=os.getenv('DB_NAME', 'smartops_platform'),
                min_size=2,
                max_size=5
            )
            logger.info("✅ Database connection established")
            
            # Redis connection
            self.redis_client = redis.Redis(
                host=os.getenv('REDIS_HOST', 'redis'),
                port=int(os.getenv('REDIS_PORT', 6379)),
                db=0,
                decode_responses=True
            )
            await self.redis_client.ping()
            logger.info("✅ Redis connection established")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize connections: {e}")
            raise
    
    async def get_pending_job(self) -> Optional[Dict[str, Any]]:
        """Get a pending simulation job from the database"""
        try:
            async with self.db_pool.acquire() as conn:
                # Get oldest pending job and mark as running
                job = await conn.fetchrow("""
                    UPDATE simulation_jobs 
                    SET status = 'running', 
                        started_at = NOW(),
                        updated_at = NOW()
                    WHERE id = (
                        SELECT id FROM simulation_jobs 
                        WHERE status = 'queued' 
                        ORDER BY created_at ASC 
                        LIMIT 1
                        FOR UPDATE SKIP LOCKED
                    )
                    RETURNING *
                """)
                
                if job:
                    job_dict = dict(job)
                    logger.info(f"🚀 Started job {job_dict['id']}: {job_dict['name']}")
                    return job_dict
                    
        except Exception as e:
            logger.error(f"❌ Error getting pending job: {e}")
        
        return None
    
    async def simulate_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Simulate running a job and generate results"""
        job_id = job['id']
        topology_type = job.get('topology_type', 'mesh')
        
        logger.info(f"🔄 Processing job {job_id} with topology: {topology_type}")
        
        # Simulate job processing with progress updates
        total_steps = 10
        for step in range(total_steps + 1):
            progress = (step / total_steps) * 100
            
            # Update progress in database
            await self.update_job_progress(job_id, progress)
            
            # Publish progress update via Redis
            await self.publish_progress_update(job_id, progress, "running")
            
            # Simulate processing time
            await asyncio.sleep(random.uniform(0.5, 2.0))
            
            logger.info(f"📊 Job {job_id} progress: {progress:.1f}%")
        
        # Generate simulation results
        results = self.generate_simulation_results(topology_type)
        
        logger.info(f"✅ Job {job_id} completed successfully")
        return results
    
    async def update_job_progress(self, job_id: int, progress: float):
        """Update job progress in database"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE simulation_jobs 
                    SET progress = $1, updated_at = NOW()
                    WHERE id = $2
                """, progress, job_id)
        except Exception as e:
            logger.error(f"❌ Error updating job progress: {e}")
    
    async def publish_progress_update(self, job_id: int, progress: float, status: str):
        """Publish progress update via Redis pub/sub"""
        try:
            update_data = {
                'job_id': job_id,
                'progress': progress,
                'status': status,
                'timestamp': datetime.utcnow().isoformat()
            }
            
            await self.redis_client.publish(
                f'job_updates:{job_id}', 
                json.dumps(update_data)
            )
            
            # Also publish to general channel
            await self.redis_client.publish(
                'job_updates', 
                json.dumps(update_data)
            )
            
        except Exception as e:
            logger.error(f"❌ Error publishing progress update: {e}")
    
    def generate_simulation_results(self, topology_type: str) -> Dict[str, Any]:
        """Generate realistic simulation results"""
        
        # Base performance metrics
        base_metrics = {
            'mesh': {'throughput': 850, 'latency': 12, 'packet_loss': 0.02},
            'fat_tree': {'throughput': 1200, 'latency': 8, 'packet_loss': 0.01},
            'torus': {'throughput': 950, 'latency': 10, 'packet_loss': 0.015},
            'custom': {'throughput': 1000, 'latency': 9, 'packet_loss': 0.012}
        }
        
        metrics = base_metrics.get(topology_type, base_metrics['mesh'])
        
        # Add some randomization
        results = {
            'topology_type': topology_type,
            'metrics': {
                'throughput_mbps': round(metrics['throughput'] * random.uniform(0.9, 1.1), 2),
                'avg_latency_ms': round(metrics['latency'] * random.uniform(0.8, 1.2), 2),
                'packet_loss_rate': round(metrics['packet_loss'] * random.uniform(0.5, 1.5), 4),
                'network_utilization': round(random.uniform(65, 95), 2),
                'nodes_count': random.randint(50, 200),
                'links_count': random.randint(100, 500)
            },
            'performance_summary': {
                'total_packets_sent': random.randint(1000000, 5000000),
                'successful_transmissions': random.randint(950000, 4950000),
                'peak_bandwidth_usage': round(random.uniform(70, 98), 2),
                'simulation_duration_seconds': round(random.uniform(30, 180), 1)
            },
            'timestamps': {
                'started_at': datetime.utcnow().isoformat(),
                'completed_at': (datetime.utcnow() + timedelta(seconds=random.randint(30, 180))).isoformat()
            }
        }
        
        return results
    
    async def complete_job(self, job: Dict[str, Any], results: Dict[str, Any]):
        """Mark job as completed and store results"""
        job_id = job['id']
        
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE simulation_jobs 
                    SET status = 'completed',
                        progress = 100,
                        results = $1,
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $2
                """, json.dumps(results), job_id)
            
            # Publish completion update
            await self.publish_progress_update(job_id, 100, "completed")
            
            logger.info(f"✅ Job {job_id} marked as completed")
            
        except Exception as e:
            logger.error(f"❌ Error completing job {job_id}: {e}")
            await self.fail_job(job_id, str(e))
    
    async def fail_job(self, job_id: int, error_message: str):
        """Mark job as failed"""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    UPDATE simulation_jobs 
                    SET status = 'failed',
                        error_message = $1,
                        completed_at = NOW(),
                        updated_at = NOW()
                    WHERE id = $2
                """, error_message, job_id)
            
            # Publish failure update
            await self.publish_progress_update(job_id, 0, "failed")
            
            logger.error(f"❌ Job {job_id} marked as failed: {error_message}")
            
        except Exception as e:
            logger.error(f"❌ Error marking job as failed: {e}")
    
    async def run(self):
        """Main worker loop"""
        self.running = True
        logger.info("🚀 Simulation worker started")
        
        while self.running:
            try:
                # Check for pending jobs
                job = await self.get_pending_job()
                
                if job:
                    try:
                        # Process the job
                        results = await self.simulate_job(job)
                        await self.complete_job(job, results)
                        
                    except Exception as e:
                        logger.error(f"❌ Error processing job {job['id']}: {e}")
                        await self.fail_job(job['id'], str(e))
                else:
                    # No jobs available, wait before checking again
                    await asyncio.sleep(5)
                    
            except Exception as e:
                logger.error(f"❌ Worker loop error: {e}")
                await asyncio.sleep(10)
    
    async def stop(self):
        """Stop the worker"""
        self.running = False
        if self.db_pool:
            await self.db_pool.close()
        if self.redis_client:
            await self.redis_client.close()
        logger.info("🛑 Simulation worker stopped")

# Health check endpoint for Docker
async def health_check():
    """Simple health check"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

async def main():
    """Main entry point"""
    worker = SimulationWorker()
    
    try:
        await worker.initialize()
        await worker.run()
    except KeyboardInterrupt:
        logger.info("🛑 Received shutdown signal")
    except Exception as e:
        logger.error(f"❌ Worker crashed: {e}")
    finally:
        await worker.stop()

if __name__ == "__main__":
    asyncio.run(main())
