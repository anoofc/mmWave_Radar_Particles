import { validatePacket } from './validation';
import type { Packet } from '../../../shared/protocol';
export function parsePacket(line: string): Packet { return validatePacket(JSON.parse(line)); }
// ROM output is outside the application's protocol. Recognize only known boot
// formats; arbitrary logs and malformed JSON must still be reported as errors.
export function isEspBootLine(line: string): boolean {
  return /^(?:ESP-ROM:esp32\S*|Build:\w+\s+\d+\s+\d{4}|rst:0x[\da-f]+(?:\s+\([^)]{1,80}\))?,boot:0x[\da-f]+|Saved PC:0x[\da-f]+|SPIWP:0x[\da-f]+|mode:\w+,\s*clock div:\d+|load:0x[\da-f]+,len:0x[\da-f]+|entry 0x[\da-f]+)(?:\s|$|\()/i.test(line);
}
/** Bounded framer; discard an oversized line until newline, including across reads. */
export class LineParser {
  private buffer = '';
  private dropping = false;
  constructor(private packet: (p: Packet) => void, private error: (message: string, line?: string) => void, private limit = 8192, private boot: (line: string) => void = () => {}) {}
  push(chunk: string) {
    for (const c of chunk) {
      if (c === '\n') {
        const line = this.buffer.trim(); this.buffer = '';
        if (this.dropping) { this.dropping = false; continue; }
        if (!line) continue;
        if (isEspBootLine(line)) { this.boot(line); continue; }
        try { this.packet(parsePacket(line)); } catch (e) { this.error(e instanceof Error ? e.message : 'Invalid packet', line); }
      } else if (!this.dropping) {
        this.buffer += c;
        if (this.buffer.length > this.limit) { const sample = this.buffer.slice(0, this.limit); this.buffer = ''; this.dropping = true; this.error('Serial line exceeds limit (captured prefix only)', sample); }
      }
    }
  }
  reset() { this.buffer = ''; this.dropping = false; }
}
