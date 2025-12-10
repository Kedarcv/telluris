#!/usr/bin/env python3
"""
Live API Mining Vision System with Audio Transcription
Integrates Gemini Live API with YOLO vision for mining vehicle navigation
Provides real-time audio feedback about what it sees and its decisions
"""

import asyncio
import json
import logging
import os
import sys
import traceback
import base64
import io
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import threading
import queue
import time

# Computer Vision and ML
import cv2
import numpy as np
from PIL import Image
import torch
from ultralytics import YOLO

# Audio (with fallback handling)
try:
    import pyaudio
    PYAUDIO_AVAILABLE = True
except ImportError:
    PYAUDIO_AVAILABLE = False
    print("⚠️  PyAudio not installed. Audio input disabled.")

try:
    import pyttsx3
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False
    print("⚠️  pyttsx3 not installed. Text-to-speech disabled.")

# Google Gemini Live API
try:
    import google.generativeai as genai
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️  google-generativeai not installed. Install with: pip install google-generativeai")

# WebSocket for ESP32 communication
try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    print("⚠️  websocket-client not installed. ESP32 communication disabled.")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AudioManager:
    """Manages audio input/output for the live API system"""
    
    def __init__(self):
        self.tts_available = TTS_AVAILABLE
        self.pyaudio_available = PYAUDIO_AVAILABLE
        
        if self.pyaudio_available:
            self.audio_format = pyaudio.paInt16
            self.channels = 1
            self.sample_rate = 16000  # 16kHz for Gemini
            self.chunk_size = 1024
            self.pyaudio_instance = pyaudio.PyAudio()
        
        # Text-to-speech for local announcements
        if self.tts_available:
            self.tts_engine = pyttsx3.init()
            self.tts_engine.setProperty('rate', 180)
            self.tts_engine.setProperty('volume', 0.8)
            self.tts_lock = threading.Lock()
        else:
            self.tts_lock = None
        
        # Audio queues
        self.audio_input_queue = queue.Queue()
        self.audio_output_queue = queue.Queue()
        
        self.recording = False
        self.playing = False
        
    def initialize_microphone(self):
        """Initialize microphone for audio input"""
        if not self.pyaudio_available:
            logger.warning("PyAudio not available - microphone disabled")
            return True
        
        try:
            self.stream = self.pyaudio_instance.open(
                format=self.audio_format,
                channels=self.channels,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=self.chunk_size,
                stream_callback=self._audio_input_callback
            )
            logger.info("🎤 Microphone initialized")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize microphone: {e}")
            return False
    
    def _audio_input_callback(self, in_data, frame_count, time_info, status):
        """Callback for audio input stream"""
        if self.recording:
            self.audio_input_queue.put(in_data)
        return (None, pyaudio.paContinue)
    
    def start_recording(self):
        """Start recording audio"""
        if not self.pyaudio_available:
            return
        
        self.recording = True
        if hasattr(self, 'stream'):
            self.stream.start_stream()
            logger.info("🎤 Started recording")
    
    def stop_recording(self):
        """Stop recording audio"""
        if not self.pyaudio_available:
            return
        
        self.recording = False
        if hasattr(self, 'stream'):
            self.stream.stop_stream()
            logger.info("🎤 Stopped recording")
    
    def speak_text(self, text: str):
        """Convert text to speech and play it with thread safety"""
        if not self.tts_available or not self.tts_lock:
            logger.info(f"📢 Would speak: {text}")
            return
        
        try:
            with self.tts_lock:
                logger.info(f"🔊 Speaking: {text}")
                self.tts_engine.say(text)
                self.tts_engine.runAndWait()
        except Exception as e:
            logger.error(f"TTS error: {e}")
    
    def speak_async(self, text: str):
        """Speak text in a separate thread to avoid blocking"""
        thread = threading.Thread(target=self.speak_text, args=(text,))
        thread.daemon = True
        thread.start()
    
    def cleanup(self):
        """Clean up audio resources"""
        if self.pyaudio_available and hasattr(self, 'stream'):
            self.stream.close()
            self.pyaudio_instance.terminate()

