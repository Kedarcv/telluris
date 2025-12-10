/*
 * ESP32-CAM Minimal Rover - Motors + Camera Feed Only
 * 
 * Hardware:
 * - ESP32-CAM board with camera
 * - L298N Motor Driver
 * - 4 DC Motors (2 left + 2 right in parallel)
 * 
 * L298N Wiring (using safe GPIOs):
 * - ENA  -> GPIO 12 (Left motors PWM)
 * - IN1  -> GPIO 13 (Left direction 1)
 * - IN2  -> GPIO 15 (Left direction 2)
 * - ENB  -> GPIO 14 (Right motors PWM)
 * - IN3  -> GPIO 33 (Right direction 1)
 * - IN4  -> GPIO 1  (Right direction 2) - TX pin, safe after Serial setup
 */

#include <WiFi.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>
#include "esp_camera.h"
#include "esp_http_server.h"

// WiFi
#define WIFI_SSID "MLUNGISI"
#define WIFI_PASSWORD "12345678"
#define WEBSOCKET_PORT 8080

// L298N Pins
#define ENA_PIN   12  // Left PWM
#define IN1_PIN   13  // Left dir 1
#define IN2_PIN   15  // Left dir 2
#define ENB_PIN   14  // Right PWM  
#define IN3_PIN   33  // Right dir 1
#define IN4_PIN   1   // Right dir 2 (TX - safe after setup)

#define PWM_FREQ 5000
#define PWM_RES 8

// ESP32-CAM pins (AI-Thinker model)
#define CAM_PIN_PWDN    32
#define CAM_PIN_RESET   -1
#define CAM_PIN_XCLK    0
#define CAM_PIN_SIOD    26
#define CAM_PIN_SIOC    27
#define CAM_PIN_D7      35
#define CAM_PIN_D6      34
#define CAM_PIN_D5      39
#define CAM_PIN_D4      36
#define CAM_PIN_D3      21
#define CAM_PIN_D2      19
#define CAM_PIN_D1      18
#define CAM_PIN_D0      5
#define CAM_PIN_VSYNC   25
#define CAM_PIN_HREF    23
#define CAM_PIN_PCLK    22

WebSocketsServer webSocket(WEBSOCKET_PORT);
httpd_handle_t camera_httpd = NULL;

struct {
  int left = 0;
  int right = 0;
  unsigned long last = 0;
} motor;

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== ESP32-CAM Rover - Motors + Camera ===");
  
  // Motor pins
  pinMode(IN1_PIN, OUTPUT);
  pinMode(IN2_PIN, OUTPUT);
  pinMode(IN3_PIN, OUTPUT);
  pinMode(IN4_PIN, OUTPUT);
  
  ledcAttach(ENA_PIN, PWM_FREQ, PWM_RES);
  ledcAttach(ENB_PIN, PWM_FREQ, PWM_RES);
  
  stopMotors();
  Serial.println("Motors initialized");
  
  // Init camera
  if (initCamera()) {
    Serial.println("Camera OK");
    startCameraServer();
  } else {
    Serial.println("Camera FAILED");
  }
  
  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts++ < 20) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected!");
    Serial.println("IP: " + WiFi.localIP().toString());
    Serial.println("Camera: http://" + WiFi.localIP().toString() + ":81/stream");
    Serial.println("Control: ws://" + WiFi.localIP().toString() + ":8080");
    
    webSocket.begin();
    webSocket.onEvent(wsEvent);
  }
  
  Serial.println("Ready!");
}

void loop() {
  webSocket.loop();
  
  // Safety timeout
  if (millis() - motor.last > 2000 && (motor.left != 0 || motor.right != 0)) {
    stopMotors();
  }
}

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAM_PIN_D0;
  config.pin_d1 = CAM_PIN_D1;
  config.pin_d2 = CAM_PIN_D2;
  config.pin_d3 = CAM_PIN_D3;
  config.pin_d4 = CAM_PIN_D4;
  config.pin_d5 = CAM_PIN_D5;
  config.pin_d6 = CAM_PIN_D6;
  config.pin_d7 = CAM_PIN_D7;
  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_pclk = CAM_PIN_PCLK;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_sscb_sda = CAM_PIN_SIOD;
  config.pin_sscb_scl = CAM_PIN_SIOC;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_DRAM;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  
  return esp_camera_init(&config) == ESP_OK;
}

