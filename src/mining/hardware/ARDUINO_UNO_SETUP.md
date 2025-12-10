# Arduino Uno Mining Vehicle Controller

This guide explains how to use an **Arduino Uno** with the mining vehicle control system via USB serial communication instead of simulating an ESP32.

## Overview

The Arduino Uno version provides:
- ✅ USB Serial communication (no WiFi needed)
- ✅ Motor control via L298N driver
- ✅ Ultrasonic sensor support
- ✅ Emergency stop button
- ✅ Battery monitoring
- ✅ Compatible with existing Live API web console

## Hardware Requirements

### Required Components
1. **Arduino Uno** (or compatible board)
2. **L298N Motor Driver** (or similar H-bridge)
3. **Two DC Motors** (for differential drive)
4. **USB Cable** (for Arduino-to-PC connection)

### Optional Components
5. **HC-SR04 Ultrasonic Sensors** (x3 for obstacle detection)
6. **Emergency Stop Button** (normally open, connects to GND)
7. **Battery Voltage Divider** (for battery monitoring)
8. **12V Battery** (or appropriate power supply for motors)

## Wiring Diagram

### Motor Driver (L298N) Connections

```
Arduino Uno          L298N Motor Driver
-----------          ------------------
Pin 5 (PWM)    →     ENA (Left motor speed)
Pin 4          →     IN1 (Left motor direction)
Pin 7          →     IN2 (Left motor direction)
Pin 6 (PWM)    →     ENB (Right motor speed)
Pin 8          →     IN3 (Right motor direction)
Pin 9          →     IN4 (Right motor direction)
GND            →     GND
```

### Motor Connections
```
L298N Motor Driver   Motors
------------------   ------
OUT1, OUT2      →    Left Motor
OUT3, OUT4      →    Right Motor
```

### Power Supply
```
12V Battery     →    L298N 12V Input
12V Battery GND →    L298N GND (also connect to Arduino GND)
Arduino         →    Powered via USB from PC
```

### Ultrasonic Sensors (Optional)
```
Arduino Uno     HC-SR04 (Front)
-----------     ---------------
Pin 10     →    TRIG
Pin 11     →    ECHO
5V         →    VCC
GND        →    GND

Arduino Uno     HC-SR04 (Left)
-----------     --------------
Pin 12     →    TRIG
Pin 13     →    ECHO
5V         →    VCC
GND        →    GND

Arduino Uno     HC-SR04 (Right)
-----------     ---------------
Pin A0     →    TRIG
Pin A1     →    ECHO
5V         →    VCC
GND        →    GND
```

### Emergency Stop Button
```
Arduino Uno     Button
-----------     ------
Pin 2      →    One terminal
GND        →    Other terminal (normally open)
```

### Battery Voltage Monitor (Optional)
```
12V Battery → 10kΩ resistor → Arduino A2 → 2.2kΩ resistor → GND
                               (Voltage divider for safe 0-5V reading)
```

## Software Setup

### Step 1: Install Required Libraries

Open Arduino IDE and install these libraries via **Library Manager** (Sketch → Include Library → Manage Libraries):

1. **ArduinoJson** by Benoit Blanchon (version 6.x or 7.x)
2. **NewPing** (for ultrasonic sensors - optional if not using sensors)

### Step 2: Upload Arduino Sketch

1. Open `src/mining/hardware/arduino_uno_mining_vehicle.ino` in Arduino IDE
2. Select your board: **Tools → Board → Arduino Uno**
3. Select your port: **Tools → Port → /dev/cu.usbmodem...** (or COM port on Windows)
4. Click **Upload** (or press Ctrl+U / Cmd+U)
5. Wait for "Done uploading" message

### Step 3: Install Node.js Dependencies

The serial bridge requires the `serialport` package:

```bash
npm install serialport @serialport/parser-readline
```

### Step 4: Find Your Arduino Port

Run the helper script to detect your Arduino:

```bash
npm run find-arduino
```

This will list all available serial ports and highlight likely Arduino ports.

**Example output:**
```
=== Available Serial Ports ===

1. /dev/cu.usbmodem14201
   Manufacturer: Arduino LLC
   ✓ Likely Arduino board

To use this port, run:
  ARDUINO_PORT=/dev/cu.usbmodem14201 npm run arduino-bridge
```

### Step 5: Update Arduino Port (if needed)

If the auto-detected port is wrong, edit `src/mining/arduino-serial-bridge.js`:

```javascript
const SERIAL_PORT = process.env.ARDUINO_PORT || '/dev/cu.usbmodem14201'; // ← Change this
```

**Common port names:**
- **macOS**: `/dev/cu.usbmodem*` or `/dev/cu.usbserial*`
- **Linux**: `/dev/ttyACM0` or `/dev/ttyUSB0`
- **Windows**: `COM3`, `COM4`, etc.

## Running the System

### Option 1: Run Everything Together (Recommended)

```bash
npm run dev-arduino
```

