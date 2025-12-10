#!/usr/bin/env python3
"""
Enhanced Mining Vision System Launcher
Starts the high-performance vision system with AI path planning and obstacle avoidance
"""

import asyncio
import os
import sys
import logging
import argparse
from pathlib import Path

# Add current directory to Python path for imports
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(current_dir / 'mining_vision.log')
    ]
)

logger = logging.getLogger(__name__)

def check_requirements():
    """Check if all required dependencies are available"""
    required_packages = [
        ('cv2', 'opencv-python'),
        ('ultralytics', 'ultralytics'),
        ('numpy', 'numpy'),
        ('pyttsx3', 'pyttsx3'),
        ('google.generativeai', 'google-generativeai'),
        ('websockets', 'websockets')
    ]
    
    missing_packages = []
    
    for module_name, package_name in required_packages:
        try:
            __import__(module_name)
            logger.info(f"✅ {package_name} is available")
        except ImportError:
            missing_packages.append(package_name)
            logger.warning(f"⚠️ {package_name} is missing")
    
    if missing_packages:
        logger.error("❌ Missing required packages. Install with:")
        logger.error(f"pip install {' '.join(missing_packages)}")
        return False
    
    return True

def check_environment():
    """Check environment configuration"""
    logger.info("🔧 Checking environment configuration...")
    
    # Check API key
    gemini_key = os.getenv('GEMINI_API_KEY')
    if not gemini_key:
        logger.warning("⚠️ GEMINI_API_KEY environment variable not set")
        logger.warning("   AI-enhanced path planning will be limited")
    else:
        logger.info(f"✅ Gemini API key configured (length: {len(gemini_key)})")
    
    # Check camera availability
    try:
        import cv2
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            logger.info("✅ Camera is available")
            cap.release()
        else:
            logger.error("❌ Camera not accessible")
            return False
    except Exception as e:
        logger.error(f"❌ Camera check failed: {e}")
        return False
    
    return True

async def start_mock_esp32_server():
    """Start mock ESP32 server for testing"""
    logger.info("🚗 Starting mock ESP32 server...")
    
    try:
        # Import the mock server
        from mock_esp32 import MockESP32Server
        
        # Create and start server
        mock_server = MockESP32Server()
        server_task = asyncio.create_task(mock_server.start())
        
        logger.info("✅ Mock ESP32 server started on ws://localhost:8080/esp32")
        return server_task
    except ImportError:
        logger.warning("⚠️ Mock ESP32 server not found - ESP32 features will be offline")
        return None
    except Exception as e:
        logger.warning(f"⚠️ Failed to start mock ESP32 server: {e}")
        return None

async def main(args):
    """Main launcher function"""
    logger.info("🎯 Enhanced Mining Vision System Launcher")
    logger.info("=" * 60)
    
    # Check requirements
    if not check_requirements():
        logger.error("❌ Requirements check failed")
        return 1
    
    if not check_environment():
        logger.error("❌ Environment check failed")
        return 1
    
    # Start mock ESP32 server if requested
    mock_server_task = None
    if args.mock_esp32:
        mock_server_task = await start_mock_esp32_server()
        if mock_server_task:
            # Wait a moment for server to start
            await asyncio.sleep(2.0)
    
    try:
        # Import and start the vision system
        logger.info("🚀 Initializing Enhanced Mining Vision System...")
        from optimized_live_api_vision import OptimizedMiningVisionSystem
        
        # Get API key
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key and args.gemini_key:
            api_key = args.gemini_key
            os.environ['GEMINI_API_KEY'] = api_key
        
        # Create and start vision system
        vision_system = OptimizedMiningVisionSystem(api_key)
        
        logger.info("🎥 Vision system initialized successfully")
        logger.info("📊 Performance optimizations:")
        logger.info(f"   - Target FPS: {vision_system.target_fps}")
        logger.info(f"   - Frame skip: {vision_system.frame_skip}")
        logger.info(f"   - Detection confidence: {vision_system.detection_confidence}")
        logger.info(f"   - Gemini call interval: {vision_system.gemini_call_interval}s")
        logger.info("")
        logger.info("🎮 Controls:")
        logger.info("   - Press 'q' to quit")
        logger.info("   - System will provide audio feedback")
        logger.info("=" * 60)
        
        # Start main loop
        await vision_system.main_loop()
        
        return 0
        
    except KeyboardInterrupt:
        logger.info("🛑 System interrupted by user")
        return 0
    except Exception as e:
        logger.error(f"❌ System error: {e}")
        import traceback
        traceback.print_exc()
        return 1
    finally:
        # Cleanup mock server
        if mock_server_task:
            mock_server_task.cancel()
            try:
                await mock_server_task
            except asyncio.CancelledError:
                pass

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(
        description="Enhanced Mining Vision System with AI Path Planning",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python launch_enhanced_mining_vision.py                    # Basic launch
  python launch_enhanced_mining_vision.py --mock-esp32      # With mock ESP32
  python launch_enhanced_mining_vision.py --gemini-key KEY  # With custom API key
        """
    )
    
    parser.add_argument(
        '--mock-esp32', 
        action='store_true',
        help='Start mock ESP32 server for testing'
    )
    
    parser.add_argument(
        '--gemini-key',
        type=str,
        help='Gemini API key (alternative to environment variable)'
    )
    
    parser.add_argument(
        '--log-level',
        choices=['DEBUG', 'INFO', 'WARNING', 'ERROR'],
        default='INFO',
        help='Set logging level (default: INFO)'
    )
    
    return parser.parse_args()

if __name__ == "__main__":
    print("🎯 Enhanced Mining Vision System")
    print("🚗 AI-Powered Obstacle Avoidance & Path Planning")
    print("⚡ Optimized for Real-Time Performance")
    print("-" * 50)
    
    # Parse arguments
    args = parse_arguments()
    
    # Set logging level
    logging.getLogger().setLevel(getattr(logging, args.log_level))
    
    # Run the system
    try:
        exit_code = asyncio.run(main(args))
        sys.exit(exit_code)
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)