# ai-service/src/main.py
# SmartOps AI Service - Enhanced with LangChain and RAG

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn
import logging
import os
from typing import Optional, Dict, Any, List
import json
import asyncio
from datetime import datetime
from contextlib import asynccontextmanager

# Import our AI Agent
from ai_agent import initialize_ai_agent, get_ai_response, get_system_analysis, ai_agent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lifespan event handler for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("🚀 Starting SmartOps AI Service...")
    try:
        await initialize_ai_agent()
        logger.info("✅ AI Agent initialized successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize AI Agent: {e}")
    
    yield
    
    # Shutdown
    logger.info("🛑 Shutting down SmartOps AI Service...")
    try:
        await ai_agent.cleanup()
        logger.info("✅ AI Agent cleanup completed")
    except Exception as e:
        logger.error(f"❌ Error during cleanup: {e}")

# Create FastAPI app with lifespan
app = FastAPI(
    title="SmartOps AI Agent Service",
    description="Advanced AI-Powered Monitoring and Analysis Service with LangChain and RAG",
    version="2.0.0",
    lifespan=lifespan
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
    query: str = Field(..., description="User query for the AI agent")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context")
    include_system_data: bool = Field(default=True, description="Include live system data in response")

class ChatResponse(BaseModel):
    response: str = Field(..., description="AI agent response")
    confidence: float = Field(..., description="Confidence score (0-1)")
    sources: List[str] = Field(..., description="Data sources used")
    context_used: bool = Field(..., description="Whether RAG context was used")
    timestamp: str = Field(..., description="Response timestamp")
    system_data: Optional[Dict[str, Any]] = Field(default=None, description="Related system data")

class HealthResponse(BaseModel):
    status: str
    version: str
    uptime: str
    ai_agent_status: str
    rag_initialized: bool
    openai_configured: bool

class SystemAnalysisResponse(BaseModel):
    analysis: Dict[str, Any]
    ai_insights: str
    recommendations: List[str]
    timestamp: str

# Routes
@app.get("/", response_model=Dict[str, Any])
async def root():
    """Root endpoint with service information"""
    return {
        "service": "SmartOps AI Agent Service",
        "status": "operational",
        "version": "2.0.0",
        "features": [
            "LangChain Integration",
            "RAG Knowledge Base", 
            "Real-time System Analysis",
            "Multi-service Communication",
            "HPC Domain Expertise"
        ],
        "endpoints": [
            "/health",
            "/chat",
            "/analysis",
            "/system-summary", 
            "/metrics",
            "/agent/status",
            "/docs"
        ],
        "ai_capabilities": {
            "langchain_agents": True,
            "rag_system": True,
            "domain_knowledge": "HPC Simulation Systems",
            "live_data_integration": True
        }
    }

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Enhanced health check endpoint"""
    try:
        ai_status = "operational" if ai_agent else "not_initialized"
        rag_status = False
        openai_status = bool(os.getenv("OPENAI_API_KEY"))
        
        if ai_agent and ai_agent.rag_system:
            rag_status = ai_agent.rag_system.knowledge_base_initialized
            
        return HealthResponse(
            status="healthy",
            version="2.0.0", 
            uptime="operational",
            ai_agent_status=ai_status,
            rag_initialized=rag_status,
            openai_configured=openai_status
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return HealthResponse(
            status="degraded",
            version="2.0.0",
            uptime="operational", 
            ai_agent_status="error",
            rag_initialized=False,
            openai_configured=False
        )

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Enhanced chat endpoint with LangChain agent integration"""
    try:
        logger.info(f"Processing chat request: {request.query[:100]}...")
        
        # Get AI response
        ai_response = await get_ai_response(request.query, request.context)
        
        # Get related system data if requested
        system_data = None
        if request.include_system_data:
            try:
                system_data = await get_system_analysis()
            except Exception as e:
                logger.warning(f"Failed to get system data: {e}")
        
        return ChatResponse(
            response=ai_response["response"],
            confidence=ai_response["confidence"],
            sources=ai_response["sources"],
            context_used=ai_response.get("context_used", False),
            timestamp=ai_response["timestamp"],
            system_data=system_data
        )
        
    except Exception as e:
        logger.error(f"Chat endpoint error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing chat request: {str(e)}"
        )

@app.get("/analysis", response_model=SystemAnalysisResponse)
async def system_analysis():
    """Get comprehensive AI-powered system analysis"""
    try:
        # Get system data
        system_data = await get_system_analysis()
        
        # Generate AI insights
        analysis_query = """
        Analyze the current system state and provide:
        1. Overall system health assessment
        2. Performance trends and insights  
        3. Potential issues or areas for improvement
        4. Specific recommendations for optimization
        """
        
        ai_response = await get_ai_response(analysis_query, {"system_data": system_data})
        
        # Extract recommendations (simplified for mock response)
        recommendations = [
            "Monitor memory usage trends over next 24 hours",
            "Consider job queue optimization for peak hours", 
            "Review error patterns for performance improvement opportunities",
            "Implement predictive scaling based on workload patterns"
        ]
        
        return SystemAnalysisResponse(
            analysis=system_data,
            ai_insights=ai_response["response"],
            recommendations=recommendations,
            timestamp=datetime.now().isoformat()
        )
        
    except Exception as e:
        logger.error(f"Analysis endpoint error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error generating system analysis: {str(e)}"
        )

@app.get("/system-summary")
async def get_system_summary():
    """Get real-time system summary with AI insights"""
    try:
        return await get_system_analysis()
    except Exception as e:
        logger.error(f"System summary error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error fetching system summary: {str(e)}"
        )

@app.get("/metrics")
async def prometheus_metrics():
    """Prometheus metrics endpoint"""
    # Simplified metrics for now - can be enhanced with prometheus_client
    return {
        "ai_requests_total": 0,
        "ai_response_time_seconds": 0.0,
        "rag_retrievals_total": 0,
        "system_analysis_requests_total": 0,
        "timestamp": datetime.now().isoformat()
    }

@app.post("/agent/retrain")
async def retrain_agent(background_tasks: BackgroundTasks):
    """Endpoint to trigger RAG system retraining (background task)"""
    def retrain():
        logger.info("Starting RAG system retraining...")
        # Placeholder for retraining logic
        logger.info("RAG system retraining completed")
    
    background_tasks.add_task(retrain)
    return {"message": "RAG system retraining started in background"}

@app.get("/agent/status")
async def agent_status():
    """Get detailed agent status information"""
    try:
        status = {
            "agent_initialized": ai_agent is not None,
            "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
            "rag_system_ready": False,
            "database_connected": False,
            "redis_connected": False,
            "java_service_accessible": False
        }
        
        if ai_agent:
            status["rag_system_ready"] = (
                ai_agent.rag_system and 
                ai_agent.rag_system.knowledge_base_initialized
            )
            status["database_connected"] = ai_agent.db_pool is not None
            status["redis_connected"] = ai_agent.redis_client is not None
            
            # Test Java service connectivity
            try:
                import httpx
                async with httpx.AsyncClient() as client:
                    response = await client.get(
                        "http://data-processor:8080/api/health", 
                        timeout=5.0
                    )
                    status["java_service_accessible"] = response.status_code == 200
            except Exception as conn_error:
                logger.debug(f"Java service connection test failed: {conn_error}")
                status["java_service_accessible"] = False
        
        return status
        
    except Exception as e:
        logger.error(f"Agent status error: {e}")
        return {"error": str(e)}

# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    return {
        "error": "Endpoint not found", 
        "available_endpoints": ["/health", "/chat", "/analysis", "/agent/status", "/docs"]
    }

@app.exception_handler(500)
async def internal_error_handler(request, exc):
    logger.error(f"Internal error: {exc}")
    return {
        "error": "Internal server error", 
        "message": "Check logs for details"
    }

if __name__ == "__main__":
    # Run the service
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "0.0.0.0")
    
    logger.info(f"🚀 Starting SmartOps AI Service on {host}:{port}")
    logger.info("🤖 LangChain integration ready")
    logger.info("📚 RAG system will initialize on startup")
    logger.info("🔗 Multi-service communication enabled")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )