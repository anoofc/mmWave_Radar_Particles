#pragma once
#include <stddef.h>
#include <stdint.h>

// Arduino v1 reads byte 0. The Seeed-linked ESPHome component reads a
// little-endian uint16. Accept both explicit 0/1 representations, never padding
// or unsupported codes as an invented presence value.
constexpr bool validPresencePayload(const uint8_t* data, size_t length) {
  return data && (length == 1 || length == 2) && data[0] <= 1 &&
         (length == 1 || data[1] == 0);
}
