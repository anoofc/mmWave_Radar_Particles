#pragma once
#include <Arduino.h>
#include <vector>
#include <Seeed_Arduino_mmWave.h>
#include <cmath>
#include <cstring>
#include "PresencePayload.h"
#include "PresencePayloadChecks.h"

// The v1 getter cannot distinguish no presence report from an absent report.
// Observe the public virtual handler, then delegate decoding to Seeed.
class Radar : public SEEED_MR60BHA2 {
 public:
  uint32_t frames = 0, errors = 0, lastFrame = 0;
  uint32_t targetAt = 0, presenceAt = 0, targetFrames = 0;
  bool sawFrame = false, sawTargets = false, sawPresence = false;
  bool present = false;
  bool handleType(uint16_t type, const uint8_t* data, size_t len) override {
    size_t required = 0;
    switch (static_cast<TypeHeartBreath>(type)) {
      case TypeHeartBreath::TypeHeartBreathPhase: required = 12; break;
      case TypeHeartBreath::TypeBreathRate:
      case TypeHeartBreath::TypeHeartRate:
      case TypeHeartBreath::ReportFirmware: required = 4; break;
      case TypeHeartBreath::TypeHeartBreathDistance: required = 8; break;
      case TypeHeartBreath::ReportHumanDetection:
        if (!validPresencePayload(data, len)) { ++errors; return false; }
        required = len;
        break;
      case TypeHeartBreath::Report3DPointCloudDetection:
      case TypeHeartBreath::Report3DPointCloudTargetInfo: {
        if (len < 4) { ++errors; return false; }
        uint32_t count; memcpy(&count, data, 4);
        if (count > MAX_TARGET_NUM || len != 4 + count * 16) { ++errors; return false; }
        required = len;
        for (uint32_t i = 0; i < count; ++i) {
          float x, y; memcpy(&x, data + 4 + i * 16, 4); memcpy(&y, data + 8 + i * 16, 4);
          if (!std::isfinite(x) || !std::isfinite(y)) { ++errors; return false; }
        }
        break;
      }
      default: return false;
    }
    if (len != required) { ++errors; return false; }
    if (!SEEED_MR60BHA2::handleType(type, data, len)) return false;
    ++frames; lastFrame = millis(); sawFrame = true;
    if (type == 0x0F09) { present = isHumanDetected(); presenceAt = lastFrame; sawPresence = true; }
    if (type == 0x0A04) { targetAt = lastFrame; sawTargets = true; ++targetFrames; }
    return true;
  }
};

inline void beginRadar(Radar& radar, HardwareSerial& uart) {
  // begin() also initializes UART; reapply explicit kit pins afterward.
  radar.begin(&uart, 115200, 0);
  uart.begin(115200, SERIAL_8N1, 17, 16);
}
