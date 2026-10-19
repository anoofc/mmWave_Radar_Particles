import type { Telemetry } from '../../../shared/protocol';
export interface SimulationZone {centerX:number;halfRange:number;near:number;far:number}
export interface SimulationConfig { zone?:SimulationZone; x: number; y: number; presence: boolean; loss: boolean; duplicate: boolean; hz: number; variable: boolean; automatic: boolean }
export const defaultSimulation: SimulationConfig = { x: .8, y: 2.4, presence: true, loss: false, duplicate: false, hz: 10, variable: false, automatic: true };
export class Simulator {
  private seq = 0;
  packet(time: number, config: SimulationConfig): Telemetry {
    // The particle view supplies its calibrated zone. Phase 1 and manual input retain their paths.
    const zone=config.zone;
    const x = config.automatic ? (zone?zone.centerX+Math.sin(time/2100)*zone.halfRange:Math.sin(time / 2100) * 1.7) : config.x;
    const y = config.automatic ? (zone?(zone.near+zone.far)/2+Math.cos(time/2800)*(zone.far-zone.near)/2:2.8 + Math.cos(time / 2800) * .8) : config.y;
    const lost = config.loss && Math.floor(time / 1000) % 5 < 2;
    const targets = !config.presence || lost ? [] : [{ x, y, doppler: Math.round(Math.cos(time / 2100) * 4), cluster: 1 }];
    if (config.duplicate && targets.length) targets.push({ ...targets[0], x: x + .02, cluster: 2 });
    return { type: 'telemetry', v: 1, seq: this.seq++, ts: Math.round(time) >>> 0, units: 'm', radar: 'responsive', presence: config.presence, presence_at: Math.round(time) >>> 0,
      report: lost ? 'unavailable' : 'valid', target_at: lost ? null : Math.round(time) >>> 0, targets,
      distance: null, sensor_frames: this.seq, target_frames: this.seq, errors: 0 };
  }
  interval(c: SimulationConfig) { return 1000 / c.hz * (c.variable ? .5 + Math.random() * 1.5 : 1); }
}
