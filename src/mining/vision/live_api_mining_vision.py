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

# Audio
import pyaudio
import wave
import pyttsx3
from pydub import AudioSegment
from pydub.playback import play

# Google Gemini Live API
try:
    import google.generativeai as genai
    from google.generativeai.types import LiveClient, LiveClientOptions
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    print("⚠️  google-generativeai not installed. Install with: pip install google-generativeai")

# WebSocket for ESP32 communication
import websocket
import ssl

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AudioManager:
    """Manages audio input/output for the live API system"""
    
    def __init__(self):
        self.audio_format = pyaudio.paInt16
        self.channels = 1
        self.sample_rate = 16000  # 16kHz for Gemini
        self.chunk_size = 1024
        self.pyaudio_instance = pyaudio.PyAudio()
        
        # Text-to-speech for local announcements
        self.tts_engine = pyttsx3.init()
        self.tts_engine.setProperty('rate', 180)
        self.tts_engine.setProperty('volume', 0.8)
        
        # Audio queues
        self.audio_input_queue = queue.Queue()
        self.audio_output_queue = queue.Queue()
        
        self.recording = False
        self.playing = False
        
    def initialize_microphone(self):
        """Initialize microphone for audio input"""
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
        self.recording = True
        if hasattr(self, 'stream'):
            self.stream.start_stream()
            logger.info("🎤 Started recording")
    
    def stop_recording(self):
        """Stop recording audio"""
        self.recording = False
        if hasattr(self, 'stream'):
            self.stream.stop_stream()
            logger.info("🎤 Stopped recording")
    
    def speak_text(self, text: str):
        """Convert text to speech and play it"""
        try:
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
        if hasattr(self, 'stream'):
            self.stream.close()
        self.pyaudio_instance.terminate()

