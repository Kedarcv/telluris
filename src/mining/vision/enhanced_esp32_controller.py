#!/usr/bin/env python3
"""
Enhanced ESP32 Mining Vehicle Controller
Handles advanced navigation commands with obstacle avoidance
"""

import asyncio
import websockets
import json
import logging
import time
import math
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from enum import Enum

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MotorCommand(Enum):
    STOP = "STOP"
    FORWARD = "FORWARD"
    BACKWARD = "BACKWARD"
    TURN_LEFT = "TURN_LEFT"
    TURN_RIGHT = "TURN_RIGHT"
    PIVOT_LEFT = "PIVOT_LEFT"
    PIVOT_RIGHT = "PIVOT_RIGHT"

@dataclass
class MotorControl:
    left_motor_speed: int  # 0-255
    right_motor_speed: int  # 0-255
    left_motor_direction: str  # "FORWARD" or "BACKWARD"
    right_motor_direction: str  # "FORWARD" or "BACKWARD"
    duration: float  # seconds

class EnhancedESP32Controller:
    def __init__(self, host: str = "localhost", port: int = 8080):
        self.host = host
        self.port = port
        self.websocket = None
        self.is_connected = False
        self.current_command = None
        self.command_start_time = 0
        
        # Motor configuration
        self.max_speed = 255
        self.base_speed = 150  # Base speed for normal operation
        self.turn_speed = 100   # Speed for turning maneuvers
        self.pivot_speed = 120  # Speed for pivot turns
        
        # Safety parameters
        self.emergency_stop_active = False
        self.last_heartbeat = time.time()
        
    async def connect(self):
        """Connect to ESP32 WebSocket server"""
        try:
            uri = f"ws://{self.host}:{self.port}/esp32"
            logger.info(f"🔌 Connecting to ESP32 at {uri}")
            
            self.websocket = await websockets.connect(
                uri,
                subprotocols=["mining-protocol"],
                ping_interval=5,
                ping_timeout=3
            )
            
            self.is_connected = True
            logger.info("✅ Connected to ESP32")
            
            # Send initial handshake
            await self.send_command({
                "type": "handshake",
                "version": "2.0",
                "capabilities": ["enhanced_navigation", "obstacle_avoidance"],
                "timestamp": time.time()
            })
            
        except Exception as e:
            logger.error(f"❌ Failed to connect to ESP32: {e}")
            self.is_connected = False
            raise
    
    async def disconnect(self):
        """Disconnect from ESP32"""
        if self.websocket:
            logger.info("🔌 Disconnecting from ESP32")
            await self.send_emergency_stop()
            await self.websocket.close()
            self.is_connected = False
    
    async def send_command(self, command: Dict[str, Any]):
        """Send command to ESP32"""
        if not self.is_connected or not self.websocket:
            logger.warning("⚠️ Not connected to ESP32")
            return False
        
        try:
            command_json = json.dumps(command)
            await self.websocket.send(command_json)
            logger.info(f"📤 Sent to ESP32: {command}")
            return True
        except Exception as e:
            logger.error(f"❌ Failed to send command: {e}")
            self.is_connected = False
            return False
    
    async def send_navigation_command(self, nav_command: Dict[str, Any]):
        """Process and send enhanced navigation command"""
        command_type = nav_command.get('command', 'NORMAL_FORWARD')
        speed = nav_command.get('speed', 0.8)
        direction = nav_command.get('direction', 0.0)  # degrees
        duration = nav_command.get('duration', 2.0)
        
        # Convert to motor commands
        motor_control = self.convert_to_motor_control(command_type, speed, direction, duration)
        
        # Create ESP32 command
        esp32_command = {
            "type": "motor_control",
            "command": command_type,
            "motor_control": asdict(motor_control),
            "metadata": {
                "original_speed": speed,
                "direction_degrees": direction,
                "duration": duration,
                "timestamp": time.time()
            }
        }
        
        # Send command
        success = await self.send_command(esp32_command)
        if success:
            self.current_command = esp32_command
            self.command_start_time = time.time()
        
        return success
    
    def convert_to_motor_control(self, command_type: str, speed: float, direction: float, duration: float) -> MotorControl:
        """Convert navigation command to motor control parameters"""
        
        # Convert speed (0.0-2.0) to motor speed (0-255)
        motor_speed = int(min(speed * self.base_speed, self.max_speed))
        
        if command_type == "EMERGENCY_STOP":
            return MotorControl(0, 0, "FORWARD", "FORWARD", 0.0)
        
        elif command_type == "NORMAL_FORWARD":
            return MotorControl(
                motor_speed, motor_speed, 
                "FORWARD", "FORWARD", 
                duration
            )
        
        elif command_type == "OBSTACLE_AVOID_LEFT":
            # Turn left while moving forward
            left_speed = int(motor_speed * 0.5)  # Reduce left motor speed
            right_speed = motor_speed
            return MotorControl(
                left_speed, right_speed,
                "FORWARD", "FORWARD",
                duration
            )
        
        elif command_type == "OBSTACLE_AVOID_RIGHT":
            # Turn right while moving forward
            left_speed = motor_speed
            right_speed = int(motor_speed * 0.5)  # Reduce right motor speed
            return MotorControl(
                left_speed, right_speed,
                "FORWARD", "FORWARD",
                duration
            )
        
        elif command_type == "RETURNING_TO_PATH":
            # Gentle correction based on direction
            if direction < 0:  # Turn left to return
                left_speed = int(motor_speed * 0.7)
                right_speed = motor_speed
            elif direction > 0:  # Turn right to return
                left_speed = motor_speed
                right_speed = int(motor_speed * 0.7)
            else:  # Go straight
                left_speed = right_speed = motor_speed
            
            return MotorControl(
                left_speed, right_speed,
                "FORWARD", "FORWARD",
                duration
            )
        
        elif command_type == "SLOW_APPROACH":
            slow_speed = int(motor_speed * 0.4)  # 40% of normal speed
            return MotorControl(
                slow_speed, slow_speed,
                "FORWARD", "FORWARD",
                duration
            )
        
        elif command_type == "STOP_AND_ASSESS":
            return MotorControl(0, 0, "FORWARD", "FORWARD", duration)
        
        else:
            # Default to stop for unknown commands
            logger.warning(f"⚠️ Unknown command type: {command_type}")
            return MotorControl(0, 0, "FORWARD", "FORWARD", 0.0)
    
    async def send_emergency_stop(self):
        """Send immediate emergency stop command"""
        logger.warning("🚨 EMERGENCY STOP ACTIVATED")
        self.emergency_stop_active = True
        
        emergency_command = {
            "type": "emergency_stop",
            "command": "EMERGENCY_STOP",
            "priority": "CRITICAL",
            "timestamp": time.time()
        }
        
        return await self.send_command(emergency_command)
    
    async def clear_emergency_stop(self):
        """Clear emergency stop condition"""
        if self.emergency_stop_active:
            logger.info("✅ Emergency stop cleared")
            self.emergency_stop_active = False
            
            clear_command = {
                "type": "clear_emergency",
                "command": "CLEAR_EMERGENCY",
                "timestamp": time.time()
            }
            
            return await self.send_command(clear_command)
        return True
    
    async def get_vehicle_status(self):
        """Request current vehicle status from ESP32"""
        status_request = {
            "type": "status_request",
            "timestamp": time.time()
        }
        
        return await self.send_command(status_request)
    
    async def send_heartbeat(self):
        """Send periodic heartbeat to maintain connection"""
        heartbeat = {
            "type": "heartbeat",
            "timestamp": time.time(),
            "system_status": "active"
        }
        
        success = await self.send_command(heartbeat)
        if success:
            self.last_heartbeat = time.time()
        return success
    
    async def monitor_connection(self):
        """Monitor connection health and handle reconnection"""
        while True:
            try:
                if self.is_connected:
                    # Send heartbeat
                    await self.send_heartbeat()
                    
                    # Check if current command has expired
                    if (self.current_command and 
                        time.time() - self.command_start_time > 
                        self.current_command.get('metadata', {}).get('duration', 0)):
                        
                        # Command expired, send stop
                        await self.send_command({
                            "type": "motor_control",
                            "command": "STOP",
                            "motor_control": asdict(MotorControl(0, 0, "FORWARD", "FORWARD", 0)),
                            "metadata": {"reason": "command_timeout"}
                        })
                        
                        self.current_command = None
                
                await asyncio.sleep(1.0)  # Check every second
                
            except Exception as e:
                logger.error(f"❌ Connection monitoring error: {e}")
                self.is_connected = False
                
                # Attempt reconnection
                try:
                    await asyncio.sleep(5.0)  # Wait before reconnect
                    await self.connect()
                except Exception:
                    pass  # Will try again in next loop

