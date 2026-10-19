#include "Radar.h"
HardwareSerial radarUart(0);
Radar radar;
uint32_t lastPrint = 0;
void setup() { Serial.begin(115200); beginRadar(radar, radarUart); }
void loop() {
  radar.update(0); // Nonblocking poll, not a sampling frequency.
  PeopleCounting targets;
  if (radar.getPeopleCountingTargetInfo(targets)) {
    Serial.printf("targets=%u\n", unsigned(targets.targets.size()));
    for (const auto& t : targets.targets)
      Serial.printf("x=%.3f m y=%.3f m dop=%ld cluster=%ld\n", t.x_point, t.y_point, long(t.dop_index), long(t.cluster_index));
  }
  if (millis() - lastPrint >= 1000) {
    lastPrint = millis();
    Serial.printf("frames=%lu presence=%s radar=%s\n", (unsigned long)radar.frames,
      !radar.sawPresence ? "unknown" : radar.present ? "present" : "absent",
      radar.sawFrame && millis() - radar.lastFrame < 3000 ? "responsive" : "unresponsive");
  }
}
