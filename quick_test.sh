#!/bin/bash
# Session 4 Enhanced API Test Script with FIXED WebSocket Testing
# Handles HTML WebSocket client correctly

set -e  # Exit on any error

# Configuration with unique timestamp to avoid conflicts
TIMESTAMP=$(date +%s)
API_BASE="http://localhost:3000/api"
API_V1="$API_BASE/v1"
TEST_EMAIL="session4user${TIMESTAMP}@example.com"
TEST_USERNAME="session4user${TIMESTAMP}"
TEST_PASSWORD="testpassword123"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
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

# Check if API is running with WebSocket support
check_api_health() {
    log_info "Checking API health and WebSocket status..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json "$API_BASE/health")
    http_code=${response: -3}
    
    if [ "$http_code" -eq 200 ]; then
        log_success "API is healthy"
        
        # Check WebSocket status specifically
        if command -v jq &> /dev/null; then
            websocket_status=$(cat /tmp/health_response.json | jq -r '.services.websocket // "unknown"')
            websocket_enabled=$(cat /tmp/health_response.json | jq -r '.websocket.enabled // false')
            
            if [ "$websocket_status" = "active" ] || [ "$websocket_enabled" = "true" ]; then
                log_success "✅ WebSocket server is ACTIVE!"
            elif [ "$websocket_status" = "disabled" ]; then
                log_warning "⚠️ WebSocket server is disabled (missing dependencies)"
            else
                log_warning "⚠️ WebSocket status: $websocket_status"
            fi
        fi
        
        cat /tmp/health_response.json | jq '.' 2>/dev/null || cat /tmp/health_response.json
    else
        log_error "API health check failed (HTTP $http_code)"
        cat /tmp/health_response.json 2>/dev/null || echo "No response body"
        exit 1
    fi
    echo
}

# Test WebSocket endpoint availability (FIXED for HTML response)
test_websocket_endpoint() {
    log_info "Testing WebSocket HTML client availability..."
    
    response=$(curl -s -w "%{http_code}" -o /tmp/websocket_test.html \
        -X GET "http://localhost:3000/websocket-test")
    
    http_code=${response: -3}
    
    if [ "$http_code" -eq 200 ]; then
        # Check if response contains HTML (not JSON)
        if grep -q "<!DOCTYPE html>" /tmp/websocket_test.html; then
            log_success "✅ WebSocket HTML client is available!"
            log_success "🌐 URL: http://localhost:3000/websocket-test"
            
            # Check if it contains WebSocket functionality
            if grep -q "socket.io" /tmp/websocket_test.html; then
                log_success "🔗 WebSocket JavaScript client detected"
            else
                log_warning "⚠️ WebSocket client may be incomplete"
            fi
            
        else
            log_warning "⚠️ WebSocket endpoint returns non-HTML content"
            echo "Response preview:"
            head -3 /tmp/websocket_test.html
        fi
    else
        log_warning "WebSocket test endpoint not available (HTTP $http_code)"
    fi
    echo
}

# Try to use existing user first, create new one if needed
setup_authentication() {
    log_info "Setting up authentication (trying existing user first)..."
    
    # First, try to login with a known user (from previous tests)
    local existing_email="testuser@example.com"
    local existing_password="testpassword123"
    
    response=$(curl -s -w "%{http_code}" -o /tmp/login_existing.json \
        -X POST "$API_V1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$existing_email\",
            \"password\": \"$existing_password\"
        }")
    
    http_code=${response: -3}
    
    if [ "$http_code" -eq 200 ]; then
        log_success "Using existing user: $existing_email"
        if command -v jq &> /dev/null; then
            JWT_TOKEN=$(cat /tmp/login_existing.json | jq -r '.token')
        else
            JWT_TOKEN=$(grep -o '"token":"[^"]*"' /tmp/login_existing.json | cut -d'"' -f4)
        fi
    else
        log_info "Existing user not found, creating new user..."
        
        # Register new user with timestamp
        response=$(curl -s -w "%{http_code}" -o /tmp/register_response.json \
            -X POST "$API_V1/auth/register" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$TEST_EMAIL\",
                \"username\": \"$TEST_USERNAME\",
                \"password\": \"$TEST_PASSWORD\",
                \"firstName\": \"Session4\",
                \"lastName\": \"Tester\",
                \"organization\": \"WebSocket Test Lab\"
            }")
        
        http_code=${response: -3}
        
        if [ "$http_code" -eq 201 ]; then
            log_success "New user registered: $TEST_EMAIL"
            
            # Login with new user
            response=$(curl -s -X POST "$API_V1/auth/login" \
                -H "Content-Type: application/json" \
                -d "{
                    \"email\": \"$TEST_EMAIL\",
                    \"password\": \"$TEST_PASSWORD\"
                }")
            
            if command -v jq &> /dev/null; then
                JWT_TOKEN=$(echo "$response" | jq -r '.token')
            else
                JWT_TOKEN=$(echo "$response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
            fi
        else
            log_error "Failed to register new user"
            cat /tmp/register_response.json
            exit 1
        fi
    fi
    
    if [ "$JWT_TOKEN" != "null" ] && [ -n "$JWT_TOKEN" ]; then
        echo "export JWT_TOKEN=\"$JWT_TOKEN\"" > /tmp/jwt_token.sh
        log_success "Authentication setup complete"
        log_info "🔑 JWT Token (for WebSocket): ${JWT_TOKEN:0:50}..."
    else
        log_error "Failed to get authentication token"
        exit 1
    fi
}

# Create a simulation job for WebSocket testing
create_test_simulation() {
    log_info "Creating simulation job for WebSocket testing..."
    
    source /tmp/jwt_token.sh
    
    # Get topology and workload IDs first
    curl -s -X GET "$API_V1/simulations/templates/topologies" \
        -H "Authorization: Bearer $JWT_TOKEN" > /tmp/topologies.json
    
    curl -s -X GET "$API_V1/simulations/templates/workloads" \
        -H "Authorization: Bearer $JWT_TOKEN" > /tmp/workloads.json
    
    if command -v jq &> /dev/null; then
        TOPOLOGY_ID=$(cat /tmp/topologies.json | jq -r '.templates[0].id')
        WORKLOAD_ID=$(cat /tmp/workloads.json | jq -r '.patterns[0].id')
    else
        TOPOLOGY_ID=1
        WORKLOAD_ID=1
    fi
    
    response=$(curl -s -w "%{http_code}" -o /tmp/create_job.json \
        -X POST "$API_V1/simulations" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{
            \"name\": \"Session 4 WebSocket Real-time Test\",
            \"description\": \"Testing real-time WebSocket updates during simulation execution\",
            \"topologyId\": $TOPOLOGY_ID,
            \"workloadId\": $WORKLOAD_ID,
            \"simulationTime\": 20.0,
            \"numComputeNodes\": 12,
            \"numStorageNodes\": 6,
            \"workType\": \"read\",
            \"dataSizeMb\": 256.0,
            \"readProbability\": 0.8
        }")
    
    http_code=${response: -3}
    
    if [ "$http_code" -eq 201 ]; then
        log_success "WebSocket test job created successfully"
        
        if command -v jq &> /dev/null; then
            JOB_ID=$(cat /tmp/create_job.json | jq -r '.job.id')
            JOB_NAME=$(cat /tmp/create_job.json | jq -r '.job.name')
            echo "export JOB_ID=\"$JOB_ID\"" > /tmp/job_id.sh
            echo "export JOB_NAME=\"$JOB_NAME\"" >> /tmp/job_id.sh
            log_success "Job ID: $JOB_ID"
            log_success "Job Name: $JOB_NAME"
            
            cat /tmp/create_job.json | jq '.'
        fi
    else
        log_error "Failed to create WebSocket test job (HTTP $http_code)"
        cat /tmp/create_job.json
        exit 1
    fi
    echo
}

# Monitor job with enhanced WebSocket instructions
monitor_job_with_websocket_instructions() {
    log_info "📋 WebSocket Real-time Monitoring Instructions:"
    
    source /tmp/jwt_token.sh
    source /tmp/job_id.sh
    
    echo ""
    echo -e "${YELLOW}🚀 REAL-TIME WebSocket Monitoring Setup:${NC}"
    echo -e "${YELLOW}============================================${NC}"
    echo -e "${YELLOW}1. Open browser: http://localhost:3000/websocket-test${NC}"
    echo -e "${YELLOW}2. Paste JWT Token: ${NC}"
    echo -e "${BLUE}   $JWT_TOKEN${NC}"
    echo -e "${YELLOW}3. Click 'Connect' button${NC}"
    echo -e "${YELLOW}4. Paste Job ID: ${NC}"
    echo -e "${BLUE}   $JOB_ID${NC}"
    echo -e "${YELLOW}5. Click 'Subscribe to Job' button${NC}"
    echo -e "${YELLOW}6. Watch LIVE progress updates!${NC}"
    echo ""
    
    # Traditional polling monitoring as backup
    max_attempts=25
    attempt=1
    
    log_info "⏱️ Backup API polling (WebSocket shows real-time updates):"
    
    while [ $attempt -le $max_attempts ]; do
        response=$(curl -s -X GET "$API_V1/simulations/$JOB_ID" \
            -H "Authorization: Bearer $JWT_TOKEN")
        
        if command -v jq &> /dev/null; then
            status=$(echo "$response" | jq -r '.job.status')
            name=$(echo "$response" | jq -r '.job.name')
        else
            status=$(echo "$response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            name="WebSocket Test Job"
        fi
        
        case $status in
            "completed")
                log_success "🎉 Job '$name' completed successfully!"
                if command -v jq &> /dev/null; then
                    echo "📊 Final Results:"
                    echo "$response" | jq '.job.results'
                fi
                return 0
                ;;
            "failed")
                log_error "❌ Job failed!"
                if command -v jq &> /dev/null; then
                    error=$(echo "$response" | jq -r '.job.errorMessage')
                    echo "Error: $error"
                fi
                return 1
                ;;
            "running")
                log_info "🏃 [$attempt/$max_attempts] Job '$name' is RUNNING - WebSocket shows live progress!"
                ;;
            "queued")
                log_info "⏳ [$attempt/$max_attempts] Job '$name' is queued - WebSocket will show when it starts"
                ;;
            *)
                log_warning "❓ [$attempt/$max_attempts] Unknown status: $status"
                ;;
        esac
        
        sleep 3
        attempt=$((attempt + 1))
    done
    
    log_warning "⏰ API polling timeout - job may still be running"
    log_info "💡 Check WebSocket client for real-time updates!"
    return 0
}

