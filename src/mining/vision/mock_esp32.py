#!/usr/bin/env python3
"""
Enhanced Mock ESP32 WebSocket Server for Testing
Simulates mining vehicle with advanced navigation capabilities
"""

import asyncio
import websockets
import json
import logging
import time
import math
from typing import Dict, Any, Set

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MockESP32Server:
    def __init__(self, host="localhost", port=8080):
        self.host = host
        self.port = port
        self.clients = set()
        
        # Vehicle simulation state
        self.vehicle_state = {
            'position': {'x': 0.0, 'y': 0.0, 'heading': 0.0},
            'motors': {'left_speed': 0, 'right_speed': 0, 'left_dir': 'FORWARD', 'right_dir': 'FORWARD'},
            'sensors': {'battery': 85, 'temperature': 42, 'obstacle_distance': 999},
            'status': 'IDLE',
            'emergency_stop': False,
            'last_command': None,
            'command_start_time': 0
        }
        
        # Command execution tracking
        self.active_commands = {}
        self.command_history = []
        
    async def handle_client(self, websocket, path):
        """Handle WebSocket client connections with enhanced command processing"""
        client_addr = websocket.remote_address
        logger.info(f"🔌 Enhanced ESP32 client connected: {client_addr}")
        self.clients.add(websocket)
        
        # Send welcome message with capabilities
        welcome_msg = {
            "type": "welcome",
            "version": "2.0",
            "capabilities": ["enhanced_navigation", "obstacle_avoidance", "path_planning"],
            "vehicle_state": self.vehicle_state,
            "timestamp": time.time()
        }
        await websocket.send(json.dumps(welcome_msg))
        
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                    logger.info(f"📥 Received from {client_addr}: {data.get('type', 'unknown')}")
                    
                    # Process different command types
                    response = await self.process_command(data, websocket)
                    
                    if response:
                        await websocket.send(json.dumps(response))
                        logger.info(f"📤 Sent to {client_addr}: {response.get('type', 'response')}")
                        
                except json.JSONDecodeError as e:
                    error_response = {
                        "type": "error",
                        "error": "invalid_json",
                        "message": str(e),
                        "timestamp": time.time()
                    }
                    await websocket.send(json.dumps(error_response))
                    
        except websockets.exceptions.ConnectionClosed:
            logger.info(f"🔌 Client disconnected: {client_addr}")
        except Exception as e:
            logger.error(f"❌ Error handling client {client_addr}: {e}")
        finally:
            self.clients.discard(websocket)
    
    async def process_command(self, data: Dict[str, Any], websocket) -> Dict[str, Any]:
        """Process different types of commands"""
        command_type = data.get('type', 'unknown')
        current_time = time.time()
        
        if command_type == 'handshake':
            return await self.handle_handshake(data)
        
        elif command_type == 'motor_control':
            return await self.handle_motor_control(data, current_time)
        
        elif command_type == 'emergency_stop':
            return await self.handle_emergency_stop(data, current_time)
        
        elif command_type == 'clear_emergency':
            return await self.handle_clear_emergency(data, current_time)
        
        elif command_type == 'status_request':
            return await self.handle_status_request(data, current_time)
        
        elif command_type == 'heartbeat':
            return await self.handle_heartbeat(data, current_time)
        
        else:
            return {
                "type": "error",
                "error": "unknown_command",
                "received_type": command_type,
                "timestamp": current_time
            }
    
    async def handle_handshake(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Handle initial handshake"""
        return {
            "type": "handshake_ack",
            "version": "2.0",
            "server_capabilities": ["enhanced_navigation", "obstacle_avoidance", "real_time_feedback"],
            "client_version": data.get('version', 'unknown'),
            "status": "ready",
            "timestamp": time.time()
        }
    
    async def handle_motor_control(self, data: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """Handle motor control commands with realistic simulation"""
        command = data.get('command', 'UNKNOWN')
        motor_control = data.get('motor_control', {})
        metadata = data.get('metadata', {})
        
        # Update vehicle state
        self.vehicle_state['status'] = command
        self.vehicle_state['last_command'] = data
        self.vehicle_state['command_start_time'] = current_time
        
        # Update motor state
        self.vehicle_state['motors'].update({
            'left_speed': motor_control.get('left_motor_speed', 0),
            'right_speed': motor_control.get('right_motor_speed', 0),
            'left_dir': motor_control.get('left_motor_direction', 'FORWARD'),
            'right_dir': motor_control.get('right_motor_direction', 'FORWARD')
        })
        
        # Simulate position change
        await self.simulate_movement(motor_control, metadata.get('duration', 1.0))
        
        # Add to command history
        self.command_history.append({
            'command': command,
            'timestamp': current_time,
            'motor_control': motor_control,
            'metadata': metadata
        })
        
        # Keep only last 50 commands
        if len(self.command_history) > 50:
            self.command_history = self.command_history[-50:]
        
        return {
            "type": "motor_control_ack",
            "command": command,
            "status": "executing",
            "estimated_duration": metadata.get('duration', 1.0),
            "vehicle_position": self.vehicle_state['position'],
            "motor_status": self.vehicle_state['motors'],
            "timestamp": current_time
        }
    
    async def handle_emergency_stop(self, data: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """Handle emergency stop with immediate response"""
        logger.warning("� EMERGENCY STOP ACTIVATED")
        
        self.vehicle_state['emergency_stop'] = True
        self.vehicle_state['status'] = 'EMERGENCY_STOP'
        self.vehicle_state['motors'] = {
            'left_speed': 0, 'right_speed': 0,
            'left_dir': 'FORWARD', 'right_dir': 'FORWARD'
        }
        
        # Broadcast emergency stop to all clients
        emergency_broadcast = {
            "type": "emergency_broadcast",
            "status": "EMERGENCY_STOP_ACTIVE",
            "reason": "Emergency stop command received",
            "timestamp": current_time
        }
        
        # Send to all connected clients
        for client in self.clients.copy():
            try:
                await client.send(json.dumps(emergency_broadcast))
            except:
                pass  # Client may have disconnected
        
        return {
            "type": "emergency_stop_ack",
            "status": "EMERGENCY_STOPPED",
            "all_motors_stopped": True,
            "timestamp": current_time
        }
    
    async def handle_clear_emergency(self, data: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """Handle clearing emergency stop"""
        logger.info("✅ Emergency stop cleared")
        
        self.vehicle_state['emergency_stop'] = False
        self.vehicle_state['status'] = 'READY'
        
        return {
            "type": "clear_emergency_ack",
            "status": "READY",
            "emergency_cleared": True,
            "timestamp": current_time
        }
    
    async def handle_status_request(self, data: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """Handle status request with full vehicle state"""
        # Simulate sensor readings
        self.vehicle_state['sensors'].update({
            'battery': max(0, self.vehicle_state['sensors']['battery'] - 0.1),  # Slow battery drain
            'temperature': 42 + (hash(str(current_time)) % 10 - 5),  # Simulate temp variation
            'obstacle_distance': 200 + (hash(str(current_time)) % 100)  # Simulate obstacle sensor
        })
        
        return {
            "type": "status_response",
            "vehicle_state": self.vehicle_state,
            "command_history": self.command_history[-5:],  # Last 5 commands
            "uptime": current_time - (self.vehicle_state.get('start_time', current_time)),
            "timestamp": current_time
        }
    
    async def handle_heartbeat(self, data: Dict[str, Any], current_time: float) -> Dict[str, Any]:
        """Handle heartbeat with minimal response"""
        return {
            "type": "heartbeat_ack",
            "status": self.vehicle_state['status'],
            "timestamp": current_time
        }
    
    async def simulate_movement(self, motor_control: Dict[str, Any], duration: float):
        """Simulate realistic vehicle movement"""
        left_speed = motor_control.get('left_motor_speed', 0)
        right_speed = motor_control.get('right_motor_speed', 0)
        
        # Simple differential drive simulation
        if left_speed == right_speed:
            # Straight movement
            speed = left_speed / 255.0 * 2.0  # Max 2 m/s
            distance = speed * duration
            
            # Update position based on heading
            heading_rad = math.radians(self.vehicle_state['position']['heading'])
            self.vehicle_state['position']['x'] += distance * math.cos(heading_rad)
            self.vehicle_state['position']['y'] += distance * math.sin(heading_rad)
        
        else:
            # Turning movement
            speed_diff = (right_speed - left_speed) / 255.0
            angular_velocity = speed_diff * 45.0  # degrees per second
            heading_change = angular_velocity * duration
            
            self.vehicle_state['position']['heading'] += heading_change
            self.vehicle_state['position']['heading'] %= 360  # Keep in 0-360 range
            
            # Some forward movement even while turning
            avg_speed = (left_speed + right_speed) / 2 / 255.0 * 1.5
            distance = avg_speed * duration
            
            heading_rad = math.radians(self.vehicle_state['position']['heading'])
            self.vehicle_state['position']['x'] += distance * math.cos(heading_rad)
            self.vehicle_state['position']['y'] += distance * math.sin(heading_rad)
    
    async def start_server(self):
        """Start the enhanced WebSocket server"""
        logger.info(f"🚀 Starting Enhanced Mock ESP32 server on {self.host}:{self.port}")
        
        # Initialize vehicle start time
        self.vehicle_state['start_time'] = time.time()
        
        server = await websockets.serve(
            self.handle_client, 
            self.host, 
            self.port,
            subprotocols=['mining-protocol']
        )
        
        logger.info(f"✅ Enhanced Mock ESP32 server running on ws://{self.host}:{self.port}/esp32")
        logger.info("🎮 Server capabilities:")
        logger.info("   - Enhanced navigation commands")
        logger.info("   - Obstacle avoidance simulation")
        logger.info("   - Real-time vehicle state tracking")
        logger.info("   - Emergency stop protocols")
        return server
    
    async def start(self):
        """Start server and return server task"""
        server = await self.start_server()
        
        # Start periodic state updates
        update_task = asyncio.create_task(self.periodic_updates())
        
        return server, update_task
    
    async def periodic_updates(self):
        """Send periodic updates to clients"""
        while True:
            try:
                await asyncio.sleep(5.0)  # Every 5 seconds
                
                if not self.clients:
                    continue
                
                # Create status update
                status_update = {
                    "type": "status_update",
                    "vehicle_state": self.vehicle_state,
                    "timestamp": time.time()
                }
                
                # Send to all clients
                for client in self.clients.copy():
                    try:
                        await client.send(json.dumps(status_update))
                    except:
                        self.clients.discard(client)  # Remove disconnected clients
                        
            except Exception as e:
                logger.error(f"Error in periodic updates: {e}")
                await asyncio.sleep(1.0)

async def main():
    """Run the enhanced mock ESP32 server"""
    logger.info("🎯 Enhanced Mock ESP32 Mining Vehicle Server")
    logger.info("=" * 50)
    
    server = MockESP32Server()
    websocket_server, update_task = await server.start()
    
    try:
        # Wait for server to be closed
        await websocket_server.wait_closed()
    except KeyboardInterrupt:
        logger.info("🛑 Shutting down enhanced mock ESP32 server")
    except Exception as e:
        logger.error(f"❌ Server error: {e}")
    finally:
        # Cleanup
        if update_task:
            update_task.cancel()
            try:
                await update_task
            except asyncio.CancelledError:
                pass

if __name__ == "__main__":
    print("🚗 Enhanced Mock ESP32 Mining Vehicle Server")
    print("🔧 Advanced Navigation Simulation")
    print("📡 WebSocket Server on ws://localhost:8080/esp32")
    print("-" * 50)
    
    asyncio.run(main())