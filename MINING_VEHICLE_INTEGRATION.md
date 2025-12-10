# Mining Vehicle Gemini AI Integration

This document describes the integration of Google's Gemini AI with an autonomous mining vehicle control system, featuring real-time YOLO object detection and natural language command processing.

## Overview

The system combines:
- **Gemini AI** for natural language understanding and decision making
- **YOLO Object Detection** for real-time perception
- **ESP32-based Vehicle Control** for hardware interface
- **WebSocket Communication** for real-time control

## Architecture

### Components

1. **GeminiMiningController** (`src/mining/services/gemini-mining-controller.ts`)
   - Bridges Gemini AI with vehicle control system
   - Processes natural language commands
   - Analyzes scenes and makes navigation decisions

2. **YOLOPerceptionService** (`src/mining/services/yolo-perception-service.ts`)
   - Real-time object detection using YOLO
   - Identifies hazards: people, trucks, equipment, obstacles
   - Converts detections to world coordinates

3. **MiningVehicleClient** (`src/mining/mining-vehicle-client.ts`)
   - Main orchestrator for vehicle operations
   - Integrates perception, planning, and control
   - Manages safety and emergency stops

4. **ESP32Controller** (`src/mining/services/esp32-controller.ts`)
   - WebSocket interface to ESP32 hardware
   - Sends motor commands and receives telemetry
   - Real-time bidirectional communication

## Features

### AI-Powered Voice Commands

Speak naturally to control the vehicle:

```
"Go to the loading bay"
"Patrol the south perimeter"
"Stop immediately"
"What do you see ahead?"
"Navigate to crusher station at 3 meters per second"
```

### Real-Time Object Detection

- **YOLO Integration**: Detects people, vehicles, equipment in real-time
- **Safety Zones**: Automatic speed reduction near people
- **Hazard Detection**: Identifies and avoids obstacles

### Intelligent Planning

- **Path Planning**: A* algorithm with obstacle avoidance
- **Dynamic Replanning**: Adjusts route when obstacles detected
- **Safety Validation**: All commands validated against safety rules

## Setup

### Prerequisites

1. **Hardware**:
   - ESP32 with motor controllers
   - Camera for perception (USB/IP camera)
   - GPS module (optional)

2. **Software**:
   ```bash
   npm install
   npm install @tensorflow/tfjs  # For YOLO
   ```

3. **Environment Variables**:
   ```bash
   REACT_APP_GEMINI_API_KEY=your_gemini_api_key
   REACT_APP_ESP32_WS_URL=ws://192.168.4.1:81  # Your ESP32 WebSocket URL
   ```

### ESP32 Configuration

Upload the firmware from `src/mining/hardware/esp32_mining_vehicle.ino` to your ESP32.

Default pins:
- Motor A: PWM=12, DIR1=14, DIR2=27
- Motor B: PWM=13, DIR1=25, DIR2=26
- E-Stop: Pin 23

### Running the System

1. **Start the ESP32** with the mining vehicle firmware
2. **Run the web interface**:
   ```bash
   npm start
   ```
3. **Enable Mining Mode** by clicking the mining mode toggle
4. **Connect to Gemini** and start speaking commands

## Voice Command Examples

### Navigation
- "Navigate to loading bay alpha"
- "Go to coordinates 100, 50"
- "Drive to the maintenance area slowly"

### Patrol
- "Patrol the perimeter"
- "Start patrolling the loading bay area"

### Inspection
- "Inspect the area ahead"
- "Check for obstacles"

### Safety
- "Emergency stop"
- "Stop immediately"
- "Resume operation" (requires authorization)

### Status
- "What's your current status?"
- "Where are you?"
- "Battery level?"

## Safety Features

### Multi-Level Safety System

1. **Perception Layer**
   - YOLO detects people, vehicles, obstacles
   - Maintains safety bubble around vehicle
   - Real-time hazard classification

2. **Planning Layer**
   - Validates all paths for safety
   - Enforces speed limits based on conditions
   - Geofence support

3. **Control Layer**
   - Hardware e-stop button
   - Automatic stop on lost communication
   - Speed limiting near hazards

### Safety Rules

- **Person Detection**: Stop if person within 8m
- **Vehicle Detection**: Slow down if vehicle within 15m
- **Max Speed**: 5 m/s normal, 2 m/s in caution zones
- **E-Stop**: Multiple triggers (hardware, software, remote)

## System Messages

The system provides real-time feedback:
- Navigation status and progress
- Hazard detections and safety alerts
- System health and connectivity
- Task completion reports

## Extending the System

### Adding New Locations

Edit `src/mining/services/gemini-mining-controller.ts`:

```typescript
const locations: { [key: string]: Waypoint } = {
  'loading bay': { x: 100, y: 50, frame: 'map' },
  'your new location': { x: 200, y: 100, frame: 'map' },
  // Add more...
};
```

### Custom YOLO Model

To use a custom-trained YOLO model for mining-specific objects:

1. Train your model on mining equipment dataset
2. Update `YOLO_CONFIG.modelUrl` in `yolo-perception-service.ts`
3. Map class IDs to mining-specific objects

### Adding New Commands

Extend `parseAndExecuteGeminiResponse` in `gemini-mining-controller.ts`:

```typescript
const commandPatterns = {
  navigate: /(?:go to|navigate to|move to|drive to)\s+(.+)/i,
  yourCommand: /your pattern here/i,
  // Add more...
};
```

## Troubleshooting

### Connection Issues
- Check ESP32 IP address and WebSocket URL
- Verify WiFi connection
- Check firewall settings

### Perception Issues
- Ensure adequate lighting for camera
- Check camera connection and permissions
- Verify YOLO model is loaded

### Command Recognition
- Speak clearly and use known location names
- Check Gemini API quota
- Verify microphone permissions

## API Integration

The system exposes vehicle state and control through React hooks:

```typescript
const {
  vehicleState,
  sendVoiceCommand,
  emergencyStop,
  manualControl
} = useMiningVehicle();

// Send voice command
await sendVoiceCommand("Go to loading bay");

// Emergency stop
await emergencyStop("User triggered");

// Manual control (linear, angular velocity)
await manualControl(1.0, 0.0); // Forward at 1 m/s
```

## Performance

- **Perception**: 10 FPS object detection
- **Control Loop**: 10 Hz update rate
- **Latency**: <100ms command to action
- **Range**: Depends on WiFi/radio link

## Safety Disclaimer

This system is designed for controlled environments. Always:
- Test thoroughly before deployment
- Maintain line-of-sight during operation
- Have physical e-stop accessible
- Follow local regulations for autonomous vehicles
- Never operate near people without safety protocols

## Future Enhancements

- [ ] Multi-vehicle coordination
- [ ] 3D mapping and SLAM
- [ ] Predictive maintenance alerts
- [ ] Cloud-based fleet management
- [ ] Advanced path optimization
- [ ] Weather adaptation