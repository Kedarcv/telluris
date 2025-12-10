# Enhanced Mining Vision System

🎯 **AI-Powered Obstacle Avoidance & Path Planning for Mining Vehicles**

This enhanced mining vision system provides real-time obstacle detection, intelligent path planning, and automated navigation for mining vehicles using computer vision and AI.

## 🚀 Key Features

### ⚡ High-Performance Vision Processing
- **Faster Inference**: Optimized YOLO detection with 20+ FPS
- **Reduced Latency**: Minimal frame buffering and processing delays
- **Real-time Processing**: Every frame analyzed for obstacles

### 🧭 Intelligent Navigation
- **AI Path Planning**: Gemini-powered decision making
- **Obstacle Avoidance**: Smart maneuvering around detected objects
- **Return to Path**: Automatic return to original route after avoidance
- **Emergency Protocols**: Immediate stop for human detection

### 🎮 Enhanced Control System
- **Advanced Motor Control**: Differential drive simulation
- **Navigation States**: Multiple movement patterns (forward, avoid left/right, return to path)
- **Real-time Feedback**: Continuous vehicle state monitoring
- **WebSocket Integration**: Real-time communication with ESP32

### 🛡️ Safety Features
- **Critical Obstacle Detection**: Immediate emergency stop for humans
- **Risk Assessment**: Multi-level risk evaluation (LOW/MEDIUM/HIGH/CRITICAL)
- **Audio Alerts**: Voice feedback for navigation status
- **Visual Indicators**: On-screen navigation state display

## 📁 System Components

```
enhanced_mining_vision/
├── optimized_live_api_vision.py       # Main vision system with AI path planning
├── enhanced_esp32_controller.py       # Advanced ESP32 communication
├── mock_esp32.py                      # Enhanced mock ESP32 server
├── launch_enhanced_mining_vision.py   # System launcher with options
├── setup_enhanced_vision.py           # Automated setup script
└── ENHANCED_README.md                 # This file
```

## 🔧 Installation & Setup

### Automated Setup (Recommended)
```bash
cd /Users/mnkomo/live-api-web-console/src/mining/vision
python3 setup_enhanced_vision.py
```

### Manual Setup
```bash
# Install dependencies
pip install opencv-python ultralytics numpy websockets google-generativeai pyttsx3

# Set Gemini API key (optional but recommended)
export GEMINI_API_KEY="your-api-key-here"
```

## 🚀 Running the System

### Basic Usage
```bash
python3 launch_enhanced_mining_vision.py
```

### With Mock ESP32 (Testing)
```bash
python3 launch_enhanced_mining_vision.py --mock-esp32
```

### With Custom API Key
```bash
python3 launch_enhanced_mining_vision.py --gemini-key "your-api-key"
```

### All Options
```bash
python3 launch_enhanced_mining_vision.py --help
```

## 🎮 Navigation Commands

The system generates intelligent navigation commands based on detected obstacles:

### Navigation States
- **NORMAL_FORWARD**: Clear path, proceeding normally
- **OBSTACLE_AVOID_LEFT**: Maneuvering left around obstacles
- **OBSTACLE_AVOID_RIGHT**: Maneuvering right around obstacles
- **RETURNING_TO_PATH**: Returning to original route after avoidance
- **EMERGENCY_STOP**: Critical obstacle detected (humans)
- **SLOW_APPROACH**: Cautious approach to uncertain obstacles

### ESP32 Commands
Commands sent to ESP32 include:
```json
{
  "command": "OBSTACLE_AVOID_LEFT",
  "speed": 0.6,
  "direction": -30.0,
  "duration": 2.0,
  "motor_control": {
    "left_motor_speed": 75,
    "right_motor_speed": 150,
    "left_motor_direction": "FORWARD",
    "right_motor_direction": "FORWARD"
  }
}
```

## 🧠 AI Decision Making

### Local Intelligence
- **Fast Obstacle Classification**: Immediate risk assessment
- **Path Planning**: Local navigation decisions
- **Emergency Detection**: Instant human detection response

### Gemini AI Integration
- **Complex Scenarios**: Multi-obstacle navigation strategies
- **Context Awareness**: Scene understanding and decision optimization
- **Learning Patterns**: Adaptive behavior based on environment

### Decision Flow
1. **Object Detection** → YOLO identifies obstacles
2. **Risk Assessment** → Local classification of threat levels
3. **Path Planning** → Generate navigation strategy
4. **AI Validation** → Gemini reviews complex scenarios
5. **Command Execution** → Send optimized commands to vehicle

## 📊 Performance Metrics

### Speed Optimizations
- **Target FPS**: 20+ (vs 15 in basic version)
- **Frame Processing**: Every frame analyzed (vs frame skipping)
- **Inference Time**: <30ms per frame
- **Command Latency**: <100ms from detection to action

