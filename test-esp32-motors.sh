#!/bin/bash
# ESP32-CAM Motor Test Commands
# Use this after ESP32-CAM connects to WiFi

# Get the ESP32-CAM IP address from serial monitor
#ESP32_IP="192.168.x.x"  # Replace with actual IP shown in Serial Monitor

echo "ESP32-CAM Motor Test - AI Command Integration"
echo "=============================================="
echo ""
echo "1. Make sure ESP32-CAM is connected to 'MLUNGISI' WiFi"
echo "2. Check Serial Monitor for IP address"
echo "3. Update ESP32_IP variable in this script"
echo ""

# Test 1: Forward movement
echo "Test 1: Move Forward"
echo '{"type":"drive","linear_mps":0.5,"angular_rps":0}' | wscat -c ws://$ESP32_IP:8080

sleep 2

# Test 2: Stop
echo "Test 2: Stop"
echo '{"type":"stop"}' | wscat -c ws://$ESP32_IP:8080

sleep 1

# Test 3: Turn Left
echo "Test 3: Turn Left"
echo '{"type":"drive","linear_mps":0,"angular_rps":0.5}' | wscat -c ws://$ESP32_IP:8080

sleep 2

# Test 4: Stop
echo "Test 4: Stop"
echo '{"type":"stop"}' | wscat -c ws://$ESP32_IP:8080

echo ""
echo "Tests complete!"
