import type { Telemetry, Target } from '../../../shared/protocol';
import { distance, normalized, uptimeAge, type Point } from './coordinates';
import { smooth, type FilterConfig } from './filtering';
export interface Track { cluster: number; raw: Target; position: Point; velocity: Point; rawVelocity: Point; sensorAt:number; deltaSeconds:number; seen: number; trail: Point[] }
export interface InteractionState {
  presence: boolean | null; primary: Point | null; screen: Point | null; velocity: Point;
  raw?: Point; rawVelocity?: Point; measurementId?:number; measurementAt?: number; measurementDelta?:number; targetId?: number; movementIntensity: number; freshness: number; tracking: 'tracking' | 'holding' | 'empty' | 'unavailable' | 'stale' | 'disconnected'; timestamp: number;
}
const empty = (timestamp: number, tracking: InteractionState['tracking']): InteractionState => ({ presence: null, primary: null, screen: null, velocity: {x: 0, y: 0}, movementIntensity: 0, freshness: 0, tracking, timestamp });
export class Tracker {
  tracks = new Map<number, Track>();
  primary: number | null = null;
  duplicates = 0;
  private lastTargetAt: number | null = null;
  private latest: Telemetry | null = null;
  private received = 0;
  private targetReceived = 0;
  private presenceReceived = 0;
  reset() { this.tracks.clear(); this.primary = null; this.latest = null; this.lastTargetAt = null; this.duplicates = 0; }
  ingest(p: Telemetry, now: number, config: FilterConfig) {
    // A device reboot starts a new coordinate history. uint32 wrap is allowed.
    if (this.latest && p.ts < this.latest.ts && this.latest.ts - p.ts < 0x80000000) this.reset();
    this.latest = p; this.received = now;
    this.presenceReceived = p.presence_at === null ? -Infinity : now - uptimeAge(p.ts, p.presence_at);
    this.targetReceived = p.target_at === null ? -Infinity : now - uptimeAge(p.ts, p.target_at);
    if (p.report !== 'valid' || p.target_at === this.lastTargetAt) return;
    this.lastTargetAt = p.target_at;
    const unique: Target[] = []; this.duplicates = 0;
    for (const t of p.targets) {
      if (unique.some(u => u.cluster === t.cluster || distance(u, t) < .08)) { ++this.duplicates; continue; }
      unique.push(t);
      const prev = this.tracks.get(t.cluster);
      const seen = this.targetReceived;
      const continuing = prev && seen - prev.seen <= config.holdMs;
      const position = continuing ? smooth(prev.position, t, config) : { x: t.x, y: t.y };
      const dt = prev && p.target_at!==null ? uptimeAge(p.target_at,prev.sensorAt) / 1000 : 0;
      const velocity = continuing && dt > 0 ? { x: (position.x - prev.position.x) / dt, y: (position.y - prev.position.y) / dt } : { x: 0, y: 0 };
      const rawVelocity = continuing && dt > .001 ? {x:(t.x-prev.raw.x)/dt,y:(t.y-prev.raw.y)/dt} : {x:0,y:0};
      this.tracks.set(t.cluster, { rawVelocity, deltaSeconds:dt, sensorAt:p.target_at??p.ts, cluster: t.cluster, raw: t, position, velocity, seen, trail: [...(continuing ? prev.trail : []), position].slice(-90) });
    }
    const current = unique.map(t => this.tracks.get(t.cluster)!);
    const nearest = current.sort((a, b) => Math.hypot(a.raw.x, a.raw.y) - Math.hypot(b.raw.x, b.raw.y))[0];
    if (config.primary === 'nearest' || !current.some(t => t.cluster === this.primary)) {
      const held = this.primary === null ? undefined : this.tracks.get(this.primary);
      if (nearest || !held || now - held.seen > config.holdMs) this.primary = nearest?.cluster ?? null;
    }
    this.prune(now, config);
  }
  private prune(now: number, config: FilterConfig) {
    for (const [id, t] of this.tracks) if (now - t.seen > config.holdMs) this.tracks.delete(id);
  }
  state(now: number, connected: boolean, config: FilterConfig): InteractionState {
    this.prune(now, config);
    if (!connected) { this.tracks.clear(); this.primary = null; return empty(now, 'disconnected'); }
    if (!this.latest) return empty(now, 'unavailable');
    const p = this.latest;
    if (now - this.received > config.staleMs || p.radar === 'unresponsive') { this.tracks.clear(); return empty(now, 'stale'); }
    const presence = now - this.presenceReceived <= config.staleMs ? p.presence : null;
    const base = { ...empty(now, 'unavailable'), presence };
    // A fresh explicit absent report must immediately suppress held interaction.
    if (presence === false) { this.tracks.clear(); this.primary = null; return { ...base, tracking: 'empty', freshness: 1 }; }
    if (p.report !== 'valid') return base;
    if (now - this.targetReceived > config.staleMs) return { ...base, tracking: 'stale' };
    const t = this.primary === null ? undefined : this.tracks.get(this.primary);
    if (!t) return { ...base, tracking: p.targets.length ? 'stale' : 'empty', freshness: 1 };
    const holding = !p.targets.some(v => v.cluster === t.cluster) || now - t.seen > 350;
    return { ...base, raw:{x:t.raw.x,y:t.raw.y},rawVelocity:holding?{x:0,y:0}:t.rawVelocity,measurementId:t.sensorAt,measurementAt:t.seen,measurementDelta:t.deltaSeconds,targetId:t.cluster,primary: t.position, screen: normalized(t.position, config), velocity: holding ? { x: 0, y: 0 } : t.velocity,
      movementIntensity: holding ? 0 : Math.min(1, Math.hypot(t.velocity.x, t.velocity.y) / 2),
      freshness: Math.max(0, 1 - (now - t.seen) / config.staleMs), tracking: holding ? 'holding' : 'tracking' };
  }
}
