export interface Point { x: number; y: number }
export const MAX_RANGE_METRES = 3;
export interface View { range: number; invertX: boolean; invertY: boolean }
export function displayPoint(p: Point, view: View): Point { return { x: p.x * (view.invertX ? -1 : 1), y: p.y * (view.invertY ? -1 : 1) }; }
export function normalized(p: Point, view: View): Point {
  const d = displayPoint(p, view), clamp = (n: number) => Math.max(0, Math.min(1, n));
  return { x: clamp(.5 + d.x / (2 * view.range)), y: clamp(.5 - d.y / (2 * view.range)) };
}
export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const uptimeAge = (now: number, then: number) => (now - then) >>> 0;
