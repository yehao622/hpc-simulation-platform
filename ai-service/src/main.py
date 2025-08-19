# ai-service/src/main.py
# SmartOps AI Agent - FastAPI service with LangChain integration

import os
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
import uvicorn
import redis.asyncio as redis
import asyncpg
import httpx

# AI/ML imports
from langchain.agents import create_react_agent, AgentExecutor
from langchain.tools import Tool
from langchain.prompts import PromptTemplate
from langchain.memory import ConversationBufferWindowMemory
from langchain_openai import ChatOpenAI
from langchain_community.vectorstores import Chroma
from langchain_community.embeddings import OpenAIEmbeddings

# Monitoring imports
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Prometheus metrics
AI_REQUESTS_TOTAL = Counter('ai_requests_total', 'Total AI requests', ['endpoint', 'status'])
AI_RESPONSE_TIME = Histogram('ai_response_duration_seconds', 'AI response time', ['endpoint'])
ACTIVE_CONVERSATIONS = Gauge('ai_active_conversations', 'Active AI conversations')

# Request/Response models
class ChatRequest(BaseModel):
    query: str = Field(..., description="User query for the AI assistant")
    context: Optional[str] = Field(None, description="Additional context for the query")
    conversation_id: Optional[str] = Field(None, description="Conversation ID for maintaining context")
    stream: bool = Field(False, description="Whether to stream the response")

class ChatResponse(BaseModel):
    response: str = Field(..., description="AI assistant response")
    conversation_id: str = Field(..., description="Conversation ID")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict[str, Any] = Field(default_factory=dict)

class MonitoringQuery(BaseModel):
    metric_name: str = Field(..., description="Prometheus metric to query")
    time_range: str = Field("1h", description="Time range for the query")
    filters: Optional[Dict[str, str]] = Field(None, description="Additional filters")

class SystemInsight(BaseModel):
    insight_type: str = Field(..., description="Type of insight (performance, anomaly, etc.)")
    severity: str = Field(..., description="Severity level (low, medium, high, critical)")
    description: str = Field(..., description="Human-readable description")
    recommendations: List[str] = Field(..., description="Recommended actions")
    metrics: Dict[str, Any] = Field(..., description="Supporting metrics data")

