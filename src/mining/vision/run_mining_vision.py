#!/usr/bin/env python3
"""Quick launcher for Enhanced Mining Vision System"""
import subprocess
import sys
from pathlib import Path

if __name__ == "__main__":
    script_path = Path(__file__).parent / 'launch_enhanced_mining_vision.py'
    subprocess.run([sys.executable, str(script_path)] + sys.argv[1:])
