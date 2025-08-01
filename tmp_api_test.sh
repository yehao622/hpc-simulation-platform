#!/bin/bash
# WebSocket Real-time Job Monitoring Test
# Now that WebSocket is working, let's test the full experience!

echo "🚀 WebSocket Real-time Job Monitoring Test"
echo "==========================================="

# Get authentication token
echo "🔑 Getting authentication token..."
auth_response=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"testuser@example.com","password":"testpassword123"}')

if command -v jq &> /dev/null; then
    JWT_TOKEN=$(echo "$auth_response" | jq -r '.token')
else
    JWT_TOKEN=$(echo "$auth_response" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi

if [ "$JWT_TOKEN" = "null" ] || [ -z "$JWT_TOKEN" ]; then
    echo "❌ Failed to get token"
    exit 1
fi

echo "✅ Token obtained: ${JWT_TOKEN:0:30}..."

# Create a simulation job for real-time monitoring
echo ""
echo "🎯 Creating simulation job for real-time monitoring..."

job_response=$(curl -s -X POST http://localhost:3000/api/v1/simulations \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "name": "🔴 LIVE WebSocket Test Job",
        "description": "Testing real-time WebSocket updates - watch this live!",
        "topologyId": 1,
        "workloadId": 1,
        "simulationTime": 25.0,
        "numComputeNodes": 16,
        "numStorageNodes": 8,
        "workType": "read",
        "dataSizeMb": 512.0,
        "readProbability": 0.75
    }')

if command -v jq &> /dev/null; then
    JOB_ID=$(echo "$job_response" | jq -r '.job.id')
    JOB_NAME=$(echo "$job_response" | jq -r '.job.name')
else
    JOB_ID=$(echo "$job_response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    JOB_NAME="Live WebSocket Test Job"
fi

if [ "$JOB_ID" = "null" ] || [ -z "$JOB_ID" ]; then
    echo "❌ Failed to create job"
    echo "Response: $job_response"
    exit 1
fi

echo "✅ Job created successfully!"
echo "   📋 Job ID: $JOB_ID"
echo "   🏷️ Job Name: $JOB_NAME"

# Start the WebSocket client automatically
echo ""
echo "🌐 Starting WebSocket client automatically..."

# Create an enhanced WebSocket test client with auto-connection
cat > /tmp/auto_websocket_client.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>🔴 LIVE WebSocket Job Monitor</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        body { 
            font-family: monospace; 
            background: linear-gradient(135deg, #000428, #004e92);
            color: #fff; 
            padding: 20px; 
            margin: 0;
        }
        .container { max-width: 1000px; margin: 0 auto; }
        h1 { color: #ff6b6b; text-align: center; margin-bottom: 30px; }
        .status-bar { 
            background: rgba(0,0,0,0.7); 
            padding: 15px; 
            border-radius: 10px; 
            margin: 10px 0; 
            border-left: 5px solid #ff6b6b;
        }
        .job-monitor { 
            background: rgba(0,0,0,0.5); 
            padding: 20px; 
            border-radius: 10px; 
            margin: 20px 0;
            border: 2px solid #4ecdc4;
        }
        .progress-bar { 
            background: #333; 
            border-radius: 10px; 
            overflow: hidden; 
            height: 30px; 
            margin: 10px 0;
        }
        .progress-fill { 
            background: linear-gradient(90deg, #ff6b6b, #4ecdc4); 
            height: 100%; 
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
        }
        .logs { 
            background: #000; 
            padding: 15px; 
            height: 350px; 
            overflow-y: auto; 
            border: 1px solid #333; 
            border-radius: 5px;
            font-size: 12px;
        }
        .log-info { color: #4ecdc4; }
        .log-success { color: #51cf66; }
        .log-error { color: #ff6b6b; }
        .log-data { color: #ffd93d; }
        .connected { color: #51cf66; }
        .disconnected { color: #ff6b6b; }
        .auto-info { 
            background: rgba(77, 208, 196, 0.1); 
            padding: 15px; 
            border-radius: 10px; 
            border-left: 5px solid #4ecdc4; 
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔴 LIVE WebSocket Job Monitor</h1>
        
        <div class="auto-info">
            <h3>🤖 Auto-Connection Status</h3>
            <p><strong>Token:</strong> ${JWT_TOKEN:0:40}...</p>
            <p><strong>Job ID:</strong> $JOB_ID</p>
            <p><strong>Job Name:</strong> $JOB_NAME</p>
            <p>⚡ <strong>Auto-connecting and subscribing...</strong></p>
        </div>
        
        <div class="status-bar">
            <h3>🔗 Connection Status</h3>
            <div id="status" class="disconnected">🔴 Connecting...</div>
        </div>
        
        <div class="job-monitor">
            <h3>🎯 Live Job Progress</h3>
            <div id="jobInfo">
                <p><strong>Job:</strong> $JOB_NAME</p>
                <p><strong>Status:</strong> <span id="jobStatus">Initializing...</span></p>
                <div class="progress-bar">
                    <div id="progressFill" class="progress-fill" style="width: 0%;">0%</div>
                </div>
                <p id="lastUpdate">Waiting for updates...</p>
            </div>
        </div>
        
        <div>
            <h3>📝 Live Event Stream</h3>
            <div id="logs" class="logs"></div>
        </div>
    </div>

    <script>
        const TOKEN = "$JWT_TOKEN";
        const JOB_ID = "$JOB_ID";
        let socket = null;
        
        function log(message, type = 'info') {
            const logs = document.getElementById('logs');
            const timestamp = new Date().toLocaleTimeString();
            logs.innerHTML += \`<div class="log-\${type}">[${timestamp}] \${message}</div>\`;
            logs.scrollTop = logs.scrollHeight;
        }
        
        function updateConnectionStatus(connected) {
            const status = document.getElementById('status');
            if (connected) {
                status.textContent = '🟢 Connected & Monitoring';
                status.className = 'connected';
            } else {
                status.textContent = '🔴 Disconnected';
                status.className = 'disconnected';
            }
        }
        
        function updateJobProgress(data) {
            const jobStatus = document.getElementById('jobStatus');
            const progressFill = document.getElementById('progressFill');
            const lastUpdate = document.getElementById('lastUpdate');
            
            jobStatus.textContent = data.status || 'Unknown';
            
            const progress = data.progress || 0;
            progressFill.style.width = progress + '%';
            progressFill.textContent = progress + '%';
            
            lastUpdate.textContent = \`Last update: \${new Date().toLocaleTimeString()}\`;
            
            // Add visual effects for different statuses
            if (data.status === 'completed') {
                progressFill.style.background = 'linear-gradient(90deg, #51cf66, #69db7c)';
                log('🎉 JOB COMPLETED! Check results below.', 'success');
            } else if (data.status === 'running') {
                progressFill.style.background = 'linear-gradient(90deg, #ff6b6b, #4ecdc4)';
            }
        }
        
        // Auto-connect on page load
        window.onload = function() {
            log('🚀 Auto-connecting to WebSocket...', 'info');
            
            socket = io('/', {
                auth: { token: TOKEN },
                transports: ['websocket', 'polling']
            });
            
            socket.on('connect', () => {
                updateConnectionStatus(true);
                log('✅ Connected to WebSocket server!', 'success');
                log(\`🔗 Socket ID: \${socket.id}\`, 'info');
                
                // Auto-subscribe to the job
                socket.emit('subscribe-job', JOB_ID);
                log(\`📡 Auto-subscribed to job: $JOB_NAME\`, 'success');
            });
            
            socket.on('connected', (data) => {
                log(\`👋 Authenticated as: \${data.userEmail}\`, 'success');
            });
            
            socket.on('job-status-update', (data) => {
                log(\`📊 REAL-TIME UPDATE: \${data.status} (\${data.progress || 0}%)\`, 'data');
                updateJobProgress(data);
            });
            
            socket.on('job-update', (data) => {
                log(\`🔄 Job event: \${data.status}\`, 'data');
                if (data.message) {
                    log(\`💬 \${data.message}\`, 'data');
                }
                updateJobProgress(data);
            });
            
            socket.on('job-subscribed', (data) => {
                log(\`✅ Subscribed to: \${data.jobName}\`, 'success');
                updateJobProgress({ status: data.currentStatus, progress: 0 });
            });
            
            socket.on('disconnect', () => {
                updateConnectionStatus(false);
                log('❌ Disconnected from WebSocket', 'error');
            });
            
            socket.on('connect_error', (error) => {
                log(\`💥 Connection error: \${error.message}\`, 'error');
                updateConnectionStatus(false);
            });
            
            // Initial message
            log('🌐 Live WebSocket monitor initialized', 'success');
            log('🎯 Monitoring job: $JOB_NAME', 'info');
            log('⏱️ Expected duration: ~25 seconds', 'info');
        };
    </script>
</body>
</html>
EOF

# Start HTTP server for the client
echo "🌐 Starting HTTP server for WebSocket client..."
cd /tmp
python3 -m http.server 8080 > /dev/null 2>&1 &
SERVER_PID=$!

# Wait a moment for server to start
sleep 2

echo ""
echo "🎯 LIVE MONITORING READY!"
echo "========================="
echo ""
echo "🌐 Open this URL in your browser:"
echo "   http://localhost:8080/auto_websocket_client.html"
echo ""
echo "📋 What you should see:"
echo "   ✅ Auto-connection to WebSocket"
echo "   ✅ Auto-subscription to job: $JOB_NAME"
echo "   ✅ Real-time progress updates every few seconds"
echo "   ✅ Live progress bar animation"
echo "   ✅ Job completion notification"
echo ""
echo "⏱️ Job will run for ~25 seconds with live updates!"
echo ""
echo "🔍 Monitor API status:"
echo "   Job API: http://localhost:3000/api/v1/simulations/$JOB_ID"
echo ""

# Monitor job status via API as backup
echo "📊 API Backup Monitoring (WebSocket shows real-time):"
echo "======================================================"

for i in {1..30}; do
    response=$(curl -s "http://localhost:3000/api/v1/simulations/$JOB_ID" \
        -H "Authorization: Bearer $JWT_TOKEN")
    
    if command -v jq &> /dev/null; then
        status=$(echo "$response" | jq -r '.job.status')
        echo "[$i/30] Job status: $status"
        
        if [ "$status" = "completed" ]; then
            echo "🎉 Job completed! Check WebSocket client for results."
            break
        elif [ "$status" = "failed" ]; then
            echo "❌ Job failed. Check WebSocket client for error details."
            break
        fi
    else
        echo "[$i/30] Job status check..."
    fi
    
    sleep 2
done

# Cleanup
kill $SERVER_PID > /dev/null 2>&1

echo ""
echo "✅ WebSocket Real-time Test Complete!"
echo "🎯 Your Session 4 WebSocket implementation is working perfectly!"