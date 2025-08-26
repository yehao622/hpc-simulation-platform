# SmartOps Data Processor (Java Spring Boot)

## Overview
Java Spring Boot microservice for advanced data processing and analytics.

## Features
- 📊 **Analytics Engine**: Process simulation data and generate insights
- 🚀 **High Performance**: Optimized Java processing with caching
- 📈 **Metrics Export**: Prometheus metrics integration
- 🔍 **Health Monitoring**: Comprehensive health checks
- 🗄️ **Database Integration**: JPA/Hibernate with PostgreSQL
- ⚡ **Redis Caching**: Performance optimization

## API Endpoints
- `GET /api/analytics/dashboard` - Dashboard summary
- `GET /api/analytics/performance` - Job performance analytics
- `GET /api/analytics/jobs/{id}` - Job detail analytics
- `GET /api/analytics/health` - System health metrics
- `GET /api/actuator/health` - Service health check
- `GET /api/actuator/prometheus` - Prometheus metrics

## Development

### Prerequisites
- Java 17+
- Maven 3.6+
- Docker

### Build & Run
```bash
# Build
mvn clean package

# Run
java -jar target/data-processor-1.0.0.jar

# Or with Docker
docker build -t data-processor .
docker run -p 8080:8080 data-processor
```

### Testing
```bash
mvn test
curl http://localhost:8080/api/actuator/health
```
