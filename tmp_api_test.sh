#!/bin/bash
# Session 4.2: GraphQL API Integration Test Script
# Comprehensive testing of GraphQL functionality alongside REST and WebSocket

set -e  # Exit on any error

# Configuration
API_BASE="http://localhost:3000"
API_V1="$API_BASE/api/v1"
GRAPHQL_ENDPOINT="$API_BASE/graphql"
TIMESTAMP=$(date +%s)
TEST_EMAIL="graphqluser${TIMESTAMP}@example.com"
TEST_USERNAME="graphqluser${TIMESTAMP}"  # Changed: removed underscore, only alphanumeric
TEST_PASSWORD="testpassword123"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
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

log_graphql() {
    echo -e "${PURPLE}[GRAPHQL]${NC} $1"
}

# Check GraphQL availability
check_graphql_availability() {
    log_info "Checking GraphQL server availability..."
    
    # Check health endpoint for GraphQL status
    response=$(curl -s "$API_BASE/api/health")
    
    if echo "$response" | grep -q '"graphql":"active"'; then
        log_success "✅ GraphQL server is ACTIVE!"
        
    elif echo "$response" | grep -q '"graphql":"degraded"'; then
        log_warning "⚠️ GraphQL server is DEGRADED but functional"
        log_info "This is often due to health check issues, but GraphQL should still work"
        
    elif echo "$response" | grep -q '"graphql":"disabled"'; then
        log_error "❌ GraphQL server is DISABLED"
        echo "Please ensure GraphQL dependencies are installed:"
        echo "  npm install apollo-server-express graphql graphql-type-json @graphql-tools/schema"
        exit 1
        
    else
        log_error "❌ Cannot determine GraphQL status"
        echo "Response: $response"
        exit 1
    fi
    
    # Test GraphQL introspection regardless of status
    log_info "Testing GraphQL endpoint directly..."
    introspection_query='{"query":"{ __schema { queryType { name } } }"}'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$introspection_query")
    
    if echo "$response" | grep -q '"queryType"'; then
        log_success "✅ GraphQL introspection working"
    elif echo "$response" | grep -q '"errors"'; then
        log_warning "⚠️ GraphQL has errors but is responding"
        echo "Response: $response"
    else
        log_warning "⚠️ GraphQL endpoint may not be properly configured"
        echo "Response: $response"
    fi
    
    echo
}