class LiveAPIMiningVision:
    """Main class for Live API Mining Vision System"""
    
    def __init__(self):
        self.camera = None
        self.yolo_model = None
        self.gemini_client = None
        self.audio_manager = AudioManager()
        
        # Vision processing
        self.frame_width = 640
        self.frame_height = 480
        self.detection_classes = {
            'person': 0, 'bicycle': 1, 'car': 2, 'motorcycle': 3, 'airplane': 4,
            'bus': 5, 'train': 6, 'truck': 7, 'boat': 8, 'traffic light': 9,
            'fire hydrant': 10, 'stop sign': 11, 'parking meter': 12, 'bench': 13,
            'bird': 14, 'cat': 15, 'dog': 16, 'horse': 17, 'sheep': 18, 'cow': 19
        }
        
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
        
        self.initialize_components()
    
    def initialize_components(self):
        """Initialize all system components"""
        logger.info("🚀 Initializing Live API Mining Vision System")
        
        # Initialize audio
        if not self.audio_manager.initialize_microphone():
            logger.error("Failed to initialize audio system")
            return False
        
        # Initialize camera
        if not self.initialize_camera():
            logger.error("Failed to initialize camera")
            return False
        
        # Initialize YOLO
        if not self.initialize_yolo():
            logger.error("Failed to initialize YOLO")
            return False
        
        # Initialize Gemini Live API
        if not self.initialize_gemini_live():
            logger.error("Failed to initialize Gemini Live API")
            return False
        
        # Initialize ESP32 connection
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
    
    def initialize_gemini_live(self):
        """Initialize Gemini Live API client"""
        try:
            if not GEMINI_AVAILABLE:
                logger.error("Gemini API not available")
                return False
            
            api_key = os.getenv('GEMINI_API_KEY') or os.getenv('REACT_APP_GEMINI_API_KEY')
            if not api_key:
                logger.error("No Gemini API key found in environment variables")
                return False
            
            genai.configure(api_key=api_key)
            
            # Initialize live client with audio capabilities
            self.gemini_client = genai.live_model.LiveClient(
                model="gemini-2.0-flash-exp",
                config={
                    "responseModalities": ["AUDIO", "TEXT"],
                    "speechConfig": {
                        "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": "Aoede"}}
                    }
                }
            )
            
            logger.info("🤖 Gemini Live API initialized")
            return True
        except Exception as e:
            logger.error(f"Gemini Live API initialization failed: {e}")
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
    
    async def analyze_with_gemini_live(self, frame, detections):
        """Analyze frame with Gemini Live API"""
        try:
            if not self.gemini_client:
            return self.simulate_gemini_response(detections)
            
            image_base64, pil_image = self.frame_to_base64(frame)
            if not pil_image:
            return self.simulate_gemini_response(detections)
            
            # Create prompt for mining vehicle analysis
            prompt = f"""
            You are an AI safety controller for an autonomous mining vehicle. Analyze the camera feed and provide both spoken commentary and navigation decisions.
            
            Current detections: {json.dumps([{'class': d['class'], 'confidence': round(d['confidence'], 2)} for d in detections], indent=2)}
            
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
            
            Provide both audio commentary and a JSON decision.
            """
            
            # Send image and prompt to Gemini Live
            response = await self.gemini_client.send_message([
            {"text": prompt},
            {"image": pil_image}
            ])
            
            # Process response
            decision = {
            'navigation_command': 'NORMAL_FORWARD',
            'speed': 0.5,
            'risk_level': 'LOW',
            'reasoning': 'Gemini Live API analysis',
            'spoken_description': 'Mining area appears clear'
            }
            
            # Extract navigation decision from response if available
            if hasattr(response, 'text') and response.text:
            try:
                # Try to parse JSON from response
                if '{' in response.text:
                json_start = response.text.find('{')
                json_end = response.text.rfind('}') + 1
                json_str = response.text[json_start:json_end]
                parsed = json.loads(json_str)
                decision.update(parsed)
            except:
                decision['reasoning'] = response.text[:200]
            
            return decision
            
        except Exception as e:
            logger.error(f"Gemini Live API error: {e}")
            return self.simulate_gemini_response(detections)
            if not self.gemini_client:
                return self.simulate_gemini_response(detections)
            
            image_base64, pil_image = self.frame_to_base64(frame)
            if not pil_image:
                return self.simulate_gemini_response(detections)
            
            # Create prompt for mining vehicle analysis
            prompt = f\"\"\"\n            You are an AI safety controller for an autonomous mining vehicle. Analyze the camera feed and provide both spoken commentary and navigation decisions.\n            \n            Current detections: {json.dumps([{'class': d['class'], 'confidence': round(d['confidence'], 2)} for d in detections], indent=2)}\n            \n            Tasks:\n            1. Describe what you see in the mining environment\n            2. Identify any safety hazards, especially HUMANS/PEOPLE (critical priority)\n            3. Make navigation decisions\n            4. Speak your observations clearly for the mining crew\n            \n            Navigation commands:\n            - EMERGENCY_STOP: Immediate stop (humans detected)\n            - AVOID_LEFT: Turn left around obstacle\n            - AVOID_RIGHT: Turn right around obstacle\n            - SLOW_FORWARD: Proceed with caution\n            - NORMAL_FORWARD: Safe to proceed normally\n            - STOP_AND_WAIT: Stop and wait for clearance\n            \n            Provide both audio commentary and a JSON decision.\n            \"\"\"\n            \n            # Send image and prompt to Gemini Live\n            response = await self.gemini_client.send_message([\n                {\"text\": prompt},\n                {\"image\": pil_image}\n            ])\n            \n            # Process response\n            decision = {\n                'navigation_command': 'NORMAL_FORWARD',\n                'speed': 0.5,\n                'risk_level': 'LOW',\n                'reasoning': 'Gemini Live API analysis',\n                'spoken_description': 'Mining area appears clear'\n            }\n            \n            # Extract navigation decision from response if available\n            if hasattr(response, 'text') and response.text:\n                try:\n                    # Try to parse JSON from response\n                    if '{' in response.text:\n                        json_start = response.text.find('{')\n                        json_end = response.text.rfind('}') + 1\n                        json_str = response.text[json_start:json_end]\n                        parsed = json.loads(json_str)\n                        decision.update(parsed)\n                except:\n                    decision['reasoning'] = response.text[:200]\n            \n            return decision\n            \n        except Exception as e:\n            logger.error(f\"Gemini Live API error: {e}\")\n            return self.simulate_gemini_response(detections)\n    \n    def simulate_gemini_response(self, detections):\n        \"\"\"Simulate Gemini response when API is not available\"\"\"\n        human_detected = any(d['class'] == 'person' for d in detections)\n        \n        if human_detected:\n            return {\n                'navigation_command': 'EMERGENCY_STOP',\n                'speed': 0.0,\n                'risk_level': 'CRITICAL',\n                'reasoning': 'Human detected in mining vehicle path',\n                'spoken_description': 'Alert! Human detected ahead. Emergency stop activated for safety.'\n            }\n        elif detections:\n            objects = [d['class'] for d in detections]\n            return {\n                'navigation_command': 'SLOW_FORWARD',\n                'speed': 0.3,\n                'risk_level': 'MEDIUM',\n                'reasoning': f'Objects detected: {\", \".join(objects)}',\n                'spoken_description': f'I can see {len(objects)} objects: {\", \".join(set(objects))}. Proceeding with caution.'\n            }\n        else:\n            return {\n                'navigation_command': 'NORMAL_FORWARD',\n                'speed': 0.5,\n                'risk_level': 'LOW',\n                'reasoning': 'Clear path detected',\n                'spoken_description': 'Mining tunnel appears clear. Proceeding at normal speed.'\n            }\n    \n    def should_speak(self, description: str) -> bool:\n        \"\"\"Determine if we should speak based on cooldown and content change\"\"\"\n        current_time = time.time()\n        \n        # Check cooldown\n        if current_time - self.last_spoken_time < self.speech_cooldown:\n            return False\n        \n        # Check if content significantly changed\n        if description == self.last_spoken_detection:\n            return False\n        \n        return True\n    \n    def handle_audio_feedback(self, decision: Dict[str, Any]):\n        \"\"\"Handle audio feedback for detections and navigation\"\"\"\n        try:\n            spoken_description = decision.get('spoken_description', '')\n            \n            if self.should_speak(spoken_description):\n                self.audio_manager.speak_async(spoken_description)\n                self.last_spoken_detection = spoken_description\n                self.last_spoken_time = time.time()\n                \n                # Also announce navigation command if critical\n                if decision['risk_level'] == 'CRITICAL':\n                    self.audio_manager.speak_async(f\"Navigation command: {decision['navigation_command']}\")\n        except Exception as e:\n            logger.error(f\"Audio feedback error: {e}\")\n    \n    def update_navigation_state(self, decision: Dict[str, Any]):\n        \"\"\"Update current navigation state and send to ESP32\"\"\"\n        self.current_navigation = {\n            'command': decision['navigation_command'],\n            'speed': decision['speed'],\n            'risk_level': decision['risk_level'],\n            'reasoning': decision['reasoning']\n        }\n        \n        # Send to ESP32\n        esp32_command = {\n            'type': 'navigation',\n            'command': decision['navigation_command'],\n            'speed': decision['speed'],\n            'timestamp': datetime.now().isoformat()\n        }\n        \n        self.send_esp32_command(esp32_command)\n        \n        # Log navigation decision\n        risk_emoji = {'LOW': '🟢', 'MEDIUM': '🟡', 'HIGH': '🟠', 'CRITICAL': '🔴'}[decision['risk_level']]\n        logger.info(f\"🧭 Navigation: {decision['navigation_command']} | Speed: {decision['speed']}m/s | Risk: {decision['risk_level']} {risk_emoji}\")\n    \n    async def run_main_loop(self):\n        \"\"\"Main processing loop\"\"\"\n        logger.info(\"🚀 Starting Live API Mining Vision main loop\")\n        \n        try:\n            while True:\n                ret, frame = self.camera.read()\n                if not ret:\n                    logger.error(\"Failed to read frame from camera\")\n                    break\n                \n                # Process with YOLO\n                detections = self.process_frame_with_yolo(frame)\n                \n                # Analyze with Gemini Live API\n                decision = await self.analyze_with_gemini_live(frame, detections)\n                \n                # Handle audio feedback\n                self.handle_audio_feedback(decision)\n                \n                # Update navigation\n                self.update_navigation_state(decision)\n                \n                # Draw detections on frame for display\n                for detection in detections:\n                    bbox = detection['bbox']\n                    x1, y1, x2, y2 = map(int, bbox)\n                    class_name = detection['class']\n                    confidence = detection['confidence']\n                    \n                    # Color coding: red for humans, yellow for vehicles, green for others\n                    color = (0, 0, 255) if class_name == 'person' else (0, 255, 255) if class_name in ['car', 'truck', 'bus'] else (0, 255, 0)\n                    \n                    cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)\n                    cv2.putText(frame, f\"{class_name}: {confidence:.2f}\", \n                              (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)\n                \n                # Add navigation info overlay\n                nav_text = f\"Nav: {self.current_navigation['command']} | Speed: {self.current_navigation['speed']}m/s | Risk: {self.current_navigation['risk_level']}\"\n                cv2.putText(frame, nav_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)\n                cv2.putText(frame, nav_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)\n                \n                # Display frame\n                cv2.imshow('Live API Mining Vision', frame)\n                \n                # Exit on 'q' press\n                if cv2.waitKey(1) & 0xFF == ord('q'):\n                    break\n                \n                # Small delay to prevent overwhelming the API\n                await asyncio.sleep(0.1)\n                \n        except KeyboardInterrupt:\n            logger.info(\"System interrupted by user\")\n        except Exception as e:\n            logger.error(f\"Main loop error: {e}\")\n            traceback.print_exc()\n        finally:\n            await self.cleanup()\n    \n    async def cleanup(self):\n        \"\"\"Clean up system resources\"\"\"\n        logger.info(\"🧹 Cleaning up Live API Mining Vision System\")\n        \n        try:\n            if self.camera:\n                self.camera.release()\n            \n            cv2.destroyAllWindows()\n            \n            if self.audio_manager:\n                self.audio_manager.cleanup()\n            \n            if self.esp32_ws:\n                self.esp32_ws.close()\n            \n            if self.gemini_client:\n                # Close Gemini Live connection if applicable\n                pass\n            \n            logger.info(\"✅ Cleanup completed\")\n        except Exception as e:\n            logger.error(f\"Cleanup error: {e}\")\n\nasync def main():\n    \"\"\"Main entry point\"\"\"\n    system = LiveAPIMiningVision()\n    \n    if system.initialize_components():\n        # Start audio recording for live interaction\n        system.audio_manager.start_recording()\n        \n        # Welcome message\n        system.audio_manager.speak_async(\"Live API Mining Vision System activated. Monitoring mining environment for safety.\")\n        \n        # Run main loop\n        await system.run_main_loop()\n    else:\n        logger.error(\"Failed to initialize system\")\n        sys.exit(1)\n\nif __name__ == \"__main__\":\n    try:\n        asyncio.run(main())\n    except KeyboardInterrupt:\n        logger.info(\"\\n🏁 Live API Mining Vision System stopped\")\n    except Exception as e:\n        logger.error(f\"System error: {e}\")\n        traceback.print_exc()\n        sys.exit(1)\n