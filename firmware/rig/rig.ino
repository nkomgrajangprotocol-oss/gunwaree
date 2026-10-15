// FloodSense demo - ESP32 DevKit V1 + A02YYUW (UART) + relay pump
// Board: "ESP32 Dev Module". No extra libraries needed.

#include <WiFi.h>
#include <HTTPClient.h>

// ===================== CONFIG =====================
#define SIMULATE_SENSOR 1          // 1 = fake water level (no sensor needed), 0 = real A02YYUW

const char* WIFI_SSID = "Wokwi-GUEST";   // change on real hardware
const char* WIFI_PASS = "";
const char* POST_URL  = "http://YOUR-BACKEND/api/level";   // ask Captain
const char* GET_URL   = "http://YOUR-BACKEND/api/pump";    // ask Captain
const char* API_KEY   = "";                                // leave "" if not needed
const char* DEVICE_ID = "esp32-01";

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
const int RELAY_PIN = 26;
const bool RELAY_ACTIVE_LOW = true;     // most relay modules: LOW = ON
const int LED_G = 25, LED_Y = 27, LED_R = 33;
const int SENSOR_RX = 16;               // sensor TX -> GPIO16 (Serial2 RX)
const int SENSOR_TX = 17;
// ==================================================

enum Status { GREEN, YELLOW, RED };
const char* STATUS_NAMES[] = {"green", "yellow", "red"};
Status status = GREEN;

float distanceCm = 0, levelCm = 0, latestCm = 0;
float samples[5]; int sampleCount = 0, sampleIdx = 0;
bool haveReading = false;
uint32_t lastGoodMs = 0, lastSample = 0, lastSend = 0, lastPoll = 0;

bool pumpOn = false, lockedOut = false;
uint32_t pumpStart = 0, maxRunMs = DEFAULT_MAX_RUN_S * 1000UL;

// ---------- relay ----------
void setRelay(bool on) {
  digitalWrite(RELAY_PIN, RELAY_ACTIVE_LOW ? (on ? LOW : HIGH) : (on ? HIGH : LOW));
}

// ---------- sensor ----------
// A02YYUW UART frame: 0xFF, high, low, checksum  (distance in mm)
bool readDistanceCm(float &cm) {
  static uint8_t buf[4];
  static uint8_t idx = 0;
  bool got = false;
  while (Serial2.available()) {
    uint8_t b = Serial2.read();
    if (idx == 0 && b != 0xFF) continue;
    buf[idx++] = b;
    if (idx == 4) {
      idx = 0;
      if (((buf[0] + buf[1] + buf[2]) & 0xFF) == buf[3]) {
        cm = ((buf[1] << 8) | buf[2]) / 10.0;
        got = true;
      }
    }
  }
  return got;
}

float medianOfSamples() {
  int n = sampleCount < 5 ? sampleCount : 5;
  float t[5];
  for (int i = 0; i < n; i++) t[i] = samples[i];
  for (int i = 1; i < n; i++) {            // insertion sort
    float v = t[i]; int j = i - 1;
    while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
    t[j + 1] = v;
  }
  return t[n / 2];
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
      maxRunMs = s * 1000UL;
      pumpOn = true;
      pumpStart = millis();
      setRelay(true);
    }
  }
}

void addHeaders(HTTPClient &http) {
  http.addHeader("Content-Type", "application/json");
  if (strlen(API_KEY) > 0) http.addHeader("Authorization", String("Bearer ") + API_KEY);
}

void pollPump() {
  if (WiFi.status() != WL_CONNECTED) { failSafe(); return; }
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(GET_URL);
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
  HTTPClient http;
  http.setTimeout(3000);
  http.begin(POST_URL);
  addHeaders(http);
  int code = http.POST(body);
  Serial.printf("POST %s -> %d\n", body, code);
  http.end();
}

// ---------- 1-second sensor tick ----------
void sampleTick(uint32_t now) {
#if SIMULATE_SENSOR
  float fakeLevel = 20.0 + 15.0 * sin(now / 1000.0 / 15.0);   // swings 5..35 cm
  latestCm = SENSOR_HEIGHT_CM - fakeLevel;
  lastGoodMs = now;
#else
  if (now - lastGoodMs > 10000) {                               // sensor fault
    Serial.println("Sensor fault: no valid reading");
    failSafe();
    return;
  }
#endif
  samples[sampleIdx] = latestCm;
  sampleIdx = (sampleIdx + 1) % 5;
  if (sampleCount < 5) sampleCount++;

  distanceCm = medianOfSamples();
  levelCm = SENSOR_HEIGHT_CM - distanceCm;
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
  Serial2.begin(9600, SERIAL_8N1, SENSOR_RX, SENSOR_TX);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  lastGoodMs = millis();
}

void loop() {
  uint32_t now = millis();

  float cm;
  if (readDistanceCm(cm)) { latestCm = cm; lastGoodMs = now; }

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
