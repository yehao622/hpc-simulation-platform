-- Database Initialization Script for HPC Simulation Platform
-- File: api-gateway/database/init.sql

-- This script ensures proper user and database setup before schema creation

-- Create database if it doesn't exist (should already exist from POSTGRES_DB)
SELECT 'CREATE DATABASE hpc_simulation' 
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'hpc_simulation');

-- Connect to the target database
\c hpc_simulation;

-- Create user if it doesn't exist (should already exist from POSTGRES_USER)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'hpc_user') THEN
        CREATE USER hpc_user WITH PASSWORD 'hpc_password';
    END IF;
END
$$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE hpc_simulation TO hpc_user;
GRANT ALL PRIVILEGES ON SCHEMA public TO hpc_user;

-- Now create the schema
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE job_status_enum AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE work_type_enum AS ENUM ('read', 'write', 'mixed');
CREATE TYPE topology_type_enum AS ENUM ('fat_tree', 'mesh', 'torus', 'custom');

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    organization VARCHAR(255),
    role VARCHAR(50) DEFAULT 'researcher',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- Network topology templates
CREATE TABLE IF NOT EXISTS topology_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type topology_type_enum NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Workload patterns
CREATE TABLE IF NOT EXISTS workload_patterns (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parameters JSONB NOT NULL,
    created_by INTEGER REFERENCES users(id),
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Main simulation jobs table
CREATE TABLE IF NOT EXISTS simulation_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status job_status_enum DEFAULT 'queued',
    
    -- Simulation parameters
    topology_id INTEGER REFERENCES topology_templates(id),
    workload_id INTEGER REFERENCES workload_patterns(id),
    simulation_time DECIMAL(10,6) NOT NULL DEFAULT 10.0,
    random_seed INTEGER,
    progress INTEGER DEFAULT 0,
    
    -- Network configuration
    num_compute_nodes INTEGER NOT NULL DEFAULT 16,
    num_storage_nodes INTEGER NOT NULL DEFAULT 8,
    num_core_switches INTEGER NOT NULL DEFAULT 2,
    num_aggr_switches INTEGER NOT NULL DEFAULT 8,
    num_edge_switches INTEGER NOT NULL DEFAULT 8,
    
    -- Performance parameters
    infiniband_bandwidth DECIMAL(10,2) DEFAULT 25.0,
    pcie_bandwidth DECIMAL(10,2) DEFAULT 24.0,
    sas_bandwidth DECIMAL(10,2) DEFAULT 10.0,
    
    -- Workload parameters
    work_type work_type_enum DEFAULT 'read',
    data_size_mb DECIMAL(10,2) DEFAULT 128.0,
    read_probability DECIMAL(3,2) DEFAULT 0.5,
    request_rate DECIMAL(10,6) DEFAULT 0.001,
    
    -- Custom parameters
    custom_parameters JSONB,
    
    -- Execution tracking
    worker_id VARCHAR(100),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    
    -- Results summary
    total_throughput DECIMAL(15,6),
    average_latency DECIMAL(15,6),
    max_queue_length INTEGER,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Simulation results - time series data
CREATE TABLE IF NOT EXISTS simulation_metrics (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES simulation_jobs(id) ON DELETE CASCADE,
    metric_type VARCHAR(50) NOT NULL,
    component_type VARCHAR(50),
    component_id VARCHAR(100),
    timestamp_sec DECIMAL(15,6) NOT NULL,
    value DECIMAL(20,8) NOT NULL,
    unit VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Job execution logs
CREATE TABLE IF NOT EXISTS job_logs (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES simulation_jobs(id) ON DELETE CASCADE,
    log_level VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    component VARCHAR(100),
    simulation_time DECIMAL(15,6),
    created_at TIMESTAMP DEFAULT NOW()
);

-- API tokens for authentication
CREATE TABLE IF NOT EXISTS api_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Job queue for async processing
CREATE TABLE IF NOT EXISTS job_queue (
    id BIGSERIAL PRIMARY KEY,
    job_id UUID REFERENCES simulation_jobs(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    queued_at TIMESTAMP DEFAULT NOW(),
    claimed_at TIMESTAMP,
    worker_id VARCHAR(100)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_simulation_jobs_user_status ON simulation_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_simulation_jobs_status_created ON simulation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_simulation_metrics_job_type ON simulation_metrics(job_id, metric_type);
CREATE INDEX IF NOT EXISTS idx_simulation_metrics_timestamp ON simulation_metrics(job_id, timestamp_sec);
CREATE INDEX IF NOT EXISTS idx_job_logs_job_level ON job_logs(job_id, log_level);
CREATE INDEX IF NOT EXISTS idx_job_queue_priority ON job_queue(priority DESC, queued_at);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_api_tokens_hash ON api_tokens(token_hash);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
DROP TRIGGER IF EXISTS update_simulation_jobs_updated_at ON simulation_jobs;
CREATE TRIGGER update_simulation_jobs_updated_at BEFORE UPDATE ON simulation_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default topology templates (only if not exists)
INSERT INTO topology_templates (name, type, description, parameters, created_by, is_public) 
SELECT 'Standard Fat-Tree', 'fat_tree', 'Default 3-tier fat-tree topology for HPC clusters', 
       '{"k_port": 8, "core_switches": 2, "aggr_switches": 8, "edge_switches": 8}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM topology_templates WHERE name = 'Standard Fat-Tree');

INSERT INTO topology_templates (name, type, description, parameters, created_by, is_public) 
SELECT 'Small Fat-Tree', 'fat_tree', 'Smaller fat-tree for testing and development', 
       '{"k_port": 4, "core_switches": 1, "aggr_switches": 4, "edge_switches": 4}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM topology_templates WHERE name = 'Small Fat-Tree');

INSERT INTO topology_templates (name, type, description, parameters, created_by, is_public) 
SELECT 'Large Fat-Tree', 'fat_tree', 'Large-scale fat-tree for production workloads', 
       '{"k_port": 16, "core_switches": 4, "aggr_switches": 16, "edge_switches": 16}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM topology_templates WHERE name = 'Large Fat-Tree');

-- Insert default workload patterns (only if not exists)
INSERT INTO workload_patterns (name, description, parameters, created_by, is_public) 
SELECT 'Read-Heavy Workload', 'Typical read-intensive HPC workload (80% reads)', 
       '{"read_probability": 0.8, "request_rate": 0.001, "data_size_mb": 128}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM workload_patterns WHERE name = 'Read-Heavy Workload');

INSERT INTO workload_patterns (name, description, parameters, created_by, is_public) 
SELECT 'Write-Heavy Workload', 'Write-intensive workload for checkpointing', 
       '{"read_probability": 0.2, "request_rate": 0.0005, "data_size_mb": 512}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM workload_patterns WHERE name = 'Write-Heavy Workload');

INSERT INTO workload_patterns (name, description, parameters, created_by, is_public) 
SELECT 'Balanced Workload', 'Balanced read/write pattern', 
       '{"read_probability": 0.5, "request_rate": 0.001, "data_size_mb": 256}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM workload_patterns WHERE name = 'Balanced Workload');

INSERT INTO workload_patterns (name, description, parameters, created_by, is_public) 
SELECT 'High-Frequency Small I/O', 'Metadata-intensive workload', 
       '{"read_probability": 0.6, "request_rate": 0.01, "data_size_mb": 4}', 
       NULL, true
WHERE NOT EXISTS (SELECT 1 FROM workload_patterns WHERE name = 'High-Frequency Small I/O');

-- Grant all permissions to hpc_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hpc_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hpc_user;
GRANT USAGE ON SCHEMA public TO hpc_user;

-- Final verification
SELECT 'Database initialization completed successfully' AS status;

-- Create the smartops role if it doesn't exist
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'smartops') THEN
      CREATE ROLE smartops LOGIN PASSWORD 'smartops123';
   END IF;
END
$$;

-- Grant necessary permissions
ALTER ROLE smartops CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE smartops_platform TO smartops;

-- Create database if it doesn't exist
SELECT 'CREATE DATABASE smartops_platform OWNER smartops'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'smartops_platform');

-- Connect to the new database and set up schema
\c smartops_platform;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO smartops;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO smartops;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO smartops;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO smartops;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO smartops;
