// Mock ESP32 WebSocket Server for Development
// Run with: node src/mining/mock-esp32-server.js

const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.ESP32_PORT || 8080;

// Vehicle state
let vehicleState = {
  pose: { x: 0, y: 0, theta: 0, frame: 'map' },
  velocity: { linear: 0, angular: 0 },
  battery: { voltage: 24.5, percentage: 85, current: 2.5 },
  gnss_status: 'fix',
  imu: {
    accel: { x: 0, y: 0, z: 9.81 },
    gyro: { x: 0, y: 0, z: 0 },
    orientation: { x: 0, y: 0, z: 0 }
  },
  health: {
    temperatures: {
      motor_left: 45.2,
      motor_right: 46.1,
      controller: 38.5,
      battery: 32.0
    },
    link_quality: 95,
    error_codes: [],
    warnings: []
  }
};

// Command execution state
let currentCommand = null;
let commandStartTime = null;

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ESP32 Mock Server Running\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/esp32' });

console.log(`Mock ESP32 WebSocket server starting on port ${PORT}...`);

wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Send initial telemetry
  sendTelemetry(ws);
  
  // Start telemetry updates
  const telemetryInterval = setInterval(() => {
    updateVehicleState();
    sendTelemetry(ws);
  }, 100); // 10Hz updates
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received command:', data);
      
      if (data.type === 'heartbeat') {
        // Echo heartbeat
        ws.send(JSON.stringify({
          type: 'heartbeat',
          timestamp: Date.now()
        }));
        return;
      }
      
      // Process command
      const response = processCommand(data);
      
      // Send response
      ws.send(JSON.stringify(response));
      
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({
        ok: false,
        error: error.message
      }));
    }
  });
  
  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(telemetryInterval);
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

function sendTelemetry(ws) {
  const telemetry = {
    type: 'telemetry',
    data: {
      ...vehicleState,
      timestamp: Date.now()
    }
  };
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(telemetry));
  }
}

function processCommand(command) {
  const response = {
    id: command.id,
    ok: true,
    timestamp: Date.now()
  };
  
  switch (command.type) {
    case 'drive':
      currentCommand = command;
      commandStartTime = Date.now();
      vehicleState.velocity.linear = command.linear_mps;
      vehicleState.velocity.angular = command.angular_rps;
      console.log(`Driving: linear=${command.linear_mps} m/s, angular=${command.angular_rps} rad/s`);
      break;
      
    case 'waypoint':
      currentCommand = command;
      commandStartTime = Date.now();
      console.log(`Navigating to waypoint: (${command.x}, ${command.y})`);
      // Start simulated movement towards waypoint
      break;
      
    case 'stop':
      currentCommand = null;
      vehicleState.velocity.linear = 0;
      vehicleState.velocity.angular = 0;
      console.log(`Stopped: ${command.reason}`);
      
      if (command.emergency) {
        vehicleState.health.error_codes.push('E_STOP_ACTIVE');
      }
      break;
      
    case 'io':
      console.log(`IO command: pin=${command.pin}, state=${command.state}`);
      break;
      
    case 'query':
      response.data = { ...vehicleState, timestamp: Date.now() };
      break;
      
    default:
      response.ok = false;
      response.error = `Unknown command type: ${command.type}`;
  }
  
  return response;
}

function updateVehicleState() {
  // Update position based on velocity
  if (vehicleState.velocity.linear !== 0 || vehicleState.velocity.angular !== 0) {
    const dt = 0.1; // 100ms update interval
    
    // Update heading
    vehicleState.pose.theta += vehicleState.velocity.angular * dt;
    
    // Keep theta in [-π, π]
    while (vehicleState.pose.theta > Math.PI) vehicleState.pose.theta -= 2 * Math.PI;
    while (vehicleState.pose.theta < -Math.PI) vehicleState.pose.theta += 2 * Math.PI;
    
    // Update position
    vehicleState.pose.x += vehicleState.velocity.linear * Math.cos(vehicleState.pose.theta) * dt;
    vehicleState.pose.y += vehicleState.velocity.linear * Math.sin(vehicleState.pose.theta) * dt;
    
    // Simulate battery drain
    const powerDraw = Math.abs(vehicleState.velocity.linear) * 0.5 + Math.abs(vehicleState.velocity.angular) * 0.3;
    vehicleState.battery.current = 2.5 + powerDraw;
    vehicleState.battery.percentage = Math.max(0, vehicleState.battery.percentage - powerDraw * dt * 0.01);
    
    // Update temperatures
    vehicleState.health.temperatures.motor_left += powerDraw * 0.1;
    vehicleState.health.temperatures.motor_right += powerDraw * 0.1;
  } else {
    // Cool down when stopped
    vehicleState.health.temperatures.motor_left = Math.max(35, vehicleState.health.temperatures.motor_left - 0.1);
    vehicleState.health.temperatures.motor_right = Math.max(35, vehicleState.health.temperatures.motor_right - 0.1);
    vehicleState.battery.current = 2.5;
  }
  
  // Handle waypoint navigation
  if (currentCommand && currentCommand.type === 'waypoint') {
    const dx = currentCommand.x - vehicleState.pose.x;
    const dy = currentCommand.y - vehicleState.pose.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < (currentCommand.tolerance_m || 1.0)) {
      // Reached waypoint
      console.log('Waypoint reached!');
      vehicleState.velocity.linear = 0;
      vehicleState.velocity.angular = 0;
      currentCommand = null;
    } else {
      // Move towards waypoint
      const targetHeading = Math.atan2(dy, dx);
      let headingError = targetHeading - vehicleState.pose.theta;
      
      // Normalize heading error
      while (headingError > Math.PI) headingError -= 2 * Math.PI;
      while (headingError < -Math.PI) headingError += 2 * Math.PI;
      
      // Simple proportional control
      vehicleState.velocity.angular = Math.max(-1, Math.min(1, headingError * 2));
      vehicleState.velocity.linear = Math.abs(headingError) < 0.2 ? Math.min(currentCommand.v_max || 2, distance / 2) : 0.5;
    }
  }
  
  // Handle drive command timeout
  if (currentCommand && currentCommand.type === 'drive' && currentCommand.duration_s) {
    const elapsed = (Date.now() - commandStartTime) / 1000;
    if (elapsed >= currentCommand.duration_s) {
      vehicleState.velocity.linear = 0;
      vehicleState.velocity.angular = 0;
      currentCommand = null;
    }
  }
  
  // Simulate link quality variation
  vehicleState.health.link_quality = 90 + Math.random() * 10;
  
  // Simulate GNSS status changes
  if (Math.random() < 0.01) {
    const statuses = ['fix', 'float', 'dgps'];
    vehicleState.gnss_status = statuses[Math.floor(Math.random() * statuses.length)];
  }
}

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Start server
server.listen(PORT, () => {
  console.log(`Mock ESP32 server running on http://localhost:${PORT}`);
  console.log(`WebSocket endpoint: ws://localhost:${PORT}/esp32`);
  console.log('\nPress Ctrl+C to stop the server');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  wss.clients.forEach((ws) => {
    ws.close();
  });
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});