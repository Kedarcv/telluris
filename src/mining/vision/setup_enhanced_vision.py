#!/usr/bin/env python3
"""
Enhanced Mining Vision System Setup Script
Installs dependencies and configures the system
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def check_python_version():
    """Check if Python version is compatible"""
    logger.info("🐍 Checking Python version...")
    
    version = sys.version_info
    if version.major != 3 or version.minor < 8:
        logger.error(f"❌ Python 3.8+ required, found {version.major}.{version.minor}")
        return False
    
    logger.info(f"✅ Python {version.major}.{version.minor}.{version.micro} is compatible")
    return True

def install_package(package):
    """Install a Python package using pip"""
    try:
        logger.info(f"📦 Installing {package}...")
        result = subprocess.run([sys.executable, "-m", "pip", "install", package], 
                              capture_output=True, text=True, check=True)
        logger.info(f"✅ {package} installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"❌ Failed to install {package}: {e}")
        logger.error(f"   stdout: {e.stdout}")
        logger.error(f"   stderr: {e.stderr}")
        return False

def install_requirements():
    """Install all required packages"""
    logger.info("📦 Installing required packages...")
    
    # Core dependencies
    packages = [
        "opencv-python",      # Computer vision
        "ultralytics",        # YOLO object detection
        "numpy",             # Numerical computations
        "websockets",        # WebSocket client/server
        "google-generativeai", # Gemini AI
        "pyttsx3",           # Text-to-speech
        "asyncio",           # Async programming (built-in but ensure latest)
    ]
    
    # Optional but recommended packages
    optional_packages = [
        "matplotlib",        # Visualization
        "pillow",           # Image processing
        "scipy",            # Scientific computing
    ]
    
    failed_packages = []
    
    # Install core packages
    for package in packages:
        if not install_package(package):
            failed_packages.append(package)
    
    # Install optional packages (don't fail if these don't work)
    for package in optional_packages:
        logger.info(f"📦 Installing optional package {package}...")
        if install_package(package):
            logger.info(f"✅ Optional package {package} installed")
        else:
            logger.warning(f"⚠️ Optional package {package} failed to install (non-critical)")
    
    if failed_packages:
        logger.error(f"❌ Failed to install core packages: {failed_packages}")
        return False
    
    logger.info("✅ All core packages installed successfully")
    return True

def setup_yolo_model():
    """Download YOLO model if not present"""
    logger.info("🤖 Setting up YOLO model...")
    
    try:
        # This will download the model if not present
        from ultralytics import YOLO
        model = YOLO('yolov8n.pt')
        logger.info("✅ YOLO model ready")
        return True
    except Exception as e:
        logger.error(f"❌ YOLO model setup failed: {e}")
        return False

def check_camera():
    """Check if camera is accessible"""
    logger.info("📹 Checking camera access...")
    
    try:
        import cv2
        cap = cv2.VideoCapture(0)
        
        if not cap.isOpened():
            logger.error("❌ Camera not accessible")
            logger.error("   Please check:")
            logger.error("   - Camera is connected")
            logger.error("   - Camera permissions are granted")
            logger.error("   - Camera is not being used by another application")
            return False
        
        ret, frame = cap.read()
        if not ret:
            logger.error("❌ Camera connected but cannot read frames")
            cap.release()
            return False
        
        height, width = frame.shape[:2]
        logger.info(f"✅ Camera working - Resolution: {width}x{height}")
        cap.release()
        return True
        
    except Exception as e:
        logger.error(f"❌ Camera check failed: {e}")
        return False

def setup_environment():
    """Setup environment variables and configuration"""
    logger.info("🔧 Setting up environment...")
    
    # Check for Gemini API key
    api_key = os.getenv('GEMINI_API_KEY')
    if not api_key:
        logger.warning("⚠️ GEMINI_API_KEY environment variable not set")
        logger.warning("   To enable AI features:")
        logger.warning("   1. Get API key from: https://makersuite.google.com/app/apikey")
        logger.warning("   2. Set environment variable:")
        logger.warning("      export GEMINI_API_KEY='your-api-key-here'")
        logger.warning("   3. Or use --gemini-key parameter when running")
    else:
        logger.info(f"✅ Gemini API key configured (length: {len(api_key)})")
    
    # Create log directory
    log_dir = Path(__file__).parent / 'logs'
    log_dir.mkdir(exist_ok=True)
    logger.info(f"✅ Log directory created: {log_dir}")
    
    return True

def create_launch_scripts():
    """Create convenient launch scripts"""
    logger.info("📜 Creating launch scripts...")
    
    current_dir = Path(__file__).parent
    
    # Create basic launch script
    basic_script = current_dir / 'run_mining_vision.py'
    with open(basic_script, 'w') as f:
        f.write('''#!/usr/bin/env python3
"""Quick launcher for Enhanced Mining Vision System"""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    script_path = Path(__file__).parent / 'launch_enhanced_mining_vision.py'
    subprocess.run([sys.executable, str(script_path)] + sys.argv[1:])
''')
    
    # Make executable on Unix-like systems
    try:
        basic_script.chmod(0o755)
    except:
        pass  # Windows doesn't use chmod
    
    # Create launch with mock ESP32 script
    mock_script = current_dir / 'run_with_mock_esp32.py'
    with open(mock_script, 'w') as f:
        f.write('''#!/usr/bin/env python3
"""Quick launcher with Mock ESP32 server"""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    script_path = Path(__file__).parent / 'launch_enhanced_mining_vision.py'
    subprocess.run([sys.executable, str(script_path), '--mock-esp32'] + sys.argv[1:])
''')
    
    try:
        mock_script.chmod(0o755)
    except:
        pass
    
    logger.info(f"✅ Created launch scripts:")
    logger.info(f"   - {basic_script}")
    logger.info(f"   - {mock_script}")
    
    return True

def run_system_test():
    """Run a quick system test"""
    logger.info("🧪 Running system test...")
    
    try:
        # Test imports
        import cv2
        import numpy as np
        from ultralytics import YOLO
        import websockets
        import asyncio
        
        # Test YOLO model load
        model = YOLO('yolov8n.pt')
        
        # Test camera
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret:
                # Test YOLO inference
                results = model(frame, verbose=False)
                logger.info("✅ YOLO inference test passed")
            cap.release()
        
        logger.info("✅ System test completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"❌ System test failed: {e}")
        return False

def main():
    """Main setup function"""
    logger.info("🎯 Enhanced Mining Vision System Setup")
    logger.info("=" * 50)
    
    # Check Python version
    if not check_python_version():
        return 1
    
    # Install requirements
    if not install_requirements():
        return 1
    
    # Setup YOLO model
    if not setup_yolo_model():
        return 1
    
    # Check camera
    if not check_camera():
        logger.warning("⚠️ Camera check failed - system will work but without live camera feed")
    
    # Setup environment
    if not setup_environment():
        return 1
    
    # Create launch scripts
    if not create_launch_scripts():
        return 1
    
    # Run system test
    if not run_system_test():
        logger.warning("⚠️ System test failed - some features may not work correctly")
    
    logger.info("=" * 50)
    logger.info("✅ Enhanced Mining Vision System setup completed!")
    logger.info("")
    logger.info("🚀 To run the system:")
    logger.info("   python launch_enhanced_mining_vision.py")
    logger.info("")
    logger.info("🚗 To run with mock ESP32 (for testing):")
    logger.info("   python launch_enhanced_mining_vision.py --mock-esp32")
    logger.info("")
    logger.info("📚 For help:")
    logger.info("   python launch_enhanced_mining_vision.py --help")
    logger.info("")
    
    return 0

if __name__ == "__main__":
    exit_code = main()
    if exit_code == 0:
        print("🎉 Setup completed successfully!")
    else:
        print("❌ Setup failed!")
    sys.exit(exit_code)