This starts:
1. React web console (http://localhost:3000)
2. Arduino serial bridge (WebSocket server on port 8080)

### Option 2: Run Separately

**Terminal 1 - Start the web console:**
```bash
npm start
```

**Terminal 2 - Start the Arduino bridge:**
```bash
npm run arduino-bridge
```

Or with custom port:
```bash
ARDUINO_PORT=/dev/cu.usbmodem14201 npm run arduino-bridge
```

## Testing the Connection

### 1. Check Serial Bridge Output

You should see:
```
✓ Arduino connected on /dev/cu.usbmodem14201
✓ Baud rate: 115200
✓ WebSocket server running on http://localhost:8080
✓ WebSocket endpoint: ws://localhost:8080/esp32
```

### 2. Check Arduino Serial Monitor

Open **Tools → Serial Monitor** in Arduino IDE (set to 115200 baud):

You should see:
```json
{"type":"startup","device":"ROVER_UNO_01","status":"initializing"}
{"type":"startup","device":"ROVER_UNO_01","status":"ready"}
{"type":"telemetry","data":{...}}
```

### 3. Test in Web Console

1. Open http://localhost:3000
2. Click **⛏️ Mining Mode** button
3. Check connection status (should show "Connected")
4. Try manual controls (arrows, stop button)
5. Send voice commands like "move forward slowly"

## Troubleshooting

### Arduino Not Detected

**Problem:** `Error: Error: No such file or directory, cannot open /dev/cu.usbmodem14201`

**Solutions:**
1. Run `npm run find-arduino` to find correct port
2. Check USB cable (must support data, not just power)
3. Close Arduino IDE Serial Monitor (can't have two programs using same port)
4. Try different USB port on your computer
5. Check Arduino drivers are installed

### Motors Not Moving

**Problem:** Commands received but motors don't move

**Solutions:**
1. Check L298N power supply (needs 12V for motors)
2. Verify motor driver connections (IN1-IN4, ENA, ENB)
3. Test motors directly with L298N jumpers
4. Check if emergency stop is triggered (press reset button)
5. Verify motor power supply GND is connected to Arduino GND

### Serial Communication Errors

**Problem:** `JSON parse error` in Arduino Serial Monitor

**Solutions:**
1. Check baud rate is 115200 in both Arduino sketch and bridge
2. Verify ArduinoJson library is installed
3. Try uploading sketch again
4. Check for loose USB connection

### WebSocket Connection Failed

**Problem:** Web console shows "Disconnected"

**Solutions:**
1. Verify serial bridge is running (`npm run arduino-bridge`)
2. Check WebSocket URL in `.env` file: `REACT_APP_ESP32_WS_URL=ws://localhost:8080/esp32`
3. Check port 8080 is not used by another program
4. Look for errors in serial bridge terminal

## Command Protocol

The Arduino accepts JSON commands via serial:

### Drive Command
```json
{
  "type": "drive",
  "id": "cmd_123",
  "linear_mps": 1.5,
  "angular_rps": 0.5,
  "duration_s": 5.0
}
```

### Stop Command
```json
{
  "type": "stop",
  "id": "cmd_124",
  "reason": "User requested",
  "emergency": false
}
```

### Waypoint Navigation
```json
{
  "type": "waypoint",
  "id": "cmd_125",
  "x": 10.0,
  "y": 5.0,
  "tolerance_m": 1.0,
  "v_max": 2.0
}
```

## Telemetry Format

Arduino sends telemetry every 100ms (10Hz):

```json
{
  "type": "telemetry",
  "data": {
    "pose": {
      "x": 0.0,
      "y": 0.0,
      "theta": 0.0,
      "frame": "map"
    },
    "velocity": {
      "linear": 0.0,
      "angular": 0.0
    },
    "battery": {
      "voltage": 12.0,
      "percentage": 85,
      "current": 2.5
    },
    "distances": [100, 150, 120],
    "timestamp": 1234567890
  }
}
```

## Customization

### Adjust Motor Speeds

Edit in Arduino sketch:
```cpp
const float MAX_LINEAR_SPEED = 2.0; // m/s
const float MAX_ANGULAR_SPEED = 1.57; // rad/s
```

### Change Pin Assignments

Modify pin definitions at the top of `arduino_uno_mining_vehicle.ino`:
```cpp
#define MOTOR_LEFT_PWM    5
#define MOTOR_LEFT_DIR1   4
// etc...
```

### Adjust Telemetry Rate

Change in Arduino sketch:
```cpp
const unsigned long TELEMETRY_INTERVAL = 100; // milliseconds (10Hz)
```

## Safety Features

1. **Emergency Stop Button**: Press to immediately stop all motors
2. **Motor Timeout**: Motors stop if no command received (safety feature)
3. **Battery Monitoring**: Low battery warning
4. **Obstacle Detection**: Ultrasonic sensors detect obstacles (if installed)

## Next Steps

- Add more sensors (IMU, GPS, etc.)
- Implement autonomous navigation
- Add camera integration
- Tune PID controllers for smoother movement
- Add encoder feedback for accurate odometry

## Support

If you encounter issues:
1. Check wiring connections
2. Verify Arduino sketch uploaded successfully
3. Run `npm run find-arduino` to verify port
4. Check serial bridge logs for errors
5. Test motors independently with L298N

## Differences from ESP32 Version

| Feature | ESP32 | Arduino Uno |
|---------|-------|-------------|
| Communication | WiFi WebSocket | USB Serial |
| Wireless | ✅ Yes | ❌ No (tethered) |
| Processing Power | Higher | Lower |
| Memory | More | Limited |
| Setup Complexity | Higher | Lower |
| Cost | Higher | Lower |
| Best For | Production | Testing/Development |