void wsEvent(uint8_t num, WStype_t type, uint8_t * payload, size_t len) {
  if (type == WStype_CONNECTED) {
    Serial.println("Client connected");
    webSocket.sendTXT(num, "{\"type\":\"connected\",\"ip\":\"" + WiFi.localIP().toString() + "\"}");
  }
  else if (type == WStype_TEXT) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload) == DeserializationError::Ok) {
      String type = doc["type"];
      
      if (type == "drive") {
        float lin = doc["linear_mps"] | 0.0;
        float ang = doc["angular_rps"] | 0.0;
        
        float left = lin - ang * 0.5;
        float right = lin + ang * 0.5;
        
        motor.left = constrain((int)(left * 255), -255, 255);
        motor.right = constrain((int)(right * 255), -255, 255);
        motor.last = millis();
        
        setMotor(IN1_PIN, IN2_PIN, ENA_PIN, motor.left);
        setMotor(IN3_PIN, IN4_PIN, ENB_PIN, motor.right);
        
        webSocket.sendTXT(num, "{\"ok\":true}");
      }
      else if (type == "stop") {
        stopMotors();
        webSocket.sendTXT(num, "{\"ok\":true}");
      }
    }
  }
}

void setMotor(int p1, int p2, int pwm, int speed) {
  if (speed > 0) {
    digitalWrite(p1, HIGH);
    digitalWrite(p2, LOW);
    ledcWrite(pwm, speed);
  } else if (speed < 0) {
    digitalWrite(p1, LOW);
    digitalWrite(p2, HIGH);
    ledcWrite(pwm, -speed);
  } else {
    digitalWrite(p1, LOW);
    digitalWrite(p2, LOW);
    ledcWrite(pwm, 0);
  }
}

void stopMotors() {
  setMotor(IN1_PIN, IN2_PIN, ENA_PIN, 0);
  setMotor(IN3_PIN, IN4_PIN, ENB_PIN, 0);
  motor.left = 0;
  motor.right = 0;
}

// Camera HTTP server
static esp_err_t stream_handler(httpd_req_t *req) {
  camera_fb_t * fb = NULL;
  esp_err_t res = ESP_OK;
  size_t _jpg_buf_len = 0;
  uint8_t * _jpg_buf = NULL;
  char * part_buf[64];

  static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=frame";
  static const char* _STREAM_BOUNDARY = "\r\n--frame\r\n";
  static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

  res = httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);
  if(res != ESP_OK) return res;

  while(true) {
    fb = esp_camera_fb_get();
    if (!fb) {
      res = ESP_FAIL;
      break;
    }
    _jpg_buf_len = fb->len;
    _jpg_buf = fb->buf;

    if(res == ESP_OK) {
      res = httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY));
    }
    if(res == ESP_OK) {
      size_t hlen = snprintf((char *)part_buf, 64, _STREAM_PART, _jpg_buf_len);
      res = httpd_resp_send_chunk(req, (const char *)part_buf, hlen);
    }
    if(res == ESP_OK) {
      res = httpd_resp_send_chunk(req, (const char *)_jpg_buf, _jpg_buf_len);
    }
    
    esp_camera_fb_return(fb);
    if(res != ESP_OK) break;
  }
  return res;
}

void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 81;

  httpd_uri_t stream_uri = {
    .uri       = "/stream",
    .method    = HTTP_GET,
    .handler   = stream_handler,
    .user_ctx  = NULL
  };

  if (httpd_start(&camera_httpd, &config) == ESP_OK) {
    httpd_register_uri_handler(camera_httpd, &stream_uri);
  }
}
