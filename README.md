# SmartOps AI Agent Platform

**Enterprise-grade AI-powered analytics platform** combining High-Performance Computing simulations with advanced LangChain AI agents and multi-service architecture. Built with modern web technologies and production-ready deployment.

![Platform Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Sessions Complete](https://img.shields.io/badge/Sessions%20Complete-7%2F7-success)
![AI Integration](https://img.shields.io/badge/AI%20Agent-LangChain%20%2B%20RAG-blue)
![AWS Deployment](https://img.shields.io/badge/AWS-Ready-orange)
![Docker](https://img.shields.io/badge/Docker-Containerized-blue)
![Architecture](https://img.shields.io/badge/Architecture-Microservices-orange)

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Features](#features)
- [AI Agent Capabilities](#ai-agent-capabilities)
- [Technology Stack](#technology-stack)
- [Quick Start (Local)](#quick-start-local)
- [AWS Deployment](#aws-deployment)
- [Live Demo](#live-demo)
- [API Testing](#api-testing)
- [Web Interface](#web-interface)
- [Project Structure](#project-structure)
- [Development](#development)
- [Monitoring](#monitoring)
- [Contributing](#contributing)

## Architecture Overview

### Multi-Service AI Platform
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │────│   API Gateway   │────│ AI Agent        │
│  (React/HTML)   │    │  (Node.js +     │    │ (Python +       │
│                 │    │   Express)      │    │  LangChain)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                               │                       │
                       ┌─────────────────┐    ┌─────────────────┐
                       │ Java Analytics  │    │   Simulation    │
                       │ (Spring Boot)   │    │   Worker        │
                       │                 │    │ (Python +       │
                       └─────────────────┘    │  OMNeT++)       │
                               │              └─────────────────┘
                       ┌─────────────────┐              │
                       │   PostgreSQL    │              │
                       │   Database      │──────────────┘
                       └─────────────────┘
                               │
                       ┌─────────────────┐
                       │   Redis Cache   │
                       │   & Queue       │
                       └─────────────────┘
                               │
                       ┌─────────────────┐
                       │   ChromaDB      │
                       │ Vector Database │
                       └─────────────────┘
```

**Enhanced Microservices Architecture:**
- **API Gateway**: RESTful APIs with authentication, GraphQL, WebSocket
- **AI Agent**: LangChain-powered intelligent analysis with RAG system
- **Java Analytics**: Spring Boot service with comprehensive metrics
- **Web Interface**: React dashboard with real-time AI chat
- **Simulation Engine**: HPC job processing with queue management
- **Database Layer**: PostgreSQL with optimized schemas
- **Vector Database**: ChromaDB for AI knowledge and semantic search
- **Monitoring**: Prometheus + Grafana observability stack

## Features

### Authentication & Security
- JWT-based authentication with secure password hashing
- User registration and profile management
- Protected API routes with role-based access
- Input validation and SQL injection prevention

### AI-Powered Analytics (NEW)
- **Real LangChain Agent**: OpenAI-powered intelligent system analysis
- **RAG Knowledge System**: Domain expertise with semantic search
- **Cross-Service Intelligence**: AI analysis of live Java analytics data
- **Intelligent Recommendations**: Context-aware optimization suggestions
- **Natural Language Interface**: Chat with your system using plain English

### Simulation Management
- Interactive job submission with real-time feedback
- Multiple simulation templates (Fat-tree, Mesh, Custom topologies)
- Real-time job status tracking (Queued → Running → Completed)
- Comprehensive job history and analytics

### Advanced Monitoring & Observability (NEW)
- **Prometheus**: Comprehensive metrics collection from all services
- **Grafana**: Professional dashboards with custom visualizations
- **Real-time Health**: Live system status and performance monitoring
- **Service Mesh**: Cross-service communication and health tracking
- **AI-Enhanced Insights**: Intelligent interpretation of system metrics

### Professional Web Interface
- Modern React dashboard with AI chat interface
- Interactive real-time monitoring with live updates
- One-click job creation and intelligent monitoring
- Mobile-friendly responsive design with professional UX
- Dark theme with gradient backgrounds and smooth animations

### Production Infrastructure
- Multi-language microservices (Node.js + Python + Java)
- Docker containerization with health checks and auto-restart
- AWS cloud deployment ready with optimized configurations
- Scalable architecture supporting horizontal scaling

## AI Agent Capabilities

### Intelligent System Analysis
- **Real-time Health Monitoring**: AI-powered analysis of system performance
- **Performance Analytics**: Intelligent interpretation of metrics and trends
- **Cross-Service Integration**: Dynamic analysis of Java analytics data
- **Predictive Insights**: Trend identification and bottleneck prediction

### Advanced AI Features
- **LangChain Integration**: Production-ready agent with function calling
- **RAG Knowledge System**: HPC domain expertise with semantic search
- **Natural Language Processing**: Context-aware query understanding
- **Live Data Integration**: Real-time analysis of system state
- **Intelligent Fallback**: Enhanced mock mode for uninterrupted operation

### AI Service Endpoints
```bash
# AI chat interface
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What is the current system health?"}'

# Comprehensive system analysis
curl http://localhost:8000/analysis

# Agent status and capabilities
curl http://localhost:8000/agent/status
```

## Technology Stack

### AI & Machine Learning (NEW)
- **LangChain**: Agent framework with function calling and memory
- **OpenAI Integration**: GPT-3.5-turbo with intelligent fallback
- **ChromaDB**: Vector database for semantic search and knowledge retrieval
- **RAG System**: Retrieval Augmented Generation with HPC domain expertise

### Backend Services
- **Node.js 18.x** with Express.js framework and TypeScript
- **Python FastAPI**: AI agent service with comprehensive endpoints
- **Java Spring Boot**: Analytics microservice with enterprise features
- **PostgreSQL 14** with optimized schemas and relationships
- **Redis 7** for caching, job queue management, and real-time communication

### Frontend & Monitoring
- **React + TypeScript**: Modern dashboard with AI chat interface
- **Modern HTML5/CSS3** with responsive design
- **WebSocket**: Real-time updates and interactive features
- **Prometheus + Grafana**: Enterprise monitoring and visualization

### Infrastructure
- **Docker & Docker Compose** for containerization
- **AWS EC2** for cloud hosting
- **GitHub** for version control and CI/CD ready
- **Health Checks**: Comprehensive service monitoring and auto-recovery

## Quick Start (Local)

### Prerequisites
- Docker & Docker Compose (latest version)
- Git
- 8GB+ RAM recommended (for AI services)

### 1. Clone Repository
```bash
git clone https://github.com/yehao622/hpc-simulation-platform.git
cd hpc-simulation-platform
```

### 2. Configure Environment
```bash
# Copy environment template
cp .env.example .env

# Edit configuration (optional - has intelligent fallbacks)
# Add your OpenAI API key for full AI capabilities:
# OPENAI_API_KEY=your_api_key_here
```

### 3. Start All Services
```bash
# Start the complete platform
docker-compose up -d

# Start monitoring services (optional)
docker-compose --profile monitoring up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f ai-service
```

### 4. Verify Installation
```bash
# Health check all services
curl http://localhost:8000/health    # AI Agent
curl http://localhost:8081/health    # Java Analytics
curl http://localhost:3000/api/health # API Gateway

# Test AI capabilities
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "System status"}'
```

### 5. Access the Platform
- **Web Dashboard**: http://localhost:3001 - React with AI chat
- **API Gateway**: http://localhost:3000 - GraphQL + REST
- **AI Agent**: http://localhost:8000 - LangChain service
- **Java Analytics**: http://localhost:8081 - Spring Boot APIs
- **Grafana**: http://localhost:3002 - Dashboards (admin/smartops123)
- **Prometheus**: http://localhost:9090 - Metrics collection

## AWS Deployment

### Live Production Deployment

This platform is **production-ready** and optimized for AWS Free Tier, demonstrating real-world cloud deployment skills with enterprise monitoring.

### Quick AWS Setup

#### 1. Prerequisites
```bash
# Install AWS CLI
brew install awscli  # macOS
# or download from AWS website

# Configure AWS credentials
aws configure
```

#### 2. Launch EC2 Instance
```bash
# Create security group
aws ec2 create-security-group --group-name smartops-platform-sg --description "SmartOps AI Platform Security Group"

# Open necessary ports
aws ec2 authorize-security-group-ingress --group-name smartops-platform-sg --protocol tcp --port 22 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-name smartops-platform-sg --protocol tcp --port 80 --cidr 0.0.0.0/0  
aws ec2 authorize-security-group-ingress --group-name smartops-platform-sg --protocol tcp --port 3000-3002 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-name smartops-platform-sg --protocol tcp --port 8000-8081 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-name smartops-platform-sg --protocol tcp --port 9090 --cidr 0.0.0.0/0

# Create SSH key pair
aws ec2 create-key-pair --key-name smartops-platform-key --query 'KeyMaterial' --output text > ~/.ssh/smartops-platform-key.pem
chmod 400 ~/.ssh/smartops-platform-key.pem

# Launch t3.micro instance (free tier)
aws ec2 run-instances \
  --image-id ami-0c12c782c6284b66c \
  --count 1 \
  --instance-type t3.micro \
  --key-name smartops-platform-key \
  --security-groups smartops-platform-sg \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=hpc-simulation-platform}]'
```

#### 3. Deploy Platform
```bash
# Get instance public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --filters "Name=tag:Name,Values=hpc-simulation-platform" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

# SSH to instance
ssh -i ~/.ssh/smartops-platform-key.pem ec2-user@$PUBLIC_IP

# Install Docker and dependencies
sudo yum update -y
sudo yum install -y docker git
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Clone and deploy
git clone https://github.com/yehao622/hpc-simulation-platform.git
cd hpc-simulation-platform

# Deploy with production configuration
docker-compose up -d
docker-compose --profile monitoring up -d
```

### Production Features
- Memory-optimized for free tier (t3.micro) with AI workloads
- Auto-restart containers with comprehensive health checks  
- Resource limits preventing OOM issues across all services
- Security groups configured for all service endpoints
- SSL-ready configuration for custom domains
- Enterprise monitoring with Prometheus + Grafana

## Live Demo

### Production Instance
- **Live URL**: `http://YOUR_AWS_IP:3001`
- **Status**: Production Ready with AI capabilities
- **Uptime**: Monitored with health checks across 8 services
- **Performance**: Optimized for free tier with intelligent resource management

### Demo Credentials
```
Email: demo@example.com
Password: demo123
```

### What You Can Demo
1. **AI Chat Interface** - Interact with LangChain agent for system analysis
2. **Interactive Dashboard** - Professional React interface with real-time updates
3. **User Authentication** - JWT-based login/registration system
4. **Job Management** - Create, monitor, and track simulation jobs with AI insights
5. **Real-time Analytics** - Watch AI analyze live system metrics
6. **System Monitoring** - Comprehensive Grafana dashboards and Prometheus metrics
7. **Multi-Service Architecture** - Demonstrate microservices communication
8. **Mobile Responsive** - Works perfectly on all devices with modern UX

## API Testing

### AI Agent APIs (NEW)
```bash
# Set your deployment URL
API_URL="http://YOUR_IP:3000"  # Use localhost:3000 for local
AI_URL="http://YOUR_IP:8000"   # Use localhost:8000 for local

# 1. AI Agent Health
curl $AI_URL/health

# 2. AI Chat Interface
curl -X POST $AI_URL/chat \
  -H 'Content-Type: application/json' \
  -d '{"query": "What is the system health?", "include_system_data": true}'

# 3. System Analysis
curl $AI_URL/analysis

# 4. Agent Status
curl $AI_URL/agent/status

# 5. Java Analytics Integration
curl http://YOUR_IP:8081/api/analytics/dashboard
```

### Core Platform APIs
```bash
# 6. Health Check
curl $API_URL/api/health

# 7. User Registration  
curl -X POST $API_URL/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test123","firstName":"Test","lastName":"User"}'

# 8. User Login
curl -X POST $API_URL/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","password":"test123"}'

# 9. Create Simulation Job
curl -X POST $API_URL/api/v1/simulations \
  -H 'Content-Type: application/json' \
  -d '{"name":"AI-Enhanced Simulation","description":"Testing AI integration"}'

# 10. List Jobs with AI Analysis
curl $API_URL/api/v1/simulations
```

### Expected Results
- All endpoints return proper JSON responses with enhanced AI data
- Authentication generates valid JWT tokens with proper security
- AI agent provides intelligent system analysis using live data
- Jobs progress with real-time AI-powered monitoring
- Cross-service communication demonstrates microservices architecture

## Web Interface

### Professional Dashboard Features

#### Modern AI-Enhanced Design
- React-based dashboard with AI chat interface
- Dark theme with professional gradients and animations
- Responsive layout optimized for all screen sizes
- Interactive AI chat panel with context-aware responses
- Real-time metrics visualization with intelligent insights

#### Advanced Real-time Functionality 
- AI-powered system analysis with natural language queries
- Live job status updates with predictive insights
- Interactive job creation with AI recommendations
- Intelligent system health monitoring with proactive alerts
- Auto-refreshing analytics with AI-enhanced interpretation

#### Enterprise User Experience
- Touch-friendly interface design with professional UX patterns
- Responsive navigation optimized for mobile and desktop
- Cross-browser compatibility with modern web standards
- Comprehensive AI chat interface for system interaction

### Enhanced User Experience Flow
1. **Landing Page** - Clean, professional introduction with AI capabilities
2. **Authentication** - Quick login with secure JWT implementation
3. **AI Dashboard** - Overview with intelligent system analysis
4. **AI Chat Interface** - Natural language system interaction
5. **Job Management** - AI-enhanced creation and monitoring
6. **Real-time Monitoring** - Live progress with predictive insights
7. **Analytics** - AI-powered performance metrics and recommendations

## Project Structure

```
hpc-simulation-platform/
├── ai-service/                     # AI Agent (Python + FastAPI)
│   ├── src/
│   │   ├── main.py                 # FastAPI application
│   │   ├── ai_agent.py             # LangChain agent implementation
│   │   └── requirements.txt        # Python dependencies
│   ├── chroma_db/                  # Vector database storage
│   ├── logs/                       # AI service logs
│   └── Dockerfile                  # AI service container
│
├── data-processor/                 # Analytics (Java + Spring Boot)
│   ├── src/main/java/com/smartops/
│   │   └── controller/             # REST controllers
│   ├── pom.xml                     # Maven dependencies
│   └── Dockerfile                  # Java service container
│
├── api-gateway/                    # Main API service
│   ├── src/                        # Source code
│   │   ├── controllers/            # API route handlers
│   │   ├── middleware/             # Authentication & validation
│   │   ├── models/                 # Database models
│   │   ├── websocket/              # WebSocket server
│   │   └── graphql/                # GraphQL schema and resolvers
│   ├── public/                     # Static web files
│   │   ├── dashboard.html          # Interactive dashboard
│   │   └── index.html              # Landing page
│   ├── database/                   # Database schemas
│   ├── Dockerfile                  # API container config
│   └── package.json                # Dependencies
│
├── frontend/                       # UI (React + TypeScript)
│   ├── src/                        # React components
│   ├── public/                     # Static assets
│   └── Dockerfile                  # Frontend container
│
├── simulation-worker/              # HPC job processor
│   ├── src/                        # Python worker code
│   ├── requirements.txt            # Python dependencies
│   └── Dockerfile                  # Worker container config
│
├── legacy-simulator/               # OMNeT++ simulation code
│   └── network-simulations/        # Simulation templates
│
├── monitoring/                     # Observability
│   ├── prometheus.yml              # Metrics collection config
│   └── grafana/                    # Dashboard configurations
│
├── docs/                           # Documentation
│   ├── development-log.md          # Complete development history
│   ├── current-status.md           # Platform status
│   └── api-documentation.md        # API reference
│
├── docker-compose.yml              # Multi-service orchestration
├── docker-compose.prod.yml         # Production deployment
├── README.md                       # This file
└── .env                            # Environment variables
```

## Development

### Local Development Setup

```bash
# Install dependencies
cd api-gateway && npm install
cd ../simulation-worker && pip install -r requirements.txt
cd ../ai-service && pip install -r requirements.txt

# Start development environment
docker-compose up -d

# Start monitoring (optional)
docker-compose --profile monitoring up -d

# Run in development mode with hot reload
cd api-gateway && npm run dev
```

### Development Workflow

```bash
# Create feature branch
git checkout -b feature/[your-feature-name]

# Make changes and test locally
docker-compose restart ai-service

# Test AI capabilities
curl -X POST http://localhost:8000/chat -H 'Content-Type: application/json' -d '{"query":"test"}'

# Run API tests
./test-api.sh

# Commit and push
git add .
git commit -m "feat: add AI enhancement"
git push origin feature/[your-feature-name]
```

### Testing & Quality Assurance

```bash
# AI service testing
curl http://localhost:8000/health

# API endpoint testing
cd api-gateway && npm test

# Integration testing
./test-integration.sh

# Health checks across all services
curl http://localhost:3000/api/health

# AI agent functionality testing
python scripts/test_ai_agent.py

# Load testing (optional)
./test-performance.sh
```

## Monitoring

### Enhanced Health Monitoring
- **AI Service Health**: `GET /health` - Agent status, RAG system, OpenAI connectivity
- **Java Analytics Health**: `GET /health` - Spring Boot actuator with comprehensive metrics
- **API Gateway Health**: `GET /api/health` - Service status and database connectivity
- **Container Health**: Docker health checks with automatic restart across all services
- **Cross-Service Monitoring**: Inter-service communication and dependency tracking

### Advanced Observability
- **Prometheus Metrics**: Comprehensive collection from all 8 microservices
- **Grafana Dashboards**: Professional visualization with custom AI metrics
- **Real-time Alerts**: Proactive monitoring with intelligent thresholds
- **Service Mesh Monitoring**: Cross-service communication and performance tracking

### Logging & Debugging
```bash
# View AI service logs
docker-compose logs -f ai-service

# View Java analytics logs
docker-compose logs -f data-processor

# View application logs
docker-compose logs -f api-gateway

# Database logs
docker-compose logs postgres

# Worker logs  
docker-compose logs simulation-worker

# System logs (on AWS)
sudo journalctl -u docker

# Monitor all services
docker-compose logs -f
```

### Performance Metrics
- **AI Response Time**: < 2s for complex analysis, < 500ms for simple queries
- **API Response Time**: < 100ms for standard endpoints
- **Job Processing**: 5-15 seconds per simulation with AI insights
- **Memory Usage**: < 2GB total (optimized for AI workloads on free tier)
- **Database Performance**: < 50ms query response time with AI data integration
- **Cross-Service Communication**: < 200ms between microservices

## Skills Demonstrated

### AI & Machine Learning
- LangChain: Production agent implementation with function calling
- RAG Systems: Vector databases and semantic search with domain expertise
- OpenAI Integration: GPT models with intelligent fallback mechanisms
- Cross-Service AI: Real-time analysis of live system data

### Full-Stack Development
- **Backend**: Node.js + Python + Java microservices architecture
- **Frontend**: React + TypeScript with AI chat interface
- **Database**: PostgreSQL with vector database integration
- **Authentication**: JWT, bcrypt, comprehensive security implementation

### DevOps & Cloud
- **Containerization**: Docker, multi-service orchestration with health checks
- **Cloud Deployment**: AWS EC2, security groups, production automation
- **Infrastructure**: Monitoring, logging, service mesh, auto-recovery
- **Automation**: Deployment scripts, health monitoring, CI/CD ready

### System Design
- **Microservices**: Clean architecture with cross-service communication
- **Scalability**: Resource optimization supporting AI workloads
- **Reliability**: Health checks, error handling, graceful degradation
- **Security**: Authentication, input validation, secure multi-service deployment

## Contact & Support

**Project Author**: Howard Ye
- **GitHub**: [@yehao622](https://github.com/yehao622)
- **Email**: hyedailyuse@gmail.com

### Project Links
- **Live Demo**: (deployed on demand)
- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/yehao622/hpc-simulation-platform/issues)
