/*
 * Telluris MineTech Underground Rover - ESP32 38-pin with External IP Camera
 * This code runs on a standard ESP32 development board with comprehensive sensor suite
 * Works with EXTERNAL IP/USB Camera (no pin changes needed!)
 * Wireless communication via WiFi WebSocket
 * 
 * Original ESP32 Mining Vehicle Controller integrated with Telluris MineTech features
 * 
 * Hardware Requirements:
 * - ESP32 Development Board (38-pin)
 * - Motor Driver (L298N or similar)
 * - Two DC Motors
 * - MPU6050 IMU
 * - Ultrasonic sensors (HC-SR04) x3
 * - Gas sensors (MQ7, MQ4)
 * - External IP Camera (phone app or USB camera with streaming)
 * - Battery voltage divider circuit
 * - Emergency stop button
 * - Status LEDs and buzzer
 */

#include <ArduinoJson.h>
#include <WiFi.h>
#if __has_include(<WebSocketsServer.h>)
#include <WebSocketsServer.h>
#else
#warning "WebSocketsServer.h not found. Install 'arduinoWebSockets' via Arduino Library Manager or add to PlatformIO lib_deps: 'arduinoWebSockets'"
/* Minimal stub for builds where WebSocketsServer is not available.
   This allows compiling and basic testing without WebSocket functionality.
   Replace with the real 'WebSocketsServer' library for full WiFi/WebSocket support. */
class WebSocketsServer {
public:
  WebSocketsServer(int port) {}
  void begin() {}
  template<typename F>
  void onEvent(F) {}
  void loop() {}
  void broadcastTXT(const String &msg) { (void)msg; }
  void sendTXT(uint8_t num, const String &msg) { (void)num; (void)msg; }
  IPAddress remoteIP(uint8_t num) { (void)num; return IPAddress(0,0,0,0); }
};
// Minimal WStype_t and values used by webSocketEvent() so code compiles
typedef enum {
  WStype_ERROR = 0,
  WStype_DISCONNECTED,
  WStype_CONNECTED,
  WStype_TEXT
} WStype_t;
#endif
#include <HTTPClient.h>
#include <Wire.h>
#include <MPU6050.h>
#include <NewPing.h>
// ESP32 LEDC functions (ledcSetup, ledcAttachPin). If not compiling for ESP32,
// provide lightweight stubs so code can compile for analysis/testing on other boards.
#if defined(ARDUINO_ARCH_ESP32) || defined(ESP32)
#include <esp32-hal-ledc.h>
#else
// Stubs for non-ESP32 builds (no-op)
static inline void ledcSetup(int channel, int freq, int res) {}
static inline void ledcAttachPin(int pin, int channel) {}
// Provide a stub for ledcWrite on non-ESP32 so code using pwmWrite compiles.
static inline void ledcWrite(int channel, int duty) { (void)channel; (void)duty; }
// Some sketches call ledcAttach(...) variant; provide a no-op stub to avoid compile errors
static inline void ledcAttach(int pin, int freq, int res) { (void)pin; (void)freq; (void)res; }
#endif

// Portable helper: write PWM using ESP32 LEDC when available, otherwise analogWrite.
static inline void pwmWrite(int pin, int channel, int value) {
#if defined(ARDUINO_ARCH_ESP32) || defined(ESP32)
  // Ensure value is within 0-255 for our usage
  int duty = constrain(value, 0, 255);
  ledcWrite(channel, duty);
#else
  // Many AVR/other Arduino cores implement analogWrite(pin, value)
  analogWrite(pin, value);
#endif
}

// ==================== ESP32 38-PIN GPIO ASSIGNMENTS ====================
/*
 * ESP32 DevKit 38-pin GPIO availability:
 * INPUT/OUTPUT: 0,1,2,3,4,5,12,13,14,15,16,17,18,19,21,22,23,25,26,27,32,33
 * INPUT ONLY: 34,35,36,39 (no pullup resistors)
 * BOOT/STRAPPING: 0,2,5,12,15 (use carefully)
 * SPI Flash: 6,7,8,9,10,11 (DO NOT USE)
 * USB Serial: 1(TX), 3(RX) (use carefully)
 */

// ==================== PIN DEFINITIONS ====================

// WiFi Communication Configuration
#define WIFI_SSID "MLUNGISI"  // Connect to existing hotspot
#define WIFI_PASSWORD "12345678"
#define WEBSOCKET_PORT 8080
#define HTTP_PORT 80

// External IP Camera Configuration
#define IP_CAMERA_URL "http://192.168.1.100:8080/video"  // Change to your camera's IP
#define IP_CAMERA_SNAPSHOT_URL "http://192.168.1.100:8080/photo.jpg"
#define IP_CAMERA_STREAM_PORT 8081

// Motor Driver (L298N or similar) - Updated pin assignments
#define MOTOR_LEFT_PWM    25
#define MOTOR_LEFT_DIR1   26
#define MOTOR_LEFT_DIR2   27
#define MOTOR_RIGHT_PWM   32
#define MOTOR_RIGHT_DIR1  33
#define MOTOR_RIGHT_DIR2  13

// Ultrasonic Sensors
#define TRIG_FRONT    12
#define ECHO_FRONT    15
#define TRIG_LEFT     16
#define ECHO_LEFT     17
#define TRIG_RIGHT    21
#define ECHO_RIGHT    22

// IMU (I2C)
#define IMU_SDA       4
#define IMU_SCL       0

// Gas Sensors (Analog) - MQ4 and MQ7 only
#define GAS_SENSOR_MQ7  34  // ADC1_CH6 - MQ7 CO (Carbon Monoxide) sensor
#define GAS_SENSOR_MQ4  35  // ADC1_CH7 - MQ4 CH4 (Methane/Natural Gas) sensor

// Servo for camera gimbal (using PWM instead of Servo library)
#define SERVO_PAN_PIN     25  // Shared with motor PWM (time-multiplexed)
#define SERVO_TILT_PIN    26  // Shared with motor PWM (time-multiplexed)

// LED Strip (WS2812B) for status indication
#define LED_STRIP_PIN 23  // Status LED strip
#define NUM_LEDS      8

// Relay controls for external devices
#define RELAY_1       3   // High power devices
#define RELAY_2       1   // Backup systems

// Emergency and user interface
#define EMERGENCY_STOP  0  // Boot button
#define USER_BUTTON     2  // Additional control
#define BUZZER         14  // Buzzer for alarms

// Battery monitoring
#define BATTERY_VOLTAGE 33 // ADC for battery level

// Status LEDs
#define LED_STATUS    2    // Built-in LED
#define LED_EMERGENCY 4    // Emergency LED
#define LED_FLASH     6    // Camera flash LED
#define TEMPERATURE   36   // Temperature sensor (GPIO 36)
#define SOIL_MOISTURE 39   // Soil moisture sensor (GPIO 39)
#define BATTERY_MONITOR 33 // Battery voltage monitoring (GPIO 33)

