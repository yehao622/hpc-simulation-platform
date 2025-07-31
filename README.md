# HPC Simulation Platform

A scalable, cloud-native platform for running High-Performance Computing network simulations, built on top of OMNeT++ simulation framework.

## 🏗️ Architecture Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   API Client    │────│   API Gateway   │────│ Simulation      │
│  (REST/GraphQL) │    │  (Node.js +     │    │ Worker          │
└─────────────────┘    │   TypeScript)   │    │ (Python +       │
                       └─────────────────┘    │  OMNeT++)       │
                                │              └─────────────────┘
                       ┌─────────────────┐               │
                       │   PostgreSQL    │               │
                       │   Database      │───────────────┘
                       └─────────────────┘
                                │
                       ┌─────────────────┐
                       │   Redis Queue   │
                       │   & Cache       │
                       └─────────────────┘
```

## 📊 Current Capabilities
🔐 Authentication System

User Registration: Secure account creation with comprehensive validation
JWT Login: Token-based authentication with bcrypt password hashing (12 rounds)
Protected Routes: Middleware-based authorization for all simulation endpoints
Profile Management: User statistics, job history, and account information
Security Features: Input validation, rate limiting, SQL injection prevention

🚀 Simulation Management

Template System: Pre-configured network topologies (Fat-tree, Mesh, Custom)
Workload Patterns: Read-heavy, Write-heavy, Balanced, High-frequency patterns
Job Submission: Comprehensive validation with topology and workload selection
Real-time Monitoring: Track job status from submission through completion
Results Retrieval: Detailed metrics, execution logs, and performance analytics
Job Operations: List, filter, paginate, view details, and cancel jobs

📈 Analytics & Metrics

Performance Tracking: Throughput, latency, and queue length time-series data
Job Statistics: User-specific success rates, completion times, and resource usage
Execution Logs: Structured logging with component-level detail and timestamps
Historical Analysis: Complete audit trail for debugging and optimization

🏗️ Infrastructure

Multi-service Architecture: Clean separation of API, worker, and data layers
Database Integration: PostgreSQL with optimized schema and relationships
Async Processing: Redis-based job queue with database fallback for reliability
Health Monitoring: Service status tracking and diagnostic tooling

---

## 🚀 Quick Start

🚀 Quick Start
Prerequisites

Docker & Docker Compose (latest version)
Node.js 16+ (for local development)
Git (for version control)

1. Clone and Setup
bashgit clone https://github.com/yehao622/hpc-simulation-platform.git
cd hpc-simulation-platform

# Start all services
docker-compose up -d

# Check service status
docker-compose ps
2. Verify Installation
bash# API Health Check
curl http://localhost:3000/api/health

# API Documentation
open http://localhost:3000/api/docs
3. Run Comprehensive Test Suite
bash# Use the provided test script for complete workflow validation
chmod +x api_test_script.sh
./api_test_script.sh

# Expected: All tests pass with ✅ indicators
📚 API Usage Examples
Complete Authentication Flow
bash# 1. Register new user
curl -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@university.edu",
    "username": "researcher1", 
    "password": "securepassword123",
    "firstName": "Jane",
    "lastName": "Researcher",
    "organization": "Research University"
  }'

# 2. Login and get JWT token
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "researcher@university.edu",
    "password": "securepassword123"
  }'
# Save the returned JWT token for subsequent requests

# 3. Get user profile and statistics
curl -X GET http://localhost:3000/api/v1/auth/profile \
  -H "Authorization: Bearer $JWT_TOKEN"
Simulation Job Management
bash# Set your JWT token
TOKEN="your-jwt-token-here"

# 1. Get available topology templates
curl -X GET http://localhost:3000/api/v1/simulations/templates/topologies \
  -H "Authorization: Bearer $TOKEN"

# 2. Get available workload patterns  
curl -X GET http://localhost:3000/api/v1/simulations/templates/workloads \
  -H "Authorization: Bearer $TOKEN"

# 3. Submit simulation job
curl -X POST http://localhost:3000/api/v1/simulations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Fat-tree Performance Analysis",
    "description": "Testing network performance under read-heavy workload",
    "topologyId": 1,
    "workloadId": 1,
    "simulationTime": 10.0,
    "numComputeNodes": 16,
    "numStorageNodes": 8,
    "workType": "read",
    "dataSizeMb": 128.0,
    "readProbability": 0.8
  }'

# 4. Monitor job status (jobs now actually complete!)
JOB_ID="simulation-job-uuid-from-response"
curl -X GET http://localhost:3000/api/v1/simulations/$JOB_ID \
  -H "Authorization: Bearer $TOKEN"

# 5. List all jobs with pagination
curl -X GET "http://localhost:3000/api/v1/simulations?page=1&limit=10&status=completed" \
  -H "Authorization: Bearer $TOKEN"

# 6. Cancel a running job
curl -X DELETE http://localhost:3000/api/v1/simulations/$JOB_ID \
  -H "Authorization: Bearer $TOKEN"
