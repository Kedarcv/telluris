#!/usr/bin/env python3
"""
Optimized Live API Mining Vision System
High-performance real-time vision processing with minimal latency
"""

import asyncio
import json
import logging
import os
import cv2
import numpy as np
from ultralytics import YOLO
import threading
import queue
import time
from datetime import datetime
from collections import deque
import concurrent.futures
import math
from typing import Dict, List, Tuple, Optional, Any, NamedTuple
from dataclasses import dataclass
from enum import Enum

# Audio (optimized)
try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

# Path planning and navigation structures
class NavigationState(Enum):
    NORMAL_FORWARD = "NORMAL_FORWARD"
    OBSTACLE_AVOID_LEFT = "OBSTACLE_AVOID_LEFT"
    OBSTACLE_AVOID_RIGHT = "OBSTACLE_AVOID_RIGHT"
    RETURNING_TO_PATH = "RETURNING_TO_PATH"
    EMERGENCY_STOP = "EMERGENCY_STOP"
    SLOW_APPROACH = "SLOW_APPROACH"
    STOP_AND_ASSESS = "STOP_AND_ASSESS"

@dataclass
class Obstacle:
    x: float
    y: float
    width: float
    height: float
    confidence: float
    object_type: str
    risk_level: str

@dataclass
class PathPoint:
    x: float
    y: float
    timestamp: float

@dataclass
class NavigationCommand:
    state: NavigationState
    speed: float
    direction: float  # degrees, 0 = forward, negative = left, positive = right
    duration: float  # seconds to execute command
    reasoning: str

