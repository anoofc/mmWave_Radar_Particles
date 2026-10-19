import {test,expect} from '@playwright/test';
import {defaultConfig,exportConfig} from '../../web/src/particles/config';
import {packet} from '../fixtures';
test.beforeEach(async({page})=>{await page.addInitScript(text=>localStorage.setItem('mr60-particles-config',text),exportConfig({...defaultConfig,count:10000,quality:'low',adaptive:false}));});

test('section navigation handles cancelled link clicks, pointer release and keyboard activation',async({page})=>{
  await page.goto('/');
  // Reproduce a host/browser script cancelling the native link action.
  await page.evaluate(()=>document.addEventListener('click',event=>event.preventDefault(),true));
  const particles=page.getByRole('link',{name:'Particle Experience',exact:true});
  const diagnostics=page.getByRole('link',{name:'Radar Diagnostics',exact:true});
  await particles.click();
  await expect(page).toHaveURL(/#particles$/);
  await expect(page.getByRole('heading',{name:'Particle Experience',exact:true})).toBeVisible();
  await diagnostics.focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#diagnostics$/);
  await expect(page.getByRole('heading',{name:'Spatial overview'})).toBeVisible();
  // A pointer release can navigate even if no subsequent click is delivered.
  await particles.dispatchEvent('pointerup',{button:0,pointerType:'touch',isPrimary:true});
  await expect(page).toHaveURL(/#particles$/);
  await expect(particles).toHaveAttribute('aria-current','page');
});

test('cold particle navigation works while USB packets continuously update state',async({page})=>{
  test.setTimeout(30000);
  await page.addInitScript(({telemetry})=>{
    let input:ReadableStreamDefaultController<Uint8Array>,timer:ReturnType<typeof setInterval>,seq=0;
    const encoder=new TextEncoder();
    const port={open:async()=>{timer=setInterval(()=>{const ts=seq*20;input.enqueue(encoder.encode(JSON.stringify({...telemetry,seq:seq++,ts,target_at:ts,presence_at:ts,sensor_frames:seq,target_frames:seq})+'\n'));},20);},close:async()=>clearInterval(timer),
      readable:new ReadableStream<Uint8Array>({start(controller){input=controller;},cancel(){clearInterval(timer);}}),
      writable:new WritableStream<Uint8Array>({write(bytes){const c=JSON.parse(new TextDecoder().decode(bytes));input.enqueue(encoder.encode(JSON.stringify({type:'ack',v:1,seq:seq++,ts:seq*20,id:c.id,ok:true,message:'ready'})+'\n'));}})};
    Object.defineProperty(navigator,'serial',{configurable:true,value:{requestPort:async()=>port}});
  },{telemetry:packet()});
  await page.route('**/src/particles/ParticleExperience.tsx*',async route=>{await new Promise(resolve=>setTimeout(resolve,1800));await route.continue();});
  await page.goto('/');await page.getByRole('button',{name:/Connect USB/}).click();
  await expect(page.getByText('USB connected',{exact:true})).toBeVisible();
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('href','#particles');
  await page.getByRole('link',{name:'Particle Experience',exact:true}).click();
  await expect(page).toHaveURL(/#particles$/);
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('status')).toContainText('Loading Particle Experience');
  await expect(page.getByRole('heading',{name:'Particle Experience',exact:true})).toBeVisible({timeout:12000});
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('aria-current','page');
  await expect(page.getByText('USB connected',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Radar Diagnostics',exact:true}).click();await expect(page.getByRole('heading',{name:'Spatial overview'})).toBeVisible();
  await page.evaluate(()=>{location.hash='particles';});
  await expect(page.getByRole('heading',{name:'Particle Experience',exact:true})).toBeVisible();
  await expect(page.getByText('USB connected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:/^Disconnect/}).click();
});

test('a failed particle module shows recovery controls and keeps diagnostics usable',async({page})=>{
  await page.route('**/src/particles/ParticleExperience.tsx*',route=>route.fulfill({status:200,contentType:'application/javascript',body:'throw new Error("Test particle module failure");'}));
  await page.goto('/');await page.getByRole('button',{name:'Run simulation',exact:true}).click();
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('href','#particles');
  await page.getByRole('link',{name:'Particle Experience',exact:true}).click();
  await expect(page).toHaveURL(/#particles$/);
  await expect(page.getByRole('heading',{name:'Particle Experience could not load'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Retry Particle Experience'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reload application'})).toBeVisible();
  await expect(page.getByText('Simulation running',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Radar Diagnostics',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Spatial overview'})).toBeVisible();
  await expect(page.getByText('Present',{exact:true})).toBeVisible();
});
test('GPU renderer, presets, simulation, replay and navigation preserve the dashboard',async({page})=>{
  test.setTimeout(60000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/');await page.getByRole('button',{name:'Run simulation',exact:true}).click();
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('href','#particles');
  await page.getByRole('link',{name:'Particle Experience',exact:true}).click();
  await expect(page).toHaveURL(/#particles$/);
  const canvas=page.locator('canvas[data-particle-canvas]');await expect(canvas).toBeVisible();
  await expect.poll(async()=>Number(await canvas.getAttribute('data-frames')),{timeout:20000}).toBeGreaterThan(0);
  await expect(page.getByTestId('particle-backend')).toContainText(/GPU|CPU fallback/);
  await expect.poll(async()=>Number(await canvas.getAttribute('data-activity')),{timeout:10000}).toBeGreaterThan(.1);
  const before=Number(await canvas.getAttribute('data-frames'));
  await page.getByRole('button',{name:'Stop simulation',exact:true}).click();
  await expect.poll(async()=>Number(await canvas.getAttribute('data-activity')),{timeout:10000}).toBeLessThan(.05);
  await expect.poll(async()=>Number(await canvas.getAttribute('data-frames'))).toBeGreaterThan(before);
  for(const name of ['Cosmic Vortex','Energy Burst','Liquid Sculpture','Particle Ocean','Ambient Galaxy','Magnetic Fluid'])await page.getByRole('button',{name:new RegExp(name)}).click();
  await page.getByLabel('Particle formation',{exact:true}).selectOption('torus');
  await page.getByLabel('Particle palette',{exact:true}).selectOption('nebula');
  await page.getByRole('button',{name:'Load & replay sample',exact:true}).click();await expect(page.getByText('Session replay',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Pause visitor replay'}).click();await page.getByRole('button',{name:'Resume visitor replay'}).click();
  await page.setViewportSize({width:1050,height:800});await expect(canvas).toBeVisible();
  await page.screenshot({path:'test-results/particles-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'Radar Diagnostics',exact:true}).click();await expect(page.getByRole('heading',{name:'Spatial overview'})).toBeVisible();await expect(canvas).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Particle Experience',exact:true})).toHaveAttribute('href','#particles');
  await page.getByRole('link',{name:'Particle Experience',exact:true}).click();
  await expect(page).toHaveURL(/#particles$/);await expect(canvas).toBeVisible();
  expect(errors).toEqual([]);
});
test('exhibition fullscreen, context restoration, reduced fallback and mobile controls',async({page})=>{
  test.setTimeout(60000);await page.goto('/?particleBackend=cpu#particles');const canvas=page.locator('canvas[data-particle-canvas]');await expect(canvas).toBeVisible();
  await expect(page.getByTestId('particle-backend')).toHaveText('CPU fallback');
  await page.getByRole('button',{name:'Enter exhibition',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await expect(page.locator('.stage-caption')).toHaveCount(0);
  await page.evaluate(()=>document.exitFullscreen());await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
  await canvas.evaluate(node=>{const gl=(node as HTMLCanvasElement).getContext('webgl2')!;const ext=gl.getExtension('WEBGL_lose_context')!;ext.loseContext();setTimeout(()=>ext.restoreContext(),600);});
  await expect(page.getByText('Restoring GPU context',{exact:true})).toBeVisible();await expect(page.getByText('Restoring GPU context',{exact:true})).toHaveCount(0,{timeout:10000});
  await expect(page.getByTestId('particle-backend')).toHaveText('CPU fallback');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
