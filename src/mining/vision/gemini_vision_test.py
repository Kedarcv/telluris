#!/usr/bin/env python3
"""
Gemini AI Mining Vehicle Vision System
Integrates Google Gemini AI for intelligent obstacle detection and navigation decisions
"""

import cv2
import numpy as np
from ultralytics import YOLO
import time
import json
import base64
import io
from PIL import Image
import os
from datetime import datetime
import logging

# Import Gemini AI with fallback
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    genai = None
    logging.warning("google.generativeai not installed. Install with: pip install google-generativeai")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GeminiMiningVisionAI:
    def __init__(self):
        # Initialize YOLO model for initial object detection
        self.yolo_model = YOLO('yolov8n.pt')
        
        # Initialize Gemini AI
        self.setup_gemini()
        
        # Camera configuration
        self.camera_id = 0
        self.cap = None
        self.frame_width = 640
        self.frame_height = 480
        
        # AI Decision making
        self.current_decision = {"action": "idle", "reason": "initializing", "confidence": 0.0}
        self.last_gemini_analysis = time.time()
        self.gemini_analysis_interval = 2.0  # Analyze with Gemini every 2 seconds
        
        # Navigation state
        self.emergency_stop = False
        self.obstacle_detected = False
        self.last_human_detection = None
        
        logger.info("Gemini Mining Vision AI initialized")
    
    def setup_gemini(self):
        """Initialize Gemini AI with API key"""
        if not GEMINI_AVAILABLE:
            logger.warning("google.generativeai not installed. Using simulated AI responses.")
            self.gemini_available = False
            return
            
        try:
            # Try to get API key from environment variable
            api_key = os.getenv('GEMINI_API_KEY')
            
            if not api_key:
                # For testing purposes, you can set your API key here
                # NEVER commit real API keys to version control!
                api_key = "YOUR_GEMINI_API_KEY_HERE"
                logger.warning("Using hardcoded API key - set GEMINI_API_KEY environment variable instead")
            
            if api_key == "YOUR_GEMINI_API_KEY_HERE":
                logger.warning("No valid Gemini API key found. Using simulated AI responses.")
                self.gemini_available = False
                return
            
            genai.configure(api_key=api_key)
            
            # Initialize the Gemini model
            self.gemini_model = genai.GenerativeModel('gemini-1.5-flash')
            self.gemini_available = True
            
            logger.info("✅ Gemini AI initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Gemini AI: {e}")
            self.gemini_available = False
            logger.info("Falling back to simulated AI responses")
    
    def initialize_camera(self):
        """Initialize camera"""
        try:
            self.cap = cv2.VideoCapture(self.camera_id)
            if not self.cap.isOpened():
                logger.error(f"Failed to open camera {self.camera_id}")
                return False
            
            self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
            self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
            
            actual_width = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_height = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            logger.info(f"Camera initialized: {actual_width}x{actual_height}")
            return True
            
        except Exception as e:
            logger.error(f"Camera initialization error: {e}")
            return False
    
    def frame_to_base64(self, frame):
        """Convert OpenCV frame to base64 for Gemini AI"""
        try:
            # Convert BGR to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Convert to PIL Image
            pil_image = Image.fromarray(rgb_frame)
            
            # Convert to base64
            buffer = io.BytesIO()
            pil_image.save(buffer, format='JPEG', quality=85)
            img_str = base64.b64encode(buffer.getvalue()).decode()
            
            return img_str, pil_image
            
        except Exception as e:
            logger.error(f"Frame conversion error: {e}")
            return None, None
    
    def analyze_with_gemini(self, frame, yolo_detections):
        """Send frame to Gemini AI for intelligent analysis"""
        try:
            if not self.gemini_available:
                return self.simulate_gemini_response(yolo_detections)
            
            img_str, pil_image = self.frame_to_base64(frame)
            if not pil_image:
                return self.simulate_gemini_response(yolo_detections)
            
            # Convert numpy float32 to regular Python floats for JSON serialization
            serializable_detections = []
            for det in yolo_detections:
                serializable_det = {
                    'class': det['class'],
                    'confidence': float(det['confidence']),
                    'bbox': [float(x) for x in det['bbox']]
                }
                serializable_detections.append(serializable_det)
            
            # Create detailed prompt for mining vehicle navigation
            prompt = f"""
            You are an AI system for an autonomous mining vehicle. Analyze this camera image and make navigation decisions.
            
            YOLO Detection Results: {json.dumps(serializable_detections, indent=2)}
            
            Your task:
            1. Identify all obstacles, especially HUMANS/PEOPLE (highest priority)
            2. Assess the safety risk level (CRITICAL, HIGH, MEDIUM, LOW)
            3. Determine the best navigation action
            4. Provide reasoning for your decision
            
            Navigation Options:
            - EMERGENCY_STOP: Immediate stop for critical safety (humans detected)
            - AVOID_LEFT: Turn left to avoid obstacle
            - AVOID_RIGHT: Turn right to avoid obstacle  
            - SLOW_FORWARD: Proceed slowly with caution
            - NORMAL_FORWARD: Safe to proceed normally
            - STOP_AND_WAIT: Stop and wait for obstacle to clear
            
            Respond in JSON format:
            {{
                "human_detected": true/false,
                "obstacles_found": ["list of obstacles"],
                "risk_level": "CRITICAL/HIGH/MEDIUM/LOW",
                "navigation_action": "action from options above",
                "reasoning": "detailed explanation of decision",
                "confidence": 0.0-1.0,
                "recommended_speed": 0.0-1.0,
                "recommended_direction": "forward/left/right/stop"
            }}
            """
            
            # Send to Gemini
            response = self.gemini_model.generate_content([prompt, pil_image])
            
            # Parse response
            try:
                # Extract JSON from response
                response_text = response.text
                
                # Sometimes Gemini wraps JSON in markdown code blocks
                if "```json" in response_text:
                    json_start = response_text.find("```json") + 7
                    json_end = response_text.find("```", json_start)
                    response_text = response_text[json_start:json_end].strip()
                elif "```" in response_text:
                    json_start = response_text.find("```") + 3
                    json_end = response_text.find("```", json_start)
                    response_text = response_text[json_start:json_end].strip()
                
                gemini_decision = json.loads(response_text)
                
                logger.info(f"🤖 Gemini AI Decision: {gemini_decision['navigation_action']}")
                logger.info(f"💭 Reasoning: {gemini_decision['reasoning']}")
                
                return gemini_decision
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse Gemini response: {e}")
                logger.error(f"Raw response: {response.text}")
                return self.simulate_gemini_response(yolo_detections)
            
        except Exception as e:
            logger.error(f"Gemini AI analysis error: {e}")
            return self.simulate_gemini_response(yolo_detections)
    
    def simulate_gemini_response(self, yolo_detections):
        """Simulate Gemini AI response when API is not available"""
        human_detected = any(d['class_name'] == 'person' for d in yolo_detections)
        vehicle_detected = any(d['class_name'] in ['car', 'truck', 'bus'] for d in yolo_detections)
        
        obstacles = [d['class_name'] for d in yolo_detections]
        
        if human_detected:
            return {
                "human_detected": True,
                "obstacles_found": obstacles,
                "risk_level": "CRITICAL",
                "navigation_action": "EMERGENCY_STOP",
                "reasoning": "Human detected in mining vehicle path - immediate emergency stop required for safety",
                "confidence": 0.95,
                "recommended_speed": 0.0,
                "recommended_direction": "stop"
            }
        elif vehicle_detected:
            return {
                "human_detected": False,
                "obstacles_found": obstacles,
                "risk_level": "HIGH",
                "navigation_action": "AVOID_LEFT",
                "reasoning": "Vehicle detected - performing avoidance maneuver to the left",
                "confidence": 0.88,
                "recommended_speed": 0.3,
                "recommended_direction": "left"
            }
        elif obstacles:
            return {
                "human_detected": False,
                "obstacles_found": obstacles,
                "risk_level": "MEDIUM",
                "navigation_action": "SLOW_FORWARD",
                "reasoning": f"Objects detected ({', '.join(obstacles)}) - proceeding with caution",
                "confidence": 0.75,
                "recommended_speed": 0.5,
                "recommended_direction": "forward"
            }
        else:
            return {
                "human_detected": False,
                "obstacles_found": [],
                "risk_level": "LOW",
                "navigation_action": "NORMAL_FORWARD",
                "reasoning": "Path clear - safe to proceed at normal speed",
                "confidence": 0.92,
                "recommended_speed": 1.0,
                "recommended_direction": "forward"
            }
    
    def yolo_detect(self, frame):
        """Run YOLO detection on frame"""
        try:
            results = self.yolo_model(frame, conf=0.5)
            
            detections = []
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                        confidence = float(box.conf[0])
                        class_id = int(box.cls[0])
                        class_name = self.yolo_model.names[class_id]
                        
                        detection = {
                            'class_name': class_name,
                            'confidence': confidence,
                            'bbox': [int(x1), int(y1), int(x2), int(y2)],
                            'center': [(x1 + x2) / 2, (y1 + y2) / 2],
                            'size': [x2 - x1, y2 - y1]
                        }
                        detections.append(detection)
            
            return detections
            
        except Exception as e:
            logger.error(f"YOLO detection error: {e}")
            return []
    
    def convert_to_navigation_command(self, gemini_decision):
        """Convert Gemini decision to navigation command for mining vehicle"""
        action_map = {
            "EMERGENCY_STOP": {"linear": 0.0, "angular": 0.0},
            "AVOID_LEFT": {"linear": 0.3, "angular": 0.5},
            "AVOID_RIGHT": {"linear": 0.3, "angular": -0.5},
            "SLOW_FORWARD": {"linear": 0.2, "angular": 0.0},
            "NORMAL_FORWARD": {"linear": 0.5, "angular": 0.0},
            "STOP_AND_WAIT": {"linear": 0.0, "angular": 0.0}
        }
        
        nav_action = gemini_decision.get('navigation_action', 'STOP_AND_WAIT')
        speeds = action_map.get(nav_action, {"linear": 0.0, "angular": 0.0})
        
        return {
            "linear_speed": speeds["linear"],
            "angular_speed": speeds["angular"],
            "action": nav_action,
            "reasoning": gemini_decision.get('reasoning', 'No reasoning provided'),
            "confidence": gemini_decision.get('confidence', 0.0),
            "risk_level": gemini_decision.get('risk_level', 'UNKNOWN'),
            "human_detected": gemini_decision.get('human_detected', False),
            "obstacles": gemini_decision.get('obstacles_found', []),
            "timestamp": datetime.now().isoformat()
        }
    
    def draw_ai_analysis(self, frame, yolo_detections, gemini_decision, nav_command):
        """Draw AI analysis results on frame"""
        height, width = frame.shape[:2]
        
        # Draw YOLO detections
        for detection in yolo_detections:
            x1, y1, x2, y2 = detection['bbox']
            class_name = detection['class_name']
            confidence = detection['confidence']
            
            # Color based on object type
            if class_name == 'person':
                color = (0, 0, 255)  # Red for humans
            elif class_name in ['car', 'truck', 'bus']:
                color = (0, 165, 255)  # Orange for vehicles
            else:
                color = (0, 255, 0)  # Green for other objects
            
            # Draw bounding box
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            
            # Draw label
            label = f"{class_name}: {confidence:.2f}"
            cv2.putText(frame, label, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        
        # Draw Gemini AI decision panel
        panel_height = 200
        panel_color = (0, 0, 0)  # Black background
        cv2.rectangle(frame, (0, height - panel_height), (width, height), panel_color, -1)
        
        # Add border
        border_color = (100, 100, 100)
        cv2.rectangle(frame, (0, height - panel_height), (width, height), border_color, 2)
        
        # Risk level color
        risk_colors = {
            "CRITICAL": (0, 0, 255),    # Red
            "HIGH": (0, 165, 255),      # Orange  
            "MEDIUM": (0, 255, 255),    # Yellow
            "LOW": (0, 255, 0)          # Green
        }
        risk_color = risk_colors.get(gemini_decision.get('risk_level', 'UNKNOWN'), (128, 128, 128))
        
        # Draw AI info
        y_start = height - panel_height + 20
        line_height = 25
        
        # Title
        cv2.putText(frame, "🤖 GEMINI AI ANALYSIS", (10, y_start), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        # Risk level
        risk_text = f"Risk Level: {gemini_decision.get('risk_level', 'UNKNOWN')}"
        cv2.putText(frame, risk_text, (10, y_start + line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, risk_color, 2)
        
        # Navigation action
        action_text = f"Action: {nav_command['action']}"
        cv2.putText(frame, action_text, (10, y_start + 2*line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Human detection status
        human_status = "HUMAN DETECTED!" if gemini_decision.get('human_detected') else "No humans"
        human_color = (0, 0, 255) if gemini_decision.get('human_detected') else (0, 255, 0)
        cv2.putText(frame, human_status, (10, y_start + 3*line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, human_color, 2)
        
        # Confidence
        conf_text = f"Confidence: {gemini_decision.get('confidence', 0.0):.2f}"
        cv2.putText(frame, conf_text, (10, y_start + 4*line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Speed commands (right side)
        speed_text = f"Linear: {nav_command['linear_speed']:.1f} m/s"
        cv2.putText(frame, speed_text, (width//2, y_start + line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        angular_text = f"Angular: {nav_command['angular_speed']:.1f} rad/s"
        cv2.putText(frame, angular_text, (width//2, y_start + 2*line_height), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
        
        # Emergency stop indicator
        if nav_command['action'] == 'EMERGENCY_STOP':
            cv2.rectangle(frame, (width//2, y_start + 3*line_height - 20), 
                         (width - 10, y_start + 4*line_height), (0, 0, 255), -1)
            cv2.putText(frame, "EMERGENCY STOP!", (width//2 + 10, y_start + 4*line_height - 5), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        
        return frame
    
    def run_test(self):
        """Run the Gemini AI mining vehicle vision test"""
        logger.info("🚗 Starting Gemini AI Mining Vehicle Vision Test")
        
        if not self.initialize_camera():
            logger.error("❌ Failed to initialize camera")
            return
        
        if not self.gemini_available:
            logger.warning("⚠️  Running with simulated Gemini AI responses")
        else:
            logger.info("✅ Running with real Gemini AI")
        
        logger.info("📹 Camera feed active - testing AI obstacle detection")
        logger.info("🎯 Test scenarios:")
        logger.info("   1. Show your face → Should detect human and EMERGENCY STOP")
        logger.info("   2. Show toy car/object → Should detect and plan avoidance")
        logger.info("   3. Clear view → Should proceed forward normally")
        logger.info("   Press 'q' to quit")
        
        try:
            frame_count = 0
            while True:
                ret, frame = self.cap.read()
                if not ret:
                    logger.error("Failed to read camera frame")
                    break
                
                frame_count += 1
                
                # Run YOLO detection every frame
                yolo_detections = self.yolo_detect(frame)
                
                # Run Gemini AI analysis every few seconds or when new objects detected
                current_time = time.time()
                should_analyze = (
                    current_time - self.last_gemini_analysis > self.gemini_analysis_interval or
                    any(d['class_name'] == 'person' for d in yolo_detections)  # Immediate analysis for humans
                )
                
                if should_analyze:
                    gemini_decision = self.analyze_with_gemini(frame, yolo_detections)
                    self.current_decision = gemini_decision
                    self.last_gemini_analysis = current_time
                    
                    # Log important decisions
                    if gemini_decision.get('human_detected'):
                        logger.warning("🚨 HUMAN DETECTED - Emergency protocols activated!")
                        self.last_human_detection = current_time
                    
                    if gemini_decision.get('risk_level') in ['CRITICAL', 'HIGH']:
                        logger.warning(f"⚠️  {gemini_decision['risk_level']} RISK: {gemini_decision['reasoning']}")
                
                # Convert to navigation command
                nav_command = self.convert_to_navigation_command(self.current_decision)
                
                # Update emergency stop status
                self.emergency_stop = (nav_command['action'] == 'EMERGENCY_STOP')
                
                # Draw analysis on frame
                annotated_frame = self.draw_ai_analysis(frame, yolo_detections, self.current_decision, nav_command)
                
                # Display frame
                cv2.imshow('Gemini AI Mining Vehicle Vision Test', annotated_frame)
                
                # Log navigation commands periodically
                if frame_count % 60 == 0:  # Every 2 seconds at 30fps
                    logger.info(f"🧭 Navigation: {nav_command['action']} | "
                               f"Speed: {nav_command['linear_speed']:.1f}m/s | "
                               f"Risk: {self.current_decision.get('risk_level', 'UNKNOWN')}")
                
                # Check for quit
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    logger.info("Test terminated by user")
                    break
        
        except KeyboardInterrupt:
            logger.info("Test interrupted by user")
        except Exception as e:
            logger.error(f"Test error: {e}")
        finally:
            if self.cap:
                self.cap.release()
            cv2.destroyAllWindows()
            logger.info("🏁 Gemini AI Mining Vehicle Vision Test completed")

def main():
    """Main function"""
    print("🤖 GEMINI AI MINING VEHICLE VISION TEST")
    print("=" * 50)
    print("This test integrates Google Gemini AI with YOLO detection")
    print("to create intelligent mining vehicle navigation decisions.")
    print("=" * 50)
    print()
    print("📋 What this test demonstrates:")
    print("✓ Real-time object detection with YOLO")
    print("✓ Gemini AI analysis of camera feed")  
    print("✓ Intelligent navigation decision making")
    print("✓ Human detection with emergency stop")
    print("✓ Obstacle avoidance planning")
    print("✓ Risk assessment and reasoning")
    print()
    print("🎯 Try these scenarios:")
    print("1. Show your face → AI detects human, triggers emergency stop")
    print("2. Show objects → AI analyzes and plans avoidance")
    print("3. Clear camera → AI decides safe forward movement")
    print()
    
    # Check for API key
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key or api_key == "YOUR_GEMINI_API_KEY_HERE":
        print("⚠️  GEMINI_API_KEY not set - using simulated AI responses")
        print("   To use real Gemini AI: export GEMINI_API_KEY='your-api-key'")
        print()
    else:
        print("✅ Gemini API key found - using real AI analysis")
        print()
    
    input("Press Enter to start the test...")
    
    # Create and run the vision system
    ai_system = GeminiMiningVisionAI()
    ai_system.run_test()

if __name__ == "__main__":
    main()