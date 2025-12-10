/*
 * ESP32-CAM Motor Control Only - NO CAMERA
 * Testing motors with AI commands
 * 
 * Hardware:
 * - ESP32-CAM board (camera disabled)
 * - L298N Motor Driver  
 * - 4 DC Motors (2 left + 2 right)
 * 
 * Connects to: MLUNGISI WiFi
 * AI Control: ws://<ESP32-IP>:8080
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "MLUNGISI";
const char* password = "12345678";

// L298N Motor pins
struct MOTOR_PINS {
  int pinEn;  
  int pinIN1;
  int pinIN2;    
};

MOTOR_PINS motorPins[2] = {
  {12, 13, 15},  // RIGHT_MOTOR (EnA=GPIO12, IN1=GPIO13, IN2=GPIO15)
  {14, 2, 16},    // LEFT_MOTOR  (EnB=GPIO14, IN3=GPIO2, IN4=GPIO4)
};
#define NUM_MOTORS 2

#define RIGHT_MOTOR 0
#define LEFT_MOTOR 1

// Motor Directions for L298N
#define DIR_FORWARD 1
#define DIR_BACKWARD -1
#define DIR_STOP 0

// Movement States
#define STATE_STOP 0
#define STATE_FORWARD 1
#define STATE_BACKWARD 2
#define STATE_LEFT 3
#define STATE_RIGHT 4

// PWM Config
const int PWMFreq = 50; // Lower frequency (50Hz) provides better torque for DC motors
const int PWMResolution = 8;
const int PWM_CHANNEL_RIGHT = 0;
const int PWM_CHANNEL_LEFT = 1;

// AI WebSocket
WebSocketsServer wsAI(8080);

// Speed Control Variables
int currentSpeed = 0;      // Actual speed applied to motors (0-255)
int targetSpeed = 0;       // Desired speed (0-255)
int currentState = STATE_STOP; // Current movement state
int targetState = STATE_STOP;  // Desired movement state

// Ramp Config
const int RAMP_STEP = 5;       // Speed increase per cycle
const int RAMP_DELAY = 10;     // Delay between updates (ms)
unsigned long lastRampTime = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32-CAM Motor Test - AI Control ===");
  
  // Setup motor pins
  setupMotors();
  
  // Connect to WiFi
  connectWiFi();
  
  // Start AI WebSocket
  wsAI.begin();
  wsAI.onEvent(onAIWebSocketEvent);
  Serial.println("AI WebSocket started on port 8080");
  Serial.println("=== READY ===");
}

void loop() {
  wsAI.loop();
  handleMotorRamp();
}

void handleMotorRamp() {
  if (millis() - lastRampTime < RAMP_DELAY) return;
  lastRampTime = millis();

  // If states are different, we must stop first
  if (currentState != targetState) {
    if (currentSpeed > 0) {
      // Ramp down to 0
      currentSpeed -= RAMP_STEP;
      if (currentSpeed < 0) currentSpeed = 0;
    } else {
      // Speed is 0, safe to switch state
      currentState = targetState;
    }
  } 
  else {
    // States match, ramp speed towards target
    if (currentSpeed < targetSpeed) {
      currentSpeed += RAMP_STEP;
      if (currentSpeed > targetSpeed) currentSpeed = targetSpeed;
    } else if (currentSpeed > targetSpeed) {
      currentSpeed -= RAMP_STEP;
      if (currentSpeed < targetSpeed) currentSpeed = targetSpeed;
    }
  }

  // Apply to motors
  applyMotorState();
}

void applyMotorState() {
  switch (currentState) {
    case STATE_FORWARD:
      rotateMotor(RIGHT_MOTOR, DIR_FORWARD);
      rotateMotor(LEFT_MOTOR, DIR_FORWARD);
      break;
    case STATE_BACKWARD:
      rotateMotor(RIGHT_MOTOR, DIR_BACKWARD);
      rotateMotor(LEFT_MOTOR, DIR_BACKWARD);
      break;
    case STATE_LEFT:
      rotateMotor(RIGHT_MOTOR, DIR_FORWARD);
      rotateMotor(LEFT_MOTOR, DIR_BACKWARD);
      break;
    case STATE_RIGHT:
      rotateMotor(RIGHT_MOTOR, DIR_BACKWARD);
      rotateMotor(LEFT_MOTOR, DIR_FORWARD);
      break;
    case STATE_STOP:
    default:
      rotateMotor(RIGHT_MOTOR, DIR_STOP);
      rotateMotor(LEFT_MOTOR, DIR_STOP);
      break;
  }
  
  ledcWrite(PWM_CHANNEL_RIGHT, currentSpeed);
  ledcWrite(PWM_CHANNEL_LEFT, currentSpeed);
}

void setupMotors() {
  // Setup separate PWM channels for each motor
  ledcSetup(PWM_CHANNEL_RIGHT, PWMFreq, PWMResolution);
  ledcSetup(PWM_CHANNEL_LEFT, PWMFreq, PWMResolution);
  
  // Right motor
  pinMode(motorPins[RIGHT_MOTOR].pinEn, OUTPUT);
  pinMode(motorPins[RIGHT_MOTOR].pinIN1, OUTPUT);
  pinMode(motorPins[RIGHT_MOTOR].pinIN2, OUTPUT);
  ledcAttachPin(motorPins[RIGHT_MOTOR].pinEn, PWM_CHANNEL_RIGHT);
  
  // Left motor
  pinMode(motorPins[LEFT_MOTOR].pinEn, OUTPUT);
  pinMode(motorPins[LEFT_MOTOR].pinIN1, OUTPUT);
  pinMode(motorPins[LEFT_MOTOR].pinIN2, OUTPUT);
  ledcAttachPin(motorPins[LEFT_MOTOR].pinEn, PWM_CHANNEL_LEFT);
  
  stopMotors();
  Serial.println("Motors initialized");
}

void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);
  
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi Connected!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("AI Control: ws://");
    Serial.print(WiFi.localIP());
    Serial.println(":8080");
  } else {
    Serial.println("\nWiFi FAILED!");
  }
}

// AI WebSocket Events
void onAIWebSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("[AI] Client #%u disconnected\n", num);
      stopMotors();
      break;
      
    case WStype_CONNECTED:
      Serial.printf("[AI] Client #%u connected\n", num);
      wsAI.sendTXT(num, "{\"type\":\"connected\",\"message\":\"Motor Control Ready\"}");
      break;
      
    case WStype_TEXT:
      Serial.printf("[AI] RX: %s\n", payload);
      processAICommand(String((char*)payload), num);
      break;
  }
}

// Process AI Commands
void processAICommand(String json, uint8_t clientNum) {
  StaticJsonDocument<512> doc;
  
  if (deserializeJson(doc, json) != DeserializationError::Ok) {
    Serial.println("[AI] JSON parse error");
    return;
  }
  
  String type = doc["type"];
  String commandId = doc["id"] | "";  // Extract command ID for acknowledgment
  
  if (type == "drive") {
    float linear_mps = doc["linear_mps"] | 0.0;
    float angular_rps = doc["angular_rps"] | 0.0;
    int speed_override = doc["speed"] | -1;  // Optional speed 0-255
    
    Serial.printf("[AI] Drive: linear=%.2f, angular=%.2f\n", linear_mps, angular_rps);
    
    // Differential drive calculation
    float leftSpeed = linear_mps - (angular_rps * 0.5);
    float rightSpeed = linear_mps + (angular_rps * 0.5);
    
    // Determine target speed
    int speed;
    if (speed_override >= 0) {
      speed = constrain(speed_override, 0, 255);
    } else {
      speed = (int)(max(abs(linear_mps), abs(angular_rps)) * 255);
    }
    
    // Set Target State and Speed
    if (abs(linear_mps) < 0.1 && abs(angular_rps) < 0.1) {
      targetState = STATE_STOP;
      targetSpeed = 0;
    }
    else if (leftSpeed > 0 && rightSpeed > 0) {
      targetState = STATE_FORWARD;
      targetSpeed = speed;
    }
    else if (leftSpeed < 0 && rightSpeed < 0) {
      targetState = STATE_BACKWARD;
      targetSpeed = speed;
    }
    else if (leftSpeed < 0 && rightSpeed > 0) {
      targetState = STATE_RIGHT;
      targetSpeed = speed;
    }
    else if (leftSpeed > 0 && rightSpeed < 0) {
      targetState = STATE_LEFT;
      targetSpeed = speed;
    }
    
    Serial.printf("[MOTOR] Target State: %d, Target Speed: %d\n", targetState, targetSpeed);
    
    // Send acknowledgment
    String response = "{\"ok\":true";
    if (commandId.length() > 0) {
      response += ",\"id\":\"" + commandId + "\"";
    }
    response += "}";
    wsAI.sendTXT(clientNum, response);
  }
  else if (type == "stop") {
    Serial.println("[AI] Stop");
    stopMotors();
    
    String response = "{\"ok\":true";
    if (commandId.length() > 0) {
      response += ",\"id\":\"" + commandId + "\"";
    }
    response += "}";
    wsAI.sendTXT(clientNum, response);
  }
  else if (type == "query") {
    String status = "{\"type\":\"telemetry\",\"speed\":" + String(currentSpeed) + ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
    wsAI.sendTXT(clientNum, status);
  }
}

// Motor control functions
void rotateMotor(int motorNum, int direction) {
  if (direction == DIR_FORWARD) {
    digitalWrite(motorPins[motorNum].pinIN1, HIGH);
    digitalWrite(motorPins[motorNum].pinIN2, LOW);
  }
  else if (direction == DIR_BACKWARD) {
    digitalWrite(motorPins[motorNum].pinIN1, LOW);
    digitalWrite(motorPins[motorNum].pinIN2, HIGH);
  }
  else {
    digitalWrite(motorPins[motorNum].pinIN1, LOW);
    digitalWrite(motorPins[motorNum].pinIN2, LOW);
  }
}

void stopMotors() {
  Serial.println("[MOTOR] Stop");
  targetState = STATE_STOP;
  targetSpeed = 0;
  // Immediate stop for safety
  currentState = STATE_STOP;
  currentSpeed = 0;
  applyMotorState();
}
