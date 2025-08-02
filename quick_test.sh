#!/bin/bash
# Debug version of check_graphql_availability function
# Add this to your tmp_api_test.sh or run it separately

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

# Debug version of check_graphql_availability
debug_check_graphql_availability() {
    log_info "🔍 DEBUG: Starting GraphQL availability check..."
    
    API_BASE="http://localhost:3000"
    GRAPHQL_ENDPOINT="$API_BASE/graphql"
    
    # Step 1: Check if API is reachable
    log_info "🔍 DEBUG: Testing API base connectivity..."
    if ! curl -s --connect-timeout 5 "$API_BASE/api/health" > /dev/null; then
        log_error "❌ Cannot reach API at $API_BASE"
        log_info "💡 Make sure Docker containers are running: docker-compose ps"
        return 1
    fi
    log_success "✅ API is reachable"
    
    # Step 2: Get health response
    log_info "🔍 DEBUG: Fetching health endpoint response..."
    response=$(curl -s "$API_BASE/api/health")
    
    if [ -z "$response" ]; then
        log_error "❌ Empty response from health endpoint"
        return 1
    fi
    
    log_info "🔍 DEBUG: Health response received (length: ${#response} chars)"
    echo "Raw response: $response"
    
    # Step 3: Check for GraphQL status in response
    log_info "🔍 DEBUG: Checking for GraphQL status..."
    
    if echo "$response" | grep -q '"graphql":"active"'; then
        log_success "✅ GraphQL server is ACTIVE!"
        
        # Test GraphQL introspection
        log_info "🔍 DEBUG: Testing GraphQL introspection..."
        introspection_query='{"query":"{ __schema { queryType { name } } }"}'
        
        log_info "🔍 DEBUG: Sending introspection query to $GRAPHQL_ENDPOINT"
        introspection_response=$(curl -s -X POST "$GRAPHQL_ENDPOINT" \
            -H "Content-Type: application/json" \
            -d "$introspection_query")
        
        log_info "🔍 DEBUG: Introspection response: $introspection_response"
        
        if echo "$introspection_response" | grep -q '"queryType"'; then
            log_success "✅ GraphQL introspection working"
            return 0
        else
            log_warning "⚠️ GraphQL introspection failed"
            log_info "Expected to find 'queryType' in response"
            return 1
        fi
        
    elif echo "$response" | grep -q '"graphql":"disabled"'; then
        log_error "❌ GraphQL server is DISABLED"
        echo "Health response shows GraphQL as disabled"
        return 1
        
    elif echo "$response" | grep -q '"graphql"'; then
        # GraphQL key exists but with different value
        graphql_status=$(echo "$response" | grep -o '"graphql":"[^"]*"' || echo "unknown")
        log_warning "⚠️ GraphQL status: $graphql_status"
        return 1
        
    else
        log_error "❌ Cannot determine GraphQL status"
        log_info "No GraphQL status found in health response"
        echo "Full response: $response"
        return 1
    fi
}

# Run the debug function
debug_check_graphql_availability
exit_code=$?

echo ""
log_info "🔍 DEBUG: Function completed with exit code: $exit_code"

if [ $exit_code -eq 0 ]; then
    log_success "🎉 GraphQL availability check PASSED"
else
    log_error "💥 GraphQL availability check FAILED"
    log_info "💡 Next steps:"
    echo "  1. Check Docker containers: docker-compose ps"
    echo "  2. Check API logs: docker-compose logs api-gateway"
    echo "  3. Test health endpoint manually: curl http://localhost:3000/api/health"
fi