# Integration function for the vision system
async def create_enhanced_controller():
    """Create and connect enhanced ESP32 controller"""
    controller = EnhancedESP32Controller()
    
    try:
        await controller.connect()
        
        # Start connection monitoring in background
        monitor_task = asyncio.create_task(controller.monitor_connection())
        
        return controller, monitor_task
    except Exception as e:
        logger.error(f"Failed to create enhanced controller: {e}")
        return None, None

# Test function
async def test_enhanced_controller():
    """Test the enhanced ESP32 controller"""
    logger.info("🧪 Testing Enhanced ESP32 Controller")
    
    controller, monitor_task = await create_enhanced_controller()
    if not controller:
        logger.error("Failed to create controller")
        return
    
    try:
        # Test various navigation commands
        test_commands = [
            {
                "command": "NORMAL_FORWARD",
                "speed": 1.0,
                "direction": 0.0,
                "duration": 2.0
            },
            {
                "command": "OBSTACLE_AVOID_LEFT", 
                "speed": 0.6,
                "direction": -30.0,
                "duration": 1.5
            },
            {
                "command": "RETURNING_TO_PATH",
                "speed": 0.7,
                "direction": 15.0,
                "duration": 2.0
            },
            {
                "command": "EMERGENCY_STOP",
                "speed": 0.0,
                "direction": 0.0,
                "duration": 0.0
            }
        ]
        
        for cmd in test_commands:
            logger.info(f"🧪 Testing command: {cmd['command']}")
            await controller.send_navigation_command(cmd)
            await asyncio.sleep(cmd['duration'] + 1)  # Wait for command + buffer
        
    except KeyboardInterrupt:
        logger.info("Test interrupted by user")
    finally:
        if monitor_task:
            monitor_task.cancel()
        await controller.disconnect()

if __name__ == "__main__":
    print("🚗 Enhanced ESP32 Mining Vehicle Controller")
    print("🔧 Advanced navigation with obstacle avoidance")
    print("-" * 50)
    
    asyncio.run(test_enhanced_controller())