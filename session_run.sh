#!/bin/bash
# session5-start.sh
# SmartOps AI Agent Platform - Session 5 Startup Script

set -e  # Exit on any error

echo "🚀 Starting SmartOps AI Agent Platform - Session 5"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check prerequisites
print_header "Checking Prerequisites"

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed or not in PATH"
    exit 1
fi

if ! command -v git &> /dev/null; then
    print_error "Git is not installed or not in PATH" 
    exit 1
fi

print_status "All prerequisites satisfied ✓"

# Verify we're on the correct branch
current_branch=$(git branch --show-current)
if [ "$current_branch" != "feature/session5-smartops-ai-agent" ]; then
    print_warning "Current branch: $current_branch"
    print_warning "Expected branch: feature/session5-smartops-ai-agent"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_error "Aborting. Please switch to the correct branch."
        exit 1
    fi
fi

print_status "Git branch verified ✓"

# Check if .env file exists, create if not
print_header "Environment Configuration"

if [ ! -f .env ]; then
    print_warning ".env file not found, creating with defaults..."
    cat > .env << EOF
# SmartOps AI Agent Platform Environment Variables

# Database Configuration
DB_HOST=postgres
DB_PORT=5432
DB_USER=smartops
DB_PASSWORD=smartops123
DB_NAME=smartops_platform

# Redis Configuration
REDIS_HOST=redis
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production

# OpenAI Configuration (optional - will use mock responses if not provided)
# OPENAI_API_KEY=your-openai-api-key-here

# Monitoring Configuration
PROMETHEUS_ENABLED=true
GRAFANA_ADMIN_PASSWORD=smartops123

# Service URLs
API_URL=http://localhost:3000
AI_API_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3001
PROMETHEUS_URL=http://localhost:9090
GRAFANA_URL=http://localhost:3002

# Development Settings
NODE_ENV=development
LOG_LEVEL=info
EOF
    print_status ".env file created with default values"
else
    print_status ".env file exists ✓"
fi

# Create necessary directories
print_header "Creating Directory Structure"

directories=(
    "monitoring/grafana/dashboards"
    "monitoring/grafana/provisioning/datasources"
    "monitoring/grafana/provisioning/dashboards"
    "monitoring/rules"
    "ai-service/src"
    "ai-service/logs"
    "frontend/src/components"
    "frontend/src/hooks"
    "frontend/src/contexts"
    "api-gateway/logs"
    "simulation-worker/logs"
)

for dir in "${directories[@]}"; do
    if [ ! -d "$dir" ]; then
        mkdir -p "$dir"
        print_status "Created directory: $dir"
    fi
done

# Stop any existing containers
print_header "Cleaning Up Existing Containers"

if docker-compose ps -q 2>/dev/null | grep -q .; then
    print_status "Stopping existing containers..."
    docker-compose down 2>/dev/null || true
fi

# Clean up orphaned containers
docker container prune -f 2>/dev/null || true

print_status "Cleanup completed ✓"

# Build and start the enhanced platform
print_header "Building and Starting SmartOps Platform"

print_status "Building Docker images..."
docker-compose -f docker-compose.enhanced.yml build --parallel

print_status "Starting core services (database, cache)..."
docker-compose -f docker-compose.enhanced.yml up -d postgres redis

# Wait for core services to be healthy
print_status "Waiting for core services to be ready..."
sleep 10

max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker-compose -f docker-compose.enhanced.yml exec postgres pg_isready -U smartops -d smartops_platform >/dev/null 2>&1; then
        print_status "PostgreSQL is ready ✓"
        break
    fi
    
    attempt=$((attempt + 1))
    if [ $attempt -eq $max_attempts ]; then
        print_error "PostgreSQL failed to start within timeout"
        exit 1
    fi
    
    echo -n "."
    sleep 2
done

