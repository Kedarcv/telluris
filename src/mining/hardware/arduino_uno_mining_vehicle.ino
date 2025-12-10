/*
 * Mining Vehicle Controller - Arduino Uno Version
 * Serial Communication Bridge for Live API Web Console
 * 
 * This sketch runs on Arduino Uno and communicates via USB Serial
 * with the mining vehicle control system.
 * 
 * Hardware Requirements:
 * - Arduino Uno
 * - Motor Driver (L298N or similar)
 * - Two DC Motors
 * - Optional: Ultrasonic sensors (HC-SR04)
 * - Optional: Emergency stop button
 * 
 * Communication Protocol:
 * - Receives JSON commands via Serial
 * - Sends JSON telemetry via Serial
 * - Baud rate: 115200
 */

#include <ArduinoJson.h>

// ==================== PIN DEFINITIONS ====================

// Motor Driver (L298N) - User Configuration
#define MOTOR_LEFT_PWM    3   // ENA (PWM capable)
#define MOTOR_LEFT_DIR1   4   // IN1
#define MOTOR_LEFT_DIR2   5   // IN2
#define MOTOR_RIGHT_PWM   10  // ENB
#define MOTOR_RIGHT_DIR1  8   // IN3
#define MOTOR_RIGHT_DIR2  9   // IN4
#define AI_TRIGGER_PIN    12  // Digital input from AI to trigger movement

// Sensors & Safety - DISABLED (Motors Only Mode)
/*
#define TRIG_FRONT    5
#define ECHO_FRONT    11
#define TRIG_LEFT     6
#define ECHO_LEFT     7
#define TRIG_RIGHT    A0
#define ECHO_RIGHT    A1
#define BATTERY_VOLTAGE A2
#define EMERGENCY_STOP  12
*/

// Status LED
#define LED_STATUS      13  // Built-in LED

// ==================== CONSTANTS ====================
#define BAUD_RATE 115200
#define MAX_DISTANCE 400
#define OBSTACLE_THRESHOLD 30
#define BATTERY_LOW_THRESHOLD 11.0
#define DEVICE_ID "ROVER_UNO_01"

// Vehicle parameters
const float WHEEL_BASE = 0.5; // meters
const float MAX_LINEAR_SPEED = 2.0; // m/s
const float MAX_ANGULAR_SPEED = 1.57; // rad/s (90 deg/s)

// ==================== GLOBAL VARIABLES ====================
struct VehicleState {
  float x = 0;
  float y = 0;
  float theta = 0;
  float linearVelocity = 0;
  float angularVelocity = 0;
  float batteryVoltage = 12.0;
  float batteryPercentage = 100.0;
  bool emergencyStop = false;
  unsigned long lastUpdate = 0;
  int leftMotorSpeed = 0;
  int rightMotorSpeed = 0;
} vehicleState;

struct SensorData {
  float distances[3] = {0, 0, 0}; // front, left, right
  float temperature = 25.0;
} sensorData;

struct CommandState {
  String type = "";
  float linearSpeed = 0;
  float angularSpeed = 0;
  float targetX = 0;
  float targetY = 0;
  float tolerance = 1.0;
  unsigned long startTime = 0;
  unsigned long duration = 0;
  bool active = false;
} commandState;

// Timing
unsigned long lastTelemetryTime = 0;
unsigned long lastSensorReadTime = 0;
const unsigned long TELEMETRY_INTERVAL = 100; // 10Hz
const unsigned long SENSOR_READ_INTERVAL = 100; // 10Hz

// Serial buffer
const int BUFFER_SIZE = 256;
char inputBuffer[BUFFER_SIZE];
int bufferPos = 0;

// ==================== FUNCTION PROTOTYPES ====================
void initializePins();
void readSerialCommands();
void processCommand(String commandJson);
void executeCommand();
void updateVehicleState();
void sendTelemetry();
void sendResponse(String id, bool ok);
void sendError(String message);
void stopMotors();
void controlMotors(int leftSpeed, int rightSpeed);
void applyDifferentialDrive(float linear, float angular);
void readSensors();
float readUltrasonic(int trigPin, int echoPin);

