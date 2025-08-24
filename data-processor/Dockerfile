# Multi-stage Dockerfile for Java Spring Boot service
# This is similar to your Node.js Dockerfile but for Java

# Stage 1: Build the application
FROM maven:3.8.7-openjdk-18-slim AS builder

# Set working directory
WORKDIR /app

# Copy pom.xml first for dependency caching (like package.json in Node.js)
COPY pom.xml .

# Download dependencies (cached if pom.xml doesn't change)
RUN mvn dependency:go-offline -B

# Copy source code
COPY src ./src

# Build the application (creates target/data-processor-1.0.0.jar)
RUN mvn clean package -DskipTests

# Stage 2: Runtime image
FROM openjdk:17-jdk-slim

# Install curl for health checks (like in your Node.js container)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r smartops && useradd -r -g smartops smartops

# Set working directory
WORKDIR /app

# Copy the built JAR from builder stage
COPY --from=builder /app/target/data-processor-1.0.0.jar app.jar

# Change ownership to non-root user
RUN chown smartops:smartops app.jar

# Switch to non-root user
USER smartops

# Expose port (Spring Boot default is 8080)
EXPOSE 8080

# Health check (similar to your Node.js health check)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/api/actuator/health || exit 1

# Environment variables with defaults
ENV JAVA_OPTS="-Xmx512m -Xms256m" \
    SPRING_PROFILES_ACTIVE=development

# Start the application
# Similar to: CMD ["node", "src/index.js"] in Node.js
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]

# Labels for metadata (good Docker practice)
LABEL maintainer="SmartOps Team" \
      service="data-processor" \
      version="1.0.0" \
      description="Java Spring Boot microservice for data processing and analytics"