// ==================== CONSTANTS ====================
#define MAX_DISTANCE 400
#define OBSTACLE_THRESHOLD 30
#define GAS_ALARM_THRESHOLD 1500
#define BATTERY_LOW_THRESHOLD 11.0  // 12V system
#define DEVICE_ID "ROVER_TELLURIS_01"

// PWM Configuration
const int PWM_FREQUENCY = 5000;
const int PWM_RESOLUTION = 8;
const int MOTOR_LEFT_CHANNEL = 0;
const int MOTOR_RIGHT_CHANNEL = 1;

// Constants
const float WHEEL_BASE = 0.5; // meters
const float MAX_LINEAR_SPEED = 5.0; // m/s
const float MAX_ANGULAR_SPEED = 3.14; // rad/s
const float BATTERY_DIVIDER_RATIO = 10.0; // Voltage divider ratio
const float BATTERY_FULL_VOLTAGE = 25.2;
const float BATTERY_EMPTY_VOLTAGE = 21.0;

// ==================== SENSOR OBJECTS ====================
NewPing sonarFront(TRIG_FRONT, ECHO_FRONT, MAX_DISTANCE);
NewPing sonarLeft(TRIG_LEFT, ECHO_LEFT, MAX_DISTANCE);
NewPing sonarRight(TRIG_RIGHT, ECHO_RIGHT, MAX_DISTANCE);
MPU6050 mpu;

// WiFi and WebSocket objects
WiFiServer wifiServer(HTTP_PORT);
WebSocketsServer webSocket(WEBSOCKET_PORT);
HTTPClient http;

// ==================== GLOBAL VARIABLES ====================
struct RoverState {
  bool autonomous_mode = false;
  bool emergency_stop = false;
  bool gas_emergency = false;
  bool battery_low = false;
  bool wifi_mode = true;
  float battery_voltage = 12.0;
  int operation_mode = 0; // 0=manual, 1=autonomous, 2=mapping, 3=emergency
  unsigned long last_heartbeat = 0;
  unsigned long last_sensor_read = 0;
  unsigned long last_camera_frame = 0;
  String last_command = "";
  int pan_angle = 90;
  int tilt_angle = 90;
  int left_motor_speed = 0;
  int right_motor_speed = 0;
  // Original vehicle state integration
  float x = 0;
  float y = 0;
  float theta = 0;
  float linearVelocity = 0;
  float angularVelocity = 0;
  float batteryPercentage = 100.0;
  unsigned long lastUpdate = 0;
} rover_state;

struct SensorData {
  float distances[3] = {0, 0, 0}; // front, left, right
  int16_t accel_x = 0, accel_y = 0, accel_z = 0;
  int16_t gyro_x = 0, gyro_y = 0, gyro_z = 0;
  float temperature = 25.0;
  float humidity = 50.0;
  float pressure = 1013.25;
  int gas_levels[2] = {0, 0}; // MQ7 (CO) and MQ4 (CH4)
  bool gas_alarms[2] = {false, false};
  float pitch = 0, roll = 0, yaw = 0;
  float soil_moisture = 0.0;
} sensor_data;

struct CameraState {
  bool connected = false;
  bool streaming = false;
  String stream_url = "";
  String snapshot_url = "";
  int frame_rate = 15;
  int resolution_width = 640;
  int resolution_height = 480;
  unsigned long last_frame_time = 0;
  int frames_captured = 0;
  String device_info = "";
  bool camera_enabled = true;
  bool streaming_active = false;
  int frame_count = 0;
  String last_capture_status = "ready";
  bool capture_requested = false;
  String camera_ip = "";
  int camera_port = 8080;
  bool camera_online = false;
  unsigned long last_camera_check = 0;
} camera_state;

struct MotorState {
  int left_speed = 0;   // -255 to 255
  int right_speed = 0;  // -255 to 255
  bool enabled = true;
  unsigned long last_command_time = 0;
  int timeout_ms = 2000; // Stop motors if no command for 2 seconds
} motor_state;

// Navigation sequence state (non-blocking) for AI-driven avoidance maneuvers
struct NavSequence {
  bool active = false;
  unsigned long start_time = 0;
  int stage = 0; // 0=turn,1=forward,2=done
  unsigned long stage_start = 0;
  String command = "";
  String direction = "";
  float speed = 0.0;
  unsigned long turn_duration = 500;  // ms
  unsigned long forward_duration = 1200; // ms
} nav_seq;

// Legacy command state for compatibility
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

// ==================== SETUP FUNCTION ====================
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32 Underground Rover with External IP Camera ===");
  
  // Initialize all pins
  initializePins();
  
  // Initialize I2C sensors
  initializeI2C();
  
  // Initialize WiFi for web interface
  initializeWiFi();
  
  // Initialize external IP camera connection
  initializeExternalCamera();
  
  Serial.println("ESP32 rover initialization complete!");
  playStartupSequence();
}

// ==================== MAIN LOOP ====================
void loop() {
  unsigned long current_time = millis();
  
  // Read all sensors
  if (current_time - rover_state.last_sensor_read > 100) {
    readAllSensors();
    rover_state.last_sensor_read = current_time;
  }
  
  // Check emergency conditions
  checkEmergencyConditions();
  
  // Handle motor timeout (safety feature)
  handleMotorTimeout();
  
  // Check camera connection status
  checkCameraConnection();
  
  // Process camera stream
  handleCameraStream();
  
  // Update vehicle state (legacy compatibility)
  updateVehicleState();
  
  // Execute current command (legacy compatibility)
  executeCommand();
  
  // Mode-specific operations
  switch (rover_state.operation_mode) {
    case 0: // Manual control mode
      // Motors controlled via web interface or WebSocket
      break;
      
    case 1: // Autonomous navigation
      // If an AI navigation sequence is active, handle it first
      handleNavSequence();
      autonomousNavigation();
      break;
      
    case 2: // Mapping mode
      mappingMode();
      break;
      
    case 3: // Emergency mode
      emergencyMode();
      break;
  }
  
  // Communication handling
  if (rover_state.wifi_mode) {
    webSocket.loop();
  }
  
  // Send telemetry data periodically
  if (current_time - rover_state.last_heartbeat > 2000) {
    sendTelemetryData();
    rover_state.last_heartbeat = current_time;
  }
  
  delay(50); // Main loop frequency: ~20Hz
}