# Gemini API (optimized)
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class OptimizedMiningVisionSystem:
    def __init__(self, gemini_api_key: str = None):
        """Initialize optimized vision system with enhanced path planning and faster inference"""
        
        # Performance configuration - Enhanced for faster inference
        self.target_fps = 20  # Increased FPS for better response
        self.frame_skip = 1   # Process every frame for better obstacle detection
        self.max_queue_size = 2  # Smaller queue for minimal latency
        
        # Detection configuration - Optimized for mining environment
        self.detection_confidence = 0.5  # Balanced for obstacle detection
        self.gemini_call_interval = 0.5  # Faster AI decision making
        
        # Path planning configuration
        self.original_path = []  # Store original intended path
        self.current_path = []   # Current planned path with obstacles
        self.path_history = deque(maxlen=50)  # Track where we've been
        self.obstacle_memory = {}  # Remember detected obstacles
        self.avoidance_active = False
        self.return_to_path_point = None
        
        # Enhanced navigation state
        self.current_navigation_state = NavigationState.NORMAL_FORWARD
        self.navigation_start_time = time.time()
        self.last_obstacle_detection = 0
        self.safe_distance_threshold = 100  # pixels
        self.critical_distance_threshold = 50  # pixels
        
        # Initialize components
        self.setup_camera()
        self.setup_yolo()
        self.setup_gemini(gemini_api_key)
        self.setup_audio()
        
        # Threading and queues for real-time processing
        self.frame_queue = queue.Queue(maxsize=self.max_queue_size)
        self.detection_queue = queue.Queue(maxsize=5)
        self.audio_queue = queue.Queue(maxsize=10)
        
        # Performance tracking
        self.fps_counter = deque(maxlen=30)
        self.last_gemini_call = 0
        self.frame_count = 0
        
        # State management
        self.current_detections = []
        self.last_navigation_command = "NORMAL_FORWARD"
        self.is_running = False
        
        # ESP32 controller
        self.esp32_controller = None
        self.esp32_monitor_task = None
        
    def setup_camera(self):
        """Setup camera with optimized settings"""
        self.cap = cv2.VideoCapture(0)
        if not self.cap.isOpened():
            raise RuntimeError("Cannot open camera")
            
        # Optimize camera settings for performance
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self.cap.set(cv2.CAP_PROP_FPS, 30)
        self.cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize buffer to reduce latency
        
        logger.info("✅ Camera initialized with optimized settings")
        
    def setup_yolo(self):
        """Setup YOLO with aggressive performance optimizations for mining environment"""
        try:
            # Use YOLOv8n for maximum speed
            self.yolo_model = YOLO('yolov8n.pt')
            
            # Configure model for maximum inference speed
            self.yolo_model.overrides = {
                'conf': 0.4,  # Lower confidence for better obstacle detection
                'iou': 0.6,   # Higher IoU to reduce duplicate detections
                'max_det': 20, # Limit detections for speed
                'half': False, # Use FP32 for stability on CPU
                'device': 'cpu',
                'verbose': False
            }
            
            # Warm up with multiple passes for consistent timing
            dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)
            for _ in range(3):
                self.yolo_model(dummy_frame, **self.yolo_model.overrides)
            
            logger.info("✅ YOLO model optimized for fast inference")
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            self.yolo_model = None
            
    def setup_gemini(self, api_key: str):
        """Setup Gemini with optimizations"""
        if not GEMINI_AVAILABLE or not api_key:
            logger.warning("Gemini AI not available")
            self.gemini_model = None
            return
            
        try:
            genai.configure(api_key=api_key)
            self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')
            logger.info("✅ Gemini AI initialized")
        except Exception as e:
            logger.error(f"Gemini initialization failed: {e}")
            self.gemini_model = None
            
    def setup_audio(self):
        """Setup optimized audio system"""
        if not TTS_AVAILABLE:
            logger.warning("TTS not available")
            self.tts_engine = None
            return
            
        try:
            self.tts_engine = pyttsx3.init()
            
            # Optimize TTS settings for speed
            rate = self.tts_engine.getProperty('rate')
            self.tts_engine.setProperty('rate', rate + 50)  # Speak faster
            
            voices = self.tts_engine.getProperty('voices')
            if voices:
                self.tts_engine.setProperty('voice', voices[0].id)  # Use first available voice
                
            logger.info("✅ TTS engine initialized")
        except Exception as e:
            logger.error(f"TTS initialization failed: {e}")
            self.tts_engine = None
    
    def detect_objects(self, frame: np.ndarray) -> List[Dict]:
        """Ultra-fast object detection optimized for mining obstacles"""
        if not self.yolo_model:
            return []
            
        try:
            # Ultra-fast inference with pre-configured settings
            results = self.yolo_model(frame, **self.yolo_model.overrides)
            
            detections = []
            if results and len(results) > 0:
                boxes = results[0].boxes
                if boxes is not None:
                    for box in boxes:
                        class_id = int(box.cls[0])
                        confidence = float(box.conf[0])
                        bbox = box.xyxy[0].tolist()
                        
                        # Get class name
                        class_name = self.yolo_model.names.get(class_id, f'class_{class_id}')
                        
                        # Calculate object center and size for path planning
                        x1, y1, x2, y2 = bbox
                        center_x = (x1 + x2) / 2
                        center_y = (y1 + y2) / 2
                        width = x2 - x1
                        height = y2 - y1
                        
                        detections.append({
                            'class': class_name,
                            'confidence': confidence,
                            'bbox': bbox,
                            'center': (center_x, center_y),
                            'size': (width, height),
                            'area': width * height
                        })
            
            return detections
            
        except Exception as e:
            logger.error(f"Detection error: {e}")
            return []
    
    def analyze_obstacles(self, detections: List[Dict], frame_shape: Tuple[int, int]) -> List[Obstacle]:
        """Analyze detections and convert to obstacle objects for path planning"""
        obstacles = []
        height, width = frame_shape[:2]
        
        # Frame center for reference
        frame_center_x = width / 2
        frame_center_y = height / 2
        
        for det in detections:
            center_x, center_y = det['center']
            obj_width, obj_height = det['size']
            
            # Calculate distance from frame center (approximation)
            distance_from_center = math.sqrt((center_x - frame_center_x)**2 + (center_y - frame_center_y)**2)
            
            # Determine risk level based on object type and position
            risk_level = self.assess_obstacle_risk(det, distance_from_center, frame_center_x)
            
            # Create obstacle object
            obstacle = Obstacle(
                x=center_x,
                y=center_y,
                width=obj_width,
                height=obj_height,
                confidence=det['confidence'],
                object_type=det['class'],
                risk_level=risk_level
            )
            
            obstacles.append(obstacle)
            
            # Store in memory for persistence
            obstacle_id = f"{det['class']}_{int(center_x)}_{int(center_y)}"
            self.obstacle_memory[obstacle_id] = {
                'obstacle': obstacle,
                'last_seen': time.time(),
                'detection_count': self.obstacle_memory.get(obstacle_id, {}).get('detection_count', 0) + 1
            }
        
        return obstacles
    
    def assess_obstacle_risk(self, detection: Dict, distance_from_center: float, frame_center_x: float) -> str:
        """Assess risk level of detected obstacle"""
        obj_class = detection['class'].lower()
        center_x = detection['center'][0]
        confidence = detection['confidence']
        area = detection['area']
        
        # Critical risks
        if 'person' in obj_class or 'human' in obj_class:
            return 'CRITICAL'
        
        # High risks - large objects in path
        if area > 10000 and distance_from_center < self.critical_distance_threshold:
            return 'HIGH'
        
        # Objects directly in front path
        if abs(center_x - frame_center_x) < 50 and distance_from_center < self.safe_distance_threshold:
            return 'HIGH'
        
        # Medium risks - objects to sides that might block path
        if distance_from_center < self.safe_distance_threshold:
            return 'MEDIUM'
        
        return 'LOW'
    
    def plan_navigation(self, obstacles: List[Obstacle], frame_shape: Tuple[int, int]) -> NavigationCommand:
        """AI-enhanced path planning with obstacle avoidance"""
        height, width = frame_shape[:2]
        frame_center_x = width / 2
        
        # Check for critical obstacles (humans)
        critical_obstacles = [obs for obs in obstacles if obs.risk_level == 'CRITICAL']
        if critical_obstacles:
            return NavigationCommand(
                state=NavigationState.EMERGENCY_STOP,
                speed=0.0,
                direction=0.0,
                duration=float('inf'),
                reasoning=f"EMERGENCY: {critical_obstacles[0].object_type} detected"
            )
        
        # Get obstacles that require avoidance
        blocking_obstacles = [obs for obs in obstacles if obs.risk_level in ['HIGH', 'MEDIUM']]
        
        if not blocking_obstacles:
            # Clear path - proceed normally or return to original path
            if self.avoidance_active and self.return_to_path_point:
                return self.plan_return_to_path(frame_center_x)
            
            return NavigationCommand(
                state=NavigationState.NORMAL_FORWARD,
                speed=1.2,  # Slightly faster when path is clear
                direction=0.0,
                duration=2.0,
                reasoning="Path clear, proceeding forward"
            )
        
        # Analyze obstacle positions for best avoidance strategy
        return self.plan_obstacle_avoidance(blocking_obstacles, frame_center_x, width)
    
    def plan_obstacle_avoidance(self, obstacles: List[Obstacle], frame_center_x: float, frame_width: float) -> NavigationCommand:
        """Plan optimal obstacle avoidance maneuver"""
        # Analyze obstacle distribution
        left_obstacles = [obs for obs in obstacles if obs.x < frame_center_x - 50]
        right_obstacles = [obs for obs in obstacles if obs.x > frame_center_x + 50]
        center_obstacles = [obs for obs in obstacles if frame_center_x - 50 <= obs.x <= frame_center_x + 50]
        
        # Calculate obstacle densities and risks
        left_risk = sum(1 if obs.risk_level == 'HIGH' else 0.5 for obs in left_obstacles)
        right_risk = sum(1 if obs.risk_level == 'HIGH' else 0.5 for obs in right_obstacles)
        
        self.avoidance_active = True
        self.return_to_path_point = PathPoint(frame_center_x, frame_width/2, time.time())
        
        # Decision logic for avoidance direction
        if center_obstacles:
            # Objects directly ahead - choose side with less risk
            if left_risk < right_risk:
                return NavigationCommand(
                    state=NavigationState.OBSTACLE_AVOID_LEFT,
                    speed=0.6,
                    direction=-30.0,  # 30 degrees left
                    duration=2.0,
                    reasoning=f"Avoiding obstacles ahead, turning left (left_risk: {left_risk:.1f})"
                )
            else:
                return NavigationCommand(
                    state=NavigationState.OBSTACLE_AVOID_RIGHT,
                    speed=0.6,
                    direction=30.0,   # 30 degrees right
                    duration=2.0,
                    reasoning=f"Avoiding obstacles ahead, turning right (right_risk: {right_risk:.1f})"
                )
        
        # Objects on sides - slow down and assess
        return NavigationCommand(
            state=NavigationState.SLOW_APPROACH,
            speed=0.3,
            direction=0.0,
            duration=1.0,
            reasoning=f"Side obstacles detected, slowing for assessment"
        )
    
    def plan_return_to_path(self, current_x: float) -> NavigationCommand:
        """Plan return to original path after obstacle avoidance"""
        if not self.return_to_path_point:
            self.avoidance_active = False
            return NavigationCommand(
                state=NavigationState.NORMAL_FORWARD,
                speed=0.8,
                direction=0.0,
                duration=2.0,
                reasoning="Returning to normal forward movement"
            )
        
        # Calculate direction to return to center path
        target_x = self.return_to_path_point.x
        direction_correction = 0.0
        
        if abs(current_x - target_x) > 30:  # If significantly off center
            if current_x < target_x:
                direction_correction = 15.0  # Gentle right turn
            else:
                direction_correction = -15.0  # Gentle left turn
        else:
            # Close enough to center path
            self.avoidance_active = False
            self.return_to_path_point = None
        
        return NavigationCommand(
            state=NavigationState.RETURNING_TO_PATH,
            speed=0.7,
            direction=direction_correction,
            duration=1.5,
            reasoning=f"Returning to center path (correction: {direction_correction:.1f}°)"
        )
    
    async def analyze_with_gemini(self, navigation_cmd: NavigationCommand, obstacles: List[Obstacle]) -> NavigationCommand:
        """Enhanced Gemini analysis for complex navigation scenarios"""
        if not self.gemini_model:
            return navigation_cmd
            
        # Rate limiting - only call Gemini for complex decisions
        current_time = time.time()
        if current_time - self.last_gemini_call < self.gemini_call_interval:
            return navigation_cmd
            
        # Only use Gemini for complex scenarios where local planning isn't sufficient
        high_risk_obstacles = [obs for obs in obstacles if obs.risk_level in ['HIGH', 'MEDIUM']]
        if len(high_risk_obstacles) < 2:  # Simple scenarios don't need AI
            return navigation_cmd
            
        try:
            # Create context for Gemini analysis
            obstacle_info = []
            for obs in obstacles:
                obstacle_info.append({
                    'type': obs.object_type,
                    'position': f'x:{obs.x:.0f}, y:{obs.y:.0f}',
                    'size': f'{obs.width:.0f}x{obs.height:.0f}',
                    'risk': obs.risk_level,
                    'confidence': f'{obs.confidence:.2f}'
                })
            
            prompt = f"""
            MINING VEHICLE NAVIGATION - COMPLEX SCENARIO
            
            Current situation:
            - Vehicle state: {self.current_navigation_state.value}
            - Avoidance active: {self.avoidance_active}
            - Detected obstacles: {len(obstacles)}
            
            Obstacle details:
            {json.dumps(obstacle_info, indent=2)}
            
            Current plan: {navigation_cmd.reasoning}
            
            Analyze and provide optimal navigation strategy. Consider:
            1. Safety priority (humans = immediate stop)
            2. Efficiency (shortest safe path)
            3. Return to original path after avoidance
            
            Respond with JSON:
            {{
                "approved": true/false,
                "alternative_state": "NORMAL_FORWARD|OBSTACLE_AVOID_LEFT|OBSTACLE_AVOID_RIGHT|RETURNING_TO_PATH|EMERGENCY_STOP|SLOW_APPROACH",
                "speed": 0.0-2.0,
                "direction": -45.0 to 45.0,
                "duration": 0.5-5.0,
                "reasoning": "detailed explanation"
            }}
            """
            
            response = await asyncio.to_thread(
                self.gemini_model.generate_content, 
                prompt
            )
            
            if response and response.text:
                result = json.loads(response.text.strip())
                self.last_gemini_call = current_time
                
                if result.get('approved', True):  # Use original plan if approved
                    return navigation_cmd
                else:  # Use AI suggested alternative
                    return NavigationCommand(
                        state=NavigationState(result['alternative_state']),
                        speed=result['speed'],
                        direction=result['direction'],
                        duration=result['duration'],
                        reasoning=f"AI Override: {result['reasoning']}"
                    )
                    
        except Exception as e:
            logger.error(f"Gemini analysis error: {e}")
            
        return navigation_cmd
    
    def get_default_navigation(self, detections: List[Dict]) -> Dict:
        """Fast default navigation logic"""
        detected_objects = [det['class'] for det in detections]
        
        # Human detection check
        if any('person' in obj.lower() for obj in detected_objects):
            return {
                "navigation_command": "EMERGENCY_STOP",
                "speed": 0.0,
                "risk_level": "CRITICAL",
                "reasoning": "Human detected",
                "detected_objects": detected_objects
            }
        
        # Default safe operation
        return {
            "navigation_command": "NORMAL_FORWARD",
            "speed": 0.8,
            "risk_level": "LOW", 
            "reasoning": "Path clear",
            "detected_objects": detected_objects
        }
    
    def speak_async(self, text: str):
        """Non-blocking text-to-speech"""
        if not self.tts_engine:
            return
            
        try:
            self.audio_queue.put(text, block=False)
        except queue.Full:
            pass  # Skip if queue is full to avoid blocking
    
    def audio_worker(self):
        """Background thread for audio processing"""
        while self.is_running:
            try:
                text = self.audio_queue.get(timeout=1.0)
                if text and self.tts_engine:
                    self.tts_engine.say(text)
                    self.tts_engine.runAndWait()
                self.audio_queue.task_done()
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Audio worker error: {e}")
    
    def process_frame(self, frame: np.ndarray) -> Tuple[np.ndarray, List[Dict]]:
        """Fast frame processing with visualization"""
        detections = self.detect_objects(frame)
        
        # Draw detections on frame
        display_frame = frame.copy()
        for det in detections:
            bbox = det['bbox']
            x1, y1, x2, y2 = map(int, bbox)
            
            # Color coding for different objects
            color = (0, 0, 255) if 'person' in det['class'].lower() else (0, 255, 0)
            
            cv2.rectangle(display_frame, (x1, y1), (x2, y2), color, 2)
            
            label = f"{det['class']} {det['confidence']:.2f}"
            cv2.putText(display_frame, label, (x1, y1-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        return display_frame, detections
    
    def calculate_fps(self):
        """Calculate and display FPS"""
        current_time = time.time()
        self.fps_counter.append(current_time)
        
        if len(self.fps_counter) >= 2:
            fps = len(self.fps_counter) / (self.fps_counter[-1] - self.fps_counter[0])
            return fps
        return 0
    
    async def initialize_esp32_controller(self):
        """Initialize ESP32 controller connection"""
        try:
            from enhanced_esp32_controller import create_enhanced_controller
            logger.info("🔌 Initializing ESP32 controller...")
            
            self.esp32_controller, self.esp32_monitor_task = await create_enhanced_controller()
            if self.esp32_controller:
                logger.info("✅ ESP32 controller connected")
            else:
                logger.warning("⚠️ ESP32 controller not available - running in offline mode")
        except ImportError:
            logger.warning("⚠️ ESP32 controller module not found - running in offline mode")
        except Exception as e:
            logger.warning(f"⚠️ ESP32 controller initialization failed: {e}")
    
    async def main_loop(self):
        """High-performance main loop with enhanced navigation"""
        logger.info("🚀 Starting enhanced mining vision system with AI path planning...")
        
        self.is_running = True
        
        # Initialize ESP32 controller
        await self.initialize_esp32_controller()
        
        # Start background threads
        audio_thread = threading.Thread(target=self.audio_worker, daemon=True)
        audio_thread.start()
        
        last_status_time = 0
        last_command_time = 0
        current_navigation_cmd = None
        
        try:
            while self.is_running:
                loop_start = time.time()
                
                # Capture frame with error handling
                ret, frame = self.cap.read()
                if not ret:
                    logger.warning("Failed to capture frame")
                    await asyncio.sleep(0.1)
                    continue
                
                self.frame_count += 1
                
                # Process every frame for better obstacle detection
                if self.frame_count % self.frame_skip != 0:
                    cv2.imshow('Enhanced Mining Vision', frame)
                    if cv2.waitKey(1) & 0xFF == ord('q'):
                        break
                    continue
                
                # High-speed detection and analysis
                display_frame, detections = self.process_frame(frame)
                obstacles = self.analyze_obstacles(detections, frame.shape)
                
                # AI-enhanced path planning
                navigation_cmd = self.plan_navigation(obstacles, frame.shape)
                
                # Use Gemini for complex scenarios
                if len(obstacles) > 1:
                    navigation_cmd = await self.analyze_with_gemini(navigation_cmd, obstacles)
                
                # Execute navigation command
                current_time = time.time()
                if (current_navigation_cmd is None or 
                    current_navigation_cmd.state != navigation_cmd.state or
                    current_time - last_command_time > navigation_cmd.duration):
                    
                    current_navigation_cmd = navigation_cmd
                    last_command_time = current_time
                    
                    # Send command to ESP32 (when connected)
                    await self.send_navigation_command(navigation_cmd)
                    
                    # Log navigation decisions
                    logger.info(f"🧭 {navigation_cmd.state.value} | Speed: {navigation_cmd.speed:.1f} | Direction: {navigation_cmd.direction:.1f}° | {navigation_cmd.reasoning}")
                
                # Audio feedback (less frequent to avoid spam)
                if current_time - last_status_time > 4.0:  # Every 4 seconds
                    status_text = self.create_enhanced_status_message(navigation_cmd, obstacles)
                    self.speak_async(status_text)
                    last_status_time = current_time
                
                # Enhanced display with path planning visualization
                display_frame = self.add_navigation_visualization(display_frame, navigation_cmd, obstacles)
                
                # Display performance and navigation info
                fps = self.calculate_fps()
                info_lines = [
                    f"FPS: {fps:.1f} | Objects: {len(detections)} | Obstacles: {len(obstacles)}",
                    f"State: {navigation_cmd.state.value} | Speed: {navigation_cmd.speed:.1f}m/s",
                    f"Direction: {navigation_cmd.direction:.1f}° | Avoidance: {'ON' if self.avoidance_active else 'OFF'}"
                ]
                
                for i, line in enumerate(info_lines):
                    cv2.putText(display_frame, line, (10, 30 + i*25), 
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                
                # Show enhanced frame
                cv2.imshow('Enhanced Mining Vision', display_frame)
                
                # Optimized loop timing
                loop_time = time.time() - loop_start
                target_time = 1.0 / self.target_fps
                if loop_time < target_time:
                    await asyncio.sleep(target_time - loop_time)
                
                # Exit condition
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                    
        except KeyboardInterrupt:
            logger.info("Interrupted by user")
        except Exception as e:
            logger.error(f"Main loop error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            await self.cleanup()
    
    async def send_navigation_command(self, cmd: NavigationCommand):
        """Send navigation command to ESP32 controller"""
        command_data = {
            'command': cmd.state.value,
            'speed': cmd.speed,
            'direction': cmd.direction,
            'duration': cmd.duration,
            'timestamp': time.time()
        }
        
        # Send to ESP32 if connected
        if self.esp32_controller and self.esp32_controller.is_connected:
            try:
                success = await self.esp32_controller.send_navigation_command(command_data)
                if success:
                    logger.info(f"📡 ESP32 Command sent: {cmd.state.value}")
                else:
                    logger.warning("⚠️ Failed to send command to ESP32")
            except Exception as e:
                logger.error(f"❌ ESP32 communication error: {e}")
        else:
            # Log command when ESP32 not connected
            logger.info(f"📡 ESP32 Command (offline): {json.dumps(command_data, indent=2)}")
    
    def add_navigation_visualization(self, frame: np.ndarray, cmd: NavigationCommand, obstacles: List[Obstacle]) -> np.ndarray:
        """Add visual indicators for navigation planning"""
        height, width = frame.shape[:2]
        
        # Draw navigation state indicator
        state_color = {
            NavigationState.NORMAL_FORWARD: (0, 255, 0),
            NavigationState.OBSTACLE_AVOID_LEFT: (0, 255, 255),
            NavigationState.OBSTACLE_AVOID_RIGHT: (255, 255, 0),
            NavigationState.RETURNING_TO_PATH: (255, 0, 255),
            NavigationState.EMERGENCY_STOP: (0, 0, 255),
            NavigationState.SLOW_APPROACH: (0, 165, 255)
        }.get(cmd.state, (128, 128, 128))
        
        # Draw state indicator circle
        cv2.circle(frame, (width - 50, 50), 20, state_color, -1)
        
        # Draw direction arrow
        center_x, center_y = width // 2, height - 50
        if cmd.direction != 0:
            arrow_length = 40
            angle_rad = math.radians(cmd.direction)
            end_x = int(center_x + arrow_length * math.sin(angle_rad))
            end_y = int(center_y - arrow_length * math.cos(angle_rad))
            cv2.arrowedLine(frame, (center_x, center_y), (end_x, end_y), state_color, 3)
        
        # Draw obstacle risk zones
        for obstacle in obstacles:
            x, y = int(obstacle.x), int(obstacle.y)
            risk_colors = {
                'LOW': (0, 255, 0),
                'MEDIUM': (0, 255, 255),
                'HIGH': (0, 165, 255),
                'CRITICAL': (0, 0, 255)
            }
            color = risk_colors.get(obstacle.risk_level, (128, 128, 128))
            cv2.circle(frame, (x, y), 10, color, 2)
            
            # Add risk level text
            cv2.putText(frame, obstacle.risk_level[0], (x-5, y+5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
        
        return frame
    
    def create_enhanced_status_message(self, cmd: NavigationCommand, obstacles: List[Obstacle]) -> str:
        """Create enhanced status message for audio feedback"""
        if cmd.state == NavigationState.EMERGENCY_STOP:
            return "EMERGENCY STOP! Critical obstacle detected!"
        
        obstacle_count = len(obstacles)
        high_risk_count = len([obs for obs in obstacles if obs.risk_level in ['HIGH', 'CRITICAL']])
        
        if obstacle_count == 0:
            if self.avoidance_active:
                return "Path clear, returning to original route."
            return "All clear, proceeding forward."
        
        if cmd.state in [NavigationState.OBSTACLE_AVOID_LEFT, NavigationState.OBSTACLE_AVOID_RIGHT]:
            direction = "left" if "LEFT" in cmd.state.value else "right"
            return f"Avoiding {obstacle_count} obstacles, maneuvering {direction}."
        
        if cmd.state == NavigationState.RETURNING_TO_PATH:
            return "Obstacle cleared, returning to main path."
        
        return f"{obstacle_count} objects detected, {high_risk_count} require attention."
    
    def get_default_navigation(self, detections: List[Dict]) -> Dict:
        """Fallback navigation logic for compatibility"""
        detected_objects = [det['class'] for det in detections]
        
        # Human detection check
        if any('person' in obj.lower() for obj in detected_objects):
            return {
                "navigation_command": "EMERGENCY_STOP",
                "speed": 0.0,
                "risk_level": "CRITICAL",
                "reasoning": "Human detected",
                "detected_objects": detected_objects
            }
        
        # Default safe operation
        return {
            "navigation_command": "NORMAL_FORWARD",
            "speed": 0.8,
            "risk_level": "LOW", 
            "reasoning": "Path clear",
            "detected_objects": detected_objects
        }
    
    async def cleanup(self):
        """Clean up resources"""
        logger.info("🛑 Shutting down mining vision system...")
        self.is_running = False
        
        # Cleanup ESP32 controller
        if self.esp32_controller:
            await self.esp32_controller.disconnect()
        
        if self.esp32_monitor_task:
            self.esp32_monitor_task.cancel()
            try:
                await self.esp32_monitor_task
            except asyncio.CancelledError:
                pass
        
        if self.cap:
            self.cap.release()
        cv2.destroyAllWindows()
        
        if self.tts_engine:
            self.tts_engine.stop()
        
        logger.info("✅ Cleanup completed")

async def main():
    """Main entry point"""
    # Get API key from environment
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        logger.warning("⚠️  GEMINI_API_KEY not set. Using basic navigation only.")
    
    # Initialize and run system
    try:
        vision_system = OptimizedMiningVisionSystem(api_key)
        await vision_system.main_loop()
    except Exception as e:
        logger.error(f"System error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("🎯 Optimized Live API Mining Vision System")
    print("📹 Press 'q' to quit")
    print("🔊 Audio feedback enabled")
    print("⚡ Performance optimized for real-time processing")
    print("-" * 50)
    
    asyncio.run(main())