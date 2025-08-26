# ai-service/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create directories for persistence
RUN mkdir -p /app/chroma_db /app/logs /app/src

# Upgrade pip first
RUN pip install --no-cache-dir --upgrade pip==25.2

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash smartops && \
    chown -R smartops:smartops /app
USER smartops

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Environment variables
ENV PYTHONPATH=/app/src
ENV PYTHONUNBUFFERED=1

# Run the application
#CMD ["python", "-m", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
CMD ["python", "src/main.py"]