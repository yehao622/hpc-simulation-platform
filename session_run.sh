#!/bin/bash
# fix-services.sh
# Fix all service issues

echo "🔧 Fixing SmartOps Platform Services..."

# Stop all services
echo "Stopping services..."
docker-compose -f docker-compose.enhanced.yml down

# Clean up
echo "Cleaning up..."
docker system prune -f

# Create necessary directories
echo "Creating directories..."
mkdir -p ai-service/src
mkdir -p ai-service/logs
mkdir -p monitoring/rules

# Create init database script
echo "Setting up database initialization..."
cat > init-database.sql << 'EOF'
-- Create the smartops role if it doesn't exist
DO $$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'smartops') THEN
      CREATE ROLE smartops LOGIN PASSWORD 'smartops123';
   END IF;
END
$$;

-- Grant permissions
ALTER ROLE smartops CREATEDB;
ALTER ROLE smartops SUPERUSER;
EOF

# Fix Prometheus config (replace the problematic storage section)
echo "Fixing Prometheus configuration..."
cat > monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
  
  - job_name: 'ai-service'
    static_configs:
      - targets: ['ai-service:8000']
    metrics_path: /metrics
    scrape_interval: 15s
  
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
EOF

# Start core services first
echo "Starting core services..."
docker-compose -f docker-compose.enhanced.yml up -d postgres redis

# Wait for database
echo "Waiting for database..."
sleep 10

# Initialize database
echo "Initializing database..."
docker-compose -f docker-compose.enhanced.yml exec -T postgres psql -U postgres << 'EOF'
CREATE ROLE smartops LOGIN PASSWORD 'smartops123';
ALTER ROLE smartops CREATEDB;
ALTER ROLE smartops SUPERUSER;
CREATE DATABASE smartops_platform OWNER smartops;
EOF

# Build and start AI service
echo "Building AI service..."
docker-compose -f docker-compose.enhanced.yml build ai-service

# Start monitoring services
echo "Starting monitoring services..."
docker-compose -f docker-compose.enhanced.yml up -d prometheus grafana node-exporter

# Start application services
echo "Starting application services..."
docker-compose -f docker-compose.enhanced.yml up -d api-gateway ai-service

# Start frontend
echo "Starting frontend..."
docker-compose -f docker-compose.enhanced.yml up -d frontend

# Wait and check status
echo "Waiting for services to start..."
sleep 15

echo "Service status:"
docker-compose -f docker-compose.enhanced.yml ps

echo "✅ Fix complete! Check service status above."
echo "Access your platform at:"
echo "  Frontend: http://localhost:3001"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana: http://localhost:3002"