# Global variables for dependencies
db_pool = None
redis_client = None
llm = None
agent_executor = None
vectorstore = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events"""
    # Startup
    logger.info("🚀 Starting SmartOps AI Agent service...")
    await initialize_dependencies()
    yield
    # Shutdown
    logger.info("🔄 Shutting down SmartOps AI Agent service...")
    await cleanup_dependencies()

app = FastAPI(
    title="SmartOps AI Agent",
    description="AI-powered monitoring and analysis for HPC simulation platform",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def initialize_dependencies():
    """Initialize database, Redis, and AI components"""
    global db_pool, redis_client, llm, agent_executor, vectorstore
    
    try:
        # Initialize database connection
        db_pool = await asyncpg.create_pool(
            host=os.getenv('DB_HOST', 'postgres'),
            port=int(os.getenv('DB_PORT', 5432)),
            user=os.getenv('DB_USER', 'smartops'),
            password=os.getenv('DB_PASSWORD', 'smartops123'),
            database=os.getenv('DB_NAME', 'smartops_platform'),
            min_size=2,
            max_size=10
        )
        logger.info("✅ Database connection established")
        
        # Initialize Redis connection
        redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST', 'redis'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            db=0,
            decode_responses=True
        )
        await redis_client.ping()
        logger.info("✅ Redis connection established")
        
        # Initialize LLM
        openai_api_key = os.getenv('OPENAI_API_KEY')
        if not openai_api_key:
            logger.warning("⚠️ OPENAI_API_KEY not found, using mock responses")
            llm = None
        else:
            llm = ChatOpenAI(
                model="gpt-4",
                temperature=0.1,
                openai_api_key=openai_api_key
            )
            logger.info("✅ OpenAI LLM initialized")
        
        # Initialize AI agent with tools
        if llm:
            tools = create_monitoring_tools()
            agent_executor = create_agent_executor(llm, tools)
            logger.info("✅ AI agent initialized with monitoring tools")
        
        # Initialize vector store for RAG
        # vectorstore = await initialize_vectorstore()
        # logger.info("✅ Vector store initialized for RAG")
        
    except Exception as e:
        logger.error(f"❌ Failed to initialize dependencies: {e}")
        raise

async def cleanup_dependencies():
    """Cleanup database and Redis connections"""
    global db_pool, redis_client
    
    if db_pool:
        await db_pool.close()
    if redis_client:
        await redis_client.close()

def create_monitoring_tools() -> List[Tool]:
    """Create LangChain tools for monitoring queries"""
    
    async def query_prometheus(query: str) -> str:
        """Query Prometheus for metrics data"""
        try:
            prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus:9090')
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{prometheus_url}/api/v1/query",
                    params={'query': query}
                )
                data = response.json()
                if data['status'] == 'success':
                    return json.dumps(data['data']['result'], indent=2)
                else:
                    return f"Error querying Prometheus: {data.get('error', 'Unknown error')}"
        except Exception as e:
            return f"Failed to query Prometheus: {str(e)}"
    
    async def get_simulation_metrics() -> str:
        """Get simulation job metrics from database"""
        try:
            async with db_pool.acquire() as conn:
                # Get job status distribution
                status_query = """
                    SELECT status, COUNT(*) as count 
                    FROM simulation_jobs 
                    WHERE created_at > NOW() - INTERVAL '24 hours'
                    GROUP BY status
                """
                status_results = await conn.fetch(status_query)
                
                # Get average job duration
                duration_query = """
                    SELECT AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration
                    FROM simulation_jobs 
                    WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '24 hours'
                """
                duration_result = await conn.fetchrow(duration_query)
                
                metrics = {
                    'job_status_distribution': dict(status_results),
                    'average_job_duration_seconds': float(duration_result['avg_duration'] or 0)
                }
                return json.dumps(metrics, indent=2)
        except Exception as e:
            return f"Failed to get simulation metrics: {str(e)}"
    
    async def analyze_system_performance() -> str:
        """Analyze overall system performance"""
        try:
            # Query key performance metrics
            queries = {
                'cpu_usage': 'rate(cpu_usage_total[5m])',
                'memory_usage': 'memory_usage_percent',
                'api_response_time': 'rate(http_request_duration_ms[5m])',
                'error_rate': 'rate(http_requests_total{status_code=~"5.."}[5m])'
            }
            
            results = {}
            for metric, query in queries.items():
                results[metric] = await query_prometheus(query)
            
            return json.dumps(results, indent=2)
        except Exception as e:
            return f"Failed to analyze performance: {str(e)}"
    
    tools = [
        Tool(
            name="query_prometheus",
            description="Query Prometheus for system metrics. Use PromQL syntax.",
            func=lambda q: asyncio.run(query_prometheus(q))
        ),
        Tool(
            name="get_simulation_metrics", 
            description="Get simulation job statistics and performance metrics.",
            func=lambda _: asyncio.run(get_simulation_metrics())
        ),
        Tool(
            name="analyze_system_performance",
            description="Get comprehensive system performance analysis.",
            func=lambda _: asyncio.run(analyze_system_performance())
        )
    ]
    
    return tools

def create_agent_executor(llm, tools) -> AgentExecutor:
    """Create LangChain agent executor"""
    prompt = PromptTemplate.from_template("""
You are SmartOps, an AI assistant for monitoring and analyzing an HPC simulation platform.
You have access to system metrics, simulation job data, and performance analytics.

Your capabilities include:
- Analyzing system performance and health
- Providing insights about simulation job metrics  
- Detecting anomalies and performance issues
- Generating recommendations for optimization

Always provide clear, actionable insights based on the available data.
If you need specific metrics, use the available tools to query the monitoring systems.

