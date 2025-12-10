# Hybrid Perception Architecture

## Overview
The system now uses a **Hybrid Architecture** combining fast local detection with smart cloud reasoning.

| Component | Model | Speed | Role |
|-----------|-------|-------|------|
| **Reflex System** | COCO-SSD (Local) | ~10 FPS | **Immediate Safety.** Detects people/obstacles and triggers instant stops or avoidance maneuvers. |
| **Cognitive System** | Gemini 1.5 Pro (Cloud) | 1 FPS | **Strategy.** Understands the scene, plans paths ("Go to kitchen"), and handles complex instructions. |

## Safety Logic (Reflex System)

The local system runs every **100ms** and enforces these rules:

### 1. Person Detection 👤
- **Critical Zone (< 1.5m):** `STOP` immediately.
- **Warning Zone (1.5m - 3m):** `AVOID` (Turn Left/Right) to maintain space.
- **Safe Zone (> 3m):** Monitor only.

### 2. Obstacle Avoidance 🪑
- Detects: Chairs, Tables, Couches, etc.
- Action: Steering around them while maintaining forward motion.

## How to Test

1. **Start System:** `npm run dev-arduino`
2. **Verify Load:** Check console for `COCO-SSD model loaded successfully`.
3. **Test Reflexes:**
   - Walk quickly in front of the camera.
   - Vehicle should STOP instantly (faster than before).
4. **Test Avoidance:**
   - Stand 2 meters away.
   - Vehicle should try to turn away from you.
5. **Test Strategy:**
   - Say "Go to the kitchen".
   - Gemini will guide the general direction, while COCO-SSD handles the dodging.