// ==================== SETUP ====================
void setup() {
  Serial.begin(BAUD_RATE);
  
  // Immediate output to verify serial is working
  delay(100);
  Serial.println("{\"type\":\"debug\",\"msg\":\"Serial started\"}");
  Serial.flush();
  
  // Small delay for serial to initialize (no blocking wait for Serial Monitor)
  delay(400);
  Serial.println("{\"type\":\"startup\",\"device\":\"" DEVICE_ID "\",\"status\":\"initializing\"}");
  Serial.flush();
  
  // Initialize pins
  Serial.println("{\"type\":\"debug\",\"msg\":\"Initializing pins\"}");
  Serial.flush();
  initializePins();
  
  // Initialize random seed
  randomSeed(analogRead(0));
  
  // Startup delay
  delay(500);
  
  // Motor test: run both motors forward for 2 seconds to verify wiring
  Serial.println("{\"type\":\"debug\",\"msg\":\"Starting motor test\"}");
  Serial.flush();
  controlMotors(255, 255);
  delay(2000);
  controlMotors(0, 0);
  Serial.println("{\"type\":\"debug\",\"msg\":\"Motor test complete\"}");
  Serial.flush();
  
  // Setup interrupts
  // attachInterrupt(digitalPinToInterrupt(EMERGENCY_STOP), emergencyStopISR, FALLING);
  // Note: Interrupts disabled because pins 2 & 3 are used for motors
  
  Serial.println("{\"type\":\"startup\",\"device\":\"" DEVICE_ID "\",\"status\":\"ready\"}");
  Serial.flush();
  
  // Initial state
  vehicleState.lastUpdate = millis();
}

// ==================== MAIN LOOP ====================
  // ==================== MAIN LOOP ====================
void loop() {
  unsigned long currentTime = millis();
  
  // Blink LED to show loop is running (fast blink)
  static unsigned long lastBlink = 0;
  if (currentTime - lastBlink >= 100) {
    digitalWrite(LED_STATUS, !digitalRead(LED_STATUS));
    lastBlink = currentTime;
  }
  
  // Simple heartbeat to verify Arduino is running
  static unsigned long lastHeartbeat = 0;
  if (currentTime - lastHeartbeat >= 1000) {
    Serial.println("{\"type\":\"heartbeat\",\"uptime\":" + String(currentTime) + "}");
    Serial.flush();
    lastHeartbeat = currentTime;
  }

  // Read serial commands
  readSerialCommands();

  // If no active command from Gemini and no emergency stop, handle AI trigger pin (active HIGH)
  if (!commandState.active && !vehicleState.emergencyStop) {
    if (digitalRead(AI_TRIGGER_PIN) == HIGH) {
      // Simple forward command when trigger is active
      controlMotors(255, 255);
    } else {
      // Stop motors when trigger not active
      controlMotors(0, 0);
    }
  }

  // E-Stop Disabled
  /*
  if (digitalRead(EMERGENCY_STOP) == LOW) { ... }
  */

  // Read sensors periodically
  if (currentTime - lastSensorReadTime >= SENSOR_READ_INTERVAL) {
    readSensors();
    lastSensorReadTime = currentTime;
  }

  // Execute active command
  if (commandState.active && !vehicleState.emergencyStop) {
    executeCommand();
  }

  // Update vehicle state
  updateVehicleState();

  // Send telemetry periodically
  if (currentTime - lastTelemetryTime >= TELEMETRY_INTERVAL) {
    sendTelemetry();
    lastTelemetryTime = currentTime;
  }
}

