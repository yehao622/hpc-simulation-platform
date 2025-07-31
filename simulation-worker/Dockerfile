# Fixed Simulation Worker Dockerfile
FROM python:3.9-slim

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY simulation-worker/requirements.txt ./requirements.txt

# Install Python dependencies
RUN pip3 install --no-cache-dir -r requirements.txt

# Create app user
RUN useradd --create-home --shell /bin/bash worker

# Copy application code
COPY --chown=worker:worker simulation-worker/src/ ./src/
COPY --chown=worker:worker legacy-simulator/ ./legacy-simulator/

# Create results directory
RUN mkdir -p /app/results && chown worker:worker /app/results

# Switch to non-root user
USER worker

# Environment variables
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python3 -c "import sys; sys.exit(0)" || exit 1

# Start the worker
CMD ["python3", "src/worker.py"]