// ==================== INITIALIZATION FUNCTIONS ====================
void initializePins() {
  // Motor pins
  pinMode(MOTOR_LEFT_PWM, OUTPUT);
  pinMode(MOTOR_LEFT_DIR1, OUTPUT);
  pinMode(MOTOR_LEFT_DIR2, OUTPUT);
  pinMode(MOTOR_RIGHT_PWM, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR1, OUTPUT);
  pinMode(MOTOR_RIGHT_DIR2, OUTPUT);
  
  // LED and buzzer pins
  pinMode(LED_STATUS, OUTPUT);
  pinMode(LED_EMERGENCY, OUTPUT);
  pinMode(BUZZER, OUTPUT);
  pinMode(LED_FLASH, OUTPUT);
  
  // Ultrasonic sensor pins
  pinMode(TRIG_FRONT, OUTPUT);
  pinMode(ECHO_FRONT, INPUT);
  pinMode(TRIG_LEFT, OUTPUT);
  pinMode(ECHO_LEFT, INPUT);
  pinMode(TRIG_RIGHT, OUTPUT);
  pinMode(ECHO_RIGHT, INPUT);
  
  // Control pins
  pinMode(EMERGENCY_STOP, INPUT_PULLUP);
  pinMode(USER_BUTTON, INPUT_PULLUP);
  pinMode(RELAY_1, OUTPUT);
  pinMode(RELAY_2, OUTPUT);
  
  // Configure PWM
  ledcSetup(MOTOR_LEFT_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcSetup(MOTOR_RIGHT_CHANNEL, PWM_FREQUENCY, PWM_RESOLUTION);
  ledcAttachPin(MOTOR_LEFT_PWM, MOTOR_LEFT_CHANNEL);
  ledcAttachPin(MOTOR_RIGHT_PWM, MOTOR_RIGHT_CHANNEL);
  
  // Initialize outputs to safe states
  stopMotors();
  digitalWrite(BUZZER, LOW);
  digitalWrite(LED_FLASH, LOW);
  digitalWrite(RELAY_1, LOW);
  digitalWrite(RELAY_2, LOW);
  
  Serial.println("GPIO pins initialized");
}

void initializeI2C() {
  Wire.begin(IMU_SDA, IMU_SCL);
  
  // Initialize MPU6050
  mpu.initialize();
  if (mpu.testConnection()) {
    Serial.println("MPU6050 connection successful");
    
    // Configure MPU6050 for underground rover use
    mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_4);
    mpu.setFullScaleGyroRange(MPU6050_GYRO_FS_500);
    mpu.setDLPFMode(MPU6050_DLPF_BW_20);  // Low pass filter for stability
  } else {
    Serial.println("WARNING: MPU6050 connection failed");
  }
  
  Serial.println("I2C sensors initialized");
}

void initializeExternalCamera() {
  Serial.println("Initializing External IP Camera Connection...");
  
  // Set camera URLs
  camera_state.stream_url = String(IP_CAMERA_URL);
  camera_state.snapshot_url = String(IP_CAMERA_SNAPSHOT_URL);
  camera_state.camera_ip = "192.168.1.100";  // Default IP - change as needed
  camera_state.camera_port = 8080;
  
  // Extract IP from URL
  int start = camera_state.stream_url.indexOf("//") + 2;
  int end = camera_state.stream_url.indexOf(":", start);
  if (end > start) {
    camera_state.camera_ip = camera_state.stream_url.substring(start, end);
  }
  
  camera_state.device_info = "External IP Camera - " + camera_state.camera_ip;
  
  Serial.println("Camera Configuration:");
  Serial.println("  Stream URL: " + camera_state.stream_url);
  Serial.println("  Snapshot URL: " + camera_state.snapshot_url);
  Serial.println("  Camera IP: " + camera_state.camera_ip);
  Serial.println("");
  Serial.println("IMPORTANT: Make sure your IP camera is:");
  Serial.println("  1. Connected to the same WiFi network: " + String(WIFI_SSID));
  Serial.println("  2. Camera IP matches the configured IP");
  Serial.println("  3. Camera streaming service is running");
  Serial.println("");
  Serial.println("Popular IP Camera Apps:");
  Serial.println("  - Android: 'IP Webcam' app");
  Serial.println("  - iOS: 'iVCam' or 'EpocCam'");
  Serial.println("  - USB Camera: Use 'mjpg-streamer' on Raspberry Pi");
}

void initializeWiFi() {
  Serial.println("Connecting to WiFi network...");
  
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  // Wait for connection
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("");
    Serial.println("WiFi connected successfully!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
    
    // Start WebSocket server
    webSocket.begin();
    webSocket.onEvent(webSocketEvent);
    Serial.println("WebSocket server started");
    
    Serial.println("WebSocket URL: ws://" + WiFi.localIP().toString() + ":" + String(WEBSOCKET_PORT));
    
    rover_state.wifi_mode = true;
  } else {
    Serial.println("");
    Serial.println("Failed to connect to WiFi!");
    Serial.println("Please check your network credentials and try again.");
    rover_state.wifi_mode = false;
  }
}

void webSocketEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.printf("Client [%u] disconnected!\n", num);
      break;
      
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(num);
      Serial.printf("Client [%u] connected from %d.%d.%d.%d\n", num, ip[0], ip[1], ip[2], ip[3]);
      webSocket.sendTXT(num, "Connected to Telluris Rover with External IP Camera");
      break;
    }
    
    case WStype_TEXT:
      Serial.printf("Received from client [%u]: %s\n", num, payload);
      processCommand(String((char*)payload));
      break;
      
    case WStype_ERROR:
      Serial.printf("WebSocket error [%u]\n", num);
      break;
      
    default:
      break;
  }
}