// ==================== INITIALIZATION ====================
void initializePins() {
  // Motor pins
  pinMode(MOTOR_LEFT_PWM, OUTPUT);
  pinMode(MOTOR_LEFT_DIR1, OUTPUT);
  pinMode(MOTOR_LEFT_DIR2, OUTPUT);
  pinMode(MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR1, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR2, OUTPUT);
  
  // LED
  pinMode(LED_STATUS, OUTPUT);
  
  // AI trigger pin (active HIGH from ESP32)
  pinMode(AI_TRIGGER_PIN, INPUT);
  
  // Sensors & Safety - DISABLED
  /*
  pinMode(EMERGENCY_STOP, INPUT_PULLUP);
  pinMode(TRIG_FRONT, OUTPUT);
  pinMode(ECHO_FRONT, INPUT);
  ...
  */
  
  // Initialize motors to stopped
  stopMotors();
  
  digitalWrite(LED_STATUS, HIGH); // Turn on status LED
}

// ==================== SERIAL COMMUNICATION ====================
void readSerialCommands() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    
    // Blink LED to show we're receiving data
    digitalWrite(LED_STATUS, HIGH);
    
    // Check for buffer overflow
    if (bufferPos >= BUFFER_SIZE - 1) {
      // Buffer full, reset
      bufferPos = 0;
      sendError("Buffer overflow");
      digitalWrite(LED_STATUS, LOW);
      return;
    }
    
    if (c == '\n' || c == '\r') {
      if (bufferPos > 0) {
        inputBuffer[bufferPos] = '\0'; // Null terminate
        
        // Debug: Send a simple acknowledgment
        Serial.println("{\"type\":\"debug\",\"msg\":\"Command received\"}");
        Serial.flush();
        
        processCommand(String(inputBuffer)); // Convert to String for existing processCommand (or update processCommand to take char*)
        bufferPos = 0;
      }
    } else {
      inputBuffer[bufferPos++] = c;
    }
    
    digitalWrite(LED_STATUS, LOW);
  }
}