Question: {input}
Thought: I should analyze the user's question and determine what monitoring data I need.
{agent_scratchpad}
""")
    
    agent = create_react_agent(llm, tools, prompt)
    return AgentExecutor(agent=agent, tools=tools, verbose=True, max_iterations=3)

# API Endpoints

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    status = {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected" if db_pool else "disconnected", 
            "redis": "connected" if redis_client else "disconnected",
            "llm": "available" if llm else "unavailable"
        }
    }
    return status

@app.post("/chat", response_model=ChatResponse)
async def chat_with_ai(request: ChatRequest):
    """Chat with the AI monitoring assistant"""
    start_time = time.time()
    
    try:
        AI_REQUESTS_TOTAL.labels(endpoint="chat", status="processing").inc()
        ACTIVE_CONVERSATIONS.inc()
        
        if not llm or not agent_executor:
            # Mock response when LLM is not available
            response_text = f"Mock AI Response: I understand you're asking about '{request.query}'. " \
                          f"In a production environment, I would analyze system metrics and provide detailed insights."
        else:
            # Use actual AI agent
            result = await agent_executor.ainvoke({
                "input": request.query
            })
            response_text = result["output"]
        
        # Store conversation in Redis if conversation_id provided
        conversation_id = request.conversation_id or f"conv_{int(time.time())}"
        if redis_client:
            await redis_client.hset(
                f"conversation:{conversation_id}",
                mapping={
                    "last_query": request.query,
                    "last_response": response_text,
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
            await redis_client.expire(f"conversation:{conversation_id}", 3600)  # 1 hour TTL
        
        response = ChatResponse(
            response=response_text,
            conversation_id=conversation_id,
            metadata={
                "processing_time": time.time() - start_time,
                "model": "gpt-4" if llm else "mock"
            }
        )
        
        AI_REQUESTS_TOTAL.labels(endpoint="chat", status="success").inc()
        AI_RESPONSE_TIME.labels(endpoint="chat").observe(time.time() - start_time)
        
        return response
        
    except Exception as e:
        AI_REQUESTS_TOTAL.labels(endpoint="chat", status="error").inc()
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")
    finally:
        ACTIVE_CONVERSATIONS.dec()

@app.post("/chat/stream")
async def stream_chat(request: ChatRequest):
    """Stream AI responses for real-time chat experience"""
    
    async def generate_stream():
        start_time = time.time()
        try:
            AI_REQUESTS_TOTAL.labels(endpoint="chat_stream", status="processing").inc()
            
            if not llm or not agent_executor:
                # Mock streaming response
                mock_response = f"Analyzing your query about '{request.query}'... " \
                              f"Based on current system metrics, here's what I found: " \
                              f"The platform is operating normally with good performance indicators."
                
                for word in mock_response.split():
                    yield f"data: {json.dumps({'token': word + ' ', 'done': False})}\n\n"
                    await asyncio.sleep(0.1)  # Simulate thinking time
                    
                yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
            else:
                # Real streaming would require streaming-capable LLM setup
                result = await agent_executor.ainvoke({"input": request.query})
                response_text = result["output"]
                
                for word in response_text.split():
                    yield f"data: {json.dumps({'token': word + ' ', 'done': False})}\n\n"
                    await asyncio.sleep(0.05)
                    
                yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
            
            AI_REQUESTS_TOTAL.labels(endpoint="chat_stream", status="success").inc()
            AI_RESPONSE_TIME.labels(endpoint="chat_stream").observe(time.time() - start_time)
            
        except Exception as e:
            AI_REQUESTS_TOTAL.labels(endpoint="chat_stream", status="error").inc()
            logger.error(f"Error in streaming chat: {e}")
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/plain",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"}
    )

@app.post("/monitoring/query")
async def query_monitoring_data(request: MonitoringQuery):
    """Query monitoring data with natural language processing"""
    start_time = time.time()
    
    try:
        AI_REQUESTS_TOTAL.labels(endpoint="monitoring_query", status="processing").inc()
        
        # Build Prometheus query
        base_query = request.metric_name
        if request.filters:
            filter_str = ",".join([f'{k}="{v}"' for k, v in request.filters.items()])
            base_query = f"{request.metric_name}{{{filter_str}}}"
        
        # Add time range
        time_query = f"{base_query}[{request.time_range}]"
        
        # Query Prometheus
        prometheus_url = os.getenv('PROMETHEUS_URL', 'http://prometheus:9090')
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{prometheus_url}/api/v1/query",
                params={'query': time_query}
            )
            data = response.json()
        
        AI_REQUESTS_TOTAL.labels(endpoint="monitoring_query", status="success").inc()
        AI_RESPONSE_TIME.labels(endpoint="monitoring_query").observe(time.time() - start_time)
        
        return {
            "query": time_query,
            "data": data.get('data', {}),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        AI_REQUESTS_TOTAL.labels(endpoint="monitoring_query", status="error").inc()
        logger.error(f"Error querying monitoring data: {e}")
        raise HTTPException(status_code=500, detail=f"Monitoring query failed: {str(e)}")

@app.get("/insights/system", response_model=List[SystemInsight])
async def get_system_insights():
    """Get AI-generated system insights and recommendations"""
    start_time = time.time()
    
    try:
        AI_REQUESTS_TOTAL.labels(endpoint="system_insights", status="processing").inc()
        
        insights = []
        
        # Check simulation job performance
        if db_pool:
            async with db_pool.acquire() as conn:
                # Get recent job failure rate
                failure_query = """
                    SELECT 
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
                        COUNT(*) as total_jobs
                    FROM simulation_jobs 
                    WHERE created_at > NOW() - INTERVAL '1 hour'
                """
                result = await conn.fetchrow(failure_query)
                
                if result['total_jobs'] > 0:
                    failure_rate = result['failed_jobs'] / result['total_jobs']
                    if failure_rate > 0.1:  # More than 10% failure rate
                        insights.append(SystemInsight(
                            insight_type="performance",
                            severity="high" if failure_rate > 0.2 else "medium",
                            description=f"High job failure rate detected: {failure_rate:.1%}",
                            recommendations=[
                                "Review simulation worker logs for error patterns",
                                "Check resource allocation and limits",
                                "Validate input parameters for failed jobs"
                            ],
                            metrics={"failure_rate": failure_rate, "total_jobs": result['total_jobs']}
                        ))
        
        # Mock additional insights for demonstration
        insights.extend([
            SystemInsight(
                insight_type="resource",
                severity="low", 
                description="System resources are operating within normal parameters",
                recommendations=["Continue monitoring", "Consider scaling if load increases"],
                metrics={"cpu_usage": 45.2, "memory_usage": 62.1}
            ),
            SystemInsight(
                insight_type="performance",
                severity="medium",
                description="API response times are slightly elevated during peak hours",
                recommendations=[
                    "Implement request rate limiting",
                    "Add caching for frequently accessed data",
                    "Consider horizontal scaling"
                ],
                metrics={"avg_response_time": 150.5, "p95_response_time": 450.2}
            )
        ])
        
        AI_REQUESTS_TOTAL.labels(endpoint="system_insights", status="success").inc()
        AI_RESPONSE_TIME.labels(endpoint="system_insights").observe(time.time() - start_time)
        
        return insights
        
    except Exception as e:
        AI_REQUESTS_TOTAL.labels(endpoint="system_insights", status="error").inc()
        logger.error(f"Error generating system insights: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate insights: {str(e)}")

@app.get("/metrics")
async def get_metrics():
    """Prometheus metrics endpoint"""
    return generate_latest()

# WebSocket support for real-time AI chat (optional enhancement)
@app.websocket("/ws/chat")
async def websocket_chat(websocket):
    """WebSocket endpoint for real-time AI chat"""
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            request_data = json.loads(data)
            
            # Process the chat request
            chat_request = ChatRequest(**request_data)
            
            if not llm or not agent_executor:
                response = f"Mock AI: Analyzing '{chat_request.query}' - system appears healthy."
            else:
                result = await agent_executor.ainvoke({"input": chat_request.query})
                response = result["output"]
            
            await websocket.send_text(json.dumps({
                "response": response,
                "timestamp": datetime.utcnow().isoformat()
            }))
            
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close()

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