# Enhanced WebSocket testing guidance
provide_websocket_testing_guidance() {
    source /tmp/jwt_token.sh
    source /tmp/job_id.sh
    
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}🎯 WebSocket Testing Complete Setup${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    
    echo -e "${BLUE}📋 Copy & Paste Ready Values:${NC}"
    echo ""
    echo -e "${YELLOW}JWT Token:${NC}"
    echo "$JWT_TOKEN"
    echo ""
    echo -e "${YELLOW}Job ID:${NC}"
    echo "$JOB_ID"
    echo ""
    
    echo -e "${BLUE}🌐 WebSocket Client URLs:${NC}"
    echo "• Primary: http://localhost:3000/websocket-test"
    echo "• Backup:  http://localhost:3000/websocket-client"
    echo ""
    
    echo -e "${BLUE}📚 Additional Resources:${NC}"
    echo "• API Health: http://localhost:3000/api/health"
    echo "• API Docs:   http://localhost:3000/api/docs"
    echo "• Job API:    http://localhost:3000/api/v1/simulations/$JOB_ID"
    echo ""
    
    echo -e "${YELLOW}💡 Expected WebSocket Experience:${NC}"
    echo "1. Connect → ✅ Connected to WebSocket!"
    echo "2. Subscribe → 📡 Subscribed to job updates"
    echo "3. Live Updates → 📊 Job update: running (25%)"
    echo "4. Progress → 📊 Job update: running (50%)"
    echo "5. Completion → 🎉 Job completed successfully!"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/*_response.json /tmp/*.json /tmp/*.html /tmp/*_id.sh /tmp/jwt_token.sh
}

# Main test execution
main() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}Session 4: Enhanced WebSocket Integration Tests${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo
    
    check_api_health
    test_websocket_endpoint
    setup_authentication
    create_test_simulation
    monitor_job_with_websocket_instructions
    provide_websocket_testing_guidance
    
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}✅ Session 4 WebSocket Testing Setup Complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    
    cleanup
}

# Trap cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"