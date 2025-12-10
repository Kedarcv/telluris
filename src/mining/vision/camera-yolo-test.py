#!/usr/bin/env python3
"""
Real-time YOLO Object Detection for Mining Vehicle System
Test implementation using PC webcam before ESP32 migration

Requirements:
- OpenCV (cv2)
- ultralytics (YOLOv8)
- numpy
- websockets (for communication)

Usage:
python camera-yolo-test.py
"""

import cv2
import numpy as np
from ultralytics import YOLO
import time
import json
import asyncio
import websockets
import threading
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class MiningVehicleVision:
    def __init__(self):
        # Initialize YOLO model with error handling
        try:
            self.model = YOLO('yolov8n.pt')  # Using YOLOv8 nano for speed
            logger.info(f"YOLO model loaded: {len(self.model.names)} classes available")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            raise
        
        # Camera configuration - optimized for Mac cameras
        self.camera_id = 0  # Default webcam
        self.cap = None
        self.frame_width = 1280  # Higher resolution for better detection
        self.frame_height = 720
        self.fps = 15  # Realistic FPS for processing
        
        # Detection configuration
        self.confidence_threshold = 0.5
        self.nms_threshold = 0.4
        
        # Mining-specific object classes of interest
        self.mining_objects = {
            'person': {'priority': 'high', 'action': 'stop'},
            'truck': {'priority': 'high', 'action': 'avoid'},
            'car': {'priority': 'medium', 'action': 'avoid'},
            'bicycle': {'priority': 'medium', 'action': 'avoid'},
            'motorcycle': {'priority': 'medium', 'action': 'avoid'},
            'bus': {'priority': 'high', 'action': 'avoid'},
            'stop sign': {'priority': 'high', 'action': 'stop'},
            'traffic light': {'priority': 'high', 'action': 'analyze'},
            'fire hydrant': {'priority': 'low', 'action': 'note'},
            'bench': {'priority': 'low', 'action': 'avoid'},
            'handbag': {'priority': 'low', 'action': 'note'},
            'backpack': {'priority': 'low', 'action': 'note'},
            'chair': {'priority': 'low', 'action': 'avoid'},
            'bottle': {'priority': 'low', 'action': 'note'}
        }
        
        # Navigation data
        self.current_detections = []
        self.navigation_command = {'linear': 0, 'angular': 0, 'action': 'idle'}
        self.emergency_stop = False
        
        # WebSocket server for communication
        self.websocket_port = 8765
        self.connected_clients = set()
        
        # Performance metrics
        self.fps_counter = 0
        self.fps_start_time = time.time()
        self.avg_inference_time = 0
        
        # Validate model for mining operations
        self._validate_mining_classes()
        
        logger.info("Mining Vehicle Vision System initialized")
        logger.info(f"Monitoring {len(self.mining_objects)} mining-relevant object types")
    
    def _validate_mining_classes(self):
        """Validate that required mining classes are available in the model"""
        available_classes = list(self.model.names.values())
        missing_classes = []
        
        for obj_class in self.mining_objects.keys():
            if obj_class not in available_classes:
                missing_classes.append(obj_class)
        
        if missing_classes:
            logger.warning(f"Missing object classes in model: {missing_classes}")
        
        # Log available mining-relevant classes
        mining_available = [cls for cls in self.mining_objects.keys() if cls in available_classes]
        logger.info(f"Available mining classes: {mining_available}")
    
    def initialize_camera(self):
        """Initialize and configure camera"""
        try:
            self.cap = cv2.VideoCapture(self.camera_id)
            if not self.cap.isOpened():
                logger.error(f"Failed to open camera {self.camera_id}")
                return False
            
            # Configure camera settings
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
            self.cap.set(cv2.CAP_PROP_FPS, self.fps)
            
            # Get actual camera properties
            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            actual_fps = int(self.cap.get(cv2.CAP_PROP_FPS))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height} @ {actual_fps}fps")
            return True
            
        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            return False
    
    def detect_objects(self, frame):
        """Run YOLO detection on frame"""
        start_time = time.time()
        
        try:
            # Run YOLO inference with optimized parameters
            results = self.model(
                frame, 
                conf=self.confidence_threshold, 
                iou=self.nms_threshold,
                verbose=False,  # Suppress verbose output
                device='cpu'   # Use CPU for compatibility
            )
            
            detections = []
            for result in results:
                boxes = result.boxes
                if boxes is not None and len(boxes) > 0:
                    for box in boxes:
                        # Extract detection data
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])
                        class_name = self.model.names[class_id]
                        
                        # Calculate object properties
                        center_x = (x1 + x2) / 2
                        center_y = (y1 + y2) / 2
                        width = x2 - x1
                        height = y2 - y1
                        area = width * height
                        
                        # Normalize coordinates (0-1)
                        norm_center_x = center_x / frame.shape[1]
                        norm_center_y = center_y / frame.shape[0]
                        
                        # Create detection object
                        detection = {
                            'class_name': class_name,
                            'confidence': confidence,
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'center': [center_x, center_y],
                            'normalized_center': [norm_center_x, norm_center_y],
                            'size': [width, height],
                            'area': area,
                            'distance_estimate': self.estimate_distance(width, height, class_name),
                            'priority': self.mining_objects.get(class_name, {}).get('priority', 'unknown'),
                            'recommended_action': self.mining_objects.get(class_name, {}).get('action', 'none'),
                            'timestamp': datetime.now().isoformat()
                        }
                        
                        detections.append(detection)
            
            # Update performance metrics
            inference_time = time.time() - start_time
            self.avg_inference_time = (self.avg_inference_time + inference_time) / 2
            
            return detections
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return []
    
    def estimate_distance(self, width, height, class_name):
        """Estimate distance based on object size (simplified)"""
        # This is a simplified distance estimation
        # In real mining applications, you'd use stereo vision or LiDAR
        
        # Known approximate sizes (in meters) for common objects
        known_sizes = {
            'person': 1.7,      # Average human height
            'car': 4.5,         # Average car length
            'truck': 8.0,       # Average truck length
            'bicycle': 1.8,     # Average bicycle length
            'stop sign': 0.8,   # Standard stop sign diameter
            'bottle': 0.25,     # Standard bottle height
            'chair': 0.8        # Average chair height
        }
        
        if class_name in known_sizes:
            # Simple distance estimation: distance = (known_size * focal_length) / pixel_size
            # Using simplified focal length estimation
            focal_length = 500  # Approximate focal length in pixels
            pixel_size = max(width, height)
            known_size = known_sizes[class_name]
            
            if pixel_size > 0:
                distance = (known_size * focal_length) / pixel_size
                return round(distance, 2)
        
        return None
    
    def analyze_navigation(self, detections):
        """Analyze detections and generate navigation commands"""
        # Reset navigation command
        nav_cmd = {'linear': 0, 'angular': 0, 'action': 'idle', 'reason': ''}
        emergency = False
        
        if not detections:
            nav_cmd = {'linear': 0.5, 'angular': 0, 'action': 'forward', 'reason': 'clear_path'}
            self.emergency_stop = False
            return nav_cmd, emergency
        
        # Analyze high priority objects
        high_priority_objects = [d for d in detections if d['priority'] == 'high']
        
        for obj in high_priority_objects:
            center_x_norm = obj['normalized_center'][0]
            distance = obj['distance_estimate']
            
            # Person detection - immediate stop
            if obj['class_name'] == 'person':
                if distance and distance < 5.0:  # Within 5 meters
                    nav_cmd = {'linear': 0, 'angular': 0, 'action': 'emergency_stop', 
                              'reason': f'Person detected at {distance}m'}
                    emergency = True
                    break
            
            # Vehicle detection - avoidance
            elif obj['class_name'] in ['truck', 'car', 'bus']:
                if distance and distance < 10.0:  # Within 10 meters
                    # Determine avoidance direction
                    if center_x_norm < 0.4:  # Object on left
                        nav_cmd = {'linear': 0.2, 'angular': -0.5, 'action': 'avoid_right',
                                  'reason': f'{obj["class_name"]} on left at {distance}m'}
                    elif center_x_norm > 0.6:  # Object on right
                        nav_cmd = {'linear': 0.2, 'angular': 0.5, 'action': 'avoid_left',
                                  'reason': f'{obj["class_name"]} on right at {distance}m'}
                    else:  # Object in center
                        nav_cmd = {'linear': 0, 'angular': 0, 'action': 'stop_and_wait',
                                  'reason': f'{obj["class_name"]} blocking path at {distance}m'}
            
            # Stop sign detection
            elif obj['class_name'] == 'stop sign':
                nav_cmd = {'linear': 0, 'angular': 0, 'action': 'stop_for_sign',
                          'reason': 'Stop sign detected'}
        
        # If no high priority objects, check medium priority
        if nav_cmd['action'] == 'idle':
            medium_priority_objects = [d for d in detections if d['priority'] == 'medium']
            
            for obj in medium_priority_objects:
                center_x_norm = obj['normalized_center'][0]
                distance = obj['distance_estimate']
                
                if distance and distance < 3.0:  # Within 3 meters
                    # Gentle avoidance for medium priority objects
                    if center_x_norm < 0.4:
                        nav_cmd = {'linear': 0.3, 'angular': -0.3, 'action': 'avoid_right',
                                  'reason': f'{obj["class_name"]} on left at {distance}m'}
                    elif center_x_norm > 0.6:
                        nav_cmd = {'linear': 0.3, 'angular': 0.3, 'action': 'avoid_left',
                                  'reason': f'{obj["class_name"]} on right at {distance}m'}
        
        # Default behavior if path is clear
        if nav_cmd['action'] == 'idle':
            nav_cmd = {'linear': 0.5, 'angular': 0, 'action': 'forward', 'reason': 'path_clear'}
        
        self.emergency_stop = emergency
        return nav_cmd, emergency
    
    def draw_detections(self, frame, detections, nav_cmd):
        """Draw detection boxes and information on frame"""
        for detection in detections:
            x1, y1, x2, y2 = detection['bbox']
            class_name = detection['class_name']
            confidence = detection['confidence']
            distance = detection['distance_estimate']
            priority = detection['priority']
            
            # Color based on priority
            color_map = {
                'high': (0, 0, 255),     # Red
                'medium': (0, 165, 255), # Orange
                'low': (0, 255, 0),      # Green
                'unknown': (128, 128, 128) # Gray
            }
            color = color_map.get(priority, (128, 128, 128))
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Prepare label
            label = f"{class_name}: {confidence:.2f}"
            if distance:
                label += f" ({distance}m)"
            
            # Draw label background
            label_size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)[0]
            cv2.rectangle(frame, (x1, y1 - label_size[1] - 10), 
                         (x1 + label_size[0], y1), color, -1)
            
            # Draw label text
            cv2.putText(frame, label, (x1, y1 - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)
        
        # Draw navigation command
        nav_text = f"Action: {nav_cmd['action']} | Reason: {nav_cmd['reason']}"
        cv2.putText(frame, nav_text, (10, 30), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Draw emergency status
        if self.emergency_stop:
            cv2.putText(frame, "EMERGENCY STOP!", (10, 60), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 3)
        
        # Draw FPS
        fps_text = f"FPS: {self.get_fps():.1f} | Inference: {self.avg_inference_time*1000:.1f}ms"
        cv2.putText(frame, fps_text, (10, frame.shape[0] - 20), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        return frame
    
    def get_fps(self):
        """Calculate current FPS"""
        self.fps_counter += 1
        if self.fps_counter % 30 == 0:
            current_time = time.time()
            fps = 30 / (current_time - self.fps_start_time)
            self.fps_start_time = current_time
            return fps
        return 0
    
    async def websocket_handler(self, websocket, path):
        """Handle WebSocket connections"""
        self.connected_clients.add(websocket)
        logger.info(f"Client connected: {websocket.remote_address}")
        
        try:
            async for message in websocket:
                # Handle incoming messages from clients
                try:
                    data = json.loads(message)
                    logger.info(f"Received: {data}")
                    
                    # Process client commands here if needed
                    if data.get('type') == 'ping':
                        await websocket.send(json.dumps({'type': 'pong', 'timestamp': time.time()}))
                    
                except json.JSONDecodeError:
                    logger.error(f"Invalid JSON received: {message}")
                    
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            self.connected_clients.remove(websocket)
            logger.info(f"Client disconnected: {websocket.remote_address}")
    
    async def broadcast_data(self, data):
        """Broadcast data to all connected WebSocket clients"""
        if self.connected_clients:
            message = json.dumps(data)
            disconnected = []
            
            for client in self.connected_clients:
                try:
                    await client.send(message)
                except websockets.exceptions.ConnectionClosed:
                    disconnected.append(client)
            
            # Remove disconnected clients
            for client in disconnected:
                self.connected_clients.discard(client)
    
    def start_websocket_server(self):
        """Start WebSocket server in separate thread"""
        def run_server():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            start_server = websockets.serve(
                self.websocket_handler, "localhost", self.websocket_port
            )
            
            logger.info(f"WebSocket server starting on ws://localhost:{self.websocket_port}")
            loop.run_until_complete(start_server)
            loop.run_forever()
        
        server_thread = threading.Thread(target=run_server, daemon=True)
        server_thread.start()
    
    async def send_telemetry(self, detections, nav_cmd):
        """Send telemetry data via WebSocket"""
        telemetry = {
            'type': 'mining_vehicle_telemetry',
            'timestamp': datetime.now().isoformat(),
            'detections': detections,
            'navigation_command': nav_cmd,
            'emergency_stop': self.emergency_stop,
            'performance': {
                'fps': self.get_fps(),
                'inference_time_ms': self.avg_inference_time * 1000,
                'detection_count': len(detections)
            },
            'camera_info': {
                'width': self.frame_width,
                'height': self.frame_height,
                'fps_target': self.fps
            }
        }
        
        await self.broadcast_data(telemetry)
    
    def run(self):
        """Main execution loop"""
        logger.info("Starting Mining Vehicle Vision System...")
        
        # Initialize camera
        if not self.initialize_camera():
            logger.error("Failed to initialize camera. Exiting.")
            return
        
        # Start WebSocket server
        self.start_websocket_server()
        
        try:
            logger.info("Starting main detection loop. Press 'q' to quit.")
            
            # Create event loop for WebSocket communication  
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    logger.error("Failed to read frame from camera")
                    break
                
                # Detect objects
                detections = self.detect_objects(frame)
                
                # Analyze and generate navigation commands
                nav_cmd, emergency = self.analyze_navigation(detections)
                self.navigation_command = nav_cmd
                
                # Draw detections on frame
                annotated_frame = self.draw_detections(frame, detections, nav_cmd)
                
                # Send telemetry
                try:
                    if loop.is_running():
                        # Create a task if loop is already running
                        asyncio.create_task(self.send_telemetry(detections, nav_cmd))
                    else:
                        loop.run_until_complete(self.send_telemetry(detections, nav_cmd))
                except Exception as e:
                    logger.error(f"WebSocket error: {e}")
                
                # Display frame
                cv2.imshow('Mining Vehicle Vision - YOLO Detection', annotated_frame)
                
                # Log important detections
                if detections:
                    high_priority = [d for d in detections if d['priority'] == 'high']
                    if high_priority:
                        logger.info(f"High priority objects detected: {len(high_priority)}")
                        for obj in high_priority:
                            logger.info(f"  {obj['class_name']}: {obj['confidence']:.2f} at {obj['distance_estimate']}m")
                
                # Check for quit
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    logger.info("Quit requested by user")
                    break
                
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Runtime error: {e}")
        finally:
            # Cleanup
            if self.cap:
                self.cap.release()
            cv2.destroyAllWindows()
            logger.info("Mining Vehicle Vision System stopped")

def main():
    """Main function"""
    print("Mining Vehicle Vision System - YOLO Object Detection")
    print("=" * 50)
    print("This system uses your PC's camera to test object detection")
    print("before deployment to ESP32 mining vehicle.")
    print("=" * 50)
    
    # Create and run vision system
    vision_system = MiningVehicleVision()
    vision_system.run()

if __name__ == "__main__":
    main()