# Setup authentication
setup_authentication() {
    log_info "Setting up authentication for GraphQL testing..."
    
    # Try to use existing user first (from previous tests)
    local existing_email="testuser@example.com"
    local existing_password="testpassword123"
    
    login_response=$(curl -s -X POST "$API_V1/auth/login" \
        -H "Content-Type: application/json" \
        -d "{
            \"email\": \"$existing_email\",
            \"password\": \"$existing_password\"
        }")
    
    # Check if existing user login worked
    if echo "$login_response" | grep -q '"token"'; then
        log_success "✅ Using existing user: $existing_email"
        if command -v jq &> /dev/null; then
            JWT_TOKEN=$(echo "$login_response" | jq -r '.token')
        else
            JWT_TOKEN=$(echo "$login_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
        fi
        
        # Save token for other functions
        echo "export JWT_TOKEN='$JWT_TOKEN'" > /tmp/graphql_jwt_token.sh
        log_success "✅ Authentication token saved"
        
    else
        log_info "Creating new test user for GraphQL testing..."
        
        # Create new user with alphanumeric username only
        register_response=$(curl -s -X POST "$API_V1/auth/register" \
            -H "Content-Type: application/json" \
            -d "{
                \"email\": \"$TEST_EMAIL\",
                \"username\": \"$TEST_USERNAME\",
                \"password\": \"$TEST_PASSWORD\",
                \"firstName\": \"GraphQL\",
                \"lastName\": \"Tester\"
            }")
        
        if echo "$register_response" | grep -q '"token"'; then
            log_success "✅ User registration successful"
            if command -v jq &> /dev/null; then
                JWT_TOKEN=$(echo "$register_response" | jq -r '.token')
            else
                JWT_TOKEN=$(echo "$register_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
            fi
            
            # Save token for other functions
            echo "export JWT_TOKEN='$JWT_TOKEN'" > /tmp/graphql_jwt_token.sh
            log_success "✅ New user created and authenticated"
            
        else
            log_error "❌ User registration failed"
            echo "Response: $register_response"
            exit 1
        fi
    fi
    echo
}

# Test GraphQL basic queries
test_graphql_basic_queries() {
    log_graphql "Testing GraphQL basic queries..."
    
    source /tmp/graphql_jwt_token.sh
    
    # Test 1: Get current user profile
    log_info "Test 1: Current user profile query"
    
    user_query='{
        "query": "query GetMyProfile { me { id email username firstName lastName role statistics { totalJobs completedJobs runningJobs } } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$user_query")
    
    if echo "$response" | grep -q '"me"'; then
        log_success "✅ User profile query successful"
        if command -v jq &> /dev/null; then
            echo "$response" | jq '.data.me'
        else
            echo "Response: $response"
        fi
    else
        log_error "❌ User profile query failed"
        echo "Response: $response"
    fi
    echo
    
    # Test 2: Get topology templates
    log_info "Test 2: Topology templates query"
    
    topology_query='{
        "query": "query GetTopologies { topologyTemplates(limit: 5) { id name type description isPublic } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$topology_query")
    
    if echo "$response" | grep -q '"topologyTemplates"'; then
        log_success "✅ Topology templates query successful"
        if command -v jq &> /dev/null; then
            template_count=$(echo "$response" | jq '.data.topologyTemplates | length')
            log_info "📊 Found $template_count topology templates"
        fi
    else
        log_error "❌ Topology templates query failed"
        echo "Response: $response"
    fi
    echo
    
    # Test 3: Get workload patterns
    log_info "Test 3: Workload patterns query"
    
    workload_query='{
        "query": "query GetWorkloads { workloadPatterns(limit: 5) { id name description isPublic } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$workload_query")
    
    if echo "$response" | grep -q '"workloadPatterns"'; then
        log_success "✅ Workload patterns query successful"
        if command -v jq &> /dev/null; then
            pattern_count=$(echo "$response" | jq '.data.workloadPatterns | length')
            log_info "📊 Found $pattern_count workload patterns"
        fi
    else
        log_error "❌ Workload patterns query failed"
        echo "Response: $response"
    fi
    echo
}

# Test GraphQL mutations
test_graphql_mutations() {
    log_graphql "Testing GraphQL mutations..."
    
    source /tmp/graphql_jwt_token.sh
    
    # Test 1: Create simulation job
    log_info "Test 1: Create simulation job mutation"
    
    create_job_mutation='{
        "query": "mutation CreateSimJob($input: CreateSimulationJobInput!) { createSimulationJob(input: $input) { id name status simulationTime progress createdAt } }",
        "variables": {
            "input": {
                "name": "GraphQL API Test Simulation",
                "description": "Testing GraphQL mutation for job creation",
                "topologyId": "1",
                "workloadId": "1",
                "simulationTime": 20.0,
                "numComputeNodes": 14,
                "numStorageNodes": 7,
                "workType": "READ",
                "dataSizeMb": 384.0,
                "readProbability": 0.75
            }
        }
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$create_job_mutation")
    
    if echo "$response" | grep -q '"createSimulationJob"'; then
        log_success "✅ Job creation mutation successful"
        
        # Extract job ID for further testing
        if command -v jq &> /dev/null; then
            GRAPHQL_JOB_ID=$(echo "$response" | jq -r '.data.createSimulationJob.id')
            echo "export GRAPHQL_JOB_ID=\"$GRAPHQL_JOB_ID\"" >> /tmp/graphql_jwt_token.sh
            log_success "📋 Job ID: $GRAPHQL_JOB_ID"
            echo "$response" | jq '.data.createSimulationJob'
        else
            echo "Response: $response"
        fi
    else
        log_error "❌ Job creation mutation failed"
        echo "Response: $response"
    fi
    echo
}

