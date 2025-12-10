// Serial to WebSocket Bridge for Arduino Uno
// This bridges the Arduino's USB serial connection to the WebSocket server
// Run with: node src/mining/arduino-serial-bridge.js

const WebSocket = require('ws');
const http = require('http');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

const PORT = process.env.ESP32_PORT || 8080;
const SERIAL_PORT = process.env.ARDUINO_PORT || '/dev/cu.wchusbserial210'; // Use cu instead of tty for macOS
const BAUD_RATE = 115200;

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Arduino Serial Bridge Running\n');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server, path: '/esp32' });

console.log(`Arduino Serial Bridge starting...`);
console.log(`WebSocket server will run on port ${PORT}`);
console.log(`Looking for Arduino on ${SERIAL_PORT}`);

// Serial port connection
let serialPort = null;
let parser = null;
let connectedClients = new Set();

// Try to connect to Arduino
function connectToArduino() {
  try {
    serialPort = new SerialPort({
      path: SERIAL_PORT,
      baudRate: BAUD_RATE
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialPort.on('open', () => {
      console.log('✓ Arduino connected on', SERIAL_PORT);
      console.log('✓ Baud rate:', BAUD_RATE);
    });

    serialPort.on('error', (err) => {
      console.error('Serial port error:', err.message);
      console.log('\nTroubleshooting:');
      console.log('1. Check that Arduino is connected via USB');
      console.log('2. Verify the correct port with: ls /dev/cu.* (macOS) or ls /dev/tty* (Linux)');
      console.log('3. Update ARDUINO_PORT environment variable or edit this file');
      console.log('4. Make sure no other program (Arduino IDE) is using the port');
    });

    serialPort.on('close', () => {
      console.error('⚠ Serial port closed unexpectedly!');
      console.log('Attempting to reconnect in 2 seconds...');
      setTimeout(() => {
        console.log('Reconnecting to Arduino...');
        connectToArduino();
      }, 2000);
    });

    // Forward data from Arduino to all WebSocket clients
    parser.on('data', (line) => {
      try {
        const data = JSON.parse(line);

        // Log telemetry at reduced rate
        if (data.type === 'telemetry') {
          // Only log every 10th telemetry message
          if (Math.random() < 0.1) {
            console.log('← Arduino telemetry:', {
              x: data.data?.pose?.x?.toFixed(2),
              y: data.data?.pose?.y?.toFixed(2),
              battery: data.data?.battery?.percentage?.toFixed(0) + '%'
            });
          }
        } else {
          console.log('← Arduino:', data);
        }

        // Broadcast to all connected WebSocket clients
        const message = JSON.stringify(data);
        connectedClients.forEach(ws => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        });
      } catch (error) {
        // Log both the error and the raw line for debugging
        console.error('JSON parse error:', error.message);
        console.log('← Arduino (raw):', line.trim());
      }
    });

  } catch (error) {
    console.error('Failed to connect to Arduino:', error.message);
    console.log('\nPlease check:');
    console.log('1. Arduino is connected via USB');
    console.log('2. Correct port is specified');
    console.log('3. Arduino sketch is uploaded and running');
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('✓ WebSocket client connected');
  connectedClients.add(ws);

  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Arduino via Serial Bridge',
    timestamp: Date.now()
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Log commands (but not heartbeats)
      if (data.type !== 'heartbeat') {
        console.log('→ Command to Arduino:', data);
      }

      // Forward to Arduino via serial
      if (serialPort && serialPort.isOpen) {
        serialPort.write(JSON.stringify(data) + '\n');
      } else {
        console.error('Cannot send command: Arduino not connected');
        ws.send(JSON.stringify({
          ok: false,
          error: 'Arduino not connected',
          id: data.id
        }));
      }

    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    connectedClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Handle server errors
server.on('error', (err) => {
  console.error('Server error:', err);
});

// Start server
server.listen(PORT, () => {
  console.log(`\n✓ WebSocket server running on http://localhost:${PORT}`);
  console.log(`✓ WebSocket endpoint: ws://localhost:${PORT}/esp32`);
  console.log('\nAttempting to connect to Arduino...\n');

  // Connect to Arduino
  connectToArduino();

  console.log('\n=== Bridge Status ===');
  console.log('Press Ctrl+C to stop the bridge\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down bridge...');

  // Close all WebSocket connections
  connectedClients.forEach(ws => {
    ws.close();
  });

  // Close serial port
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      console.log('Serial port closed');
    });
  }

  // Close server
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});

// Auto-detect Arduino port (helper function)
async function listSerialPorts() {
  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();

    console.log('\nAvailable serial ports:');
    ports.forEach(port => {
      console.log(`  ${port.path}`);
      if (port.manufacturer) {
        console.log(`    Manufacturer: ${port.manufacturer}`);
      }
    });
    console.log('');
  } catch (error) {
    console.error('Error listing ports:', error.message);
  }
}

// List ports on startup if Arduino connection fails
setTimeout(() => {
  if (!serialPort || !serialPort.isOpen) {
    console.log('\nFailed to connect to Arduino. Listing available ports:\n');
    listSerialPorts();
  }
}, 2000);
