import {test,expect} from '@playwright/test';
import {defaultConfig,exportConfig} from '../../web/src/particles/config';
import {writeFileSync,mkdirSync} from 'node:fs';

test('measure actual GPU coverage at five positions and verify full-field diagnostic',async({page},testInfo)=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/?particleSpatial=1#particles');
 const results=await page.evaluate(async()=>{
  const gpuPath='/src/particles/gpu.ts',configPath='/src/particles/config.ts';
  const source=await(await fetch(gpuPath)).text(),threePath=source.match(/import \* as THREE from [\"']([^\"']+)/)![1];
  const {GPUSimulation,detectCapabilities}=await import(gpuPath),{defaultConfig}=await import(configPath),THREE=await import(threePath);
  const renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(64,64);const capabilities=detectCapabilities(renderer);
  const c=structuredClone(defaultConfig);c.rotation=0;const count=60000;
  const result:any={renderer:capabilities.renderer,count,points:[],uniformField:null};
  if(!capabilities.float)throw new Error('Float32 GPU required for measurement test');
  for(const name of ['left','center','right','near','far','uniform']){
   const sim=new GPUSimulation(renderer,count,'cloud',THREE.FloatType),b=sim.bounds(0);
   const position=name==='left'?[b.min[0],0,0]:name==='right'?[b.max[0],0,0]:name==='near'?[0,0,b.max[2]]:name==='far'?[0,0,b.min[2]]:[0,0,0];
   const input={position,direction:[1.5,0,0],activity:1,motion:1,proximity:.5,pulse:0,radius:b.radius*.9,globalRadius:b.radius*1.75,approach:0,pulseAge:10,uniformField:name==='uniform'};
   const config=name==='uniform'?{...c,flow:0,turbulence:0,vortex:0,magnetic:0,repulsion:0,response:{...c.response,drag:0,vortex:0,turbulence:0},coverage:{...c.coverage,global:0}}:c;
   sim.step(1/60,1/60,config,input);const before=sim.measure(0);
   for(let i=1;i<90;i++)sim.step(1/60,(i+1)/60,config,input);
   const after=sim.measure(1500),entry={name,position,bounds:b,radius:input.radius,before,after,uniforms:sim.forceUniforms};
   if(name==='uniform')result.uniformField=entry;else result.points.push(entry);sim.dispose();
  }
  const simulationPath='/src/core/simulation.ts',trackingPath='/src/core/tracking.ts',filterPath='/src/core/filtering.ts',adapterPath='/src/particles/adapter.ts';
  const {Simulator,defaultSimulation}=await import(simulationPath),{Tracker}=await import(trackingPath),{defaultFilters}=await import(filterPath),{InteractionAdapter}=await import(adapterPath);
  result.automatic=[];
  for(const variant of ['legacy','calibrated']){
   const sim=new GPUSimulation(renderer,count,'cloud',THREE.FloatType),visitor=new Simulator(),tracker=new Tracker(),adapter=new InteractionAdapter(),bounds=sim.bounds(0);
   const simulation=variant==='legacy'?defaultSimulation:{...defaultSimulation,zone:{centerX:0,halfRange:defaultFilters.range,near:c.mapping.depthMin,far:c.mapping.depthMax}};
   const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],normalizedMin=[Infinity,Infinity],normalizedMax=[-Infinity,-Infinity],samples:any[]=[];
   for(let i=0;i<1200;i++){
    const now=i*1000/60;if(i%6===0)tracker.ingest(visitor.packet(now,simulation),now,defaultFilters);
    adapter.accept(tracker.state(now,true,defaultFilters),now);const input=adapter.step(1/60,now,c.mapping,defaultFilters,c.response,bounds.radius,bounds,c.coverage);
    sim.step(1/60,i/60,c,input);
    for(let j=0;j<3;j++){min[j]=Math.min(min[j],input.position[j]);max[j]=Math.max(max[j],input.position[j]);}
    const n=adapter.diagnostics.normalized as {x:number;depth:number}|undefined;if(n){for(const [j,v] of [n.x,n.depth].entries()){normalizedMin[j]=Math.min(normalizedMin[j],v);normalizedMax[j]=Math.max(normalizedMax[j],v);}}
    if(i%120===119)samples.push({time:now,position:[...input.position],radius:input.radius,measurement:sim.measure(now)});
   }
   result.automatic.push({variant,min,max,normalizedMin,normalizedMax,lateralCoverage:(max[0]-min[0])/(bounds.max[0]-bounds.min[0]),samples});sim.dispose();
  }
  renderer.dispose();renderer.forceContextLoss();return result;
 });
 mkdirSync('docs/diagnostics',{recursive:true});writeFileSync('docs/diagnostics/phase31-gpu.json',JSON.stringify(results,null,2));
 await testInfo.attach('measured-gpu-coverage',{body:JSON.stringify(results,null,2),contentType:'application/json'});
 for(const point of results.points){expect(point.before.finite).toBe(true);expect(point.after.finite).toBe(true);expect(point.before.meaningfulPercent).toBeGreaterThan(95);}
 expect(results.uniformField.before.meaningfulPercent).toBe(100);expect(results.uniformField.before.interactionAverage).toBeCloseTo(.6,4);expect(results.uniformField.after.deformationAverage).toBeGreaterThan(.1);
 expect(results.automatic.find((r:any)=>r.variant==='legacy').lateralCoverage).toBeLessThan(.6);
 expect(results.automatic.find((r:any)=>r.variant==='calibrated').lateralCoverage).toBeGreaterThan(.95);
 expect(errors).toEqual([]);
});

