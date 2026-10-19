import type {CoverageConfig} from './config';
export function falloffPower(c:CoverageConfig):number {return ({Local:2,Wide:1,'Full Field':.5}[c.mode])/c.softness;}
/** Matches the GPU's C1 continuous compact support. */
export function spatialInfluence(distance:number,radius:number,power:number):number {
  const u=Math.max(0,Math.min(1,distance/Math.max(.1,radius)));
  return Math.pow(Math.max(0,1-u*u*(3-2*u)),Math.max(.75,.5+power));
}
export function globalEnvelope(distance:number,radius:number):number {return Math.exp(-.5*Math.pow(distance/Math.max(.1,radius),2));}