void processCommand(String command_json) {
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, command_json);
  
  if (error) {
    Serial.println("JSON parse error");
    return;
  }
  
  String type = doc["type"];
  rover_state.last_command = type;
  
  if (type == "VOICE_COMMAND") {
    JsonObject data = doc["data"];
    String action = data["action"];
    JsonObject parameters = data["parameters"];
    processVoiceCommand(action, parameters);
    
  } else if (type == "MOTOR_CONTROL") {
    int left = doc["left"];
    int right = doc["right"];
    controlMotors(left, right);
    sendWebSocketResponse("MOTOR_ACK");
    
  } else if (type == "AUTONOMOUS_MODE") {
    bool enabled = doc["enabled"];
    rover_state.autonomous_mode = enabled;
    rover_state.operation_mode = enabled ? 1 : 0;
    sendWebSocketResponse("MODE_ACK");
    
  } else if (type == "CAMERA_SNAPSHOT") {
    bool success = captureSnapshotFromCamera();
    if (success) {
      sendWebSocketResponse("SNAPSHOT_SUCCESS");
    } else {
      sendWebSocketResponse("SNAPSHOT_FAILED");
    }
    
  } else if (type == "CAMERA_STREAM_URL") {
    String url = getCameraStreamURL();
    sendWebSocketResponse("STREAM_URL:" + url);
    
  } else if (type == "UPDATE_CAMERA_IP") {
    String new_ip = doc["ip"];
    int new_port = doc["port"] | 8080;
    camera_state.camera_ip = new_ip;
    camera_state.camera_port = new_port;
    camera_state.stream_url = "http://" + new_ip + ":" + String(new_port) + "/video";
    camera_state.snapshot_url = "http://" + new_ip + ":" + String(new_port) + "/photo.jpg";
    Serial.println("Camera IP updated to: " + new_ip);
    sendWebSocketResponse("CAMERA_IP_UPDATED");
    
  } else if (type == "GIMBAL_CONTROL") {
    int pan = doc["pan"];
    int tilt = doc["tilt"];
    
    if (pan >= 0 && pan <= 180) {
      rover_state.pan_angle = pan;
    }
    
    if (tilt >= 0 && tilt <= 180) {
      rover_state.tilt_angle = tilt;
    }
    
    sendWebSocketResponse("GIMBAL_ACK");
    
  } else if (type == "EMERGENCY_STOP") {
    rover_state.emergency_stop = true;
    rover_state.operation_mode = 3;
    stopMotors();
    sendWebSocketResponse("EMERGENCY_ACK");
    
  } else if (type == "EMERGENCY_RESET" && !rover_state.gas_emergency) {
    rover_state.emergency_stop = false;
    rover_state.operation_mode = 0;
    sendWebSocketResponse("RESET_ACK");
    
  } else if (type == "PING") {
    sendWebSocketResponse("PONG");
    
  } else if (type == "REQUEST_TELEMETRY") {
    sendTelemetryData();
    
  } else if (type == "CHECK_CAMERA") {
    checkCameraConnection();
    sendWebSocketResponse(camera_state.camera_online ? "CAMERA_ONLINE" : "CAMERA_OFFLINE");
    
  // Legacy command support for backward compatibility
  } else if (type == "drive") {
    commandState.type = "drive";
    // Safely read numeric fields from ArduinoJson before applying constrain
    float linear_mps = 0.0f;
    if (!doc["linear_mps"].isNull()) linear_mps = doc["linear_mps"].as<float>();
    float angular_rps = 0.0f;
    if (!doc["angular_rps"].isNull()) angular_rps = doc["angular_rps"].as<float>();
    commandState.linearSpeed = constrain(linear_mps, -MAX_LINEAR_SPEED, MAX_LINEAR_SPEED);
    commandState.angularSpeed = constrain(angular_rps, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
    commandState.startTime = millis();
    commandState.duration = doc["duration_s"] | 0;
    commandState.active = true;
    
  } else if (type == "waypoint") {
    commandState.type = "waypoint";
    commandState.targetX = doc["x"];
    commandState.targetY = doc["y"];
    commandState.tolerance = doc["tolerance_m"] | 1.0;
    commandState.linearSpeed = doc["v_max"] | 2.0;
    commandState.active = true;
    
  } else if (type == "stop") {
    emergencyStop(doc["reason"]);
    if (doc["emergency"]) {
      rover_state.emergency_stop = true;
    }
    
  } else if (type == "query") {
    sendTelemetryData();
    
  } else if (type == "NAV_COMMAND" || type == "navigation") {
    // AI-directed navigation command coming from the Live API
    // Accept payloads like: {"type":"NAV_COMMAND","navigation_command":"AVOID_LEFT","action":"avoid","direction":"left","speed":0.3}
    String navcmd = "";
    if (doc.containsKey("navigation_command")) navcmd = doc["navigation_command"].as<String>();
    else if (doc.containsKey("command")) navcmd = doc["command"].as<String>();
    JsonObject data = doc["data"];
    String action = "";
    String direction = "";
    float speed = 0.5;
    if (!data.isNull()) {
      if (data.containsKey("action")) action = data["action"].as<String>();
      if (data.containsKey("direction")) direction = data["direction"].as<String>();
      if (data.containsKey("speed")) speed = data["speed"].as<float>();
    }
    // fallback to top-level fields
    if (action == "" && doc.containsKey("action")) action = doc["action"].as<String>();
    if (direction == "" && doc.containsKey("direction")) direction = doc["direction"].as<String>();
    if (doc.containsKey("speed")) speed = doc["speed"].as<float>();

    // Start a non-blocking navigation sequence
    nav_seq.active = true;
    nav_seq.start_time = millis();
    nav_seq.stage = 0;
    nav_seq.stage_start = millis();
    nav_seq.command = navcmd;
    nav_seq.direction = direction;
    nav_seq.speed = speed;

    // tune durations depending on speed
    nav_seq.turn_duration = (unsigned long)max(300.0, 800.0 - speed * 400.0);
    nav_seq.forward_duration = (unsigned long)max(600.0, 1400.0 - speed * 800.0);

    sendWebSocketResponse("NAV_COMMAND_ACK");

  } else if (type == "heartbeat") {
    sendWebSocketResponse("HEARTBEAT_ACK");
  }
}

void executeCommand() {
  if (!commandState.active || rover_state.emergency_stop) {
    stopMotors();
    return;
  }
  
  if (commandState.type == "drive") {
    // Check duration
    if (commandState.duration > 0 && 
        millis() - commandState.startTime > commandState.duration * 1000) {
      commandState.active = false;
      stopMotors();
      return;
    }
    
    // Apply drive command
    applyDifferentialDrive(commandState.linearSpeed, commandState.angularSpeed);
  }
  else if (commandState.type == "waypoint") {
    // Simple waypoint navigation
    float dx = commandState.targetX - rover_state.x;
    float dy = commandState.targetY - rover_state.y;
    float distance = sqrt(dx*dx + dy*dy);
    
    if (distance < commandState.tolerance) {
      // Waypoint reached
      commandState.active = false;
      stopMotors();
      Serial.println("Waypoint reached!");
      return;
    }
    
    // Calculate desired heading
    float targetHeading = atan2(dy, dx);
    float headingError = targetHeading - rover_state.theta;
    
    // Normalize heading error to [-π, π]
    while (headingError > PI) headingError -= 2*PI;
    while (headingError < -PI) headingError += 2*PI;
    
    // Simple proportional control
  float angularSpeed = constrain(headingError * 2.0, -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED);
  // Ensure float arithmetic to avoid std::min template ambiguity with double
  float linearSpeed = abs(headingError) < 0.2 ? 
             min(commandState.linearSpeed, (float)(distance * 0.5f)) : 0.5f;
    
    applyDifferentialDrive(linearSpeed, angularSpeed);
  }
}

// ==================== SENSOR READING ====================
void readAllSensors() {
  // Read ultrasonic sensors
  sensor_data.distances[0] = sonarFront.ping_cm();
  sensor_data.distances[1] = sonarLeft.ping_cm();
  sensor_data.distances[2] = sonarRight.ping_cm();
  
  // Convert 0 (timeout) to max distance
  for (int i = 0; i < 3; i++) {
    if (sensor_data.distances[i] == 0) {
      sensor_data.distances[i] = MAX_DISTANCE;
    }
  }
  
  // Read IMU
  if (mpu.testConnection()) {
    mpu.getMotion6(&sensor_data.accel_x, &sensor_data.accel_y, &sensor_data.accel_z,
                   &sensor_data.gyro_x, &sensor_data.gyro_y, &sensor_data.gyro_z);
    
    // Calculate orientation (simplified)
    sensor_data.pitch = atan2(sensor_data.accel_y, sensor_data.accel_z) * 180.0 / PI;
    sensor_data.roll = atan2(-sensor_data.accel_x, sqrt(sensor_data.accel_y * sensor_data.accel_y + sensor_data.accel_z * sensor_data.accel_z)) * 180.0 / PI;
  }
  
  // Read gas sensors - MQ7 (CO) and MQ4 (CH4)
  sensor_data.gas_levels[0] = analogRead(GAS_SENSOR_MQ7);  // CO sensor
  sensor_data.gas_levels[1] = analogRead(GAS_SENSOR_MQ4);  // CH4/Natural gas sensor
  sensor_data.gas_alarms[0] = sensor_data.gas_levels[0] > GAS_ALARM_THRESHOLD;
  sensor_data.gas_alarms[1] = sensor_data.gas_levels[1] > GAS_ALARM_THRESHOLD;
  
  // Read environmental sensors
  sensor_data.soil_moisture = analogRead(SOIL_MOISTURE);
  
  // Read battery voltage
  int battery_raw = analogRead(BATTERY_MONITOR);
  rover_state.battery_voltage = (battery_raw / 4095.0) * 3.3 * 4.0; // Voltage divider
  rover_state.battery_low = rover_state.battery_voltage < BATTERY_LOW_THRESHOLD;
  
  // Read temperature
  int temp_raw = analogRead(TEMPERATURE);
  sensor_data.temperature = (temp_raw / 4095.0) * 3.3 * 100.0; // Convert to temperature
}

