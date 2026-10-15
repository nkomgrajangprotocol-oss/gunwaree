// FloodSense - ESP32 DevKit V1 + HC-SR04 + relay pump + 3 LEDs
// Board: "ESP32 Dev Module". No extra libraries needed.
//
// REQUIRES secrets.h next to this file (defines WIFI_SSID, WIFI_PASS, DEVICE_KEY).
// Copy secrets.example.h to secrets.h and fill in real values. secrets.h is in .gitignore - never commit it.
//
// TODO(Pai): confirm the sensor. readDistanceCm() below is written for HC-SR04 (trig/echo).
//            The plan mentions A02YYUW (UART) - if that is used, the read code must change.

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "secrets.h"

// ===================== CONFIG =====================
#define SIMULATE_SENSOR 0          // 0 = real sensor. 1 = fake water level for Wokwi only - never use with the real system

const char* BASE_URL  = "https://gunwaree-production.up.railway.app";
const char* POST_PATH = "/device/readings";
const char* PUMP_PATH = "/device/pump-command?region=bangkok_test";
const char* DEVICE_ID = "esp32-01";
const uint32_t MAX_RUN_CAP_S = 90;     // never run longer than this, whatever the backend sends

// TODO: replace with real measurements
const float SENSOR_HEIGHT_CM = 50.0;   // sensor face -> bottom of container
const float YELLOW_CM        = 15.0;   // water level (cm)
const float RED_CM           = 25.0;   // water level (cm)
const float HYST_CM          = 2.0;

const uint32_t SEND_NORMAL_S     = 10;  // green
const uint32_t SEND_ALERT_S      = 3;   // yellow / red
const uint32_t POLL_EVERY_S      = 5;   // GET pump command
const uint32_t DEFAULT_MAX_RUN_S = 60;

// Pins
const int TRIG_PIN = 5;
const int ECHO_PIN = 18;                // MUST go through a voltage divider (1k + 2k) - Echo is 5V
const int RELAY_PIN = 26;
const bool RELAY_ACTIVE_LOW = true;     // most relay modules: LOW = ON
const int LED_G = 25, LED_Y = 27, LED_R = 33;
// ==================================================

enum Status { GREEN, YELLOW, RED };
const char* STATUS_NAMES[] = {"green", "yellow", "red"};
Status status = GREEN;

float distanceCm = 0, levelCm = 0;
bool haveReading = false;
uint32_t lastGoodMs = 0, lastSample = 0, lastSend = 0, lastPoll = 0;

bool pumpOn = false, lockedOut = false;
uint32_t pumpStart = 0, maxRunMs = DEFAULT_MAX_RUN_S * 1000UL;

// ---------- relay ----------
void setRelay(bool on) {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

// ---------- HC-SR04: 5 pings, median of valid ones ----------
bool readDistanceCm(float &cm) {
  float v[5];
  int n = 0;
  for (int i = 0; i < 5; i++) {
    digitalWrite(TRIG_PIN, LOW);  delayMicroseconds(2);
    digitalWrite(TRIG_PIN, HIGH); delayMicroseconds(10);
    digitalWrite(TRIG_PIN, LOW);
    unsigned long us = pulseIn(ECHO_PIN, HIGH, 30000UL);   // 30 ms timeout
    if (us > 0) {
      float d = us * 0.0343f / 2.0f;                       // cm
      if (d >= 2.0f && d <= 400.0f) v[n++] = d;
    }
    delay(40);
  }
  if (n == 0) return false;
  for (int i = 1; i < n; i++) {                            // insertion sort
    float x = v[i]; int j = i - 1;
    while (j >= 0 && v[j] > x) { v[j + 1] = v[j]; j--; }
    v[j + 1] = x;
  }
  cm = v[n / 2];
  return true;
}

// ---------- status with hysteresis ----------
void updateStatus(float level) {
  switch (status) {
    case GREEN:
      if (level >= RED_CM) status = RED;
      else if (level >= YELLOW_CM) status = YELLOW;
      break;
    case YELLOW:
      if (level >= RED_CM) status = RED;
      else if (level < YELLOW_CM - HYST_CM) status = GREEN;
      break;
    case RED:
      if (level < RED_CM - HYST_CM) status = YELLOW;
      break;
  }
  digitalWrite(LED_G, status == GREEN);
  digitalWrite(LED_Y, status == YELLOW);
  digitalWrite(LED_R, status == RED);
}

// ---------- pump rules ----------
void failSafe() {                 // GET failed / Wi-Fi lost / sensor fault
  if (pumpOn) lockedOut = true;   // needs an explicit "off" before running again
  pumpOn = false;
  setRelay(false);
}

void handleCommand(String body) {
  body.replace(" ", "");
  body.replace("\n", "");
  if (body.indexOf("\"pump\":\"off\"") >= 0) {
    pumpOn = false;
    lockedOut = false;            // unlock only on "off"
    setRelay(false);
  } else if (body.indexOf("\"pump\":\"on\"") >= 0) {
    if (!pumpOn && !lockedOut) {  // repeated "on" does not reset the timer
      int i = body.indexOf("\"max_run_s\":");
      uint32_t s = (i >= 0) ? body.substring(i + 12).toInt() : 0;
      if (s == 0) s = DEFAULT_MAX_RUN_S;
      if (s > MAX_RUN_CAP_S) s = MAX_RUN_CAP_S;
      maxRunMs = s * 1000UL;
      pumpOn = true;
      pumpStart = millis();
      setRelay(true);
    }
  }
}

void addHeaders(HTTPClient &http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);   // never print DEVICE_KEY to Serial
}