void processCommand(String commandJson) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, commandJson);
  
  if (error) {
    Serial.print("{\"type\":\"error\",\"error\":\"JSON parse error\",\"received\":\"");
    Serial.print(commandJson);
    Serial.println("\"}");
    Serial.flush();
    return;
  }
  String type = doc["type"];
  String id = doc["id"] | "";
  
  if (type == "drive") {
    commandState.type = "drive";
    commandState.linearSpeed = constrain((float)doc["linear_mps"], -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    commandState.angularSpeed = constrain((float)doc["angular_rps"], -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    commandState.startTime = millis();
    commandState.duration = (unsigned long)((float)doc["duration_s"] * 1000.0);
    commandState.active = true;
    
    sendResponse(id, true);
    
  } else if (type == "waypoint") {
    commandState.type = "waypoint";
    commandState.targetX = doc["x"];
    commandState.targetY = doc["y"];
    commandState.tolerance = doc["tolerance_m"] | 1.0;
    commandState.linearSpeed = doc["v_max"] | 2.0;
    commandState.active = true;
    
    sendResponse(id, true);
    
  } else if (type == "stop") {
    commandState.active = false;
    stopMotors();
    
    if (doc["emergency"]) {
      vehicleState.emergencyStop = true;
    }
    
    sendResponse(id, true);
    
  } else if (type == "query") {
    sendTelemetry();
    sendResponse(id, true);
    
  } else if (type == "heartbeat") {
    sendResponse(id, true);
  
  } else if (type == "io") {
    // Handle digital I/O commands
    int pin = doc["pin"] | -1;
    String state = doc["state"] | "";
    
    if (pin >= 0 && pin <= 13) {
      if (state == "high") {
        digitalWrite(pin, HIGH);
        sendResponse(id, true);
      } else if (state == "low") {
        digitalWrite(pin, LOW);
        sendResponse(id, true);
      } else {
        sendError("Invalid state for pin " + String(pin) + ": " + state);
      }
    } else {
      sendError("Invalid pin number: " + String(pin));
    }
    
  } else if (type == "reset_emergency") {
    vehicleState.emergencyStop = false;
    sendResponse(id, true);
    
  } else {
    sendError("Unknown command type: " + type);
  }
}

void sendResponse(String id, bool ok) {
  StaticJsonDocument<256> doc;
  doc["id"] = id;
  doc["ok"] = ok;
  doc["timestamp"] = millis();
  
  serializeJson(doc, Serial);
  Serial.println();
  Serial.flush();
}

void sendError(String message) {
  StaticJsonDocument<256> doc;
  doc["type"] = "error";
  doc["error"] = message;
  doc["timestamp"] = millis();
  
  serializeJson(doc, Serial);
  Serial.println();
  Serial.flush();
}

void sendTelemetry() {
  StaticJsonDocument<1024> doc;  // Increased from 512 to prevent memory overflow
  
  doc["type"] = "telemetry";
  
  JsonObject data = doc.createNestedObject("data");
  
  // Pose
  JsonObject pose = data.createNestedObject("pose");
  pose["x"] = vehicleState.x;
  pose["y"] = vehicleState.y;
  pose["theta"] = vehicleState.theta;
  pose["frame"] = "map";
  
  // Velocity
  JsonObject velocity = data.createNestedObject("velocity");
  velocity["linear"] = vehicleState.linearVelocity;
  velocity["angular"] = vehicleState.angularVelocity;
  
  // Battery
  JsonObject battery = data.createNestedObject("battery");
  battery["voltage"] = vehicleState.batteryVoltage;
  battery["percentage"] = vehicleState.batteryPercentage;
  battery["current"] = 2.5;
  
  // Health
  JsonObject health = data.createNestedObject("health");
  JsonObject temps = health.createNestedObject("temperatures");
  temps["motor_left"] = sensorData.temperature;
  temps["motor_right"] = sensorData.temperature;
  health["link_quality"] = 100;
  
  // Sensors
  JsonArray distances = data.createNestedArray("distances");
  distances.add(sensorData.distances[0]);
  distances.add(sensorData.distances[1]);
  distances.add(sensorData.distances[2]);
  
  data["timestamp"] = millis();
  
  serializeJson(doc, Serial);
  Serial.println();
  Serial.flush();
}

// ==================== COMMAND EXECUTION ====================
void executeCommand() {
  if (commandState.type == "drive") {
    // Check duration
    if (commandState.duration > 0 && 
        millis() - commandState.startTime > commandState.duration) {
      commandState.active = false;
      stopMotors();
      return;
    }
    
    // Apply drive command
    applyDifferentialDrive(commandState.linearSpeed, commandState.angularSpeed);
    
  } else if (commandState.type == "waypoint") {
    // Simple waypoint navigation
    float dx = commandState.targetX - vehicleState.x;
    float dy = commandState.targetY - vehicleState.y;
    float distance = sqrt(dx*dx + dy*dy);
    
    if (distance < commandState.tolerance) {
      // Waypoint reached
      commandState.active = false;
      stopMotors();
      return;
    }
    
    // Calculate desired heading
    float targetHeading = atan2(dy, dx);
    float headingError = targetHeading - vehicleState.theta;
    
    // Normalize heading error to [-π, π]
    while (headingError > PI) headingError -= 2*PI;
    while (headingError < -PI) headingError += 2*PI;
    
    // Simple proportional control
    float angularSpeed = constrain(headingError * 2.0, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    float linearSpeed = abs(headingError) < 0.2 ? 
                        min(commandState.linearSpeed, (float)(distance * 0.5f)) : 0.5f;
    
    applyDifferentialDrive(linearSpeed, angularSpeed);
  }
}

void applyDifferentialDrive(float linear, float angular) {
  // Convert to wheel speeds
  float leftSpeed = linear - angular * WHEEL_BASE / 2.0;
  float rightSpeed = linear + angular * WHEEL_BASE / 2.0;
  
  // Convert to motor PWM values (-255 to 255)
  int leftPWM = map(abs(leftSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  int rightPWM = map(abs(rightSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  
  // Apply direction
  if (leftSpeed < 0) leftPWM = -leftPWM;
  if (rightSpeed < 0) rightPWM = -rightPWM;
  
  controlMotors(leftPWM, rightPWM);
  
  // Update state
  vehicleState.linearVelocity = linear;
  vehicleState.angularVelocity = angular;
}

// ==================== MOTOR CONTROL ====================
void controlMotors(int leftSpeed, int rightSpeed) {
  // Constrain speeds
  leftSpeed = constrain(leftSpeed, -255, 255);
  rightSpeed = constrain(rightSpeed, -255, 255);
  
  // Store current speeds
  vehicleState.leftMotorSpeed = leftSpeed;
  vehicleState.rightMotorSpeed = rightSpeed;
  
  // Left motor
  if (leftSpeed > 0) {
    digitalWrite(MOTOR_LEFT_DIR1, HIGH);
    digitalWrite(MOTOR_LEFT_DIR2, LOW);
    analogWrite(MOTOR_LEFT_PWM, leftSpeed);
  } else if (leftSpeed < 0) {
    digitalWrite(MOTOR_LEFT_DIR1, LOW);
    digitalWrite(MOTOR_LEFT_DIR2, HIGH);
    analogWrite(MOTOR_LEFT_PWM, -leftSpeed);
  } else {
    digitalWrite(MOTOR_LEFT_DIR1, LOW);
    digitalWrite(MOTOR_LEFT_DIR2, LOW);
    analogWrite(MOTOR_LEFT_PWM, 0);
  }
  
  // Right motor
  if (rightSpeed > 0) {
    digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
    digitalWrite(MOTOR_RIGHT_DIR2, LOW);
    analogWrite(MOTOR_RIGHT_PWM, rightSpeed);
  } else if (rightSpeed < 0) {
    digitalWrite(MOTOR_RIGHT_DIR1, LOW);
    digitalWrite(MOTOR_RIGHT_DIR2, HIGH);
    analogWrite(MOTOR_RIGHT_PWM, -rightSpeed);
  } else {
    digitalWrite(MOTOR_RIGHT_DIR1, LOW);
    digitalWrite(MOTOR_RIGHT_DIR2, LOW);
    analogWrite(MOTOR_RIGHT_PWM, 0);
  }
}

void stopMotors() {
  controlMotors(0, 0);
  vehicleState.linearVelocity = 0;
  vehicleState.angularVelocity = 0;
}

// ==================== SENSOR READING ====================
void readSensors() {
  // Dummy data for Motors-Only mode
  sensorData.distances[0] = MAX_DISTANCE;
  sensorData.distances[1] = MAX_DISTANCE;
  sensorData.distances[2] = MAX_DISTANCE;
  
  vehicleState.batteryVoltage = 12.0;
  vehicleState.batteryPercentage = 100.0;
}

float readUltrasonic(int trigPin, int echoPin) {
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  long duration = pulseIn(echoPin, HIGH, 30000); // 30ms timeout
  
  if (duration == 0) {
    return MAX_DISTANCE;
  }
  
  float distance = duration * 0.034 / 2.0; // cm
  
  if (distance > MAX_DISTANCE) {
    return MAX_DISTANCE;
  }
  
  return distance;
}

// ==================== STATE UPDATE ====================
void updateVehicleState() {
  unsigned long currentTime = millis();
  float dt = (currentTime - vehicleState.lastUpdate) / 1000.0; // seconds
  
  if (dt > 0) {
    // Update heading
    vehicleState.theta += vehicleState.angularVelocity * dt;
    
    // Keep theta in [-π, π]
    while (vehicleState.theta > PI) vehicleState.theta -= 2 * PI;
    while (vehicleState.theta < -PI) vehicleState.theta += 2 * PI;
    
    // Update position
    vehicleState.x += vehicleState.linearVelocity * cos(vehicleState.theta) * dt;
    vehicleState.y += vehicleState.linearVelocity * sin(vehicleState.theta) * dt;
    
    vehicleState.lastUpdate = currentTime;
  }
}

// ==================== INTERRUPT HANDLERS ====================
// ISR disabled in Motors-Only mode
/*
void emergencyStopISR() {
  vehicleState.emergencyStop = true;
  stopMotors();
}
*/
