# Mining Vehicle Vision System - YOLO Testing

This system provides **real** computer vision testing using your PC's camera with YOLO object detection before migrating to ESP32. No simulations - real AI functionality!

## 🚀 Features

### Real Computer Vision
- **YOLOv8** object detection using your PC's camera
- **Real-time processing** with performance metrics
- **Distance estimation** for detected objects
- **Mining-specific object classification** (people, vehicles, equipment)

### Intelligent Navigation
- **Priority-based decision making** (High/Medium/Low priority objects)
- **Obstacle avoidance** with directional steering
- **Emergency stop** for high-risk objects (people, vehicles)
- **Path planning** based on object positions

### Real Communication
- **WebSocket server** for real-time telemetry
- **Live data streaming** to web dashboard
- **Performance monitoring** (FPS, inference time)
- **Detection logging** and analytics

### Safety Features
- **Emergency stop** for people detection within 5m
- **Vehicle avoidance** for trucks/cars within 10m  
- **Stop sign recognition** with full stop command
- **Real-time alerts** and warnings

## 🛠️ Setup Instructions

### 1. Install Dependencies
```bash
# Navigate to the vision directory
cd src/mining/vision

# Install required packages
pip install -r requirements.txt
```

### 2. Run the Vision System
```bash
# Start the YOLO detection system
python camera-yolo-test.py
```

### 3. Open the Web Dashboard
```bash
# Open the test client in your browser
open test_client.html
# or navigate to: file:///path/to/test_client.html
```

## 📊 System Architecture

### Vision Pipeline
```
Camera Feed → YOLO Detection → Object Analysis → Navigation Commands → WebSocket Telemetry
```

### Object Priority System
- **High Priority**: People, trucks, cars, buses, stop signs
  - Action: Emergency stop or immediate avoidance
  - Distance threshold: 5-10 meters
  
- **Medium Priority**: Bicycles, motorcycles  
  - Action: Gentle avoidance maneuvers
  - Distance threshold: 3 meters
  
- **Low Priority**: Bottles, chairs, bags
  - Action: Note and gentle avoidance if needed

### Navigation Commands
- `forward`: Clear path, proceed normally
- `avoid_left`: Turn left to avoid obstacle
- `avoid_right`: Turn right to avoid obstacle  
- `stop_and_wait`: Obstacle blocking path
- `emergency_stop`: High-risk object detected
- `stop_for_sign`: Stop sign recognition

## 🖥️ Web Dashboard Features

### Real-time Monitoring
- **Connection status** with auto-reconnect
- **Performance metrics** (FPS, inference time, detection count)
- **Navigation commands** with reasoning
- **Object detections** with priority highlighting
- **System logs** with timestamped events

### Visual Indicators
- **Color-coded priorities**: Red (high), Orange (medium), Green (low)
- **Emergency alerts**: Flashing red warnings
- **Distance estimates**: Real-world measurements
- **Confidence scores**: Detection accuracy

## 🔧 Configuration Options

### Camera Settings
```python
# In camera-yolo-test.py
self.camera_id = 0          # Change camera (0=default, 1=external)
self.frame_width = 640      # Resolution width
self.frame_height = 480     # Resolution height  
self.fps = 30               # Target framerate
```

### Detection Thresholds
```python
self.confidence_threshold = 0.5    # YOLO confidence threshold
self.nms_threshold = 0.4          # Non-maximum suppression
```

### Mining-Specific Objects
```python
self.mining_objects = {
    'person': {'priority': 'high', 'action': 'stop'},
    'truck': {'priority': 'high', 'action': 'avoid'},
    # Add custom mining equipment objects here
}
```

## 📈 Testing Scenarios

### Test Cases
1. **Person Detection**: Walk in front of camera - should trigger emergency stop
2. **Vehicle Avoidance**: Show toy car/truck - should trigger avoidance
3. **Stop Sign**: Show stop sign - should trigger full stop
4. **Multiple Objects**: Test priority handling with multiple objects
5. **Distance Estimation**: Test accuracy of distance measurements

### Expected Behaviors
- **Immediate response** to high-priority objects
- **Smooth avoidance** for medium-priority objects  
- **Accurate distance estimation** for known object sizes
- **Real-time telemetry** updates in web dashboard
- **Emergency protocols** for safety-critical situations

## 🚚 Migration to ESP32

After testing, the navigation commands can be directly sent to ESP32:

```python
# Navigation command format (ready for ESP32)
nav_command = {
    'linear': 0.5,      # Forward speed (m/s)
    'angular': 0.2,     # Turning speed (rad/s)
    'action': 'avoid_right',
    'reason': 'truck detected on left at 8.5m'
}
```

### ESP32 Integration Points
1. **Replace camera input** with ESP32 IP camera stream
2. **Send navigation commands** via WebSocket to ESP32
3. **Integrate sensor data** (ultrasonic, IMU, gas sensors)
4. **Add emergency stop** hardware integration
5. **Implement motor control** mapping

## 🔍 Troubleshooting

### Common Issues
- **Camera not found**: Check camera_id in code
- **Low FPS**: Reduce resolution or use YOLOv8n (nano) model
- **WebSocket errors**: Ensure port 8765 is available
- **Detection accuracy**: Adjust confidence_threshold

### Performance Optimization
- Use **YOLOv8n** for fastest inference
- **Reduce resolution** for higher FPS
- **Limit detection classes** to mining-relevant objects
- **Optimize frame processing** pipeline

## 🎯 Key Advantages

### Real vs Simulated
- ✅ **Real YOLO inference** on live camera feed
- ✅ **Actual object detection** with confidence scores
- ✅ **True distance estimation** based on object sizes
- ✅ **Live navigation decisions** based on real detections
- ✅ **Performance measurement** of actual AI processing

### Ready for Production
- Pre-tested navigation logic
- Validated safety protocols
- Measured performance benchmarks
- Real-world object handling
- Production-ready communication protocols

This system provides a complete testing environment for your mining vehicle AI before ESP32 deployment! 🎉