test('spatial controls use the shared shader, cover the sweep, disable in exhibition and release resources',async({page})=>{
 test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(text=>localStorage.setItem('mr60-particles-config',text),exportConfig({...defaultConfig,count:10000,quality:'low',adaptive:false,rotation:0}));
 await page.goto('/?particleSpatial=1#particles');const canvas=page.locator('canvas[data-particle-canvas]');await expect(canvas).toBeVisible();
 await expect.poll(async()=>Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(0);
 const baselineTextures=await canvas.evaluate(node=>JSON.parse((node as HTMLElement).dataset.metrics??'{}').textures);
 await page.getByLabel('Enable spatial diagnostics',{exact:true}).check();
 await expect.poll(async()=>JSON.parse(await canvas.getAttribute('data-spatial')??'{}').measurement?.sampleCount,{timeout:15000}).toBeGreaterThan(200);
 const measured=await canvas.evaluate(node=>JSON.parse((node as HTMLElement).dataset.spatial!));
 expect(measured.influenceRadius).toBe(measured.uniforms.radius);expect(measured.attractorSimulation).toEqual(measured.uniforms.attractor);
 await page.getByLabel('Diagnostic mode',{exact:true}).selectOption('Attractor Sweep');
 const sweep=await canvas.evaluate(async node=>{const samples:any[]=[];const start=performance.now();while(performance.now()-start<9000){samples.push(JSON.parse((node as HTMLElement).dataset.spatial??'{}'));await new Promise(r=>setTimeout(r,200));}return samples;});
 expect(sweep.some(s=>s.attractorWorld?.[0]<-2)).toBe(true);expect(sweep.some(s=>s.attractorWorld?.[0]>2)).toBe(true);
 await page.getByLabel('Diagnostic mode',{exact:true}).selectOption('Force Visualization');await expect(canvas).toHaveAttribute('data-spatial-mode','Force Visualization');await page.getByRole('button',{name:'Test interaction',exact:true}).click();await page.waitForTimeout(3300);
 await page.screenshot({path:'test-results/phase31-force.png',fullPage:true});
 await page.getByLabel('Diagnostic mode',{exact:true}).selectOption('Uniform Field');await expect(canvas).toHaveAttribute('data-spatial-mode','Uniform Field');
 await page.getByRole('button',{name:'Enter exhibition',exact:true}).click();await expect(canvas).toHaveAttribute('data-spatial-enabled','false');await expect(canvas).toHaveAttribute('data-spatial-mode','Off');
 await expect.poll(async()=>canvas.evaluate(node=>JSON.parse((node as HTMLElement).dataset.metrics??'{}').textures)).toBeLessThanOrEqual(baselineTextures);
 await page.evaluate(()=>document.exitFullscreen());await expect(page.getByLabel('Enable spatial diagnostics',{exact:true})).not.toBeChecked();
 await page.getByRole('link',{name:'Radar Diagnostics',exact:true}).click();
 const restoredZone=await page.evaluate(async()=>{const path='/src/state/store.ts';const {useRadar}=await import(path);return useRadar.getState().simulation.zone;});
 expect(restoredZone).toBeUndefined();
 expect(errors).toEqual([]);
});
