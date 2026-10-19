import {describe,it,expect} from 'vitest';
import {InteractionAdapter} from '../web/src/particles/adapter';
import {CPUSimulation} from '../web/src/particles/gpu';
import {defaultConfig,validateConfig} from '../web/src/particles/config';
import {defaultResponse,responsePresets} from '../web/src/particles/response';
import {Tracker} from '../web/src/core/tracking';
import {defaultFilters} from '../web/src/core/filtering';
import {packet} from './fixtures';
const calibration={invertX:false,invertY:false,range:3};
const config=structuredClone(defaultConfig);
function stats(p:Float32Array){let x=0,r=0;for(let i=0;i<p.length;i+=3){x+=p[i];r+=Math.hypot(p[i],p[i+1],p[i+2]);}return {x:x/(p.length/3),radius:r/(p.length/3)};}
describe('Phase 3 movement response',()=>{
 it('uses sensor cadence for velocity despite USB arrival jitter',()=>{
  const t=new Tracker();t.ingest(packet(),100,defaultFilters);
  t.ingest(packet({ts:200,target_at:200,targets:[{x:1.1,y:2,doppler:0,cluster:1}]}),450,defaultFilters);
  expect(t.state(450,true,defaultFilters).velocity.x).toBeCloseTo(.3);
  expect(t.state(450,true,defaultFilters).rawVelocity?.x).toBeCloseTo(1);
 });
 it('expires held velocity even when dashboard timestamps advance',()=>{
  const a=new InteractionAdapter();a.test(0);for(let i=0;i<180;i++)a.step(1/60,i*1000/60,config.mapping,calibration);
  a.stopTest();const t=new Tracker();t.ingest(packet(),3000,defaultFilters);a.accept(t.state(3000,true,defaultFilters),3000);
  for(let i=0;i<240;i++){const now=3000+i*1000/60;a.accept(t.state(now,true,defaultFilters),now);a.step(1/60,now,config.mapping,calibration);}
  expect(a.output.motion).toBeLessThan(.01);expect(a.output.activity).toBeLessThan(.01);expect(a.output.direction.every(v=>Math.abs(v)<.01)).toBe(true);
 });
 it('runs bounded, directional, compressive and expansive motion then recovers',()=>{
  const a=new InteractionAdapter(),sim=new CPUSimulation(512,'cloud');a.test(0);
  const checkpoints:Record<number,ReturnType<typeof stats>>={};let pulses=0,minX=Infinity,maxX=-Infinity;
  for(let i=0;i<1440;i++){
   const input=a.step(1/60,i*1000/60,config.mapping,calibration,config.response);sim.step(1/60,i/60,config,input);
   minX=Math.min(minX,input.position[0]);maxX=Math.max(maxX,input.position[0]);if(input.pulse>.8)pulses++;
   if([119,239,359,479,599,719,1439].includes(i))checkpoints[i]=stats(sim.cpuPositions);
   expect([...sim.cpuPositions].every(Number.isFinite)).toBe(true);
  }
  expect(minX).toBeLessThan(-2);expect(maxX).toBeGreaterThan(2);expect(pulses).toBeGreaterThan(0);
  expect(checkpoints[359].x-checkpoints[239].x).toBeGreaterThan(.4);
  expect(checkpoints[479].radius).toBeLessThan(checkpoints[359].radius*.85);
  expect(checkpoints[599].radius).toBeGreaterThan(checkpoints[479].radius*1.15);
  expect(checkpoints[1439].radius).toBeLessThan(4);expect(a.output.motion).toBeLessThan(.01);
  sim.dispose();
 });
 it('makes amplification measurable without changing the calibrated target path',()=>{
  const a=new InteractionAdapter(),b=new InteractionAdapter();a.test(0);b.test(0,true);
  let strong=0,baseline=0;
  for(let i=0;i<360;i++){const x=a.step(1/60,i*1000/60,config.mapping,calibration),y=b.step(1/60,i*1000/60,config.mapping,calibration);strong+=Math.abs(x.direction[0]);baseline+=Math.abs(y.direction[0]);expect(x.position).toEqual(y.position);}
  expect(strong).toBeGreaterThan(baseline*3);
 });
 it('preserves old configuration imports and validates every response control',()=>{
  const {response:_,...legacy}=config;expect(validateConfig(legacy).response).toEqual(defaultResponse);
  for(const [preset,values] of Object.entries(responsePresets))expect(validateConfig({...config,response:{...defaultResponse,...values,preset}}).response.preset).toBe(preset);
  for(const bad of [{amplification:Infinity},{radius:0},{speedMin:1,speedMax:.5},{attack:0}])expect(()=>validateConfig({...config,response:{...defaultResponse,...bad}})).toThrow();
 });
});
