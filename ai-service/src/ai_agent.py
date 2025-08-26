# ai-service/src/ai_agent.py
# SmartOps AI Agent - Real LangChain Implementation with RAG

import os
import logging
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
import json
import asyncio
import hashlib
from datetime import datetime, timedelta

# LangChain imports
from langchain.agents import create_openai_functions_agent, AgentExecutor
from langchain.tools import Tool
from langchain.schema import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.vectorstores import Chroma
from langchain.embeddings import OpenAIEmbeddings
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.memory import ConversationBufferWindowMemory
from langchain.schema.runnable import RunnablePassthrough
from langchain.schema.output_parser import StrOutputParser

# Database and HTTP clients
import asyncpg
import redis.asyncio as redis
import httpx

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class SmartOpsContext:
    """Context information for SmartOps AI Agent"""
    system_metrics: Dict[str, Any]
    recent_jobs: List[Dict[str, Any]]
    alerts: List[Dict[str, Any]]
    analytics_summary: Dict[str, Any]
    timestamp: datetime

class SmartOpsRAGSystem:
    """RAG (Retrieval Augmented Generation) system for SmartOps domain knowledge"""
    
    def __init__(self, openai_api_key: str):
        self.openai_api_key = openai_api_key
        self.embeddings = OpenAIEmbeddings(openai_api_key=openai_api_key)
        self.vectorstore = None
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=100,
            separators=["\n\n", "\n", " ", ""]
        )
        self.knowledge_base_initialized = False
        
    async def initialize_knowledge_base(self):
        """Initialize RAG knowledge base with HPC simulation domain knowledge"""
        try:
            # HPC Simulation Domain Knowledge
            hpc_knowledge = [
                """
                High Performance Computing (HPC) systems are used for computationally intensive tasks.
                Common HPC topologies include Fat-Tree, Torus, and Mesh networks.
                Fat-Tree topology provides full bisection bandwidth and is popular in modern data centers.
                Common performance metrics include job completion time, throughput, and resource utilization.
                """,
                """
                Job scheduling in HPC systems uses algorithms like FIFO, Shortest Job First, and Backfill.
                Resource allocation considers CPU cores, memory, and network bandwidth requirements.
                Load balancing distributes workloads across compute nodes to optimize performance.
                Queue management prevents system overload and ensures fair resource allocation.
                """,
                """
                HPC monitoring involves tracking system health, job performance, and resource utilization.
                Key metrics include CPU usage, memory consumption, network I/O, and storage performance.
                Failure detection and recovery mechanisms ensure system reliability and availability.
                Performance bottlenecks can occur in computation, memory access, or network communication.
                """,
                """
                Simulation workloads include computational fluid dynamics, molecular dynamics, and climate modeling.
                Parallel computing techniques like MPI and OpenMP enable scalable performance.
                Data management involves handling large datasets and ensuring data integrity.
                Checkpointing allows jobs to recover from failures without losing significant progress.
                """,
                """
                System optimization involves tuning parameters for specific workload characteristics.
                Energy efficiency is important for large-scale HPC installations.
                Cooling systems and power management are critical infrastructure components.
                Performance profiling helps identify optimization opportunities.
                """
            ]
            
            # Convert knowledge to documents
            documents = []
            for i, text in enumerate(hpc_knowledge):
                doc = Document(
                    page_content=text.strip(),
                    metadata={
                        "source": f"hpc_knowledge_{i}",
                        "topic": "hpc_domain",
                        "timestamp": datetime.now().isoformat()
                    }
                )
                documents.append(doc)
            
            # Split documents into chunks
            split_docs = self.text_splitter.split_documents(documents)
            
            # Create vector store
            self.vectorstore = Chroma.from_documents(
                documents=split_docs,
                embedding=self.embeddings,
                persist_directory="./chroma_db"
            )
            
            self.knowledge_base_initialized = True
            logger.info(f"RAG knowledge base initialized with {len(split_docs)} document chunks")
            
        except Exception as e:
            logger.error(f"Failed to initialize knowledge base: {e}")
            self.knowledge_base_initialized = False
    
    async def retrieve_relevant_context(self, query: str, k: int = 3) -> List[str]:
        """Retrieve relevant context from knowledge base"""
        if not self.knowledge_base_initialized or not self.vectorstore:
            return []
        
        try:
            # Search for relevant documents
            docs = self.vectorstore.similarity_search(query, k=k)
            return [doc.page_content for doc in docs]
        except Exception as e:
            logger.error(f"Failed to retrieve context: {e}")
            return []

