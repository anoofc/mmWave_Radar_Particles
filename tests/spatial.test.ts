import {it,expect} from 'vitest';
import {summarizeSpatial} from '../web/src/particles/spatial';
import {Simulator,defaultSimulation} from '../web/src/core/simulation';
it('reports measured sample counts separately from population estimates and excludes padding',()=>{
 const p=new Float32Array([-2,0,0,0,2,0,0,0,99,99,99,0]),f=new Float32Array([.05,1,.5,.2,2,2,4,.8,-1,-1,-1,-1]);
 const m=summarizeSpatial(p,f,60000,3,1000);
 expect(m.sampleCount).toBe(2);expect(m.inside).toBe(1);expect(m.insidePercent).toBe(50);expect(m.meaningfulPercent).toBe(50);expect(m.estimatedInsideCount).toBe(30000);
 expect(m.center).toEqual([0,0,0]);expect(m.dimensions).toEqual([4,0,0]);expect(m.sphereRadius).toBe(2);expect(m.interactionAverage).toBeCloseTo(1.025);expect(m.restorationAverage).toBe(1.5);expect(m.ratio).toBeCloseTo(1.025/1.5);
 expect(()=>summarizeSpatial(new Float32Array(4).fill(NaN),new Float32Array(4).fill(NaN),60000,3,1000)).toThrow();
});
it('covers arbitrary calibrated simulation zones while preserving manual and legacy Phase 1 paths',()=>{
 const visitor=new Simulator(),zone={centerX:.7,halfRange:1.8,near:.6,far:4.2};
 const config={...defaultSimulation,zone};let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let t=0;t<20000;t+=10){const p=visitor.packet(t,config).targets[0];minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
 expect(minX).toBeCloseTo(zone.centerX-zone.halfRange,3);expect(maxX).toBeCloseTo(zone.centerX+zone.halfRange,3);expect(minY).toBeCloseTo(zone.near,3);expect(maxY).toBeCloseTo(zone.far,3);
 expect(visitor.packet(0,defaultSimulation).targets[0]).toMatchObject({x:0,y:3.5999999999999996});
 expect(visitor.packet(0,{...config,automatic:false,x:-1,y:2}).targets[0]).toMatchObject({x:-1,y:2});
});
