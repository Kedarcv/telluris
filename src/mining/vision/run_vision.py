#!/usr/bin/env python3
"""
Mining Vehicle Vision System Launcher
Simple launcher that ensures all dependencies and runs the vision system
"""

import os
import sys
import subprocess

def check_requirements():
    """Check if all required packages are installed"""
    required_packages = ['cv2', 'ultralytics', 'numpy', 'websockets']
    missing = []
    
    for package in required_packages:
        try:
            if package == 'cv2':
                import cv2
            elif package == 'ultralytics':
                from ultralytics import YOLO
            elif package == 'numpy':
                import numpy
            elif package == 'websockets':
                import websockets
        except ImportError:
            missing.append(package)
    
    if missing:
        print(f"❌ Missing packages: {missing}")
        print("Install with: pip install ultralytics opencv-python websockets numpy")
        return False
    return True

def main():
    print("🚗 Mining Vehicle Vision System Launcher")
    print("=" * 40)
    
    # Check requirements
    if not check_requirements():
        return
    
    # Import and run the vision system
    try:
        from camera_yolo_test import MiningVehicleVision
        
        print("🤖 Starting AI Vision System...")
        vision_system = MiningVehicleVision()
        vision_system.run()
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Make sure camera-yolo-test.py is in the same directory")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    main()