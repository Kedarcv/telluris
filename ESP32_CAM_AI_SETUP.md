# ESP32-CAM AI Rover Setup Guide

## Quick Start

### 1. Connect to ESP32-CAM WiFi
- **Network Name**: `MyWiFiCar`
- **Password**: `12345678`
- **ESP32-CAM IP**: `192.168.4.1`

### 2. Access Rover Controls
- **Manual Web UI**: http://192.168.4.1
- **AI WebSocket**: ws://192.168.4.1:8080
- **Camera Feed**: http://192.168.4.1/Camera (via WebSocket)

### 3. Start the AI Web Console

```bash
cd /Users/mnkomo/live-api-web-console
REACT_APP_ESP32_WS_URL=ws://192.168.4.1:8080 npm start
```

OR create a `.env` file:
```bash
echo "REACT_APP_ESP32_WS_URL=ws://192.168.4.1:8080" > .env.local
npm start
```

### 4. Test AI Connection

Open browser to `http://localhost:3000` and the AI should connect to the rover.

You can test commands manually with:
```bash
# Install wscat if needed
npm install -g wscat

# Connect to rover (after joining MyWiFiCar WiFi)
wscat -c ws://192.168.4.1:8080

# Send test commands
{"type":"drive","linear_mps":0.3,"angular_rps":0}
{"type":"stop"}
```

### 5. Using the Gemini AI Control

Once connected, you can:
- **Talk to Gemini**: "Move forward", "Turn left", "Go to the kitchen"
- **View camera**: Camera feed updates every 1 second
- **Manual override**: Use web UI at http://192.168.4.1 anytime

## Architecture

```
[Your Computer] --WiFi--> [ESP32-CAM "MyWiFiCar"]
                              |
                              +-- Port 80: Manual Web UI
                              +-- Port 8080: AI WebSocket
                              +-- Camera streaming
                              +-- Motor Control (L298N)
```

## Troubleshooting

**Can't connect to rover:**
- Make sure you're connected to "MyWiFiCar" WiFi network
- Check ESP32-CAM has power (motors need external power supply)
- Serial monitor should show: "AI WebSocket started on port 8080"

**Motors don't move:**
- Check L298N wiring matches pin configuration
- Verify external power supply to L298N (motors need more than USB power)
- Check Serial monitor for motor commands

**Camera not working:**
- Open http://192.168.4.1 to test camera directly
- Camera refreshes every 1 second (not real-time streaming)
