/** USB NDJSON protocol v1. Sensor times are uint32 uptime milliseconds. */
export const PROTOCOL_VERSION = 1 as const;
export interface Target { x: number; y: number; doppler: number; cluster: number }
export interface Envelope { type: string; v: 1; seq: number; ts: number }
export interface Telemetry extends Envelope {
  type: 'telemetry'; units: 'm'; radar: 'responsive' | 'unresponsive';
  presence: boolean | null; presence_at: number | null;
  report: 'valid' | 'unavailable'; target_at: number | null; targets: Target[];
  distance: { value: number; unit: 'sensor_raw'; at: number } | null;
  sensor_frames: number; target_frames: number; errors: number;
}
export interface Status extends Envelope {
  type: 'status'; firmware: string; board: string; sensor: string;
  radar: 'responsive' | 'unresponsive'; sensor_firmware: string | null;
  doppler_step_cm_s: number; interval_ms: number; sensor_frames: number;
  target_frames: number; errors: number; tx_dropped: number;
}
export interface Ack extends Envelope { type: 'ack'; id: string; ok: boolean; message: string }
export type Packet = Telemetry | Status | Ack;
export interface Command { type: 'command'; v: 1; id: string; command: 'hello' | 'ping' | 'status' | 'set_interval' | 'recover'; interval_ms?: number }
