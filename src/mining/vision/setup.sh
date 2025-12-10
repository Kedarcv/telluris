#!/bin/bash
# Mining Vehicle Vision System Setup Script

echo "🚗 Mining Vehicle Vision System Setup"
echo "====================================="

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8+ first."
    exit 1
fi

echo "✅ Python 3 found: $(python3 --version)"

# Check if pip is installed
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is not installed. Please install pip first."
    exit 1
fi

echo "✅ pip3 found: $(pip3 --version)"

# Create virtual environment (optional but recommended)
read -p "📦 Create virtual environment? (y/n): " create_venv

if [[ $create_venv =~ ^[Yy]$ ]]; then
    echo "Creating virtual environment..."
    python3 -m venv mining_vision_env
    
    echo "Activating virtual environment..."
    source mining_vision_env/bin/activate
    
    echo "✅ Virtual environment created and activated"
    echo "💡 To activate it later, run: source mining_vision_env/bin/activate"
fi

# Upgrade pip
echo "📦 Upgrading pip..."
pip3 install --upgrade pip

# Install requirements
echo "📦 Installing required packages..."
pip3 install -r requirements.txt

# Download YOLO model (optional)
echo "🤖 Setting up YOLO model..."
python3 -c "
from ultralytics import YOLO
print('Downloading YOLOv8 nano model...')
model = YOLO('yolov8n.pt')  # This will download the model
print('✅ YOLO model ready!')
"

# Check camera access
echo "📷 Testing camera access..."
python3 -c "
import cv2
cap = cv2.VideoCapture(0)
if cap.isOpened():
    print('✅ Camera access successful')
    cap.release()
else:
    print('❌ Camera access failed - check permissions')
"

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Run the vision system: python3 camera-yolo-test.py"
echo "2. Open test_client.html in your browser"
echo "3. Test with objects in front of your camera"
echo ""
echo "💡 Tips:"
echo "- Use 'q' key to quit the vision system"
echo "- The web dashboard auto-connects to the vision system"
echo "- Try showing people, cars, or stop signs to test detection"
echo ""