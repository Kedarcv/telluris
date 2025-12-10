# AI-Driven Arduino Mining Vehicle - Complete Setup

## Overview

Your system is now configured for **real-time AI-driven navigation** using:
- ✅ **Gemini Live API** for real-time vision analysis and voice feedback
- ✅ **Arduino Uno** for motor control via USB serial
- ✅ **Camera** for obstacle detection and navigation
- ✅ **No simulated analysis** - everything is real!

## How It Works

```
Camera Feed → Gemini Live API → Vision Analysis → Navigation Commands → Arduino → Motors
```

### 1. **Camera Captures Video**
   - Your webcam streams video to the browser
   - Frames are sent to Gemini Live API

### 2. **Gemini Analyzes in Real-Time**
   - Gemini "sees" what the camera sees
   - Identifies obstacles, people, clear paths
   - Makes navigation decisions
   - Speaks its analysis (this is what you hear!)

### 3. **Navigation Commands Sent**
   - Based on what Gemini sees, it sends commands like:
     - "Path clear - moving forward" → Arduino moves forward
     - "Obstacle ahead - stopping" → Arduino stops
     - "Person detected - emergency stop" → Arduino emergency stop
     - "Turn left to avoid obstacle" → Arduino turns left

### 4. **Arduino Executes**
   - Receives commands via USB serial
   - Controls motors through L298N driver
   - Sends telemetry back (position, speed, battery)

## What Changed

### ✅ Removed
- ❌ Simulated color detection
- ❌ Fake obstacle generation
- ❌ Pre-recorded analysis

### ✅ Added
- ✅ Real Gemini Live API vision analysis
- ✅ Direct Arduino motor control
- ✅ Real-time obstacle avoidance
- ✅ Voice feedback from AI

## Navigation Commands

Gemini can now send these commands based on what it sees:

| What Gemini Sees | Command | Arduino Action |
|------------------|---------|----------------|
| Clear path | `forward` | Move forward at 1.0 m/s |
| Obstacle ahead | `stop` | Emergency stop |
| Person detected | `emergency_stop` | Immediate stop |
| Obstacle on left | `turn_right` | Turn right to avoid |
| Obstacle on right | `turn_left` | Turn left to avoid |
| Narrow passage | `slow` | Slow to 0.5 m/s |
| Need to back up | `reverse` | Reverse at 0.5 m/s |

## Testing the System

### 1. Start Everything
```bash
npm run dev-arduino
```

