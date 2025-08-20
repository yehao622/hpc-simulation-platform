# ai-service/src/main.py
# SmartOps AI Agent - FastAPI Service

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import logging
import os
from typing import Optional
import json
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="SmartOps AI Service",
    description="AI-Powered Monitoring and Analysis Service",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models
class ChatRequest(BaseModel):
    query: str
    context: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    confidence: float = 0.8
    sources: list = []

class HealthResponse(BaseModel):
    status: str
    version: str
    uptime: str

# Mock AI responses for initial deployment
MOCK_RESPONSES = {
    "system health": "All services are operational. API Gateway (✅), Database (✅), Redis (✅), Frontend (✅)",
    "performance": "Current system performance: CPU 15%, Memory 45%, Network 2MB/s. All metrics within normal range.",
    "alerts": "No critical alerts. 2 info notifications: Prometheus metrics collection active, Grafana dashboards ready.",
    "metrics": "Key metrics: API response time <50ms, Database connections 8/20, Active jobs 0, Error rate 0.02%",
    "status": "SmartOps platform is fully operational with all monitoring services active.",
    "default": "I'm the SmartOps AI monitoring assistant. I can help you analyze system health, performance metrics, and provide insights about your HPC simulation platform. Try asking about 'system health', 'performance', or 'metrics'."
}

def get_ai_response(query: str) -> str:
    """Get AI response based on query keywords"""
    query_lower = query.lower()
    
    # Simple keyword matching for mock responses
    for keyword, response in MOCK_RESPONSES.items():
        if keyword in query_lower:
            return response
    
    # Default response
    return MOCK_RESPONSES["default"]

# Routes
@app.get("/", response_model=dict)
async def root():
    """Root endpoint"""
    return {
        "service": "SmartOps AI Agent",
        "status": "operational",
        "version": "1.0.0",
        "endpoints": ["/health", "/chat", "/metrics", "/docs"]
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        uptime="operational"
    )

@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Chat endpoint for AI monitoring queries"""
    try:
        logger.info(f"Received query: {request.query}")
        
        # Get AI response
        response = get_ai_response(request.query)
        
        return ChatResponse(
            response=response,
            confidence=0.85,
            sources=["system_metrics", "monitoring_data"]
        )
    
    except Exception as e:
        logger.error(f"Error processing chat request: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    # Return Prometheus-formatted metrics
    return """# HELP ai_service_requests_total Total number of requests
# TYPE ai_service_requests_total counter
ai_service_requests_total 42

# HELP ai_service_response_time_seconds Response time in seconds
# TYPE ai_service_response_time_seconds histogram
ai_service_response_time_seconds_bucket{le="0.1"} 10
ai_service_response_time_seconds_bucket{le="0.5"} 35
ai_service_response_time_seconds_bucket{le="1.0"} 42
ai_service_response_time_seconds_bucket{le="+Inf"} 42
ai_service_response_time_seconds_sum 12.5
ai_service_response_time_seconds_count 42

# HELP ai_service_status Service status (1=healthy, 0=unhealthy)
# TYPE ai_service_status gauge
ai_service_status 1
"""

@app.get("/status")
async def system_status():
    """Get system status for monitoring"""
    return {
        "ai_service": "healthy",
        "langchain": "mock_mode",
        "model": "mock_gpt",
        "capabilities": [
            "system_monitoring",
            "performance_analysis", 
            "anomaly_detection",
            "natural_language_queries"
        ],
        "metrics": {
            "queries_processed": 42,
            "avg_response_time": "0.3s",
            "accuracy": "85%"
        }
    }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    logger.info(f"Starting SmartOps AI Service on port {port}")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        access_log=True
    )
