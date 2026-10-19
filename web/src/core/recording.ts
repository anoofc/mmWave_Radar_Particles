import type { Packet } from '../../../shared/protocol';
import { validatePacket } from './validation';
export interface RecordedEvent { at: number; packet: Packet }
export interface Session { format: 'mr60-session'; version: 1; started: string; events: RecordedEvent[] }
export const MAX_EVENTS = 100000;
export function newSession(): Session { return { format: 'mr60-session', version: 1, started: new Date().toISOString(), events: [] }; }
export function importSession(text: string): Session {
  if (text.length > 30_000_000) throw new Error('Recording exceeds 30 MB');
  const s = JSON.parse(text.replace(/^\uFEFF/, '')) as Session;
  if (s.format !== 'mr60-session' || s.version !== 1 || !Number.isFinite(Date.parse(s.started)) || !Array.isArray(s.events) || !s.events.length || s.events.length > MAX_EVENTS) throw new Error('Invalid recording envelope');
  let previous = -1;
  for (const e of s.events) {
    if (!Number.isFinite(e.at) || e.at < 0 || e.at < previous) throw new Error('Recording times must be ordered');
    e.packet = validatePacket(e.packet); previous = e.at;
  }
  return s;
}
export function sessionCsv(s: Session) {
  // One row per target; blank fields preserve empty/unavailable and status events.
  const rows = ['session_started,offset_ms,type,seq,device_ms,radar,presence,report,target_at_ms,x_m,y_m,doppler_index,cluster_index'];
  for (const e of s.events) {
    const p = e.packet;
    const prefix = [s.started, e.at, p.type, p.seq, p.ts];
    if (p.type !== 'telemetry') { rows.push([...prefix, '', '', '', '', '', '', '', ''].join(',')); continue; }
    for (const t of p.targets.length ? p.targets : [null]) rows.push([...prefix, p.radar, p.presence ?? '', p.report, p.target_at ?? '', t?.x ?? '', t?.y ?? '', t?.doppler ?? '', t?.cluster ?? ''].join(','));
  }
  return rows.join('\r\n');
}
/** Deterministic replay clock. Rebuild from zero on seeks to preserve filter history. */
export class Replay {
  position = 0; cursor = 0;
  constructor(public session: Session) {}
  get duration() { return this.session.events.at(-1)?.at ?? 0; }
  advance(delta: number, speed: number, emit: (event: RecordedEvent) => void) {
    this.position = Math.min(this.duration, this.position + delta * speed);
    while (this.cursor < this.session.events.length && this.session.events[this.cursor].at <= this.position) emit(this.session.events[this.cursor++]);
  }
  seek(position: number, reset: () => void, emit: (event: RecordedEvent) => void) {
    reset(); this.position = 0; this.cursor = 0;
    this.advance(Math.max(0, position), 1, emit);
  }
}
