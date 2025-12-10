# ESP32-CAM Motor Test - Quick Start Guide

## Current Status
✅ ESP32-CAM sketch uploaded (motors only, no camera)
❌ WiFi connection failing to MLUNGISI hotspot

## Troubleshooting WiFi Connection

### Option 1: Verify Hotspot Settings
Make sure on your phone/router:
- Network Name: **MLUNGISI**
- Password: **12345678**  
- 2.4GHz band enabled (ESP32-CAM doesn't support 5GHz)
- MAC filtering disabled

### Option 2: Check Serial Monitor
```bash
arduino-cli monitor -p /dev/cu.wchusbserial210 -c baudrate=115200
```

After opening serial monitor:
1. Press RESET button on ESP32-CAM
2. Watch for boot messages
3. Look for WiFi connection status

You should see:
```
=== ESP32-CAM Motor Test - AI Control ===
Motors initialized
Connecting to WiFi..................
WiFi Connected!
IP: 192.168.43.XXX
AI Control: ws://192.168.43.XXX:8080
```

### Option 3: Test Motors WITHOUT WiFi
If WiFi keeps failing, we can test motors directly via USB serial commands instead of WiFi.

## Once WiFi Connects

After you see the IP address (e.g., `192.168.43.100`), connect your computer to the same WiFi hotspot and test:

```bash
# Install wscat
npm install -g wscat

# Connect (replace IP with actual)
wscat -c ws://192.168.43.100:8080

# Send commands:
{"type":"drive","linear_mps":0.5,"angular_rps":0}  # Forward
{"type":"stop"}                                     # Stop
{"type":"drive","linear_mps":0,"angular_rps":0.5}  # Turn left
```

## Next: Connect AI Service

Once motors work via WebSocket, start the AI:
```bash
REACT_APP_ESP32_WS_URL=ws://192.168.43.XXX:8080 npm start
```

Then open http://localhost:3000 and talk to the rover!
