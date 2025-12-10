# ⚠️ IMPORTANT: Board Selection

## You're Currently Using ESP8266!

Based on the compilation error, you have **ESP8266** selected in Arduino IDE, not Arduino Uno.

## How to Fix

### Option 1: Switch to Arduino Uno (Recommended)

1. In Arduino IDE, go to **Tools → Board**
2. Select **Arduino AVR Boards → Arduino Uno**
3. Go to **Tools → Port**
4. Select `/dev/tty.wchusbserial110`
5. Click **Upload**

### Option 2: Use ESP8266 (Alternative)

If you actually want to use ESP8266 instead of Arduino Uno:

1. The code now supports both boards!
2. Keep ESP8266 selected
3. Note: ESP8266 only has **one analog pin (A0)**, so:
   - Battery monitoring will work (A0)
   - Right ultrasonic sensor uses digital pins instead
4. Upload the sketch

## Pin Differences

### Arduino Uno (Recommended)
```
✅ 6 Analog pins (A0-A5)
✅ More stable for motor control
✅ Easier for beginners
✅ Better documented
```

### ESP8266
```
⚠️ Only 1 analog pin (A0)
✅ Built-in WiFi (not used in this sketch)
⚠️ 3.3V logic (may need level shifters)
⚠️ More complex pin mapping
```

## Quick Check

**What board do you actually have connected?**

- If it says "Arduino Uno" or "Arduino" on the board → Select **Arduino Uno**
- If it says "NodeMCU", "ESP8266", "Wemos D1" → Select **ESP8266**
- If you have a CH340 USB chip (common on clones) → Still select **Arduino Uno** if it's an Uno clone

## After Selecting Correct Board

The sketch will now compile for both boards! The code automatically adjusts pin assignments based on your selection.

**Try uploading again!** 🚀
