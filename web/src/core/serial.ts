import type { Command, Packet } from '../../../shared/protocol';
import { LineParser } from './protocol';
export class SerialTransport {
  static supported() { return typeof navigator !== 'undefined' && 'serial' in navigator && window.isSecureContext; }
  private port: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private reading: Promise<void> | null = null;
  private closing = false;
  private writes: Promise<void> = Promise.resolve();
  private parser: LineParser;
  constructor(packet: (p: Packet) => void, private error: (s: string, line?: string) => void, private lost: () => void, boot: (line: string) => void = () => {}) { this.parser = new LineParser(packet, error, 8192, boot); }
  async connect(reconnect = false) {
    if (this.port) return;
    if (!SerialTransport.supported()) throw new Error('Web Serial requires Chrome or Edge on localhost or HTTPS.');
    let port: SerialPort;
    if (reconnect) {
      const ports = await navigator.serial.getPorts();
      if (ports.length !== 1) throw new Error('Select a port with Connect USB; reconnect requires exactly one authorized port.');
      port = ports[0];
    } else port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200, bufferSize: 16384 });
    this.port = port; this.closing = false; this.parser.reset();
    this.reading = this.readLoop(port);
  }
  private async readLoop(port: SerialPort) {
    const decoder = new TextDecoder();
    try {
      if (!port.readable) throw new Error('Port is not readable');
      this.reader = port.readable.getReader();
      while (!this.closing) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) this.parser.push(decoder.decode(value, { stream: true }));
      }
    } catch (e) { if (!this.closing) this.error(`Serial read: ${String(e)}`); }
    finally {
      this.reader?.releaseLock(); this.reader = null; this.parser.reset();
      if (!this.closing) {
        this.closing = true;
        await this.writes.catch(() => {});
        await port.close().catch(() => {}); this.port = null; this.lost();
      }
    }
  }
  send(command: Command): Promise<void> {
    const task = this.writes.then(async () => {
      if (!this.port?.writable || this.closing) throw new Error('USB serial is not connected');
      const writer = this.port.writable.getWriter();
      try { await writer.write(new TextEncoder().encode(JSON.stringify(command) + '\n')); }
      finally { writer.releaseLock(); }
    });
    this.writes = task.catch(() => {}); return task;
  }
  async disconnect() {
    this.closing = true;
    await this.reader?.cancel().catch(() => {});
    await this.reading;
    await this.writes;
    await this.port?.close().catch(() => {});
    this.port = null; this.parser.reset();
  }
}