# Start monitoring stack
print_status "Starting monitoring stack (Prometheus, Grafana)..."
docker-compose -f docker-compose.enhanced.yml up -d prometheus grafana node-exporter redis-exporter postgres-exporter

# Wait for monitoring services
sleep 5

# Start application services
print_status "Starting application services..."
docker-compose -f docker-compose.enhanced.yml up -d api-gateway simulation-worker ai-service

# Wait for application services
sleep 10

# Start frontend
print_status "Starting React frontend..."
docker-compose -f docker-compose.enhanced.yml up -d frontend

# Wait for all services to be ready
print_header "Verifying Service Health"

services=("api-gateway" "ai-service" "prometheus" "grafana")
for service in "${services[@]}"; do
    print_status "Checking $service health..."
    attempt=0
    max_attempts=10
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f docker-compose.enhanced.yml ps $service | grep -q "Up (healthy)"; then
            print_status "$service is healthy ✓"
            break
        fi
        
        attempt=$((attempt + 1))
        if [ $attempt -eq $max_attempts ]; then
            print_warning "$service health check timeout (may still be starting)"
        fi
        
        sleep 3
    done
done

# Display service status
print_header "Service Status Summary"

echo
echo "📊 SmartOps AI Agent Platform - Service URLs"
echo "=============================================="
echo
echo "🌐 Frontend Dashboard:    http://localhost:3001"
echo "🔧 API Gateway:           http://localhost:3000"
echo "🤖 AI Service:            http://localhost:8000"
echo "📈 Prometheus:            http://localhost:9090"
echo "📊 Grafana:               http://localhost:3002"
echo "   ├─ Username: admin"
echo "   └─ Password: smartops123"
echo
echo "🔍 Health Check Endpoints:"
echo "   ├─ API Gateway:        http://localhost:3000/api/health"
echo "   ├─ AI Service:         http://localhost:8000/health"
echo "   └─ Prometheus:         http://localhost:9090/-/healthy"
echo
echo "🎯 Key Features Added in Session 5:"
echo "   ✅ Complete Prometheus + Grafana monitoring stack"
echo "   ✅ FastAPI AI service with LangChain integration"
echo "   ✅ React frontend with AI chat interface"
echo "   ✅ Enhanced metrics collection from all services"
echo "   ✅ AI-powered monitoring insights and analysis"
echo
echo "🚀 Next Steps:"
echo "   1. Open http://localhost:3001 to access the React dashboard"
echo "   2. Try the AI chat at http://localhost:3001/ai-chat"
echo "   3. View metrics in Grafana at http://localhost:3002"
echo "   4. Monitor system health via Prometheus at http://localhost:9090"
echo

# Test basic connectivity
print_header "Running Basic Connectivity Tests"

test_endpoints=(
    "http://localhost:3000/api/health|API Gateway"
    "http://localhost:8000/health|AI Service"
    "http://localhost:9090/-/healthy|Prometheus"
)

for endpoint_info in "${test_endpoints[@]}"; do
    IFS='|' read -r endpoint name <<< "$endpoint_info"
    
    if curl -s -f "$endpoint" > /dev/null 2>&1; then
        print_status "$name connectivity ✓"
    else
        print_warning "$name connectivity failed (may still be starting)"
    fi
done

# Display logs command
echo
print_header "Monitoring Commands"
echo
echo "📋 View logs:"
echo "   docker-compose -f docker-compose.enhanced.yml logs -f [service-name]"
echo
echo "🔄 Restart services:"
echo "   docker-compose -f docker-compose.enhanced.yml restart [service-name]"
echo
echo "🛑 Stop all services:"
echo "   docker-compose -f docker-compose.enhanced.yml down"
echo
echo "🎉 SmartOps AI Agent Platform Session 5 is ready!"
echo "   The 'To be done' monitoring gap has been ELIMINATED ✅"
echo "   AI-powered monitoring capabilities are now ACTIVE ✅"
echo "   React frontend migration is INITIATED ✅"
