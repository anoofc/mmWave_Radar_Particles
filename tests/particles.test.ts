import {describe,it,expect} from 'vitest';
import {defaultConfig,validateConfig,importConfig,exportConfig,presets,applyPreset,formations} from '../web/src/particles/config';
import {InteractionAdapter,mapInteraction,sceneInput} from '../web/src/particles/adapter';
import {formationTargets} from '../web/src/particles/formations';
import {FixedStepClock,AdaptiveResolution} from '../web/src/particles/performance';
import type {InteractionState} from '../web/src/core/tracking';
import {Simulator,defaultSimulation} from '../web/src/core/simulation';
import {Tracker} from '../web/src/core/tracking';
import {defaultFilters} from '../web/src/core/filtering';
import {Replay,importSession} from '../web/src/core/recording';
import {readFileSync} from 'node:fs';
const state=(patch:Partial<InteractionState>={}):InteractionState=>({presence:true,primary:{x:1.5,y:1.65},screen:{x:.25,y:.25},velocity:{x:1,y:-.2},movementIntensity:.6,freshness:1,tracking:'tracking',timestamp:1000,...patch});
const calibration={invertX:true,invertY:false,range:3};
describe('particle configuration and stable targets',()=>{
  it('validates all six presets through one shared configuration',()=>{expect(presets).toHaveLength(6);for(const preset of presets)expect(validateConfig(applyPreset(defaultConfig,preset.id))).toHaveProperty('preset',preset.id);});
  it('round trips portable settings and custom colors',()=>{const c={...defaultConfig,palette:'custom' as const,colors:['#ff0000','#00ff00','#0000ff'] as [string,string,string]};expect(importConfig(exportConfig(c))).toEqual(c);});
  it.each([{count:100001},{magnetic:100},{flow:NaN},{damping:-1},{palette:'unknown'},{formation:'cube'},{colors:['red']},{mapping:{...defaultConfig.mapping,depthMin:3,depthMax:2}},{mapping:{...defaultConfig.mapping,smoothing:Infinity}}])('rejects unstable or unsupported imports %j',patch=>expect(()=>validateConfig({...defaultConfig,...patch})).toThrow());
  it('rejects invalid envelopes and import sizes',()=>{expect(()=>importConfig('{}')).toThrow();expect(()=>importConfig('x'.repeat(32769))).toThrow();});
  it('does not retain arbitrary configuration keys',()=>expect(validateConfig({...defaultConfig,unexpected:true})).not.toHaveProperty('unexpected'));
  it.each(formations)('generates stable, finite %s targets with bounded memory',formation=>{const a=formationTargets(100,formation);expect(a).toEqual(formationTargets(100,formation));expect(a).toHaveLength(400);expect([...a].every(Number.isFinite)).toBe(true);expect(Math.max(...a.map(Math.abs))).toBeLessThan(8);});
});
describe('radar to particle adapter',()=>{
  it('keeps the physical attractor in world space during scene rotation',()=>{const input={position:[2,0,1] as [number,number,number],direction:[1,0,0] as [number,number,number],activity:1,motion:1,proximity:.5,pulse:0,radius:2};const local=sceneInput(input,Math.PI/2);expect(local.position[0]).toBeCloseTo(-1);expect(local.position[2]).toBeCloseTo(2);expect(local.direction[2]).toBeCloseTo(1);expect(input.position).toEqual([2,0,1]);});
  it('maps native metres to normalized and world coordinates with Phase 1 inversion',()=>{const mapped=mapInteraction(state(),defaultConfig.mapping,calibration);expect(mapped.normalized.x).toBe(.25);expect(mapped.normalized.depth).toBeCloseTo(.5);expect(mapped.world[0]).toBe(-2);expect(mapped.world[1]).toBe(0);expect(mapped.world[2]).toBeCloseTo(0);expect(mapped.radar).toEqual({x:1.5,y:1.65});expect(mapped.direction[0]).toBe(-1);});
  it('supports independent inversion and calibrated range overrides',()=>{const mapping={...defaultConfig.mapping,phase1Calibration:false,invertX:false,invertY:true,horizontalRange:1.5};const m=mapInteraction(state(),mapping,calibration);expect(m.normalized.x).toBe(1);expect(m.world[0]).toBe(4);});
  it('interpolates entry and fades stale or missing data without moving the attractor abruptly',()=>{const a=new InteractionAdapter();a.accept(state(),0);const first=a.step(1/60,0,defaultConfig.mapping,calibration);expect(first.activity).toBeGreaterThan(0);expect(first.activity).toBeLessThan(1);for(let i=1;i<180;i++){a.accept(state({timestamp:1000+i*16}),i*16);a.step(1/60,i*16,defaultConfig.mapping,calibration);}const before=[...a.output.position];a.accept(state({tracking:'stale',primary:null}),3000);for(let i=0;i<300;i++)a.step(1/60,3000+i*16,defaultConfig.mapping,calibration);expect(a.output.activity).toBeLessThan(.01);expect(a.output.position).toEqual(before);});
  it.each(['stale','disconnected','unavailable','empty'] as const)('does not activate forces for %s tracking',tracking=>{const a=new InteractionAdapter();a.accept(state({tracking}),0);expect(a.step(.1,0,defaultConfig.mapping,calibration).activity).toBe(0);});
  it('handles absent, nonfinite and expired sensor snapshots',()=>{for(const s of [state({presence:false}),state({timestamp:NaN}),state({primary:{x:Infinity,y:1}}),state({freshness:0})]){const a=new InteractionAdapter();a.accept(s,0);expect(a.step(.1,0,defaultConfig.mapping,calibration).activity).toBe(0);}const a=new InteractionAdapter();a.accept(state(),0);expect(a.step(.1,2000,defaultConfig.mapping,calibration).activity).toBe(0);});
  it('decays stationary movement and generates a bounded temporary pulse',()=>{const a=new InteractionAdapter();a.accept(state({movementIntensity:1}),0);a.step(.1,0,defaultConfig.mapping,calibration);a.accept(state({timestamp:1100,primary:{x:1.6,y:1.65},velocity:{x:2,y:0}}),100);a.step(.1,100,defaultConfig.mapping,calibration);expect(a.output.pulse).toBeGreaterThan(0);for(let i=0;i<100;i++)a.step(.1,1000+i*100,defaultConfig.mapping,calibration);expect(a.output.pulse).toBeLessThan(.001);expect(a.output.motion).toBeLessThan(.01);});
  it('consumes simulated movement and recording replay through the Phase 1 tracker',()=>{
    const simulator=new Simulator(),tracker=new Tracker(),adapter=new InteractionAdapter();
    for(let i=0;i<20;i++){tracker.ingest(simulator.packet(i*100,defaultSimulation),i*100,defaultFilters);adapter.accept(tracker.state(i*100,true,defaultFilters),i*100);adapter.step(.1,i*100,defaultConfig.mapping,calibration);}expect(adapter.output.activity).toBeGreaterThan(.5);
    const session=importSession(readFileSync('web/public/sample-session.json','utf8')),replay=new Replay(session);tracker.reset();
    replay.advance(1000,1,e=>{if(e.packet.type==='telemetry')tracker.ingest(e.packet,e.at,defaultFilters);});adapter.accept(tracker.state(1000,true,defaultFilters),2000);expect(adapter.step(.1,2000,defaultConfig.mapping,calibration).position.every(Number.isFinite)).toBe(true);
  });
});
describe('simulation budgets and performance hysteresis',()=>{
  it('bounds catch-up work and resumes without a time jump',()=>{const clock=new FixedStepClock();let steps=0;clock.advance(20,dt=>{expect(dt).toBe(1/60);steps++;});expect(steps).toBeLessThanOrEqual(4);clock.reset();expect(clock.advance(0,()=>{})).toBe(0);});
  it('requires sustained slow frames and a cooldown before reducing resolution',()=>{const adaptive=new AdaptiveResolution();for(let i=0;i<4;i++)adaptive.update(20,1,i*1000,1.25,true);expect(adaptive.ratio).toBe(1);adaptive.update(20,1,5000,1.25,true);expect(adaptive.ratio).toBe(.85);adaptive.update(20,5,6000,1.25,true);expect(adaptive.ratio).toBe(.85);});
});
