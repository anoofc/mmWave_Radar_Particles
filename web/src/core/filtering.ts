import { distance, MAX_RANGE_METRES, type Point } from './coordinates';
export interface FilterConfig { alpha: number; deadZone: number; holdMs: number; staleMs: number; primary: 'sticky' | 'nearest'; range: number; invertX: boolean; invertY: boolean }
export const defaultFilters: FilterConfig = { alpha: .3, deadZone: .025, holdMs: 700, staleMs: 2200, primary: 'sticky', range: MAX_RANGE_METRES, invertX: true, invertY: false };
export function smooth(previous: Point, raw: Point, config: FilterConfig): Point {
  if (distance(previous, raw) < config.deadZone) return previous;
  return { x: previous.x + config.alpha * (raw.x - previous.x), y: previous.y + config.alpha * (raw.y - previous.y) };
}
