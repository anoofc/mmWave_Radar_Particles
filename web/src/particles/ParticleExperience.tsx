import {SpatialDiagnostics} from './SpatialDiagnostics';
import {InteractionControls,InteractionDiagnostics} from './InteractionControls';
import {useEffect,useRef,useState} from 'react';
import {useRadar} from '../state/store';
import {Panel,Slider,Toggle,SimulationControls} from '../components/Controls';
import {ParticleEngine} from './engine';
import {useParticles} from './store';
import {exportConfig,formations,paletteNames,presets,qualities,type ParticleConfig,type Formation,type Palette,type Quality} from './config';
import './particles.css';
export interface ParticleExperienceProps {
  onSample:()=>Promise<void>;onReplay:()=>Promise<void>;onRestart:()=>void;onPause:()=>void;
  onSeek:(value:number)=>void;onSpeed:(value:number)=>void;playing:boolean;position:number;duration:number;speed:number;
}
function exportFile(text:string,name:string){const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function ParticleExperience(props:ParticleExperienceProps){
  const {config:c,metrics:m,error,patch,map,preset,quality,reset,save,restore,saved,refreshSaved}=useParticles();
  const diagnosticRange=useRadar(s=>s.filters.range);
  const mode=useRadar(s=>s.mode),interaction=useRadar(s=>s.interaction),session=useRadar(s=>s.session);
  const host=useRef<HTMLDivElement>(null),stage=useRef<HTMLDivElement>(null),engine=useRef<ParticleEngine|null>(null);
  const [localError,setLocalError]=useState(''),[name,setName]=useState('My installation'),[retry,setRetry]=useState(0),[exhibition,setExhibition]=useState(false);
  useEffect(()=>{
    const previous=useRadar.getState().simulation.zone;
    useRadar.getState().simulate({zone:{centerX:c.response.radarCenterX,halfRange:c.mapping.phase1Calibration?diagnosticRange:c.mapping.horizontalRange,near:c.mapping.depthMin,far:c.mapping.depthMax}});
    return()=>useRadar.getState().simulate({zone:previous});
  },[c.response.radarCenterX,c.mapping.phase1Calibration,c.mapping.horizontalRange,c.mapping.depthMin,c.mapping.depthMax,diagnosticRange]);
  useEffect(()=>{
    if(!host.current)return;
    useParticles.setState({metrics:{...useParticles.getState().metrics,status:'initializing'}});
    // Commit/paint the selected view before potentially expensive GPU setup.
    // Cancel both stages if the operator returns to diagnostics while loading.
    let timer:ReturnType<typeof setTimeout>|undefined,cancelled=false;
    const frame=requestAnimationFrame(()=>{timer=setTimeout(()=>{
      if(cancelled||!host.current)return;
      try{engine.current=new ParticleEngine(host.current,()=>useParticles.getState().config,()=>useRadar.getState().filters,metrics=>useParticles.setState({metrics}),new URLSearchParams(location.search).get('particleBackend')==='cpu');setLocalError('');}
      catch(e){useParticles.setState({metrics:{...useParticles.getState().metrics,status:'unavailable',message:String(e)}});setLocalError(`3D rendering is unavailable: ${String(e)}`);}
    },0);});
    refreshSaved();
    return()=>{cancelled=true;cancelAnimationFrame(frame);clearTimeout(timer);engine.current?.dispose();engine.current=null;};
  },[retry,refreshSaved]);
  useEffect(()=>{const change=()=>{const active=document.fullscreenElement===stage.current;setExhibition(active);engine.current?.setExhibition(active);};document.addEventListener('fullscreenchange',change);return()=>document.removeEventListener('fullscreenchange',change);},[]);
  const fullscreen=async()=>{try{await stage.current?.requestFullscreen();}catch(e){setLocalError(`Fullscreen permission was denied. Use your browser's fullscreen shortcut or allow fullscreen: ${String(e)}`);}};
  const current=presets.find(p=>p.id===c.preset)!;
  const slider=(key:keyof ParticleConfig,label:string,min:number,max:number,step=.05)=> <Slider key={key} label={label} value={Number(c[key])} min={min} max={max} step={step} onChange={value=>patch({[key]:value})}/>;
  const mappingSlider=(key:'horizontalRange'|'depthMin'|'depthMax'|'worldScale'|'sensitivity'|'smoothing'|'deadZone',label:string,min:number,max:number,step=.05)=><Slider key={key} label={label} value={c.mapping[key]} min={min} max={max} step={step} onChange={value=>map({[key]:value})}/>;
  return <div className="particle-experience">
    <div className="experience-title"><div><span className="eyebrow">PHASE 03 / RESPONSIVE MATTER</span><h2>Particle Experience</h2><p>Spatial presence becomes a fluid sculpture.</p></div><div className="experience-title-actions"><button onClick={()=>engine.current?.resetCamera()}>Reset camera</button><button className="primary" onClick={()=>void fullscreen()}>Enter exhibition</button></div></div>
    {(error||localError)&&<div className="error-banner" role="alert"><span>{error||localError}</span><button aria-label="Dismiss particle error" onClick={()=>{setLocalError('');useParticles.setState({error:''});}}>×</button></div>}
    <div className="experience-grid"><div className="experience-main">
      <div className="particle-stage" ref={stage} data-exhibition={exhibition}>
        <div ref={host} className="particle-canvas-host"/>
        {!exhibition&&<div className="stage-caption"><span>{current.name}</span><small>{m.status==='ready'?`${m.count.toLocaleString()} PARTICLES · ${m.backend}`:m.status.toUpperCase()}</small></div>}
        {m.status!=='ready'&&<div className="renderer-message" role="status"><strong>{m.status==='initializing'?'Preparing particle field':m.status==='context-lost'?'Restoring GPU context':'Renderer unavailable'}</strong><p>{m.message}</p>{m.status==='unavailable'&&<button onClick={()=>setRetry(v=>v+1)}>Retry renderer</button>}</div>}
        <button className="exhibition-exit" aria-label="Exit exhibition" onClick={()=>void document.exitFullscreen()}>Exit exhibition</button>
      </div>
      <div className="particle-performance" aria-label="Particle performance"><div><strong data-testid="particle-fps">{m.fps.toFixed(1)}</strong><span>FPS</span></div><div><strong>{m.frameMs.toFixed(1)}<small> ms</small></strong><span>FRAME / P95 {m.p95Ms.toFixed(1)} ms</span></div><div><strong>{m.gpuMs===null?'—':m.gpuMs.toFixed(1)}<small> ms</small></strong><span>GPU TIMER {m.gpuMs===null?'UNAVAILABLE':''}</span></div><div><strong>{m.pixelRatio.toFixed(2)}<small>×</small></strong><span>{m.width} × {m.height} PX</span></div><span className={`tag ${m.backend==='CPU fallback'?'warning':'cyan'}`} data-testid="particle-backend">{m.backend}</span></div>
      <div className="gpu-description"><span>{m.renderer}</span><span>{m.drawCalls} draws · {m.textures} textures</span></div>
      {m.message&&m.status==='ready'&&<p className="hint text-warning">{m.message}</p>}
      <div className="preset-grid" aria-label="Visual presets">{presets.map((p,i)=><button key={p.id} className={`preset-card ${c.preset===p.id?'selected':''}`} aria-pressed={c.preset===p.id} onClick={()=>preset(p.id)}><span className={`preset-art preset-art-${i}`} aria-hidden="true"><i/><i/><i/></span><span><small>0{i+1}</small><strong>{p.name}</strong><em>{p.description}</em></span></button>)}</div>
      <InteractionDiagnostics/>
      <SpatialDiagnostics/>
      <Panel title="Visitor input" eyebrow="LIVE / SIMULATION / REPLAY" aside={<span className="tag cyan">{mode.toUpperCase()}</span>}>
        <div className="input-readout"><span>Tracking <b>{interaction.tracking}</b></span><span>Presence <b>{interaction.presence===null?'Unknown':interaction.presence?'Present':'Absent'}</b></span><span>Intensity <b>{interaction.movementIntensity.toFixed(2)}</b></span><span>Freshness <b>{interaction.freshness.toFixed(2)}</b></span></div>
        <p className="hint">Use Connect USB or Run simulation above. Every source feeds the same interaction API. Automatic simulation spans the current particle calibration. Drag the preview to orbit; scroll to zoom. Exhibition hides controls and debug geometry; Escape returns here.</p>
        <div className="recorder-actions"><button onClick={()=>void props.onSample()}>Load & replay sample</button><button disabled={!session.events.length} onClick={()=>void props.onReplay()}>Replay recorded session</button><button disabled={mode!=='replay'} onClick={props.onPause}>{props.playing?'Pause visitor replay':'Resume visitor replay'}</button><button disabled={mode!=='replay'} onClick={props.onRestart}>Restart visitor replay</button></div>
        {mode==='replay'&&<div className="replay-controls"><input type="range" aria-label="Particle replay position" min={0} max={props.duration||1} value={props.position} onChange={e=>props.onSeek(Number(e.target.value))}/><span className="timecode">{(props.position/1000).toFixed(1)} / {(props.duration/1000).toFixed(1)} s</span><select aria-label="Particle replay speed" value={props.speed} onChange={e=>props.onSpeed(Number(e.target.value))}>{[.25,.5,1,2,4].map(v=><option key={v} value={v}>{v}×</option>)}</select></div>}
      </Panel>
      <details className="particle-input-details"><summary>Simulated visitor controls</summary><SimulationControls/></details>
      <Panel title="Operator configurations" eyebrow="SAVE / LOAD"><div className="config-actions"><label>Preset name<input value={name} maxLength={48} onChange={e=>setName(e.target.value)}/></label><button onClick={()=>save(name)}>Save locally</button><select aria-label="Load saved particle preset" defaultValue="" onChange={e=>{if(e.target.value)restore(e.target.value);}}><option value="">Load saved preset</option>{saved.map(v=><option value={v} key={v}>{v}</option>)}</select><button onClick={()=>exportFile(exportConfig(c),'mr60-particle-config.json')}>Export configuration</button><label className="file-button">Import configuration<input type="file" accept=".json,application/json" aria-label="Import particle configuration" onChange={e=>{const file=e.target.files?.[0];if(file){if(file.size>32768)useParticles.setState({error:'Configuration exceeds 32 KB'});else void file.text().then(text=>useParticles.getState().load(text)).catch(err=>setLocalError(String(err)));}e.target.value='';}}/></label><button onClick={reset}>Reset particle defaults</button></div></Panel>
    </div><aside className="experience-controls">
      <Panel title="Appearance" eyebrow="SCULPTURE"><label className="select-label">Formation<select aria-label="Particle formation" value={c.formation} onChange={e=>patch({formation:e.target.value as Formation,autoMorph:false})}>{formations.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label className="select-label">Palette<select aria-label="Particle palette" value={c.palette} onChange={e=>patch({palette:e.target.value as Palette})}>{paletteNames.map(v=><option key={v} value={v}>{v}</option>)}</select></label>{c.palette==='custom'&&<div className="color-inputs">{c.colors.map((color,i)=><label key={i}>Color {i+1}<input type="color" value={color} onChange={e=>{const colors=[...c.colors] as [string,string,string];colors[i]=e.target.value;patch({colors});}}/></label>)}</div>}{slider('size','Particle size',.5,6,.1)}{slider('morphDuration','Morph duration · s',.5,15,.5)}{slider('rotation','Scene rotation',0,.4,.01)}{slider('cameraDistance','Camera distance',8,24,.5)}<Toggle label="Cycle formations" checked={c.autoMorph} onChange={autoMorph=>patch({autoMorph})}/></Panel>
      <InteractionControls test={baseline=>engine.current?.testInteraction(baseline)} stop={()=>engine.current?.stopInteractionTest()}/>
      <Panel title="Fluid & forces" eyebrow="ONE UNIFIED ENGINE">{slider('flow','Fluid speed',0,3)}{slider('turbulence','Turbulence',0,3)}{slider('magnetic','Attraction strength',0,5)}{slider('repulsion','Repulsion strength',0,5)}{slider('vortex','Vortex intensity',0,5)}{slider('shape','Shape restoring force',0,5)}{slider('damping','Velocity damping',.1,5)}<Toggle label="Soft boundary" checked={c.boundary} onChange={boundary=>patch({boundary})}/><details><summary>Stability limits</summary>{slider('accelerationLimit','Acceleration limit',1,30,.5)}{slider('velocityLimit','Velocity limit',.2,10,.2)}{slider('boundaryRadius','Boundary radius',3,12,.5)}</details></Panel>
      <Panel title="Light & performance" eyebrow="CINEMATIC">{slider('bloom','Bloom intensity',0,1.5)}{slider('trails','Trail intensity',0,.85)}{slider('exposure','Exposure',.3,2.5)}<label className="select-label">Quality<select aria-label="Particle quality" value={c.quality} onChange={e=>quality(e.target.value as Quality)}>{qualities.map(v=><option key={v} value={v}>{v}</option>)}</select></label><label className="select-label">Particles<select aria-label="Particle count" value={c.count} onChange={e=>patch({count:Number(e.target.value)})}>{[10000,30000,60000,100000,...(![10000,30000,60000,100000].includes(c.count)?[c.count]:[])].map(v=><option key={v} value={v}>{v.toLocaleString()}</option>)}</select></label><Toggle label="Adaptive resolution" checked={c.adaptive} onChange={adaptive=>patch({adaptive})}/><p className="hint">Resolution adapts after sustained frame-time changes. Particle count changes rebuild simulation buffers; formations and presets morph without a reset.</p></Panel>
      <Panel title="Radar mapping" eyebrow="METRES → WORLD"><Toggle label="Use diagnostic calibration" checked={c.mapping.phase1Calibration} onChange={phase1Calibration=>map({phase1Calibration})}/><fieldset disabled={c.mapping.phase1Calibration}><Toggle label="Particle invert X" checked={c.mapping.invertX} onChange={invertX=>map({invertX})}/><Toggle label="Particle invert Y" checked={c.mapping.invertY} onChange={invertY=>map({invertY})}/>{mappingSlider('horizontalRange','Horizontal half-range · m',.25,10,.25)}</fieldset>{mappingSlider('depthMin','Near depth · m',0,Math.min(5,c.mapping.depthMax-.2),.1)}{mappingSlider('depthMax','Far depth · m',Math.max(.5,c.mapping.depthMin+.2),10,.1)}{mappingSlider('worldScale','World scale',.25,2)}{mappingSlider('sensitivity','Interaction sensitivity',.1,3)}<Toggle label="Show attractor debug" checked={c.debug} onChange={debug=>patch({debug})}/><p className="hint">Diagnostic calibration preserves the current X/Y inversion and horizontal range. Missing data fades to idle; positions never reset on input loss.</p></Panel>
    </aside></div>
  </div>;
}