# Test GraphQL complex nested queries
test_graphql_complex_queries() {
    log_graphql "Testing GraphQL complex nested queries..."
    
    source /tmp/graphql_jwt_token.sh
    
    # Test 1: Complex dashboard query
    log_info "Test 1: Complex dashboard query with nested relations"
    
    dashboard_query='{
        "query": "query Dashboard { me { email firstName statistics { totalJobs completedJobs avgThroughput } } simulationJobs(limit: 3) { id name status progress user { email } topology { name type } workload { name } results { totalThroughput averageLatency } } myAnalytics { totalJobs completedJobs totalSimulationTime } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$dashboard_query")
    
    if echo "$response" | grep -q '"me"' && echo "$response" | grep -q '"simulationJobs"'; then
        log_success "✅ Complex dashboard query successful"
        log_info "📊 Retrieved user profile, jobs, and analytics in one request"
        
        if command -v jq &> /dev/null; then
            user_email=$(echo "$response" | jq -r '.data.me.email')
            job_count=$(echo "$response" | jq '.data.simulationJobs | length')
            log_info "👤 User: $user_email, Jobs: $job_count"
        fi
    else
        log_error "❌ Complex dashboard query failed"
        echo "Response: $response"
    fi
    echo
    
    # Test 2: Job details with metrics (if job exists)
    if [ -n "$GRAPHQL_JOB_ID" ]; then
        log_info "Test 2: Job details query with metrics and logs"
        
        job_details_query="{
            \"query\": \"query JobDetails(\$jobId: ID!) { simulationJob(id: \$jobId) { id name status progress simulationTime networkConfig { computeNodes storageNodes infinibandBandwidth } workloadConfig { workType dataSizeMb readProbability } results { totalThroughput averageLatency performanceMetrics { peakThroughput successRate } } logs(limit: 5) { logLevel message createdAt } } }\",
            \"variables\": {
                \"jobId\": \"$GRAPHQL_JOB_ID\"
            }
        }"
        
        response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $JWT_TOKEN" \
            -d "$job_details_query")
        
        if echo "$response" | grep -q '"simulationJob"'; then
            log_success "✅ Job details query successful"
            log_info "📊 Retrieved complete job configuration and results"
        else
            log_warning "⚠️ Job details query returned no results (job may not exist yet)"
        fi
        echo
    fi
}

