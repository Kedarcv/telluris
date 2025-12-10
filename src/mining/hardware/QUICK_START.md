# Quick Start - Arduino Uno Testing

## ✅ Your Arduino is detected!

**Port:** `/dev/tty.wchusbserial110`

## Steps to Get Started

### 1. Upload Arduino Sketch

1. Open Arduino IDE
2. Open file: `src/mining/hardware/arduino_uno_mining_vehicle.ino`
3. Install required libraries:
   - **ArduinoJson** (via Library Manager)
   - **NewPing** (optional, for ultrasonic sensors)
4. Select **Board**: Arduino Uno
5. Select **Port**: `/dev/tty.wchusbserial110`
6. Click **Upload**

### 2. Wire Your Hardware

**Minimum setup (motors only):**
```
Arduino → L298N Motor Driver
Pin 5   → ENA (Left motor PWM)
Pin 4   → IN1 (Left direction)
Pin 7   → IN2 (Left direction)
Pin 6   → ENB (Right motor PWM)
Pin 8   → IN3 (Right direction)
Pin 9   → IN4 (Right direction)
GND     → GND

L298N → Motors
OUT1, OUT2 → Left Motor
OUT3, OUT4 → Right Motor

Power:
12V Battery → L298N 12V input
12V GND     → L298N GND + Arduino GND
```

See `ARDUINO_UNO_SETUP.md` for complete wiring diagram.

### 3. Test Serial Communication

After uploading, open Arduino IDE Serial Monitor (115200 baud):

You should see:
```json
{"type":"startup","device":"ROVER_UNO_01","status":"ready"}
{"type":"telemetry","data":{...}}
```

### 4. Run the System

**Option A - Everything together:**
```bash
npm run dev-arduino
```

**Option B - Separate terminals:**

Terminal 1:
```bash
npm start
```

Terminal 2:
```bash
npm run arduino-bridge
```

### 5. Test in Web Console

1. Open http://localhost:3000
2. Click **⛏️ Mining Mode**
3. Check connection status (should show connected)
4. Try manual controls or voice commands

## Troubleshooting

### Arduino IDE can't upload
- Close Serial Monitor before uploading
- Check USB cable supports data
- Try different USB port

### Serial bridge can't connect
- Close Arduino IDE Serial Monitor
- Verify Arduino is still connected
- Run `npm run find-arduino` to check port

### Motors don't move
- Check 12V power supply to L298N
- Verify all GND connections
- Test motors directly with L298N jumpers
- Check emergency stop button (pin 2)

## Next Steps

- Add ultrasonic sensors for obstacle detection
- Add emergency stop button (pin 2 to GND)
- Add battery voltage monitoring (A2 pin)
- Test autonomous navigation
- Integrate with Live API for voice control

## Files Created

1. `arduino_uno_mining_vehicle.ino` - Arduino sketch
2. `arduino-serial-bridge.js` - Serial to WebSocket bridge
3. `find-arduino-port.js` - Port detection helper
4. `ARDUINO_UNO_SETUP.md` - Complete setup guide
5. `QUICK_START.md` - This file

## Support

For detailed instructions, see `ARDUINO_UNO_SETUP.md`
