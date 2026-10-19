// #include <Arduino.h>
#include "Radar.h"
#include <ArduinoJson.h>

namespace {
constexpr uint32_t MEASUREMENT_TTL = 2500, RADAR_TIMEOUT = 3000;
HardwareSerial radarUart(0);
Radar radar;
PeopleCounting targets;
StaticJsonDocument<2048> output;
StaticJsonDocument<512> commandDoc;
char tx[1536], commandLine[256], sensorFirmware[32] = {};
size_t txSize = 0, txSent = 0, commandSize = 0;
bool droppingCommand = false, statusRequested = true, usbWasConnected = false;
uint32_t seq = 0, dropped = 0, commandErrors = 0, intervalMs = 100;
uint32_t lastTelemetry = 0, lastStatus = 0, lastRecovery = 0;
uint32_t distanceAt = 0;
float distanceValue = 0;
bool sawDistance = false;

bool responsive(uint32_t now) { return radar.sawFrame && now - radar.lastFrame < RADAR_TIMEOUT; }
void envelope(const char* type, uint32_t now) {
  output.clear(); output["type"] = type; output["v"] = 1;
  output["seq"] = seq++; output["ts"] = now;
}
void queueOutput() {
  const size_t size = measureJson(output);
  if (txSize || output.overflowed() || size + 2 > sizeof(tx)) { ++dropped; return; }
  // A leading delimiter isolates any partial line left by a USB reconnect.
  // Empty NDJSON lines are ignored by the host. Never concatenate documents.
  tx[0] = '\n';
  const size_t written = serializeJson(output, tx + 1, sizeof(tx) - 1);
  if (written != size) { ++dropped; return; }
  txSize = written + 1; tx[txSize++] = '\n'; txSent = 0;
}
void pumpOutput() {
  if (!Serial) { txSize = txSent = 0; return; }
  if (!txSize) return;
  const int available = Serial.availableForWrite();
  if (available <= 0) return;
  const size_t remaining = txSize - txSent;
  const size_t size = remaining < size_t(available) ? remaining : size_t(available);
  // Keep each write within a USB full-speed packet and retry short writes.
  const size_t chunk = size < 64 ? size : 64;
  txSent += Serial.write(reinterpret_cast<const uint8_t*>(tx + txSent), chunk);
  if (txSent == txSize) txSize = txSent = 0;
}
void sendStatus(uint32_t now) {
  envelope("status", now);
  output["firmware"] = "1.0.2"; output["board"] = "XIAO ESP32C6"; output["sensor"] = "MR60BHA2";
  output["radar"] = responsive(now) ? "responsive" : "unresponsive";
  if (sensorFirmware[0]) output["sensor_firmware"] = sensorFirmware; else output["sensor_firmware"] = nullptr;
  output["doppler_step_cm_s"] = RANGE_STEP; output["interval_ms"] = intervalMs;
  output["sensor_frames"] = radar.frames; output["target_frames"] = radar.targetFrames;
  output["errors"] = radar.errors + commandErrors; output["tx_dropped"] = dropped;
  queueOutput(); lastStatus = now; statusRequested = false;
}
void sendTelemetry(uint32_t now) {
  envelope("telemetry", now); output["units"] = "m";
  const bool alive = responsive(now);
  output["radar"] = alive ? "responsive" : "unresponsive";
  const bool presenceValid = alive && radar.sawPresence && now - radar.presenceAt < MEASUREMENT_TTL;
  if (presenceValid) { output["presence"] = radar.present; output["presence_at"] = radar.presenceAt; }
  else { output["presence"] = nullptr; output["presence_at"] = nullptr; }
  const bool targetValid = alive && radar.sawTargets && now - radar.targetAt < MEASUREMENT_TTL;
  output["report"] = targetValid ? "valid" : "unavailable";
  if (targetValid) output["target_at"] = radar.targetAt; else output["target_at"] = nullptr;
  JsonArray array = output.createNestedArray("targets");
  if (targetValid) for (const auto& t : targets.targets) {
    JsonObject item = array.createNestedObject();
    item["x"] = t.x_point; item["y"] = t.y_point;
    item["doppler"] = t.dop_index; item["cluster"] = t.cluster_index;
  }
  if (alive && sawDistance && now - distanceAt < MEASUREMENT_TTL) {
    JsonObject d = output.createNestedObject("distance");
    d["value"] = distanceValue; d["unit"] = "sensor_raw"; d["at"] = distanceAt;
  } else output["distance"] = nullptr;
  output["sensor_frames"] = radar.frames; output["target_frames"] = radar.targetFrames;
  output["errors"] = radar.errors + commandErrors;
  queueOutput(); lastTelemetry = now;
}
void recover(uint32_t now) {
  radarUart.end(); beginRadar(radar, radarUart);
  radar.sawTargets = radar.sawPresence = radar.sawFrame = false;
  sawDistance = false; targets.targets.clear(); lastRecovery = now;
}
void ack(const char* id, bool ok, const char* message, uint32_t now) {
  envelope("ack", now); output["id"] = id; output["ok"] = ok; output["message"] = message; queueOutput();
}
void processCommand(uint32_t now) {
  const DeserializationError error = deserializeJson(commandDoc, commandLine, commandSize);
  if (error) { ++commandErrors; ack("", false, "invalid JSON", now); return; }
  const char* suppliedId = commandDoc["id"] | "";
  char id[65]; const size_t length = strlen(suppliedId);
  if (length > 64) { ++commandErrors; ack("", false, "id too long", now); return; }
  memcpy(id, suppliedId, length + 1);
  if (!length || !commandDoc["id"].is<const char*>() || !commandDoc["v"].is<int>() || commandDoc["v"].as<int>() != 1 || strcmp(commandDoc["type"] | "", "command")) {
    ++commandErrors; ack(id, false, "invalid envelope or protocol version", now); return;
  }
  const char* name = commandDoc["command"] | "";
  if (!strcmp(name, "hello") || !strcmp(name, "status") || !strcmp(name, "ping")) {
    statusRequested = true; ack(id, true, "ready", now);
  } else if (!strcmp(name, "set_interval")) {
    if (!commandDoc["interval_ms"].is<uint32_t>() || commandDoc["interval_ms"].as<uint32_t>() < 50 || commandDoc["interval_ms"].as<uint32_t>() > 1000) {
      ++commandErrors; ack(id, false, "interval_ms must be an integer from 50 to 1000", now);
    } else { intervalMs = commandDoc["interval_ms"]; statusRequested = true; ack(id, true, "interval updated", now); }
  } else if (!strcmp(name, "recover")) {
    recover(now); statusRequested = true; ack(id, true, "UART restarted", now);
  } else { ++commandErrors; ack(id, false, "unknown command", now); }
}
void readCommands(uint32_t now) {
  // Bound work per loop. Leave room for an acknowledgement before reading a command.
  for (int budget = 96; budget && Serial.available() && !txSize; --budget) {
    const char c = char(Serial.read());
    if (c == '\n') {
      if (droppingCommand) { droppingCommand = false; ++commandErrors; ack("", false, "command line too long", now); }
      else if (commandSize) processCommand(now);
      commandSize = 0;
    } else if (c != '\r' && !droppingCommand) {
      if (commandSize < sizeof(commandLine) - 1) commandLine[commandSize++] = c;
      else { droppingCommand = true; commandSize = 0; }
    }
  }
}
}

