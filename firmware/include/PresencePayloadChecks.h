#pragma once
#include "PresencePayload.h"
// Compile-time regression checks run in both PlatformIO environments.
namespace presence_payload_checks {
constexpr uint8_t absent[] = {0, 0};
constexpr uint8_t present[] = {1, 0};
constexpr uint8_t invalidCode[] = {2, 0};
constexpr uint8_t invalidHighByte[] = {1, 1};
static_assert(validPresencePayload(absent, 1), "Arduino absent byte");
static_assert(validPresencePayload(present, 1), "Arduino present byte");
static_assert(validPresencePayload(absent, 2), "ESPHome uint16 absent");
static_assert(validPresencePayload(present, 2), "ESPHome uint16 present");
static_assert(!validPresencePayload(present, 0), "Empty payload must be rejected");
static_assert(!validPresencePayload(present, 3), "Unsupported width must be rejected before reading");
static_assert(!validPresencePayload(nullptr, 1), "Null payload must be rejected");
static_assert(!validPresencePayload(invalidCode, 1), "Unknown byte value must be rejected");
static_assert(!validPresencePayload(invalidCode, 2), "Unknown uint16 value must be rejected");
static_assert(!validPresencePayload(invalidHighByte, 2), "Nonboolean uint16 must be rejected");
}