// HTTPS without certificate check (setInsecure): accepted for this prototype.
// Risk: anyone who can intercept the traffic (e.g. on the same Wi-Fi) could impersonate the backend
// or read X-Device-Key. Add the server's root CA with client.setCACert() if there is time.

void pollPump() {
  if (WiFi.status() != WL_CONNECTED) { failSafe(); return; }
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(BASE_URL) + PUMP_PATH);
  http.setTimeout(5000);
  addHeaders(http);
  int code = http.GET();
  if (code == 200) handleCommand(http.getString());
  else { Serial.printf("GET failed: %d\n", code); failSafe(); }
  http.end();
}

void postLevel() {
  if (!haveReading || WiFi.status() != WL_CONNECTED) return;
  char body[200];
  snprintf(body, sizeof(body),
           "{\"device_id\":\"%s\",\"distance_cm\":%.1f,\"water_level_cm\":%.1f,\"status\":\"%s\"}",
           DEVICE_ID, distanceCm, levelCm, STATUS_NAMES[status]);
  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  http.begin(client, String(BASE_URL) + POST_PATH);
  http.setTimeout(5000);
  addHeaders(http);
  int code = http.POST(body);
  Serial.printf("POST -> %d  %s\n", code, body);   // body has no key
  http.end();
}

// ---------- 1-second sensor tick ----------
void sampleTick(uint32_t now) {
#if SIMULATE_SENSOR
  float fakeLevel = 20.0 + 15.0 * sin(now / 1000.0 / 15.0);   // swings 5..35 cm
  distanceCm = SENSOR_HEIGHT_CM - fakeLevel;
  lastGoodMs = now;
#else
  float cm;
  if (readDistanceCm(cm)) {
    distanceCm = cm;
    lastGoodMs = now;
  } else if (now - lastGoodMs > 10000) {                       // sensor fault
    Serial.println("Sensor fault: no valid reading");
    haveReading = false;                                       // stop re-sending the last value with a new timestamp
    failSafe();
    return;
  } else if (!haveReading) {
    return;
  }
#endif
  levelCm = SENSOR_HEIGHT_CM - distanceCm;
  if (levelCm < 0) levelCm = 0;
  haveReading = true;
  updateStatus(levelCm);
  Serial.printf("distance=%.1f cm  level=%.1f cm  status=%s  pump=%s%s\n",
                distanceCm, levelCm, STATUS_NAMES[status],
                pumpOn ? "ON" : "off", lockedOut ? " (locked)" : "");
}

void setup() {
  Serial.begin(115200);
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? HIGH : LOW);   // pump off before pin becomes output
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
  pinMode(LED_G, OUTPUT); pinMode(LED_Y, OUTPUT); pinMode(LED_R, OUTPUT);
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastGoodMs = millis();
}

void loop() {
  uint32_t now = millis();

  // pump timer: stop at max_run_s and lock until "off"
  if (pumpOn && now - pumpStart >= maxRunMs) {
    pumpOn = false;
    lockedOut = true;
    setRelay(false);
    Serial.println("Pump max run reached -> off, locked until backend sends off");
  }

  if (now - lastSample >= 1000) { lastSample = now; sampleTick(now); }

  uint32_t sendEvery = (status == GREEN ? SEND_NORMAL_S : SEND_ALERT_S) * 1000UL;
  if (now - lastSend >= sendEvery) { lastSend = now; postLevel(); }

  if (now - lastPoll >= POLL_EVERY_S * 1000UL) { lastPoll = now; pollPump(); }
}
