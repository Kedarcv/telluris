# Autonomous Mining Vehicle Control System

## Overview

The Autonomous Mining Vehicle Control System provides conversational AI-driven control for mining vehicles operating in hazardous, GPS-challenged environments. The system integrates real-time perception, safety management, navigation planning, and ESP32-based motor control.

## System Architecture

### Core Components

1. **Mining Vehicle Client** (`mining-vehicle-client.ts`)
   - Main orchestration class
   - Manages all subsystems
   - Handles operator messages and plan execution
   - Maintains system state

2. **ESP32 Controller** (`services/esp32-controller.ts`)
   - WebSocket communication with ESP32 motor controller
   - Command queue management
   - Telemetry reception
   - Automatic reconnection

3. **Perception Service** (`services/perception-service.ts`)
   - Object detection and tracking
   - Hazard identification
   - World model maintenance
   - Video frame processing

4. **Safety Manager** (`services/safety-manager.ts`)
   - Enforces safety policies
   - Monitors clearance requirements
   - Manages emergency stops
   - Risk level assessment

5. **Navigation Planner** (`services/navigation-planner.ts`)
   - Path planning and validation
   - Waypoint following
   - Obstacle avoidance
   - Plan execution monitoring

## Quick Start

### 1. Configure Environment

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Key configurations:
- `REACT_APP_GEMINI_API_KEY`: Your Gemini API key
- `REACT_APP_ESP32_WS_URL`: ESP32 WebSocket URL (default: ws://localhost:8080/esp32)
- `REACT_APP_CLAUDE_API_KEY`: Optional Claude API key for advanced reasoning

### 2. Start Development Environment

Run both the React app and mock ESP32 server:

```bash
npm run dev
```

Or run separately:

```bash
# Terminal 1 - React App
npm start

# Terminal 2 - Mock ESP32 Server
npm run mock-esp32
```

### 3. Access the Application

1. Open http://localhost:3000
2. Click the "⛏️ Mining Mode" button to switch to mining control
3. Grant camera permissions when prompted

## Using the System

### Basic Commands

The system accepts natural language commands:

- **Navigation**: "Go to loading bay alpha at 2 m/s"
- **Patrol**: "Patrol the south berm loop"
- **Stop**: "Stop immediately"
- **Inspection**: "Inspect the area ahead"

### Command Parameters

When sending commands, you can specify:

- **Task Type**: Navigate, Patrol, Follow, Inspect, Standby, Stop
- **Speed Limit**: Maximum velocity in m/s
- **Safety Clearance**: Minimum distance from obstacles in meters
- **Confirmation**: Whether to require confirmation before execution

### Manual Control

Use the control pad for direct vehicle control:
- ↑ Forward
- ↓ Backward
- ← Turn left
- → Turn right
- STOP: Emergency stop

### Safety Features

The system includes multiple safety layers:

1. **Clearance Requirements**
   - Person: 8m default
   - Truck: 15m default
   - Equipment: 10m default
   - Rock: 3m default

2. **Risk Levels**
   - Minimal: Normal operation
   - Low: Increased awareness
   - Medium: Reduced speed
   - High: Very slow speed only
   - Critical: Emergency stop

3. **Emergency Stop**
   - Manual button always available
   - Automatic on critical risks
   - Requires authorization to clear

## ESP32 Integration

### Command Protocol

The system sends JSON commands to the ESP32:

```json
// Drive Command
{
  "type": "drive",
  "linear_mps": 2.0,
  "angular_rps": 0.5,
  "duration_s": 5.0,
  "id": "cmd_12345"
}

// Waypoint Command
{
  "type": "waypoint",
  "frame": "map",
  "x": 100.0,
  "y": 50.0,
  "tolerance_m": 1.0,
  "v_max": 2.0,
  "id": "cmd_12346"
}

// Stop Command
{
  "type": "stop",
  "reason": "Obstacle detected",
  "emergency": true,
  "id": "cmd_12347"
}
```

### Telemetry Format

The ESP32 sends telemetry updates:

```json
{
  "type": "telemetry",
  "data": {
    "pose": {
      "x": 10.5,
      "y": 20.3,
      "theta": 1.57,
      "frame": "map"
    },
    "velocity": {
      "linear": 2.0,
      "angular": 0.0
    },
    "battery": {
      "voltage": 24.5,
      "percentage": 85,
      "current": 5.2
    },
    "health": {
      "temperatures": {
        "motor_left": 45.2,
        "motor_right": 46.1
      },
      "link_quality": 95,
      "error_codes": []
    },
    "timestamp": 1699123456789
  }
}
```

## Perception Integration

The system processes video frames for object detection:

1. **Supported Classes**
   - person
   - truck
   - equipment
   - rock
   - berm
   - void

2. **Detection Format**
   ```typescript
   {
     frame_id: "frame_12345",
     class: "person",
     confidence: 0.92,
     position: { x: 15.0, y: 8.0, frame: "map" }
   }
   ```

## Safety Policy Configuration

Customize safety policies in `use-mining-vehicle.ts`:

```typescript
const SAFETY_POLICY = {
  geofences: [
    {
      id: "restricted_area_1",
      type: "exclusion",
      polygon: [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
        { x: 100, y: 200 }
      ],
      active: true
    }
  ],
  speed_limits: [
    { condition: "default", max_speed_mps: 5.0 },
    { condition: "near_person", max_speed_mps: 1.0 }
  ],
  clearance_requirements: [
    { object_class: "person", min_distance_m: 8.0, action: "stop" }
  ],
  max_risk_level: "medium"
};
```

## Development

### Mock ESP32 Server

The mock server simulates:
- Vehicle movement and physics
- Battery discharge
- Temperature changes
- GNSS status variations
- Command responses

### Adding New Features

1. **New Command Types**
   - Add to `ESP32CommandType` in `types.ts`
   - Implement in `ESP32Controller`
   - Add handler in mock server

2. **New Detection Classes**
   - Add to Detection type
   - Update perception service
   - Add clearance requirements

3. **New Safety Rules**
   - Update `SafetyPolicy` type
   - Implement in `SafetyManager`
   - Add UI controls

## Production Deployment

### Requirements

1. **Hardware**
   - ESP32 with motor controllers
   - Camera system with ML inference
   - GNSS/INS for positioning
   - Emergency stop hardware

2. **Software**
   - Replace mock services with real implementations
   - Configure actual WebSocket endpoints
   - Deploy ML models for perception
   - Implement secure authorization

### Security Considerations

- Use WSS (WebSocket Secure) for ESP32 communication
- Implement authentication for commands
- Encrypt telemetry data
- Secure emergency stop authorization
- Audit all commands and actions

## Troubleshooting

### Connection Issues
- Check ESP32 WebSocket URL in .env
- Verify network connectivity
- Check browser console for errors

### Performance Issues
- Reduce video processing frequency
- Optimize perception models
- Check WebSocket message rates

### Safety Issues
- Verify safety policy configuration
- Check sensor calibration
- Test emergency stop regularly

## API Reference

See individual service files for detailed API documentation:
- `types.ts` - All type definitions
- `mining-vehicle-client.ts` - Main client API
- Service files in `services/` - Individual component APIs

## License

Copyright 2024 - Licensed under Apache License 2.0