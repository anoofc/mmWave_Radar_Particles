import {describe,it,expect} from 'vitest';
import {defaultConfig,defaultCoverage,formations,validateConfig} from '../web/src/particles/config';
import {formationTargets,targetBounds,rotatedBounds} from '../web/src/particles/formations';
import {mapInteraction,InteractionAdapter,type ParticleInput} from '../web/src/particles/adapter';
import {falloffPower,spatialInfluence,globalEnvelope} from '../web/src/particles/coverage';
import {CPUSimulation} from '../web/src/particles/gpu';
import type {InteractionState} from '../web/src/core/tracking';
const calibration={invertX:false,invertY:false,range:2};
const state=(x:number,y:number):InteractionState=>({presence:true,primary:{x,y},screen:null,velocity:{x:0,y:0},movementIntensity:0,freshness:1,tracking:'tracking',timestamp:0});
describe('sculpture interaction coverage',()=>{
 it.each(formations)('maps calibrated endpoints across the actual %s formation',formation=>{
  const bounds=targetBounds(formationTargets(1024,formation));
  const r={...defaultConfig.response,radarCenterX:.7};
  const left=mapInteraction(state(-1.3,.3),defaultConfig.mapping,calibration,r,bounds);
  const right=mapInteraction(state(2.7,3),defaultConfig.mapping,calibration,r,bounds);
  expect(left.world[0]).toBeCloseTo(bounds.min[0]);expect(right.world[0]).toBeCloseTo(bounds.max[0]);
  expect(left.world[2]).toBeCloseTo(bounds.max[2]);expect(right.world[2]).toBeCloseTo(bounds.min[2]);
  const data=formationTargets(1024,formation);for(let i=0;i<data.length;i+=4)expect(Math.hypot(data[i],data[i+1],data[i+2])).toBeLessThanOrEqual(bounds.radius+1e-6);
 });
 it('orders falloff modes with a continuous boundary and broad nonzero support',()=>{
  const strengths=['Local','Wide','Full Field'].map(mode=>spatialInfluence(2,3,falloffPower({...defaultCoverage,mode:mode as typeof defaultCoverage.mode})));
  expect(strengths[0]).toBeLessThan(strengths[1]);expect(strengths[1]).toBeLessThan(strengths[2]);
  for(const mode of ['Local','Wide','Full Field'] as const)for(const softness of [.25,1,3]){
   const power=falloffPower({...defaultCoverage,mode,softness});
   expect(spatialInfluence(3,3,power)).toBe(0);expect(spatialInfluence(3-1e-5,3,power)/1e-5).toBeLessThan(.01);
  }
  expect(globalEnvelope(3,3*1.75)).toBeGreaterThan(.8);
 });
 it('smoothly expands on movement, contracts at rest and decouples radius from sensor mapping scale',()=>{
  const a=new InteractionAdapter(),b=new InteractionAdapter(),bounds=targetBounds(formationTargets(1024,'cloud'));a.test(0);b.test(0);
  let idle=0,active=0,previous=2;
  for(let i=0;i<960;i++){
   const out=a.step(1/60,i*1000/60,defaultConfig.mapping,calibration,defaultConfig.response,bounds.radius,bounds);
   const fixed=b.step(1/60,i*1000/60,{...defaultConfig.mapping,worldScale:2,radius:5},calibration,defaultConfig.response,bounds.radius,bounds,{...defaultCoverage,dynamic:false});
   expect(Math.abs(out.radius-previous)).toBeLessThan(.15);previous=out.radius;
   if(i===110)idle=out.radius;if(i===350)active=out.radius;
   if(i>900)expect(fixed.radius).toBeCloseTo(bounds.radius*.9,5);
  }
  expect(active).toBeGreaterThan(idle*1.4);expect(a.output.radius).toBeCloseTo(idle,1);
 });
 it('moves a substantial region beyond the local field, varies spatially and settles',()=>{
  const c=structuredClone(defaultConfig);Object.assign(c,{flow:0,turbulence:0,vortex:0,magnetic:0,repulsion:0});
  const a=new CPUSimulation(1024,'cloud'),b=new CPUSimulation(1024,'cloud'),original=a.cpuPositions.slice();
  const input:ParticleInput={position:[-3,0,0],direction:[2,0,0],activity:1,motion:1,proximity:0,pulse:0,radius:.2,globalRadius:a.bounds(0).radius*1.75};
  for(let i=0;i<90;i++){a.step(1/60,i/60,c,input);b.step(1/60,i/60,{...c,coverage:{...c.coverage,global:0}},input);}
  const differences=Array.from({length:1024},(_,i)=>Math.hypot(...[0,1,2].map(j=>a.cpuPositions[i*3+j]-b.cpuPositions[i*3+j])));
  expect(differences.filter(d=>d>.1).length).toBeGreaterThan(800);
  expect(Math.max(...differences)-Math.min(...differences)).toBeGreaterThan(.1);
  const activeError=Math.hypot(...a.cpuPositions.map((v,i)=>v-original[i]));
  for(let i=0;i<1200;i++)a.step(1/60,1.5+i/60,c,{...input,direction:[0,0,0],activity:0,motion:0});
  expect([...a.cpuPositions].every(Number.isFinite)).toBe(true);
  expect(Math.hypot(...a.cpuPositions.map((v,i)=>v-original[i]))).toBeLessThan(activeError*.01);
  a.dispose();b.dispose();
 });
 it('maps the visual bounds when the sculpture rotates',()=>{
  const bounds=targetBounds(formationTargets(1024,'wave')),rotated=rotatedBounds(bounds,Math.PI/2);
  expect(rotated.min[0]).toBeCloseTo(bounds.min[2]);expect(rotated.max[0]).toBeCloseTo(bounds.max[2]);
  expect(rotated.min[2]).toBeCloseTo(-bounds.max[0]);expect(rotated.radius).toBe(bounds.radius);
 });
 it('keeps morph bounds continuous and covers both endpoints',()=>{
  const sim=new CPUSimulation(1024,'wave'),start=sim.bounds(0);sim.formation('sphere',0,4);
  expect(sim.bounds(0)).toEqual(start);expect(sim.bounds(4).radius).toBeCloseTo(2.6);
  expect(sim.bounds(2).radius).toBeCloseTo((start.radius+2.6)/2);sim.dispose();
 });
 it('migrates old configurations and rejects invalid coverage values',()=>{
  const {coverage:_,...legacy}=defaultConfig;expect(validateConfig(legacy).coverage).toEqual(defaultCoverage);
  for(const bad of [{global:NaN},{balance:2},{mode:'unknown'},{softness:0},{dynamic:1},{movementRange:Infinity}])expect(()=>validateConfig({...defaultConfig,coverage:{...defaultCoverage,...bad}})).toThrow();
 });
});