### Detection Accuracy
- **Confidence Threshold**: 0.5 (balanced accuracy/speed)
- **Object Tracking**: Persistent obstacle memory
- **False Positive Reduction**: Multi-frame validation

## 🎥 Visual Interface

### On-Screen Display
- **Real-time FPS**: Performance monitoring
- **Detection Count**: Number of objects/obstacles detected
- **Navigation State**: Current movement strategy
- **Direction Indicator**: Visual arrow showing planned direction
- **Risk Zones**: Color-coded obstacle markers

### Color Coding
- 🟢 **Green**: Low risk, normal operation
- 🟡 **Yellow**: Medium risk, caution required
- 🟠 **Orange**: High risk, avoidance needed
- 🔴 **Red**: Critical risk, emergency stop

## 🔊 Audio Feedback

### Status Announcements
- Path clear notifications
- Obstacle avoidance alerts
- Emergency stop warnings
- Return to path confirmations

### Frequency Control
- Periodic updates (every 4 seconds)
- Emergency alerts (immediate)
- Status changes (on state transition)

## 🔧 Configuration Options

### Performance Tuning
```python
# In optimized_live_api_vision.py
self.target_fps = 20              # Target frame rate
self.frame_skip = 1               # Process every N frames
self.detection_confidence = 0.5   # YOLO confidence threshold
self.gemini_call_interval = 0.5   # AI decision frequency
```

### Safety Parameters
```python
self.safe_distance_threshold = 100    # Safe distance (pixels)
self.critical_distance_threshold = 50 # Emergency distance (pixels)
```

## 🚗 ESP32 Integration

### WebSocket Protocol
- **Endpoint**: `ws://localhost:8080/esp32`
- **Subprotocol**: `mining-protocol`
- **Format**: JSON commands with motor control data

### Command Structure
```json
{
  "type": "motor_control",
  "command": "OBSTACLE_AVOID_LEFT",
  "motor_control": {
    "left_motor_speed": 75,
    "right_motor_speed": 150,
    "duration": 2.0
  },
  "metadata": {
    "timestamp": 1700000000.0,
    "reasoning": "Large obstacle detected ahead"
  }
}
```

## 🧪 Testing & Development

### Mock ESP32 Server
The enhanced mock server simulates realistic vehicle behavior:
- **Differential Drive Physics**: Realistic movement simulation
- **State Tracking**: Position, heading, motor status
- **Emergency Protocols**: Proper emergency stop handling
- **Real-time Feedback**: Status updates and acknowledgments

### Testing Commands
```bash
# Start mock server only
python3 mock_esp32.py

# Test ESP32 controller only  
python3 enhanced_esp32_controller.py

# Full system test
python3 launch_enhanced_mining_vision.py --mock-esp32
```

## 🔍 Debugging

### Log Locations
- **Console**: Real-time status and errors
- **File**: `mining_vision.log` (if enabled)

### Debug Levels
```bash
python3 launch_enhanced_mining_vision.py --log-level DEBUG
```

### Common Issues
1. **Camera not found**: Check camera connections and permissions
2. **YOLO model download**: Ensure internet connection for first run
3. **ESP32 connection**: Verify WebSocket server is running
4. **Audio issues**: Check TTS engine installation

## 🎯 Usage Examples

### Basic Mining Operation
1. Start the system: `python3 launch_enhanced_mining_vision.py`
2. System detects obstacles automatically
3. Vehicle navigates around obstacles
4. Returns to original path after avoidance
5. Emergency stops for humans

### Development/Testing
1. Start with mock ESP32: `python3 launch_enhanced_mining_vision.py --mock-esp32`
2. Observe navigation decisions in logs
3. Test different obstacle scenarios
4. Verify emergency stop functionality

### Integration with Real Hardware
1. Configure ESP32 WebSocket server
2. Update connection parameters in `enhanced_esp32_controller.py`
3. Test motor control commands
4. Calibrate speed and direction parameters

## 📈 Future Enhancements

### Planned Features
- **Multi-Camera Support**: 360-degree obstacle detection
- **LIDAR Integration**: Enhanced distance measurement
- **GPS Navigation**: Absolute positioning and route planning
- **Machine Learning**: Custom model training for mining-specific objects
- **Fleet Management**: Multi-vehicle coordination

### Performance Improvements
- **GPU Acceleration**: CUDA support for faster inference
- **Model Optimization**: Custom YOLO training for mining environments
- **Edge Computing**: On-device AI processing
- **Network Optimization**: Reduced bandwidth usage

## 🤝 Contributing

To contribute to the enhanced mining vision system:
1. Fork the repository
2. Create a feature branch
3. Test with mock ESP32 server
4. Submit pull request with detailed description

## 📄 License

This enhanced mining vision system is part of the live-api-web-console project and follows the same licensing terms.

---

**🚗 Enhanced Mining Vision System - Intelligent Navigation for Autonomous Mining Vehicles**