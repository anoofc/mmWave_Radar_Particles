import {test,expect} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {defaultConfig,exportConfig} from '../../web/src/particles/config';
import type {EngineMetrics} from '../../web/src/particles/performance';
test('measure 10k, 30k, 60k and 100k at 1920×1080',async({page,browser})=>{
  await page.addInitScript(text=>localStorage.setItem('mr60-particles-config',text),exportConfig({...defaultConfig,count:10000,quality:'high',adaptive:false}));
  await page.goto('/#particles');const canvas=page.locator('canvas[data-particle-canvas]');await expect(canvas).toBeVisible();
  await page.getByRole('button',{name:'Run simulation',exact:true}).click();
  const results:unknown[]=[];
  for(const count of [10000,30000,60000,100000]){
    await page.getByLabel('Particle count',{exact:true}).selectOption(String(count));
    await page.getByRole('button',{name:'Enter exhibition',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await expect.poll(async()=>Number(await canvas.getAttribute('data-frames')),{timeout:30000}).toBeGreaterThan(0);
    await page.waitForTimeout(3000);
    const sample=await canvas.evaluate(async node=>{
      const el=node as HTMLCanvasElement,start=performance.now(),first=Number(el.dataset.frames??0),samples:EngineMetrics[]=[];
      while(performance.now()-start<5000){if(el.dataset.metrics)samples.push(JSON.parse(el.dataset.metrics));await new Promise(resolve=>setTimeout(resolve,500));}
      const elapsed=performance.now()-start,last=Number(el.dataset.frames??0);
      return {measurementSeconds:elapsed/1000,averageFps:(last-first)/(elapsed/1000),last:samples.at(-1),samples};
    });
    const result={requestedCount:count,...sample};results.push(result);console.log(JSON.stringify({requested:count,actual:sample.last?.count,backend:sample.last?.backend,averageFps:sample.averageFps,renderer:sample.last?.renderer}));
    if(count===60000)await page.screenshot({path:'test-results/particles-60000-exhibition.png'});
    await page.evaluate(()=>document.exitFullscreen());
  }
  mkdirSync('docs/benchmarks',{recursive:true});writeFileSync('docs/benchmarks/results.json',JSON.stringify({recordedAt:new Date().toISOString(),browser:browser.version(),viewport:{width:1920,height:1080},configuration:{quality:'high',adaptive:false,bloom:defaultConfig.bloom,trails:defaultConfig.trails},results},null,2));
  expect(results).toHaveLength(4);
});