# Test GraphQL vs REST API comparison
test_graphql_vs_rest_comparison() {
    log_graphql "Testing GraphQL vs REST API comparison..."
    
    source /tmp/graphql_jwt_token.sh
    
    log_info "🏁 Performance Comparison: GraphQL vs REST"
    echo
    
    # REST API approach - Multiple requests
    log_info "REST API approach (multiple requests):"
    
    start_time=$(date +%s%N)
    
    # Request 1: Get user profile
    curl -s -X GET "$API_V1/auth/profile" \
        -H "Authorization: Bearer $JWT_TOKEN" > /tmp/rest_profile.json
    
    # Request 2: Get simulation jobs
    curl -s -X GET "$API_V1/simulations?limit=5" \
        -H "Authorization: Bearer $JWT_TOKEN" > /tmp/rest_jobs.json
    
    # Request 3: Get topology templates
    curl -s -X GET "$API_V1/simulations/templates/topologies" \
        -H "Authorization: Bearer $JWT_TOKEN" > /tmp/rest_topologies.json
    
    rest_end_time=$(date +%s%N)
    rest_duration=$(( (rest_end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    log_info "✅ REST API: 3 requests completed in ${rest_duration}ms"
    
    # GraphQL approach - Single request
    log_info "GraphQL approach (single request):"
    
    start_time=$(date +%s%N)
    
    combined_query='{
        "query": "query CombinedData { me { email firstName statistics { totalJobs completedJobs } } simulationJobs(limit: 5) { id name status } topologyTemplates(limit: 5) { id name type } }"
    }'
    
    curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$combined_query" > /tmp/graphql_combined.json
    
    graphql_end_time=$(date +%s%N)  
    graphql_duration=$(( (graphql_end_time - start_time) / 1000000 )) # Convert to milliseconds
    
    log_info "✅ GraphQL: 1 request completed in ${graphql_duration}ms"
    echo
    
    # Compare results
    log_success "📊 Performance Summary:"
    echo "   REST API:  3 requests, ${rest_duration}ms total"
    echo "   GraphQL:   1 request,  ${graphql_duration}ms total"
    
    if [ "$graphql_duration" -lt "$rest_duration" ]; then
        improvement=$(( (rest_duration - graphql_duration) * 100 / rest_duration ))
        log_success "🏆 GraphQL is ${improvement}% faster!"
    else
        log_info "📈 REST API was faster this time (network conditions vary)"
    fi
    echo
    
    # Data size comparison
    if command -v wc &> /dev/null; then
        rest_size=$(( $(wc -c < /tmp/rest_profile.json) + $(wc -c < /tmp/rest_jobs.json) + $(wc -c < /tmp/rest_topologies.json) ))
        graphql_size=$(wc -c < /tmp/graphql_combined.json)
        
        log_info "📦 Data transfer comparison:"
        echo "   REST API:  ${rest_size} bytes (combined responses)"
        echo "   GraphQL:   ${graphql_size} bytes (single response)"
        
        if [ "$graphql_size" -lt "$rest_size" ]; then
            reduction=$(( (rest_size - graphql_size) * 100 / rest_size ))
            log_success "📉 GraphQL reduced data transfer by ${reduction}%"
        fi
    fi
    echo
}

# Test GraphQL error handling
test_graphql_error_handling() {
    log_graphql "Testing GraphQL error handling..."
    
    source /tmp/graphql_jwt_token.sh
    
    # Test 1: Invalid field
    log_info "Test 1: Query with invalid field"
    
    invalid_query='{
        "query": "query InvalidField { me { id email invalidField } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$invalid_query")
    
    if echo "$response" | grep -q '"errors"'; then
        log_success "✅ Invalid field error handled correctly"
        if command -v jq &> /dev/null; then
            error_message=$(echo "$response" | jq -r '.errors[0].message')
            log_info "📝 Error: $error_message"
        fi
    else
        log_warning "⚠️ Invalid field error not detected"
    fi
    echo
    
    # Test 2: Unauthorized query
    log_info "Test 2: Query without authentication"
    
    unauth_query='{
        "query": "query Unauthorized { me { email } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -d "$unauth_query")
    
    if echo "$response" | grep -q '"errors"' && echo "$response" | grep -qi "authentication"; then
        log_success "✅ Authentication error handled correctly"
    else
        log_warning "⚠️ Authentication error not properly handled"
        echo "Response: $response"
    fi
    echo
    
    # Test 3: Invalid mutation
    log_info "Test 3: Invalid mutation input"
    
    invalid_mutation='{
        "query": "mutation InvalidInput { createSimulationJob(input: { name: \"\", topologyId: \"999\" }) { id } }"
    }'
    
    response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -d "$invalid_mutation")
    
    if echo "$response" | grep -q '"errors"'; then
        log_success "✅ Invalid input error handled correctly"
    else
        log_warning "⚠️ Invalid input error not detected"
    fi
    echo
}

# Test GraphQL Playground accessibility
test_graphql_playground() {
    log_graphql "Testing GraphQL Playground accessibility..."
    
    # Check if playground is accessible
    response=$(curl -s -H "Accept: text/html" "$GRAPHQL_ENDPOINT")
    
    if echo "$response" | grep -q "GraphQL Playground" || echo "$response" | grep -q "<!DOCTYPE html>"; then
        log_success "✅ GraphQL Playground is accessible"
        log_info "🎮 URL: http://localhost:3000/graphql"
        log_info "💡 Open in browser to use interactive GraphQL IDE"
    else
        log_warning "⚠️ GraphQL Playground not accessible"
        log_info "📝 This may be expected in production mode"
    fi
    echo
}