void setup() {
  Serial.setTxBufferSize(2048);
  Serial.begin(115200); Serial.setTxTimeoutMs(0);
  beginRadar(radar, radarUart);
}
void loop() {
  radar.update(0);
  PeopleCounting freshTargets;
  if (radar.getPeopleCountingTargetInfo(freshTargets)) targets = std::move(freshTargets);
  // Consume point-cloud storage too; it is not a target report.
  PeopleCounting pointCloud; radar.getPeopleCountingPointCloud(pointCloud);
  const uint32_t now = millis();
  float d;
  if (radar.getDistance(d) && std::isfinite(d)) { distanceValue = d; distanceAt = now; sawDistance = true; }
  FirmwareInfo info;
  if (radar.getFirmwareInfo(info)) {
    const auto& f = info.firmware_verson;
    snprintf(sensorFirmware, sizeof(sensorFirmware), "%u.%u.%u (project %u)", f.major_version, f.sub_version, f.modified_version, f.project_name);
  }
  if (!responsive(now) && now - lastRecovery >= 10000) recover(now);
  const bool connected = bool(Serial);
  if (connected != usbWasConnected) {
    txSize = txSent = commandSize = 0; droppingCommand = false;
    statusRequested = true; usbWasConnected = connected;
  }
  pumpOutput();
  if (connected) {
    readCommands(now);
    if (!txSize && (statusRequested || now - lastStatus >= 1000)) sendStatus(now);
    if (!txSize && now - lastTelemetry >= intervalMs) sendTelemetry(now);
    pumpOutput();
  }
}