This starts:
- React web console (http://localhost:3000)
- Arduino serial bridge (WebSocket on port 8080)

### 2. Open Mining Mode
1. Go to http://localhost:3000
2. Click **⛏️ Mining Mode**
3. Allow camera access when prompted
4. Wait for Arduino to connect (you'll see "Connected")

### 3. Test AI Vision
Try these scenarios:

**Test 1: Clear Path**
- Point camera at open space
- Gemini should say: "Path is clear, moving forward"
- Arduino should move forward

**Test 2: Obstacle Detection**
- Put your hand in front of camera
- Gemini should say: "Obstacle detected, stopping"
- Arduino should stop

**Test 3: Person Detection**
- Show your face to camera
- Gemini should say: "Person detected, emergency stop"
- Arduino should stop immediately

**Test 4: Obstacle Avoidance**
- Put object on one side of view
- Gemini should say: "Obstacle on left, turning right"
- Arduino should turn to avoid

### 4. Voice Commands
You can also give voice commands:
- "What do you see?" - Gemini describes the scene
- "Move forward slowly" - Controlled forward movement
- "Stop" - Emergency stop
- "Turn left" - Manual turn command

## System Prompts

Gemini is configured with this mining vehicle context:

```
You are an AI safety controller for an autonomous mining vehicle.
Analyze the camera feed and provide:
1. Spoken commentary on what you see
2. Navigation decisions (forward, stop, turn, etc.)
3. Safety warnings for hazards

Safety Rules:
- Stop immediately if person detected
- Maintain safe distance from obstacles
- Announce all navigation decisions
- Prioritize safety over speed
```

## Monitoring

### Serial Bridge Console
Watch the terminal running `npm run dev-arduino`:

```
✓ Arduino connected on /dev/tty.wchusbserial110
→ Command to Arduino: {"type":"drive","linear_mps":1.0,"angular_rps":0}
← Arduino telemetry: {"x":0.5,"y":0.2,"battery":85%}
```

### Browser Console
Open DevTools (F12) to see:
```
🎥 Vision-based navigation: Path clear ahead
✅ Path clear - moving forward
→ Command to Arduino: drive forward
```

### Arduino Serial Monitor
If you want to see raw Arduino data:
1. Close the serial bridge (Ctrl+C)
2. Open Arduino IDE → Tools → Serial Monitor (115200 baud)
3. You'll see JSON telemetry every 100ms

## Troubleshooting

### "Cannot send command: Arduino not connected"
**Problem:** Serial bridge can't connect to Arduino

**Solutions:**
1. Close Arduino IDE Serial Monitor
2. Check USB cable is connected
3. Run `npm run find-arduino` to verify port
4. Restart the bridge: Ctrl+C then `npm run arduino-bridge`

### Gemini Not Responding to Camera
**Problem:** AI not analyzing video feed

**Solutions:**
1. Check camera permissions in browser
2. Verify Gemini API key in `.env`
3. Check browser console for errors
4. Try refreshing the page

### Motors Not Moving
**Problem:** Commands sent but motors don't respond

**Solutions:**
1. Check L298N power supply (12V connected?)
2. Verify motor wiring to L298N
3. Check Arduino GND connected to L298N GND
4. Test motors directly with L298N jumpers

### Too Much Voice Feedback
**Problem:** Gemini talks too much

**Solution:** The AI provides real-time commentary. This is intentional for transparency, but you can:
1. Mute browser tab if you just want visual feedback
2. Or modify the system prompt to reduce verbosity

## Advanced Configuration

### Adjust AI Sensitivity

Edit `/src/mining/services/gemini-mining-controller.ts`:

```typescript
// Line 462: Adjust command cooldown
private commandCooldown = 500; // ms between commands (increase to slow down)

// Line 471: Adjust speeds
await this.vehicleClient.manualControl(1.0, 0); // Change 1.0 to 0.5 for slower
```

### Customize Safety Rules

The AI follows safety rules defined in the system prompt. To modify:

1. Edit `/src/mining/services/gemini-mining-controller.ts`
2. Find `SYSTEM_CONTEXT` (line 14)
3. Update safety rules as needed

### Add Custom Locations

Add waypoints Gemini can navigate to:

```typescript
// Line 276 in gemini-mining-controller.ts
const locations: { [key: string]: Waypoint } = {
  'loading bay alpha': { x: 100, y: 50, frame: 'map' },
  'your custom location': { x: 20, y: 30, frame: 'map' }, // Add here
};
```

## Performance Tips

1. **Reduce Camera Resolution**: Lower resolution = faster processing
2. **Increase Command Cooldown**: Less frequent commands = smoother operation
3. **Adjust Telemetry Rate**: Arduino sends data every 100ms, can be increased

## Safety Features

### Automatic Safety Stops
The system will automatically stop if:
- Person detected in camera view
- Critical obstacle detected
- Battery low (< 11V)
- Emergency stop button pressed (Arduino pin 2)

### Manual Override
- **Emergency Stop Button**: Press button on pin 2
- **Voice Command**: Say "stop" or "emergency stop"
- **Web UI**: Click STOP button

## Next Steps

1. **Test in Controlled Environment**: Start with small movements
2. **Add More Sensors**: Ultrasonic sensors for better obstacle detection
3. **Train Custom Model**: For mining-specific object detection
4. **Add Encoders**: For accurate odometry
5. **Implement SLAM**: For autonomous mapping

## Files Modified

- ✅ `/src/mining/services/gemini-mining-controller.ts` - Enhanced vision navigation
- ✅ `/src/mining/hardware/arduino_uno_mining_vehicle.ino` - Arduino firmware
- ✅ `/src/mining/arduino-serial-bridge.js` - Serial to WebSocket bridge
- ✅ `package.json` - Added Arduino scripts

## Support

If you encounter issues:
1. Check all wiring connections
2. Verify Arduino sketch uploaded successfully
3. Ensure camera permissions granted
4. Check Gemini API key is valid
5. Review browser and terminal console logs

---

**You now have a fully functional AI-driven mining vehicle!** 🚀

The AI can see through the camera, make decisions, and control the Arduino motors in real-time. No simulation - everything is real!