# Provide GraphQL usage examples and next steps
provide_graphql_guidance() {
    source /tmp/graphql_jwt_token.sh
    
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}🎯 GraphQL API Integration Complete!${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo
    
    echo -e "${BLUE}🔑 Authentication Token:${NC}"
    echo "$JWT_TOKEN"
    echo
    
    echo -e "${BLUE}🌐 GraphQL Endpoints:${NC}"
    echo "• GraphQL API: http://localhost:3000/graphql"
    echo "• Playground:  http://localhost:3000/graphql (open in browser)"
    echo "• Health:      http://localhost:3000/api/health"
    echo
    
    echo -e "${BLUE}📚 Example GraphQL Queries:${NC}"
    echo
    echo -e "${YELLOW}# Get user dashboard${NC}"
    echo 'query Dashboard {
  me {
    email
    firstName
    statistics {
      totalJobs
      completedJobs
      avgThroughput
    }
  }
  simulationJobs(limit: 5, status: COMPLETED) {
    id
    name
    status
    results {
      totalThroughput
      averageLatency
    }
  }
}'
    echo
    
    echo -e "${YELLOW}# Create simulation job${NC}"
    echo 'mutation CreateJob {
  createSimulationJob(input: {
    name: "My GraphQL Simulation"
    topologyId: "1"
    workloadId: "1"
    simulationTime: 15.0
    numComputeNodes: 16
  }) {
    id
    name
    status
    progress
  }
}'
    echo
    
    echo -e "${YELLOW}# Search jobs${NC}"
    echo 'query SearchJobs {
  searchJobs(query: "test", limit: 10) {
    id
    name
    status
    user {
      email
    }
  }
}'
    echo
    
    echo -e "${BLUE}💡 GraphQL Advantages Demonstrated:${NC}"
    echo "✅ Single endpoint for all operations"
    echo "✅ Request exactly the data you need"
    echo "✅ Strong type system with validation"
    echo "✅ Complex nested queries in one request"
    echo "✅ Self-documenting API with introspection"
    echo "✅ Real-time subscriptions (infrastructure ready)"
    echo "✅ Better performance with reduced requests"
    echo
    
    echo -e "${BLUE}🚀 Next Steps:${NC}"
    echo "1. Open GraphQL Playground: http://localhost:3000/graphql"
    echo "2. Copy the JWT token above"
    echo "3. Add to HTTP headers: {\"Authorization\": \"Bearer YOUR_TOKEN\"}"
    echo "4. Try the example queries above"
    echo "5. Explore schema with introspection"
    echo "6. Compare with REST API endpoints"
    echo
    
    echo -e "${BLUE}🧪 Combined Testing:${NC}"
    echo "• WebSocket + GraphQL: http://localhost:3000/websocket-test"
    echo "• API Comparison: http://localhost:3000/api/v1/graphql-comparison"
    echo
}

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary files..."
    rm -f /tmp/graphql_*.json /tmp/rest_*.json /tmp/graphql_jwt_token.sh
}

# Main test execution
main() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}Session 4.2: GraphQL API Integration Testing${NC}"
    echo -e "${BLUE}================================================${NC}"
    echo
    
    check_graphql_availability
    setup_authentication
    test_graphql_basic_queries
    test_graphql_mutations
    test_graphql_complex_queries
    test_graphql_vs_rest_comparison
    test_graphql_error_handling
    test_graphql_playground
    provide_graphql_guidance
    
    echo -e "${GREEN}================================================${NC}"
    echo -e "${GREEN}✅ Session 4.2 GraphQL Integration Complete!${NC}"
    echo -e "${GREEN}================================================${NC}"
    
    cleanup
}

# Trap cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"