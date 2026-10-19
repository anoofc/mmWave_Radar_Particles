import { test,expect } from '@playwright/test';
import { packet } from '../fixtures';
import {readFileSync} from 'node:fs';
test('range rings show metres and targets can move beyond the first circle',async({page})=>{
  await page.goto('/');
  await expect(page.locator('svg .range-label')).toHaveText(['0.75 m','1.5 m','2.25 m','3 m']);
  await expect(page.getByLabel('Visible range',{exact:true}).locator('option')).toHaveText(['1 m','2 m','3 m']);
  await page.getByRole('button',{name:'Run simulation'}).click();
  await page.getByLabel('Automatic movement',{exact:true}).uncheck();
  // Manual default Y=2.4m must render above the top of the first 0.75m ring.
  await expect.poll(async()=>Number(await page.locator('svg .filtered-target').getAttribute('cy'))).toBeLessThan(310-265/4);
  await expect(page.locator('svg .position-label').last()).toHaveText(/r \d+\.\d{2} m/);
  await page.getByLabel('Visible range',{exact:true}).selectOption('2');
  await expect(page.locator('svg .range-label')).toHaveText(['0.5 m','1 m','1.5 m','2 m']);
});
test('USB boot output is counted separately and live telemetry still displays',async({page})=>{
  await page.addInitScript(({telemetry})=>{
    let input:ReadableStreamDefaultController<Uint8Array>;
    const encoder=new TextEncoder();
    const port={
      open:async()=>{}, close:async()=>{},
      readable:new ReadableStream<Uint8Array>({start(controller){input=controller;}}),
      writable:new WritableStream<Uint8Array>({write(bytes){
        const command=JSON.parse(new TextDecoder().decode(bytes));
        input.enqueue(encoder.encode('ESP-ROM:esp32c6-20220919\nBuild:Sep 19 2022\n'+JSON.stringify({type:'ack',v:1,seq:0,ts:100,id:command.id,ok:true,message:'ready'})+'\n'+JSON.stringify(telemetry)+'\n'));
      }})
    };
    Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>port}});
    Object.defineProperty(window,'emitMalformed',{value:()=>input.enqueue(encoder.encode('{"padding":"'+'x'.repeat(507)+'" true}\n'))});
  },{telemetry:packet()});
  await page.goto('/');await page.getByRole('button',{name:/Connect USB/}).click();
  await expect(page.getByText('USB connected',{exact:true})).toBeVisible();
  await expect(page.getByText('Present',{exact:true})).toBeVisible();
  const bootRow=page.getByText('ESP startup lines',{exact:true}).locator('..');
  await expect(bootRow).toHaveText('ESP startup lines2');
  await expect(page.getByText('Host / protocol errors',{exact:true}).locator('..')).toHaveText('Host / protocol errors0');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.evaluate(()=>(window as unknown as {emitMalformed:()=>void}).emitMalformed());
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByText('Last rejected serial packet',{exact:true}).click();
  const diagnosticDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download rejected packet',exact:true}).click();
  const diagnostic=JSON.parse(readFileSync((await (await diagnosticDownload).path())!,'utf8'));
  expect(diagnostic.format).toBe('mr60-serial-diagnostic');
  expect(diagnostic.line).toBe('{"padding":"'+'x'.repeat(507)+'" true}');
  await page.getByRole('button',{name:/^Disconnect/}).click();
  await expect(page.getByText('Awaiting connection',{exact:true})).toBeVisible();
});
test('simulation, controls, recorder and replay work without hardware',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/Radar Console/})).toBeVisible();
  await page.getByRole('button',{name:'Run simulation'}).click();
  await expect(page.getByText('Simulation running')).toBeVisible();await expect(page.getByText('Present',{exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
  await page.getByLabel('Duplicate target',{exact:true}).check();await expect(page.getByText('C02',{exact:true})).toBeVisible();
  await page.getByLabel('Human presence',{exact:true}).uncheck();await expect(page.getByText('Absent',{exact:true})).toBeVisible();
  await page.getByLabel('Human presence',{exact:true}).check();
  await page.getByRole('button',{name:'Start recording'}).click();await page.waitForTimeout(550);await page.getByRole('button',{name:'Stop recording'}).click();
  const exported=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON'}).click();expect((await exported).suggestedFilename()).toMatch(/mr60-.*\.json/);
  await page.getByRole('button',{name:/▶ Replay/}).click();await expect(page.getByText('Session replay')).toBeVisible();
  await page.getByRole('button',{name:'Load sample'}).click();await page.getByRole('button',{name:/▶ Replay/}).click();
  await page.getByLabel('Replay speed').selectOption('0.5');await page.getByRole('button',{name:/Ⅱ Pause/}).click();
  await expect(page.getByLabel('Replay position')).toBeEnabled();await page.getByLabel('Restart replay').click();
  expect(errors).toEqual([]);
});
test('responsive dashboard has no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Run simulation'}).click();
  await expect(page.getByRole('heading',{name:'Simulation lab'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});
});
