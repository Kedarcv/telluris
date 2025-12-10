# Arduino Uno Pinout Configuration

## Motor Control (L298N)
| Function | Pin | Note |
|----------|-----|------|
| **ENA** (Left Speed) | **2** | *Non-PWM on Uno (Speed control limited)* |
| **IN1** (Left Dir 1) | **3** | |
| **IN2** (Left Dir 2) | **4** | |
| **ENB** (Right Speed)| **10**| PWM Capable |
| **IN3** (Right Dir 1)| **8** | |
| **IN4** (Right Dir 2)| **9** | |

## Sensors & Safety
**DISABLED** - Motors Only Mode

## Instructions
1. **Re-wire** your Arduino according to the Motor Control table.
2. **Upload** the updated sketch `src/mining/hardware/arduino_uno_mining_vehicle.ino` to your Arduino.
3. **Restart** the bridge: `npm run dev-arduino`
