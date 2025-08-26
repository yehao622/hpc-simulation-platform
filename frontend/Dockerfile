# frontend/Dockerfile.lightweight
# Ultra-lightweight build without npm build step

FROM nginx:alpine

# Copy source files directly (for development)
COPY src/ /usr/share/nginx/html/src/
COPY public/ /usr/share/nginx/html/

# Create a simple index.html that loads React from CDN
RUN echo '<!DOCTYPE html> \
<html lang="en"> \
<head> \
    <meta charset="utf-8" /> \
    <meta name="viewport" content="width=device-width, initial-scale=1" /> \
    <title>SmartOps AI Agent Platform</title> \
    <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script> \
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script> \
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script> \
    <style> \
        body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; } \
        .app { min-height: 100vh; background: linear-gradient(135deg, #1a1a1a 0%, #2d3748 100%); color: white; padding: 20px; } \
        .header { text-align: center; padding: 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 15px; margin-bottom: 20px; } \
        .status { color: #4CAF50; font-weight: bold; } \
    </style> \
</head> \
<body> \
    <div id="root"></div> \
    <script type="text/babel"> \
        function App() { \
            return ( \
                <div className="app"> \
                    <div className="header"> \
                        <h1>🚀 SmartOps AI Agent Platform</h1> \
                        <p>AI-Powered HPC Monitoring & Analysis Dashboard</p> \
                        <p>System Status: <span className="status">Operational</span></p> \
                    </div> \
                    <div style={{textAlign: "center", padding: "40px"}}> \
                        <h2>✅ Frontend Service Running</h2> \
                        <p>React application loaded successfully</p> \
                        <p>Ready for Session 5 development</p> \
                    </div> \
                </div> \
            ); \
        } \
        ReactDOM.render(<App />, document.getElementById("root")); \
    </script> \
</body> \
</html>' > /usr/share/nginx/html/index.html

# Simple nginx config
RUN echo 'server { \
    listen 80; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { try_files $uri $uri/ /index.html; } \
    location /api/ { \
        proxy_pass http://api-gateway:3000/api/; \
        proxy_set_header Host $host; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
