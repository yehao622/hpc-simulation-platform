package com.smartops.dataprocessor;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@SpringBootApplication
@RestController
public class DataProcessorApplication {

    public static void main(String[] args) {
        SpringApplication.run(DataProcessorApplication.class, args);
        System.out.println("");
        System.out.println("🚀 SmartOps Data Processor Started Successfully!");
        System.out.println("📊 Health endpoint: http://localhost:8080/health");
        System.out.println("🧪 Test endpoint: http://localhost:8080/test");
        System.out.println("💚 Actuator health: http://localhost:8080/actuator/health");
        System.out.println("🎉 Session 6 Java integration complete!");
        System.out.println("");
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("service", "smartops-data-processor");
        response.put("timestamp", LocalDateTime.now().toString());
        response.put("message", "🎉 Java Spring Boot integration successful!");
        response.put("version", "1.0.0");
        return response;
    }

    @GetMapping("/test")
    public Map<String, Object> test() {
        Map<String, Object> response = new HashMap<>();
        response.put("message", "Hello from Java Spring Boot microservice!");
        response.put("framework", "Spring Boot 3.1.5");
        response.put("java", System.getProperty("java.version"));
        response.put("timestamp", LocalDateTime.now().toString());
        response.put("session", "Session 6 - Java integration complete! 🎉");
        return response;
    }

    @GetMapping("/analytics/summary")
    public Map<String, Object> analyticsSummary() {
        Map<String, Object> response = new HashMap<>();
        response.put("totalJobs", 42);
        response.put("successRate", 95.5);
        response.put("systemHealth", 98.0);
        response.put("timestamp", LocalDateTime.now().toString());
        response.put("message", "Mock analytics - Java service working!");
        return response;
    }
}