class LiveAPIMiningVision:
    """Main class for Live API Mining Vision System"""
    
    def __init__(self):
        self.camera = None
        self.yolo_model = None
        self.gemini_model = None
        self.audio_manager = AudioManager()
        
        # Vision processing
        self.frame_width = 640
        self.frame_height = 480
        
        # Navigation state
        self.current_navigation = {
            'command': 'NORMAL_FORWARD',
            'speed': 0.5,
            'risk_level': 'LOW',
            'reasoning': 'System initializing'
        }
        
        # Audio transcription
        self.last_spoken_detection = ""
        self.last_spoken_time = 0
        self.speech_cooldown = 3.0  # seconds
        
        # ESP32 WebSocket
        self.esp32_ws = None
        self.esp32_connected = False
        
    def initialize_components(self):
        """Initialize all system components"""
        logger.info("🚀 Initializing Live API Mining Vision System")
        
        # Initialize audio
        if not self.audio_manager.initialize_microphone():
            logger.warning("Audio system initialization failed - continuing without audio")
        
        # Initialize camera
        if not self.initialize_camera():
            logger.error("Failed to initialize camera")
            return False
        
        # Initialize YOLO
        if not self.initialize_yolo():
            logger.error("Failed to initialize YOLO")
            return False
        
        # Initialize Gemini
        if not self.initialize_gemini():
            logger.warning("Gemini API not available - using fallback responses")
        
        # Initialize ESP32 connection
        if WEBSOCKET_AVAILABLE:
            self.initialize_esp32_connection()
        
        logger.info("✅ All components initialized successfully")
        return True
    
    def initialize_camera(self):
        """Initialize camera capture"""
        try:
            self.camera = cv2.VideoCapture(0)
            self.camera.set(cv2.CAP_PROP_FRAME_WIDTH, self.frame_width)
            self.camera.set(cv2.CAP_PROP_FRAME_HEIGHT, self.frame_height)
            self.camera.set(cv2.CAP_PROP_FPS, 30)
            self.camera.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Minimize latency
            
            if not self.camera.isOpened():
                raise Exception("Cannot open camera")
            
            logger.info("📹 Camera initialized")
            return True
        except Exception as e:
            logger.error(f"Camera initialization failed: {e}")
            return False
    
    def initialize_yolo(self):
        """Initialize YOLO model"""
        try:
            self.yolo_model = YOLO('yolo11n.pt')
            logger.info("🔍 YOLO model loaded")
            return True
        except Exception as e:
            logger.error(f"YOLO initialization failed: {e}")
            return False
    
    def initialize_gemini(self):
        """Initialize Gemini API"""
        try:
            if not GEMINI_AVAILABLE:
                logger.warning("Gemini API not available")
                return False
            
            api_key = os.getenv('GEMINI_API_KEY') or os.getenv('REACT_APP_GEMINI_API_KEY')
            if not api_key:
                logger.error("No Gemini API key found in environment variables")
                return False
            
            genai.configure(api_key=api_key)
            self.gemini_model = genai.GenerativeModel('gemini-2.0-flash')
            
            logger.info("🤖 Gemini API initialized")
            return True
        except Exception as e:
            logger.error(f"Gemini API initialization failed: {e}")
            return False
    
    def initialize_esp32_connection(self):
        """Initialize WebSocket connection to ESP32"""
        try:
            esp32_url = os.getenv('REACT_APP_ESP32_WS_URL', 'ws://localhost:8080/esp32')
            logger.info(f"🔌 Connecting to ESP32 at {esp32_url}")
            
            def on_message(ws, message):
                try:
                    data = json.loads(message)
                    logger.info(f"ESP32 data: {data}")
                except Exception as e:
                    logger.error(f"ESP32 message error: {e}")
            
            def on_error(ws, error):
                logger.error(f"ESP32 WebSocket error: {error}")
                self.esp32_connected = False
            
            def on_close(ws, close_status_code, close_msg):
                logger.info("ESP32 WebSocket connection closed")
                self.esp32_connected = False
            
            def on_open(ws):
                logger.info("✅ ESP32 WebSocket connection opened")
                self.esp32_connected = True
            
            self.esp32_ws = websocket.WebSocketApp(
                esp32_url,
                on_message=on_message,
                on_error=on_error,
                on_close=on_close,
                on_open=on_open
            )
            
            # Start WebSocket in background thread
            ws_thread = threading.Thread(target=self.esp32_ws.run_forever)
            ws_thread.daemon = True
            ws_thread.start()
            
        except Exception as e:
            logger.error(f"ESP32 connection failed: {e}")
    
    def send_esp32_command(self, command: Dict[str, Any]):
        """Send navigation command to ESP32"""
        try:
            if self.esp32_connected and self.esp32_ws:
                message = json.dumps(command)
                self.esp32_ws.send(message)
                logger.info(f"📡 Sent to ESP32: {command}")
            else:
                logger.debug(f"📡 Would send to ESP32: {command}")
        except Exception as e:
            logger.error(f"Failed to send ESP32 command: {e}")
    
    def process_frame_with_yolo(self, frame):
        """Process frame with YOLO detection"""
        try:
            results = self.yolo_model(frame)
            detections = []
            
            for result in results:
                boxes = result.boxes
                if boxes is not None:
                    for box in boxes:
                        cls_id = int(box.cls[0])
                        confidence = float(box.conf[0])
                        bbox = box.xyxy[0].tolist()
                        
                        # Get class name
                        class_name = self.yolo_model.names.get(cls_id, f'class_{cls_id}')
                        
                        if confidence > 0.5:  # Confidence threshold
                            detection = {
                                'class': class_name,
                                'confidence': confidence,
                                'bbox': bbox,
                                'class_id': cls_id
                            }
                            detections.append(detection)
            
            return detections
        except Exception as e:
            logger.error(f"YOLO processing error: {e}")
            return []
    
    def frame_to_base64(self, frame):
        """Convert frame to base64 for Gemini"""
        try:
            _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            image_base64 = base64.b64encode(buffer).decode('utf-8')
            
            # Convert to PIL Image for Gemini
            pil_image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            
            return image_base64, pil_image
        except Exception as e:
            logger.error(f"Frame conversion error: {e}")
            return None, None
    
    def get_quick_navigation_decision(self, detections):
        """Fast local navigation decision between Gemini API calls"""
        if not detections:
            return {
                'action': 'continue',
                'direction': 'forward',
                'speed': 0.5,
                'confidence': 0.7,
                'navigation_command': 'NORMAL_FORWARD',
                'reason': 'No obstacles detected - continuing forward'
            }
        
        # Simple obstacle avoidance logic
        obstacle_detected = any(det['confidence'] > 0.5 for det in detections)
        if obstacle_detected:
            return {
                'action': 'stop',
                'direction': 'none',
                'speed': 0.0,
                'confidence': 0.8,
                'navigation_command': 'EMERGENCY_STOP',
                'reason': 'Obstacle detected - stopping for safety'
            }
        
        return {
            'action': 'continue',
            'direction': 'forward', 
            'speed': 0.3,
            'confidence': 0.6,
            'navigation_command': 'SLOW_FORWARD',
            'reason': 'Clear path detected'
        }
    
    def analyze_with_gemini(self, frame, detections):
        """Analyze frame with Gemini API"""
        try:
            if not self.gemini_model:
                return self.simulate_gemini_response(detections)
            
            image_base64, pil_image = self.frame_to_base64(frame)
            if not pil_image:
                return self.simulate_gemini_response(detections)
            
            # Create prompt for mining vehicle analysis
            detection_summary = json.dumps([
                {'class': d['class'], 'confidence': round(d['confidence'], 2)} 
                for d in detections
            ], indent=2)
            
            prompt = f"""
You are an AI safety controller for an autonomous mining vehicle. Analyze the camera feed and provide both spoken commentary and navigation decisions.

Current detections: {detection_summary}

Tasks:
1. Describe what you see in the mining environment
2. Identify any safety hazards, especially HUMANS/PEOPLE (critical priority)
3. Make navigation decisions
4. Speak your observations clearly for the mining crew

Navigation commands:
- EMERGENCY_STOP: Immediate stop (humans detected)
- AVOID_LEFT: Turn left around obstacle
- AVOID_RIGHT: Turn right around obstacle
- SLOW_FORWARD: Proceed with caution
- NORMAL_FORWARD: Safe to proceed normally
- STOP_AND_WAIT: Stop and wait for clearance

Respond with JSON format:
{{
  "navigation_command": "COMMAND",
  "speed": 0.5,
  "risk_level": "LOW/MEDIUM/HIGH/CRITICAL",
  "reasoning": "Brief explanation",
  "spoken_description": "What to announce to mining crew"
}}
"""
            
            # Send to Gemini
            response = self.gemini_model.generate_content([prompt, pil_image])
            
            # Process response
            decision = {
                'navigation_command': 'NORMAL_FORWARD',
                'speed': 0.5,
                'risk_level': 'LOW',
                'reasoning': 'Gemini API analysis',
                'spoken_description': 'Mining area appears clear'
            }
            
            # Extract JSON from response
            if response.text:
                try:
                    # Look for JSON in response
                    response_text = response.text
                    if "```json" in response_text:
                        json_start = response_text.find("```json") + 7
                        json_end = response_text.find("```", json_start)
                        response_text = response_text[json_start:json_end].strip()
                    elif "```" in response_text:
                        json_start = response_text.find("```") + 3
                        json_end = response_text.find("```", json_start)
                        response_text = response_text[json_start:json_end].strip()
                    
                    parsed = json.loads(response_text)
                    decision.update(parsed)
                except json.JSONDecodeError:
                    decision['reasoning'] = response.text[:200]
            
            return decision
            
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            return self.simulate_gemini_response(detections)
    
    def simulate_gemini_response(self, detections):
        """Simulate Gemini response when API is not available"""
        human_detected = any(d['class'] == 'person' for d in detections)
        
        if human_detected:
            return {
                'navigation_command': 'EMERGENCY_STOP',
                'speed': 0.0,
                'risk_level': 'CRITICAL',
                'reasoning': 'Human detected in mining vehicle path',
                'spoken_description': 'Alert! Human detected ahead. Emergency stop activated for safety.'
            }
        elif detections:
            objects = [d['class'] for d in detections]
            unique_objects = list(set(objects))
            return {
                'navigation_command': 'SLOW_FORWARD',
                'speed': 0.3,
                'risk_level': 'MEDIUM',
                'reasoning': f'Objects detected: {", ".join(unique_objects)}',
                'spoken_description': f'I can see {len(objects)} objects: {", ".join(unique_objects)}. Proceeding with caution.'
            }
        else:
            return {
                'navigation_command': 'NORMAL_FORWARD',
                'speed': 0.5,
                'risk_level': 'LOW',
                'reasoning': 'Clear path detected',
                'spoken_description': 'Mining tunnel appears clear. Proceeding at normal speed.'
            }
    
    def should_speak(self, description: str) -> bool:
        """Determine if we should speak based on cooldown and content change"""
        current_time = time.time()
        
        # Check cooldown
        if current_time - self.last_spoken_time < self.speech_cooldown:
            return False
        
        # Check if content significantly changed
        if description == self.last_spoken_detection:
            return False
        
        return True
    
    def handle_audio_feedback(self, decision: Dict[str, Any]):
        """Handle audio feedback for detections and navigation"""
        try:
            spoken_description = decision.get('spoken_description', '')
            
            if self.should_speak(spoken_description):
                self.audio_manager.speak_async(spoken_description)
                self.last_spoken_detection = spoken_description
                self.last_spoken_time = time.time()
                
                # Also announce navigation command if critical
                if decision['risk_level'] == 'CRITICAL':
                    nav_announcement = f"Navigation command: {decision['navigation_command']}"
                    self.audio_manager.speak_async(nav_announcement)
        except Exception as e:
            logger.error(f"Audio feedback error: {e}")
    
    def update_navigation_state(self, decision: Dict[str, Any]):
        """Update current navigation state and send to ESP32"""
        self.current_navigation = {
            'command': decision['navigation_command'],
            'speed': decision['speed'],
            'risk_level': decision['risk_level'],
            'reasoning': decision['reasoning']
        }
        
        # Send to ESP32
        esp32_command = {
            'type': 'navigation',
            'command': decision['navigation_command'],
            'speed': decision['speed'],
            'timestamp': datetime.now().isoformat()
        }
        
        self.send_esp32_command(esp32_command)
        
        # Log navigation decision
        risk_emoji = {
            'LOW': '🟢', 
            'MEDIUM': '🟡', 
            'HIGH': '🟠', 
            'CRITICAL': '🔴'
        }.get(decision['risk_level'], '⚪')
        
        logger.info(
            f"🧭 Navigation: {decision['navigation_command']} | "
            f"Speed: {decision['speed']}m/s | "
            f"Risk: {decision['risk_level']} {risk_emoji}"
        )
    
    def run_main_loop(self):
        """Main processing loop with performance optimizations"""
        logger.info("🚀 Starting Live API Mining Vision main loop")
        
        frame_count = 0
        last_gemini_call = 0
        gemini_call_interval = 2.0  # Call Gemini every 2 seconds for performance
        
        try:
            while True:
                ret, frame = self.camera.read()
                if not ret:
                    logger.error("Failed to read frame from camera")
                    break
                
                frame_count += 1
                current_time = time.time()
                
                # Process with YOLO
                detections = self.process_frame_with_yolo(frame)
                
                # Rate-limited Gemini API calls for performance
                if current_time - last_gemini_call >= gemini_call_interval:
                    decision = self.analyze_with_gemini(frame, detections)
                    last_gemini_call = current_time
                else:
                    # Use fast local logic between Gemini calls
                    decision = self.get_quick_navigation_decision(detections)
                
                # Handle audio feedback
                self.handle_audio_feedback(decision)
                
                # Update navigation
                self.update_navigation_state(decision)
                
                # Draw detections on frame for display
                for detection in detections:
                    bbox = detection['bbox']
                    x1, y1, x2, y2 = map(int, bbox)
                    class_name = detection['class']
                    confidence = detection['confidence']
                    
                    # Color coding: red for humans, yellow for vehicles, green for others
                    if class_name == 'person':
                        color = (0, 0, 255)  # Red
                    elif class_name in ['car', 'truck', 'bus']:
                        color = (0, 255, 255)  # Yellow
                    else:
                        color = (0, 255, 0)  # Green
                    
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
                    cv2.putText(frame, f"{class_name}: {confidence:.2f}", 
                              (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                
                # Add navigation info overlay
                nav_text = (
                    f"Nav: {self.current_navigation['command']} | "
                    f"Speed: {self.current_navigation['speed']}m/s | "
                    f"Risk: {self.current_navigation['risk_level']}"
                )
                
                cv2.putText(frame, nav_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                cv2.putText(frame, nav_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
                
                # Display frame with reduced frequency for performance
                if frame_count % 2 == 0:  # Display every other frame
                    cv2.imshow('Live API Mining Vision', frame)
                
                # Exit on 'q' press
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                
                # Performance monitoring
                if frame_count % 30 == 0:
                    logger.info(f"📊 Frame {frame_count} processed")
                
                # Reduced delay for better performance
                time.sleep(0.05)  # Reduced from 0.1 to 0.05
                
        except KeyboardInterrupt:
            logger.info("System interrupted by user")
        except Exception as e:
            logger.error(f"Main loop error: {e}")
            traceback.print_exc()
        finally:
            self.cleanup()
    
    def cleanup(self):
        """Clean up system resources"""
        logger.info("🧹 Cleaning up Live API Mining Vision System")
        
        try:
            if self.camera:
                self.camera.release()
            
            cv2.destroyAllWindows()
            
            if self.audio_manager:
                self.audio_manager.cleanup()
            
            if self.esp32_ws:
                self.esp32_ws.close()
            
            logger.info("✅ Cleanup completed")
        except Exception as e:
            logger.error(f"Cleanup error: {e}")

def main():
    """Main entry point"""
    system = LiveAPIMiningVision()
    
    if system.initialize_components():
        # Start audio recording for live interaction
        system.audio_manager.start_recording()
        
        # Welcome message
        system.audio_manager.speak_async(
            "Live API Mining Vision System activated. Monitoring mining environment for safety."
        )
        
        # Run main loop
        system.run_main_loop()
    else:
        logger.error("Failed to initialize system")
        sys.exit(1)

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("\n🏁 Live API Mining Vision System stopped")
    except Exception as e:
        logger.error(f"System error: {e}")
        traceback.print_exc()
        sys.exit(1)