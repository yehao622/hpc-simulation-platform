#!/bin/bash
# Simple Simulation Worker Diagnostic Script
# Compatible with older docker-compose versions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Simple Simulation Diagnostics${NC}"
echo -e "${BLUE}================================${NC}"
echo

# 1. Check all services
log_info "Docker Compose Services Status:"
docker-compose ps
echo

# 2. Check simulation worker specifically
log_info "Simulation Worker Details:"
if docker-compose ps | grep -q simulation-worker; then
    worker_line=$(docker-compose ps | grep simulation-worker)
    echo "$worker_line"
    
    if echo "$worker_line" | grep -q "Up"; then
        log_success "Simulation worker container is up"
    else
        log_error "Simulation worker container is not running"
        log_info "Attempting to start worker..."
        docker-compose up -d simulation-worker
        sleep 3
    fi
else
    log_error "Simulation worker not found in services"
fi
echo

# 3. Check worker logs (last 10 lines)
log_info "Recent simulation worker logs:"
docker-compose logs --tail=10 simulation-worker
echo

# 4. Test database connection
log_info "Testing database connection..."
if docker-compose exec -T postgres pg_isready -U hpc_user -d hpc_simulation >/dev/null 2>&1; then
    log_success "Database is accessible"
else
    log_error "Database connection failed"
fi

# 5. Test Redis connection
log_info "Testing Redis connection..."
if docker-compose exec -T redis redis-cli ping >/dev/null 2>&1; then
    log_success "Redis is accessible"
else
    log_error "Redis connection failed"
fi
echo

# 6. Check job queue
log_info "Checking job queues..."

# Database queue
queued_jobs=$(docker-compose exec -T postgres psql -U hpc_user -d hpc_simulation -t -c "SELECT COUNT(*) FROM job_queue WHERE claimed_at IS NULL;" 2>/dev/null | tr -d ' \n' || echo "0")
echo "Jobs in database queue: $queued_jobs"

# Redis queue  
redis_jobs=$(docker-compose exec -T redis redis-cli llen simulation_queue 2>/dev/null || echo "0")
echo "Jobs in Redis queue: $redis_jobs"

# 7. Check job statuses
log_info "Current simulation job statuses:"
docker-compose exec -T postgres psql -U hpc_user -d hpc_simulation -c "SELECT status, COUNT(*) FROM simulation_jobs GROUP BY status;" 2>/dev/null || log_warning "Could not query job statuses"
echo

# 8. Check if worker process is running inside container
log_info "Checking worker process inside container..."
worker_procs=$(docker-compose exec -T simulation-worker ps aux 2>/dev/null | grep -c "worker.py" || echo "0")
echo "Worker processes: $worker_procs"

if [[ "$worker_procs" -eq 0 ]]; then
    log_error "No worker.py process found inside container!"
    log_info "Container might have crashed. Check logs above."
else
    log_success "Worker process is running"
fi
echo

# 9. Quick fix recommendations
echo -e "${YELLOW}🔧 Quick Fix Options:${NC}"
echo
echo "Option 1 - Restart worker:"
echo "  docker-compose restart simulation-worker"
echo
echo "Option 2 - Restart worker and Redis:"
echo "  docker-compose restart simulation-worker redis"
echo
echo "Option 3 - Reset stuck jobs and restart:"
echo "  docker-compose exec postgres psql -U hpc_user -d hpc_simulation -c \"UPDATE simulation_jobs SET status='queued', worker_id=NULL WHERE status='running';\""
echo "  docker-compose restart simulation-worker"
echo
echo "Option 4 - View live worker logs:"
echo "  docker-compose logs -f simulation-worker"
echo
echo "Option 5 - Rebuild worker container:"
echo "  docker-compose build simulation-worker"
echo "  docker-compose up -d simulation-worker"
echo

# 10. Auto-fix attempt
echo -e "${BLUE}🚀 Attempting automatic fix...${NC}"

if [[ "$worker_procs" -eq 0 ]] || [[ "$queued_jobs" -gt 0 ]]; then
    log_info "Restarting simulation worker..."
    docker-compose restart simulation-worker
    sleep 5
    
    # Check if fix worked
    new_worker_procs=$(docker-compose exec -T simulation-worker ps aux 2>/dev/null | grep -c "worker.py" || echo "0")
    if [[ "$new_worker_procs" -gt 0 ]]; then
        log_success "Worker restarted successfully!"
    else
        log_error "Worker restart failed. Try manual fixes above."
    fi
else
    log_success "Worker appears to be functioning normally"
fi

echo
echo -e "${GREEN}✅ Diagnostic complete!${NC}"
echo "If issues persist, try the manual fix options above."