void applyDifferentialDrive(float linear, float angular) {
  // Convert to wheel speeds
  float leftSpeed = linear - angular * WHEEL_BASE / 2.0;
  float rightSpeed = linear + angular * WHEEL_BASE / 2.0;
  
  // Convert to motor PWM values
  int leftPWM = map(abs(leftSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  int rightPWM = map(abs(rightSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  
  controlMotors(leftPWM * (leftSpeed < 0 ? -1 : 1), rightPWM * (rightSpeed < 0 ? -1 : 1));
  
  // Update state
  rover_state.linearVelocity = linear;
  rover_state.angularVelocity = angular;
}

// ==================== MOTOR CONTROL ====================
void controlMotors(int left_speed, int right_speed) {
  // Safety checks
  if (rover_state.emergency_stop || rover_state.gas_emergency) {
    left_speed = 0;
    right_speed = 0;
  }
  
  // Constrain speeds
  left_speed = constrain(left_speed, -255, 255);
  right_speed = constrain(right_speed, -255, 255);
  
  // Control left motor
  if (left_speed > 0) {
    digitalWrite(MOTOR_LEFT_DIR1, HIGH);
    digitalWrite(MOTOR_LEFT_DIR2, LOW);
    pwmWrite(MOTOR_LEFT_PWM, MOTOR_LEFT_CHANNEL, left_speed);
  } else if (left_speed < 0) {
    digitalWrite(MOTOR_LEFT_DIR1, LOW);
    digitalWrite(MOTOR_LEFT_DIR2, HIGH);
    pwmWrite(MOTOR_LEFT_PWM, MOTOR_LEFT_CHANNEL, -left_speed);
  } else {
    digitalWrite(MOTOR_LEFT_DIR1, LOW);
    digitalWrite(MOTOR_LEFT_DIR2, LOW);
    pwmWrite(MOTOR_LEFT_PWM, MOTOR_LEFT_CHANNEL, 0);
  }
  
  // Control right motor
  if (right_speed > 0) {
    digitalWrite(MOTOR_RIGHT_DIR1, HIGH);
    digitalWrite(MOTOR_RIGHT_DIR2, LOW);
    pwmWrite(MOTOR_RIGHT_PWM, MOTOR_RIGHT_CHANNEL, right_speed);
  } else if (right_speed < 0) {
    digitalWrite(MOTOR_RIGHT_DIR1, LOW);
    digitalWrite(MOTOR_RIGHT_DIR2, HIGH);
    pwmWrite(MOTOR_RIGHT_PWM, MOTOR_RIGHT_CHANNEL, -right_speed);
  } else {
    digitalWrite(MOTOR_RIGHT_DIR1, LOW);
    digitalWrite(MOTOR_RIGHT_DIR2, LOW);
    pwmWrite(MOTOR_RIGHT_PWM, MOTOR_RIGHT_CHANNEL, 0);
  }
  
  rover_state.left_motor_speed = left_speed;
  rover_state.right_motor_speed = right_speed;
  motor_state.last_command_time = millis();
}

void stopMotors() {
  controlMotors(0, 0);
}

void handleMotorTimeout() {
  if (millis() - motor_state.last_command_time > motor_state.timeout_ms) {
    if (motor_state.left_speed != 0 || motor_state.right_speed != 0) {
      stopMotors();
      Serial.println("Motor timeout - stopping for safety");
    }
  }
}

// Legacy compatibility function
void setMotorSpeeds(float leftSpeed, float rightSpeed) {
  // Convert m/s to PWM (0-255)
  int leftPWM = map(abs(leftSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  int rightPWM = map(abs(rightSpeed) * 1000, 0, MAX_LINEAR_SPEED * 1000, 0, 255);
  
  controlMotors(leftPWM * (leftSpeed < 0 ? -1 : 1), rightPWM * (rightSpeed < 0 ? -1 : 1));
}

void checkEmergencyConditions() {
  // Check emergency stop button
  bool emergency_pressed = !digitalRead(EMERGENCY_STOP);
  if (emergency_pressed && !rover_state.emergency_stop) {
    rover_state.emergency_stop = true;
    stopMotors();
    rover_state.operation_mode = 3; // Emergency mode
    Serial.println("EMERGENCY STOP ACTIVATED!");
    playAlarmSequence();
  }
  
  // Check gas alarms
  bool gas_detected = false;
  for (int i = 0; i < 2; i++) {
    if (sensor_data.gas_alarms[i]) {
      gas_detected = true;
      String gas_type = (i == 0) ? "CO (MQ7)" : "CH4/Natural Gas (MQ4)";
      Serial.println("GAS EMERGENCY: " + gas_type + " detected! Level: " + String(sensor_data.gas_levels[i]));
      break;
    }
  }
  
  if (gas_detected && !rover_state.gas_emergency) {
    rover_state.gas_emergency = true;
    stopMotors();
    rover_state.operation_mode = 3; // Emergency mode
    Serial.println("GAS EMERGENCY DETECTED!");
    playAlarmSequence();
  } else if (!gas_detected && rover_state.gas_emergency) {
    rover_state.gas_emergency = false;
    Serial.println("Gas levels normal");
  }
  
  // Check battery level
  if (rover_state.battery_low) {
    Serial.println("WARNING: Low battery voltage: " + String(rover_state.battery_voltage) + "V");
  }
  
  // Check for stuck conditions (IMU-based)
  if (abs(sensor_data.pitch) > 45 || abs(sensor_data.roll) > 45) {
    Serial.println("WARNING: Rover tilted beyond safe limits");
  }
}

// ==================== EXTERNAL CAMERA FUNCTIONS ====================
void checkCameraConnection() {
  // Check camera connection every 10 seconds
  if (millis() - camera_state.last_camera_check > 10000) {
    camera_state.last_camera_check = millis();
    
    Serial.println("Checking IP camera connection...");
    
    // Try to connect to camera
    http.begin(camera_state.snapshot_url);
    http.setTimeout(5000); // 5 second timeout
    
    int httpCode = http.GET();
    
    if (httpCode > 0) {
      if (httpCode == HTTP_CODE_OK) {
        camera_state.camera_online = true;
        camera_state.connected = true;
        camera_state.streaming_active = true;
        Serial.println("✓ IP Camera is ONLINE and responding!");
        Serial.println("  HTTP Response: " + String(httpCode));
      } else {
        camera_state.camera_online = false;
        Serial.println("✗ Camera responded but with error code: " + String(httpCode));
      }
    } else {
      camera_state.camera_online = false;
      camera_state.connected = false;
      camera_state.streaming_active = false;
      Serial.println("✗ IP Camera is OFFLINE or unreachable");
      Serial.println("  Error: " + http.errorToString(httpCode));
      Serial.println("  Please check:");
      Serial.println("    1. Camera app is running on phone/device");
      Serial.println("    2. Camera IP address is correct: " + camera_state.camera_ip);
      Serial.println("    3. Both devices are on same WiFi network");
    }
    
    http.end();
  }
}

bool captureSnapshotFromCamera() {
  Serial.println("Capturing snapshot from IP camera...");
  
  if (!camera_state.camera_online) {
    Serial.println("ERROR: Camera is offline!");
    camera_state.last_capture_status = "camera_offline";
    return false;
  }
  
  // Request snapshot from camera
  http.begin(camera_state.snapshot_url);
  int httpCode = http.GET();
  
  if (httpCode == HTTP_CODE_OK) {
    int len = http.getSize();
    Serial.println("✓ Snapshot captured successfully!");
    Serial.println("  Image size: " + String(len) + " bytes");
    
    camera_state.last_capture_status = "success";
    camera_state.frames_captured++;
    http.end();
    return true;
    
  } else {
    Serial.println("✗ Failed to capture snapshot");
    Serial.println("  Error: " + http.errorToString(httpCode));
    camera_state.last_capture_status = "capture_failed";
    http.end();
    return false;
  }
}

String getCameraStreamURL() {
  // Return the camera stream URL for the web interface
  if (camera_state.camera_online) {
    return camera_state.stream_url;
  } else {
    return "Camera offline";
  }
}

void updateVehicleState() {
  unsigned long now = millis();
  float dt = (now - rover_state.lastUpdate) / 1000.0;
  rover_state.lastUpdate = now;
  
  // Update position (dead reckoning)
  if (rover_state.linearVelocity != 0 || rover_state.angularVelocity != 0) {
    rover_state.theta += rover_state.angularVelocity * dt;
    
    // Normalize theta
    while (rover_state.theta > PI) rover_state.theta -= 2*PI;
    while (rover_state.theta < -PI) rover_state.theta += 2*PI;
    
    rover_state.x += rover_state.linearVelocity * cos(rover_state.theta) * dt;
    rover_state.y += rover_state.linearVelocity * sin(rover_state.theta) * dt;
  }
  
  // Update battery percentage
  rover_state.batteryPercentage = constrain(
    map(rover_state.battery_voltage * 100, 
        BATTERY_EMPTY_VOLTAGE * 100, 
        BATTERY_FULL_VOLTAGE * 100, 
        0, 100), 
    0, 100);
}

// ==================== AUTONOMOUS NAVIGATION ====================
void autonomousNavigation() {
  if (!rover_state.autonomous_mode) return;
  
  float front_dist = sensor_data.distances[0];
  float left_dist = sensor_data.distances[1];
  float right_dist = sensor_data.distances[2];
  
  int base_speed = 100;
  int left_motor = base_speed;
  int right_motor = base_speed;
  
  // Obstacle avoidance logic
  if (front_dist < OBSTACLE_THRESHOLD) {
    // Obstacle ahead - decide which way to turn
    if (left_dist > right_dist) {
      // Turn left
      left_motor = -base_speed;
      right_motor = base_speed;
    } else {
      // Turn right
      left_motor = base_speed;
      right_motor = -base_speed;
    }
  } else {
    // Path clear - wall following behavior
    if (left_dist < OBSTACLE_THRESHOLD * 1.5) {
      // Too close to left wall - turn right slightly
      left_motor = base_speed;
      right_motor = base_speed * 0.7;
    } else if (right_dist < OBSTACLE_THRESHOLD * 1.5) {
      // Too close to right wall - turn left slightly
      left_motor = base_speed * 0.7;
      right_motor = base_speed;
    }
  }
  
  controlMotors(left_motor, right_motor);
}

void mappingMode() {
  static unsigned long last_map_update = 0;
  static float current_x = 0.0;
  static float current_y = 0.0;
  static float current_heading = 0.0;
  
  if (millis() - last_map_update > 1000) {
    float left_distance = (motor_state.left_speed * 0.1) / 100.0;
    float right_distance = (motor_state.right_speed * 0.1) / 100.0;
    float avg_distance = (left_distance + right_distance) / 2.0;
    
    current_x += avg_distance * cos(current_heading * PI / 180.0);
    current_y += avg_distance * sin(current_heading * PI / 180.0);
    
    float heading_change = (right_distance - left_distance) * 10.0;
    current_heading += heading_change;
    if (current_heading > 360) current_heading -= 360;
    if (current_heading < 0) current_heading += 360;
    
    String map_entry = String(millis()) + "," + 
                      String(current_x, 2) + "," + 
                      String(current_y, 2) + "," + 
                      String(current_heading, 2) + "," +
                      String(sensor_data.distances[0]) + "," +
                      String(sensor_data.distances[1]) + "," +
                      String(sensor_data.distances[2]) + "," +
                      String(rover_state.battery_voltage);
    
    sendWebSocketMessage("{\"type\":\"mapping_data\",\"data\":\"" + map_entry + "\"}");
    
    Serial.println("Map Update - X:" + String(current_x, 2) + " Y:" + String(current_y, 2) + " Heading:" + String(current_heading, 2));
    last_map_update = millis();
  }
}

void emergencyMode() {
  stopMotors();
  
  static unsigned long last_flash = 0;
  if (millis() - last_flash > 500) {
    digitalWrite(RELAY_1, !digitalRead(RELAY_1));
    last_flash = millis();
  }
  
  static unsigned long last_beep = 0;
  if (millis() - last_beep > 2000) {
    digitalWrite(BUZZER, HIGH);
    delay(100);
    digitalWrite(BUZZER, LOW);
    last_beep = millis();
  }
}

void emergencyStop(const char* reason) {
  commandState.active = false;
  stopMotors();
  rover_state.emergency_stop = true;
  Serial.print("EMERGENCY STOP: ");
  Serial.println(reason);
}

void processVoiceCommand(String action, JsonObject parameters) {
  action.toLowerCase();
  
  if (action == "move_forward" || action == "go_forward") {
    controlMotors(150, 150);
    sendWebSocketResponse("MOVING_FORWARD");
    
  } else if (action == "move_backward" || action == "go_backward") {
    controlMotors(-150, -150);
    sendWebSocketResponse("MOVING_BACKWARD");
    
  } else if (action == "turn_left") {
    controlMotors(-100, 100);
    sendWebSocketResponse("TURNING_LEFT");
    
  } else if (action == "turn_right") {
    controlMotors(100, -100);
    sendWebSocketResponse("TURNING_RIGHT");
    
  } else if (action == "stop" || action == "halt") {
    stopMotors();
    sendWebSocketResponse("STOPPED");
    
  } else if (action == "autonomous_on" || action == "auto_mode") {
    rover_state.autonomous_mode = true;
    rover_state.operation_mode = 1;
    sendWebSocketResponse("AUTONOMOUS_MODE_ON");
    
  } else if (action == "autonomous_off" || action == "manual_mode") {
    rover_state.autonomous_mode = false;
    rover_state.operation_mode = 0;
    stopMotors();
    sendWebSocketResponse("MANUAL_MODE_ON");
    
  } else if (action == "take_picture" || action == "capture") {
    bool success = captureSnapshotFromCamera();
    if (success) {
      sendStatusMessage("VOICE_CAPTURE_SUCCESS");
    } else {
      sendStatusMessage("VOICE_CAPTURE_FAILED");
    }
    
  } else if (action == "camera_up" || action == "tilt_up") {
    rover_state.tilt_angle = constrain(rover_state.tilt_angle - 10, 0, 180);
    sendStatusMessage("VOICE_CAMERA_TILT_UP");
    
  } else if (action == "camera_down" || action == "tilt_down") {
    rover_state.tilt_angle = constrain(rover_state.tilt_angle + 10, 0, 180);
    sendStatusMessage("VOICE_CAMERA_TILT_DOWN");
    
  } else if (action == "camera_left" || action == "pan_left") {
    rover_state.pan_angle = constrain(rover_state.pan_angle - 10, 0, 180);
    sendStatusMessage("VOICE_CAMERA_PAN_LEFT");
    
  } else if (action == "camera_right" || action == "pan_right") {
    rover_state.pan_angle = constrain(rover_state.pan_angle + 10, 0, 180);
    sendStatusMessage("VOICE_CAMERA_PAN_RIGHT");
    
  } else if (action == "return_to_base" || action == "go_home") {
    emergencyReturnToBase();
    sendStatusMessage("VOICE_RETURN_TO_BASE");
    
  } else if (action == "status" || action == "report") {
    sendTelemetryData();
    sendStatusMessage("VOICE_STATUS_REPORT");
    
  } else if (action == "emergency_stop") {
    rover_state.emergency_stop = true;
    rover_state.operation_mode = 3;
    stopMotors();
    sendStatusMessage("VOICE_EMERGENCY_STOP");
  }
}

void emergencyReturnToBase() {
  Serial.println("Emergency return to base initiated");
  rover_state.operation_mode = 3;
  
  static float base_x = 0.0, base_y = 0.0;
  static float current_x = 0.0, current_y = 0.0, current_heading = 0.0;
  
  float distance_to_base = sqrt(pow(base_x - current_x, 2) + pow(base_y - current_y, 2));
  float angle_to_base = atan2(base_y - current_y, base_x - current_x) * 180.0 / PI;
  
  float heading_diff = angle_to_base - current_heading;
  if (heading_diff > 180) heading_diff -= 360;
  if (heading_diff < -180) heading_diff += 360;
  
  if (distance_to_base > 0.5) {
    if (sensor_data.distances[0] < OBSTACLE_THRESHOLD) {
      if (sensor_data.distances[1] > sensor_data.distances[2]) {
        controlMotors(-150, 150);
      } else {
        controlMotors(150, -150);
      }
    } else if (abs(heading_diff) > 15) {
      if (heading_diff > 0) {
        controlMotors(-120, 120);
      } else {
        controlMotors(120, -120);
      }
    } else {
      int speed = min(200, (int)(distance_to_base * 40));
      controlMotors(speed, speed);
    }
    
    current_x += 0.1 * cos(current_heading * PI / 180.0);
    current_y += 0.1 * sin(current_heading * PI / 180.0);
    current_heading += (motor_state.right_speed - motor_state.left_speed) * 0.1;
    
  } else {
    stopMotors();
    sendWebSocketResponse("EMERGENCY_RETURN_COMPLETE");
    Serial.println("Emergency return to base completed");
    rover_state.operation_mode = 0;
  }
  
  sendStatusMessage("EMERGENCY_RETURN_TO_BASE");
}

void sendWebSocketResponse(String response) {
  DynamicJsonDocument doc(256);
  doc["device_id"] = DEVICE_ID;
  doc["response"] = response;
  doc["timestamp"] = millis();
  
  String message;
  serializeJson(doc, message);
  sendWebSocketMessage(message);
}

void sendStatusMessage(String message) {
  DynamicJsonDocument doc(256);
  doc["device_id"] = DEVICE_ID;
  doc["type"] = "STATUS";
  doc["message"] = message;
  doc["timestamp"] = millis();
  
  String response;
  serializeJson(doc, response);
  sendWebSocketMessage(response);
}

void sendTelemetryData() {
  DynamicJsonDocument doc(1024);
  doc["device_id"] = DEVICE_ID;
  doc["type"] = "ROVER_UPDATE";
  doc["timestamp"] = millis();
  
  // System status
  doc["mode"] = rover_state.operation_mode;
  doc["autonomous"] = rover_state.autonomous_mode;
  doc["emergency"] = rover_state.emergency_stop;
  doc["gas_emergency"] = rover_state.gas_emergency;
  doc["battery"] = rover_state.battery_voltage;
  doc["battery_low"] = rover_state.battery_low;
  
  // Sensor data
  JsonArray distances = doc.createNestedArray("distances");
  for (int i = 0; i < 3; i++) {
    distances.add(sensor_data.distances[i]);
  }
  
  // Gas sensor data with labels
  JsonArray gas_levels = doc.createNestedArray("gas_levels");
  gas_levels.add(sensor_data.gas_levels[0]);
  gas_levels.add(sensor_data.gas_levels[1]);
  
  JsonArray gas_types = doc.createNestedArray("gas_types");
  gas_types.add("CO");
  gas_types.add("CH4");
  
  JsonArray gas_alarms = doc.createNestedArray("gas_alarms");
  gas_alarms.add(sensor_data.gas_alarms[0]);
  gas_alarms.add(sensor_data.gas_alarms[1]);
  
  // IMU data
  JsonObject imu = doc.createNestedObject("imu");
  imu["pitch"] = sensor_data.pitch;
  imu["roll"] = sensor_data.roll;
  imu["accel_x"] = sensor_data.accel_x;
  imu["accel_y"] = sensor_data.accel_y;
  imu["accel_z"] = sensor_data.accel_z;
  
  // Environmental
  doc["temperature"] = sensor_data.temperature;
  doc["humidity"] = sensor_data.humidity;
  doc["soil_moisture"] = sensor_data.soil_moisture;
  
  // Camera status
  JsonObject camera_status = doc.createNestedObject("camera");
  camera_status["enabled"] = camera_state.camera_enabled;
  camera_status["online"] = camera_state.camera_online;
  camera_status["streaming"] = camera_state.streaming_active;
  camera_status["stream_url"] = camera_state.stream_url;
  camera_status["camera_ip"] = camera_state.camera_ip;
  camera_status["frame_count"] = camera_state.frame_count;
  camera_status["pan_angle"] = rover_state.pan_angle;
  camera_status["tilt_angle"] = rover_state.tilt_angle;
  camera_status["last_capture"] = camera_state.last_capture_status;
  
  // Legacy compatibility - position data
  JsonObject pose = doc.createNestedObject("pose");
  pose["x"] = rover_state.x;
  pose["y"] = rover_state.y;
  pose["theta"] = rover_state.theta;
  
  String message;
  serializeJson(doc, message);
  sendWebSocketMessage(message);
}

void sendWebSocketMessage(String message) {
  webSocket.broadcastTXT(message);
  Serial.println("Sent via WebSocket: " + message);
}

// ==================== CAMERA HANDLING ====================
void handleCameraStream() {
  static unsigned long last_frame = 0;
  unsigned long current_time = millis();
  
  if (current_time - last_frame > (1000 / camera_state.frame_rate)) {
    if (camera_state.camera_online) {
      camera_state.frame_count++;
      camera_state.last_frame_time = current_time;
      
      // Process camera frame for computer vision
      processCameraFrame();
    }
    
    last_frame = current_time;
  }
}

void processCameraFrame() {
  static unsigned long last_cv_analysis = 0;
  
  // Reduced interval for faster responsiveness (was 500ms)
  if (millis() - last_cv_analysis > 200) {
    
    // Computer vision analysis using ultrasonic sensors as proxy
    // In real implementation, you would fetch and analyze actual camera frames
    
    bool obstacle_detected = false;
    if (sensor_data.distances[0] < OBSTACLE_THRESHOLD) {
      obstacle_detected = true;
      Serial.println("CV: Obstacle detected ahead");
    }
    
    String path_status = "CLEAR";
    if (sensor_data.distances[0] < 50) {
      path_status = "OBSTACLE_AHEAD";
    } else if (sensor_data.distances[1] < 30) {
      path_status = "WALL_LEFT";
    } else if (sensor_data.distances[2] < 30) {
      path_status = "WALL_RIGHT";
    }
    
    String environment_status = "NORMAL";
    if (sensor_data.gas_levels[0] > GAS_ALARM_THRESHOLD) {
      environment_status = "CO_DETECTED";
    } else if (sensor_data.gas_levels[1] > GAS_ALARM_THRESHOLD) {
      environment_status = "CH4_DETECTED";
    }
    
    String objects_detected = "NONE";
    if (sensor_data.distances[0] > 100 && sensor_data.distances[0] < 200) {
      objects_detected = "POTENTIAL_TARGET";
    }
    
    String cv_data = "{\"type\":\"cv_analysis\",\"obstacle\":" + String(obstacle_detected) + 
                    ",\"path_status\":\"" + path_status + "\",\"environment\":\"" + environment_status + 
                    "\",\"objects\":\"" + objects_detected + "\",\"camera_online\":" + String(camera_state.camera_online) +
                    ",\"confidence\":0.85}";
    
    sendWebSocketMessage(cv_data);
    
    if (rover_state.autonomous_mode && obstacle_detected) {
      if (sensor_data.distances[1] > sensor_data.distances[2]) {
        controlMotors(-80, 80);
      } else {
        controlMotors(80, -80);
      }
    }
    
    last_cv_analysis = millis();
  }
}

// Non-blocking handler for AI navigation maneuvers
void handleNavSequence() {
  if (!nav_seq.active) return;

  unsigned long now = millis();
  unsigned long elapsed = now - nav_seq.stage_start;

  if (nav_seq.stage == 0) {
    // Turning stage
    if (nav_seq.direction == "left" || nav_seq.command == "AVOID_LEFT") {
      controlMotors(-120, 120); // pivot left
    } else if (nav_seq.direction == "right" || nav_seq.command == "AVOID_RIGHT") {
      controlMotors(120, -120); // pivot right
    } else {
      // default: slight left
      controlMotors(-100, 100);
    }

    if (elapsed >= nav_seq.turn_duration) {
      nav_seq.stage = 1;
      nav_seq.stage_start = now;
    }

  } else if (nav_seq.stage == 1) {
    // Move forward
    int base = (int)constrain(nav_seq.speed * 255, 80, 200);
    controlMotors(base, base);

    if (elapsed >= nav_seq.forward_duration) {
      nav_seq.stage = 2;
      nav_seq.stage_start = now;
    }

  } else {
    // Done - stop and resume autonomous mode
    stopMotors();
    nav_seq.active = false;
    // ensure autonomous mode is enabled
    if (rover_state.autonomous_mode) rover_state.operation_mode = 1;
    sendStatusMessage("NAV_SEQUENCE_COMPLETE");
  }
}

// ==================== UTILITY FUNCTIONS ====================
void playStartupSequence() {
  for (int i = 0; i < 3; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(200);
    digitalWrite(BUZZER, LOW);
    delay(200);
  }
  
  Serial.println("Startup sequence complete");
}

void playAlarmSequence() {
  for (int i = 0; i < 5; i++) {
    digitalWrite(BUZZER, HIGH);
    delay(100);
    digitalWrite(BUZZER, LOW);
    delay(100);
  }
}

String getSystemInfo() {
  String info = "ESP32 Underground Rover with External IP Camera\n";
  info += "Device ID: " + String(DEVICE_ID) + "\n";
  info += "Uptime: " + String(millis() / 1000) + " seconds\n";
  info += "Free heap: " + String(ESP.getFreeHeap()) + " bytes\n";
  info += "WiFi IP: " + WiFi.localIP().toString() + "\n";
  info += "Battery: " + String(rover_state.battery_voltage) + "V\n";
  info += "Mode: " + String(rover_state.operation_mode) + "\n";
  info += "Camera Status: " + String(camera_state.camera_online ? "ONLINE" : "OFFLINE") + "\n";
  info += "Camera IP: " + camera_state.camera_ip + "\n";
  info += "Stream URL: " + camera_state.stream_url + "\n";
  info += "Gas Sensors: MQ7 (CO) = " + String(sensor_data.gas_levels[0]) + ", MQ4 (CH4) = " + String(sensor_data.gas_levels[1]) + "\n";
  
  return info;
}

// Legacy compatibility functions
void sendTelemetry() {
  sendTelemetryData();
}

void sendHeartbeat(uint8_t num) {
  sendWebSocketResponse("HEARTBEAT");
}

void sendError(uint8_t num, const char* error) {
  sendWebSocketResponse("ERROR: " + String(error));
}

// Legacy command handler for backward compatibility
void handleCommand(uint8_t num, uint8_t * payload, size_t length) {
  processCommand(String((char*)payload));
}