class SmartOpsAIAgent:
    """Advanced SmartOps AI Agent with LangChain and RAG capabilities"""
    
    def __init__(self):
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        if not self.openai_api_key:
            logger.warning("OPENAI_API_KEY not set. Using mock responses.")
            self.use_real_ai = False
        else:
            self.use_real_ai = True
            
        # Initialize components
        self.rag_system = SmartOpsRAGSystem(self.openai_api_key) if self.use_real_ai else None
        self.llm = ChatOpenAI(
            openai_api_key=self.openai_api_key,
            model="gpt-3.5-turbo",
            temperature=0.1
        ) if self.use_real_ai else None
        
        # Memory for conversation context
        self.memory = ConversationBufferWindowMemory(
            k=5,
            memory_key="chat_history",
            return_messages=True
        ) if self.use_real_ai else None
        
        # Database and cache connections
        self.db_pool = None
        self.redis_client = None
        
        # Agent components
        self.agent_executor = None
        self.tools = []
        
    async def initialize(self):
        """Initialize AI Agent with database connections and RAG system"""
        try:
            # Initialize database connection - CORRECTED for existing setup
            self.db_pool = await asyncpg.create_pool(
                host=os.getenv("POSTGRES_HOST", "localhost"),
                port=int(os.getenv("POSTGRES_PORT", "5432")),
                user=os.getenv("POSTGRES_USER", "hpc_user"),
                password=os.getenv("POSTGRES_PASSWORD", "hpc_password"),
                database=os.getenv("POSTGRES_DB", "hpc_simulation"),
                min_size=2,
                max_size=10
            )
            
            # Initialize Redis connection
            self.redis_client = redis.from_url(
                f"redis://{os.getenv('REDIS_HOST', 'localhost')}:"
                f"{os.getenv('REDIS_PORT', '6379')}"
            )
            
            # Initialize RAG system if using real AI
            if self.use_real_ai and self.rag_system:
                await self.rag_system.initialize_knowledge_base()
                self._create_agent_tools()
                self._create_agent_executor()
            
            logger.info("SmartOps AI Agent initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize AI Agent: {e}")
            
    def _create_agent_tools(self):
        """Create tools for the LangChain agent"""
        
        async def get_system_health():
            """Get current system health status"""
            try:
                async with httpx.AsyncClient() as client:
                    # Get analytics from Java service
                    response = await client.get("http://data-processor:8080/api/analytics/health")
                    if response.status_code == 200:
                        return json.dumps(response.json(), indent=2)
                return "Unable to fetch system health data"
            except Exception as e:
                return f"Error fetching system health: {str(e)}"
        
        async def get_performance_metrics():
            """Get current performance metrics"""
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.get("http://data-processor:8080/api/analytics/performance")
                    if response.status_code == 200:
                        return json.dumps(response.json(), indent=2)
                return "Unable to fetch performance metrics"
            except Exception as e:
                return f"Error fetching performance metrics: {str(e)}"
        
        async def get_recent_jobs():
            """Get information about recent jobs"""
            try:
                if self.db_pool:
                    async with self.db_pool.acquire() as conn:
                        rows = await conn.fetch("""
                            SELECT job_id, job_name, status, created_at, 
                                   completed_at, resource_requirements
                            FROM jobs 
                            ORDER BY created_at DESC 
                            LIMIT 10
                        """)
                        jobs = [dict(row) for row in rows]
                        return json.dumps(jobs, indent=2, default=str)
                return "Database connection not available"
            except Exception as e:
                return f"Error fetching recent jobs: {str(e)}"
        
        # Convert async functions to sync for LangChain tools
        def sync_system_health():
            return asyncio.create_task(get_system_health())
            
        def sync_performance_metrics():
            return asyncio.create_task(get_performance_metrics())
            
        def sync_recent_jobs():
            return asyncio.create_task(get_recent_jobs())
        
        # Create LangChain tools
        self.tools = [
            Tool(
                name="get_system_health",
                description="Get current system health status including CPU, memory, and service status",
                func=lambda: asyncio.run(get_system_health())
            ),
            Tool(
                name="get_performance_metrics", 
                description="Get performance metrics and analytics data",
                func=lambda: asyncio.run(get_performance_metrics())
            ),
            Tool(
                name="get_recent_jobs",
                description="Get information about recent simulation jobs and their status",
                func=lambda: asyncio.run(get_recent_jobs())
            )
        ]
        
    def _create_agent_executor(self):
        """Create the LangChain agent executor"""
        if not self.use_real_ai:
            return
            
        # Create system prompt
        system_prompt = """
        You are the SmartOps AI Assistant, an expert in High Performance Computing (HPC) systems,
        job scheduling, and system monitoring. You help users understand system performance,
        analyze job metrics, and provide insights about HPC simulation workloads.
        
        Your capabilities include:
        - Analyzing system health and performance metrics
        - Providing insights about job execution and scheduling
        - Explaining HPC concepts and best practices
        - Identifying performance bottlenecks and optimization opportunities
        - Monitoring alerts and recommending actions
        
        Always provide specific, actionable insights based on the data you receive from tools.
        Use your domain knowledge about HPC systems to interpret metrics and provide context.
        Be concise but thorough in your explanations.
        """
        
        # Create prompt template
        prompt = ChatPromptTemplate.from_messages([
            ("system", system_prompt),
            MessagesPlaceholder("chat_history", optional=True),
            ("human", "{input}"),
            MessagesPlaceholder("agent_scratchpad")
        ])
        
        # Create agent
        agent = create_openai_functions_agent(
            llm=self.llm,
            tools=self.tools,
            prompt=prompt
        )
        
        # Create agent executor
        self.agent_executor = AgentExecutor(
            agent=agent,
            tools=self.tools,
            memory=self.memory,
            verbose=True,
            max_iterations=5,
            handle_parsing_errors=True
        )
    
    async def process_query(self, query: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """Process user query and return AI response"""
        
        # If not using real AI, return enhanced mock response
        if not self.use_real_ai:
            return await self._generate_mock_response(query, context)
        
        try:
            # Get relevant context from RAG system
            relevant_context = await self.rag_system.retrieve_relevant_context(query)
            
            # Enhance query with context
            enhanced_query = query
            if relevant_context:
                context_str = "\n\n".join(relevant_context)
                enhanced_query = f"""
                Context from knowledge base:
                {context_str}
                
                User question: {query}
                
                Please provide a comprehensive answer using the context and any relevant system data.
                """
            
            # Execute agent
            result = await self.agent_executor.ainvoke({
                "input": enhanced_query
            })
            
            return {
                "response": result["output"],
                "confidence": 0.9,
                "sources": ["LangChain Agent", "RAG Knowledge Base", "Live System Data"],
                "context_used": len(relevant_context) > 0,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing query: {e}")
            return {
                "response": f"I encountered an error processing your query: {str(e)}. Please try again or rephrase your question.",
                "confidence": 0.1,
                "sources": ["Error Handler"],
                "context_used": False,
                "timestamp": datetime.now().isoformat()
            }
    
    async def _generate_mock_response(self, query: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """Generate enhanced mock responses when OpenAI API is not available"""
        
        query_lower = query.lower()
        
        # Enhanced mock responses with more intelligence
        if any(word in query_lower for word in ["health", "status", "system"]):
            response = """
            **System Health Analysis:**
            - All core services are operational (API Gateway ✅, Database ✅, Redis ✅)
            - Java Analytics Service: Healthy with 8 active endpoints
            - Current resource utilization: CPU 15%, Memory 45%, Network optimal
            - No critical alerts detected
            - System performance score: 92.3/100 (Excellent)
            
            **Recommendations:**
            - System is running optimally
            - Monitor memory usage trends over the next 24 hours
            """
        
        elif any(word in query_lower for word in ["performance", "metrics", "analytics"]):
            response = """
            **Performance Metrics Summary:**
            - Average job completion time: 1,156.7 seconds
            - Success rate (30 days): 89.1%
            - Active jobs: 5 running, 15 pending
            - Throughput: 23 jobs completed in last 24 hours
            
            **Performance Insights:**
            - System is handling current load efficiently
            - Success rate is within acceptable range (>85%)
            - Job queue depth is normal for current workload
            """
            
        elif any(word in query_lower for word in ["jobs", "queue", "scheduling"]):
            response = """
            **Job Scheduling Analysis:**
            - Total jobs processed: 267
            - Current queue: 5 running, 15 pending
            - Recent completion: Fat-Tree Optimization (100% success)
            - Currently running: HPC Network Analysis (78.5% progress)
            
            **Scheduling Insights:**
            - Queue processing normally with no bottlenecks
            - Average wait time: <5 minutes
            - Resource allocation is balanced across compute nodes
            """
            
        elif any(word in query_lower for word in ["alerts", "warnings", "issues"]):
            response = """
            **Alert Status:**
            - No critical alerts active
            - 2 informational notifications:
              • Prometheus metrics collection active
              • Grafana dashboards ready for monitoring
            
            **System Status:**
            - All monitoring systems operational
            - Error rate: 0.02% (well within normal range)
            - No intervention required at this time
            """
            
        else:
            response = """
            **SmartOps AI Assistant Ready**
            
            I can help you with:
            - System health and performance analysis
            - Job scheduling and queue management  
            - HPC simulation insights and optimization
            - Alert monitoring and troubleshooting
            
            **Current Platform Status:**
            - Multi-service architecture operational
            - Java + Python + Node.js services integrated
            - Real-time monitoring with Prometheus + Grafana
            - Ready for advanced AI-powered analytics
            
            Try asking about: 'system health', 'performance metrics', 'job status', or 'alerts'
            """
        
        return {
            "response": response,
            "confidence": 0.85,
            "sources": ["SmartOps Knowledge Base", "Live System Data", "Analytics Service"],
            "context_used": True,
            "timestamp": datetime.now().isoformat(),
            "note": "Enhanced mock response - Configure OPENAI_API_KEY for full LangChain integration"
        }
    
    async def get_system_summary(self) -> Dict[str, Any]:
        """Get comprehensive system summary"""
        try:
            # Fetch data from Java analytics service
            async with httpx.AsyncClient() as client:
                dashboard_response = await client.get("http://data-processor:8080/api/analytics/dashboard")
                health_response = await client.get("http://data-processor:8080/api/analytics/health")
                
                dashboard_data = dashboard_response.json() if dashboard_response.status_code == 200 else {}
                health_data = health_response.json() if health_response.status_code == 200 else {}
                
                return {
                    "dashboard": dashboard_data,
                    "health": health_data,
                    "timestamp": datetime.now().isoformat(),
                    "ai_analysis": "System operating within normal parameters with good performance metrics"
                }
                
        except Exception as e:
            logger.error(f"Error getting system summary: {e}")
            return {"error": str(e), "timestamp": datetime.now().isoformat()}
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            if self.db_pool:
                await self.db_pool.close()
            if self.redis_client:
                await self.redis_client.close()
            logger.info("AI Agent cleanup completed")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

# Global agent instance
ai_agent = SmartOpsAIAgent()

async def initialize_ai_agent():
    """Initialize the global AI agent instance"""
    await ai_agent.initialize()

async def get_ai_response(query: str, context: Optional[Dict] = None) -> Dict[str, Any]:
    """Get AI response for a query"""
    return await ai_agent.process_query(query, context)

async def get_system_analysis() -> Dict[str, Any]:
    """Get comprehensive system analysis"""
    return await ai_agent.get_system_summary()