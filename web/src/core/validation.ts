import type { Packet, Target } from '../../../shared/protocol';
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const uint = (v: unknown): v is number => finite(v) && Number.isInteger(v) && v >= 0 && v <= 0xffffffff;
const nullableTime = (v: unknown) => v === null || uint(v);
const target = (v: unknown): v is Target => obj(v) && finite(v.x) && finite(v.y) && Math.abs(v.x) <= 100 && Math.abs(v.y) <= 100 && finite(v.doppler) && Number.isInteger(v.doppler) && Math.abs(v.doppler) <= 2147483648 && finite(v.cluster) && Number.isInteger(v.cluster) && Math.abs(v.cluster) <= 2147483648;
export function validatePacket(p: unknown): Packet {
  if (!obj(p)) throw new Error('Packet must be an object');
  if (p.v !== 1) throw new Error(`Unsupported protocol version: ${String(p.v)}`);
  if (!uint(p.seq) || !uint(p.ts)) throw new Error('Invalid sequence or uptime');
  if (p.type === 'telemetry') {
    if (p.units !== 'm' || !['responsive', 'unresponsive'].includes(String(p.radar))) throw new Error('Invalid units or radar state');
    if (!(p.presence === null || typeof p.presence === 'boolean') || !nullableTime(p.presence_at) || !nullableTime(p.target_at)) throw new Error('Invalid presence or measurement time');
    if (!['valid', 'unavailable'].includes(String(p.report)) || !Array.isArray(p.targets) || p.targets.length > 3 || !p.targets.every(target)) throw new Error('Invalid target report');
    if (p.report === 'valid' && p.target_at === null) throw new Error('Valid report requires measurement time');
    if (p.report === 'unavailable' && p.targets.length !== 0) throw new Error('Unavailable report must have no targets');
    if (p.presence !== null && p.presence_at === null) throw new Error('Presence requires measurement time');
    if (p.distance !== null && (!obj(p.distance) || !finite(p.distance.value) || p.distance.unit !== 'sensor_raw' || !uint(p.distance.at))) throw new Error('Invalid distance');
    if (![p.sensor_frames, p.target_frames, p.errors].every(uint)) throw new Error('Invalid counters');
  } else if (p.type === 'status') {
    if (!['firmware', 'board', 'sensor'].every(k => typeof p[k] === 'string') || !['responsive', 'unresponsive'].includes(String(p.radar)) || !(p.sensor_firmware === null || typeof p.sensor_firmware === 'string') || !finite(p.doppler_step_cm_s) || p.doppler_step_cm_s <= 0 || !uint(p.interval_ms) || ![p.sensor_frames, p.target_frames, p.errors, p.tx_dropped].every(uint)) throw new Error('Invalid status');
  } else if (p.type === 'ack') {
    if (typeof p.id !== 'string' || typeof p.ok !== 'boolean' || typeof p.message !== 'string') throw new Error('Invalid acknowledgement');
  } else throw new Error(`Unknown packet type: ${String(p.type)}`);
  return p as unknown as Packet;
}
