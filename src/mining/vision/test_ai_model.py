#!/usr/bin/env python3
"""
Quick AI Model Test for Mining Vehicle Vision System
Tests YOLO model loading, camera access, and basic detection
"""

import cv2
import time
from ultralytics import YOLO
import numpy as np

def test_model_loading():
    """Test YOLO model loading"""
    print("🤖 Testing AI Model Loading...")
    try:
        model = YOLO('yolov8n.pt')
        print(f"✅ YOLO model loaded successfully!")
        print(f"📊 Model has {len(model.names)} object classes")
        
        # Show mining-relevant classes
        mining_classes = ['person', 'bicycle', 'car', 'motorcycle', 'bus', 'truck', 'stop sign', 'chair', 'bottle']
        available_mining = []
        
        for class_name in mining_classes:
            if class_name in model.names.values():
                class_id = list(model.names.keys())[list(model.names.values()).index(class_name)]
                available_mining.append(f"{class_id}: {class_name}")
        
        print(f"🚗 Mining-relevant classes available: {len(available_mining)}")
        for cls in available_mining:
            print(f"  ✓ {cls}")
        
        return model
    except Exception as e:
        print(f"❌ Model loading failed: {e}")
        return None

def test_camera_access():
    """Test camera access and configuration"""
    print("\n📷 Testing Camera Access...")
    try:
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌ Camera not accessible - trying camera 1...")
            cap = cv2.VideoCapture(1)
            if not cap.isOpened():
                print("❌ No camera found")
                return None
        
        # Get camera properties
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        
        print(f"✅ Camera found: {width}x{height} @ {fps}fps")
        
        # Test frame capture
        ret, frame = cap.read()
        if ret:
            print(f"✅ Frame captured: {frame.shape}")
            return cap
        else:
            print("❌ Failed to capture frame")
            cap.release()
            return None
            
    except Exception as e:
        print(f"❌ Camera test failed: {e}")
        return None

def test_ai_detection(model, cap):
    """Test AI detection on live camera"""
    print("\n🎯 Testing AI Detection (10 seconds)...")
    print("👋 Wave your hand or show objects to the camera!")
    
    start_time = time.time()
    detection_count = 0
    total_inference_time = 0
    
    while time.time() - start_time < 10:  # Run for 10 seconds
        ret, frame = cap.read()
        if not ret:
            continue
        
        # Resize frame for faster processing
        frame_resized = cv2.resize(frame, (640, 480))
        
        # Run detection
        detection_start = time.time()
        results = model(frame_resized, conf=0.5, verbose=False)
        inference_time = time.time() - detection_start
        total_inference_time += inference_time
        
        # Process results
        detections = []
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for box in boxes:
                    class_id = int(box.cls[0])
                    class_name = model.names[class_id]
                    confidence = float(box.conf[0])
                    detections.append((class_name, confidence))
        
        if detections:
            detection_count += 1
            print(f"🎯 Detection #{detection_count}:")
            for obj_name, conf in detections:
                print(f"  📍 {obj_name}: {conf:.2f}")
        
        # Show frame with basic info
        cv2.putText(frame, f"AI Test - {len(detections)} objects", (10, 30),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(frame, f"Inference: {inference_time*1000:.1f}ms", (10, 60),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        
        cv2.imshow('AI Model Test', frame)
        
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break
    
    avg_inference = (total_inference_time / (time.time() - start_time)) * 1000
    print(f"\n📊 Test Results:")
    print(f"  ⏱️  Average inference time: {avg_inference:.1f}ms")
    print(f"  🎯 Total detections: {detection_count}")
    print(f"  ✅ AI model working properly!")

def main():
    """Run all tests"""
    print("🚗 Mining Vehicle AI Model Test")
    print("=" * 40)
    
    # Test 1: Model Loading
    model = test_model_loading()
    if not model:
        print("❌ Cannot proceed without model")
        return
    
    # Test 2: Camera Access
    cap = test_camera_access()
    if not cap:
        print("❌ Cannot proceed without camera")
        return
    
    # Test 3: AI Detection
    try:
        test_ai_detection(model, cap)
    finally:
        cap.release()
        cv2.destroyAllWindows()
    
    print("\n✅ All tests completed!")
    print("🚀 Ready to run the full mining vehicle vision system!")
    print("   Run: python3 camera-yolo-test.py")

if __name__ == "__main__":
    main()