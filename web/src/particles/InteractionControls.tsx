import {useEffect,useState} from 'react';
import {Panel,Slider,Toggle} from '../components/Controls';
import {useRadar} from '../state/store';
import {useParticles} from './store';
import {defaultCoverage,type CoverageConfig} from './config';
import {defaultResponse,responsePresets,responseBounds,type ResponseConfig} from './response';

const labels:Record<Exclude<keyof ResponseConfig,'preset'|'radius'>,[string,string]>={
 amplification:['Movement amplification','Multiplies velocity-driven forces; the attractor remains inside calibrated bounds.'],
 horizontal:['Horizontal response','Scales lateral velocity in world units per second.'],depth:['Depth response','Scales approach and retreat response.'],
 attraction:['Approach attraction','Pulls particles inward when confirmed depth decreases.'],expansion:['Retreat expansion','Pushes particles outward when confirmed depth increases.'],
 drag:['Directional drag','Acceleration along visitor movement with spatial falloff.'],vortex:['Movement vortex','Signed rotating flow around the attractor.'],turbulence:['Movement turbulence','Adds local curl flow during movement.'],
 pulseThreshold:['Energy pulse threshold','Normalized movement energy crossing; one second cooldown.'],pulseStrength:['Pulse strength','Expanding wave acceleration, bounded by simulation limits.'],
 restoration:['Active shape-restoration weight','Relative restoration during movement; returns to full strength at rest.'],
 attack:['Attack time · s','Energy rise time.'],release:['Release time · s','Energy and presence decay time.'],smoothing:['Position smoothing · s','Adaptive raw-position filter; faster motion reduces lag.'],
 deadZone:['Motion dead zone · m','Ignores raw position jitter below this distance.'],speedMin:['Minimum energy speed · m/s','Speeds below this threshold carry no movement energy.'],speedMax:['Full energy speed · m/s','Speed that produces maximum movement energy.'],
 radarCenterX:['Radar zone center X ? m','Physical X bounds are center minus/plus horizontal half-range.'],
 width:['Lateral span calibration','8 maps the full formation width; multiplies World-space movement range.'],depthSize:['Depth span calibration','6 maps the full formation depth; multiplies World-space movement range.'],
 offsetX:['Center offset X','World-space horizontal center.'],offsetY:['Center offset Y','World-space vertical center.'],offsetZ:['Center offset Z','World-space depth center.']
};
export function InteractionControls({test,stop}:{test:(baseline:boolean)=>void;stop:()=>void}){
 const {config:c,patch,save}=useParticles();const r=c.response;
 const setCoverage=(value:Partial<CoverageConfig>)=>patch({coverage:{...c.coverage,...value}});
 const set=(value:Partial<ResponseConfig>)=>patch({response:{...r,...value}});
 return <Panel title="Interaction Response" eyebrow="PHASE 03 / MOVEMENT ENERGY">
  <label className="select-label">Interaction preset<select aria-label="Interaction preset" value={r.preset} onChange={e=>set({...responsePresets[e.target.value as keyof typeof responsePresets],preset:e.target.value})}>{Object.keys(responsePresets).map(v=><option key={v}>{v}</option>)}{r.preset==='Custom'&&<option>Custom</option>}</select></label>
  <label className="select-label">Interaction coverage<select aria-label="Interaction coverage" value={c.coverage.mode} onChange={e=>setCoverage({mode:e.target.value as CoverageConfig['mode']})}>{['Local','Wide','Full Field'].map(v=><option key={v}>{v}</option>)}</select></label>
  <Slider label="Influence radius (% of sculpture size)" value={r.radius*100} min={20} max={150} unit="%" onChange={v=>set({radius:v/100,preset:'Custom'})}/>
  <Slider label="Global fluid influence" value={c.coverage.global} min={0} max={1} step={.01} onChange={global=>setCoverage({global})}/>
  <Slider label="Local-to-global force balance" value={c.coverage.balance} min={0} max={1} step={.01} onChange={balance=>setCoverage({balance})}/>
  <Slider label="Spatial falloff softness" value={c.coverage.softness} min={.25} max={3} step={.05} onChange={softness=>setCoverage({softness})}/>
  <Toggle label="Dynamic radius expansion" checked={c.coverage.dynamic} onChange={dynamic=>setCoverage({dynamic})}/>
  <Slider label="Movement radius expansion" value={c.coverage.expansion} min={0} max={1.5} step={.05} onChange={expansion=>setCoverage({expansion})}/>
  <Slider label="World-space movement range" value={c.coverage.movementRange} min={.25} max={2} step={.05} onChange={movementRange=>setCoverage({movementRange})}/>
  {(Object.keys(labels) as (keyof typeof labels)[]).map(key=><div key={key} title={labels[key][1]}><Slider label={labels[key][0]} value={r[key]} min={key==='speedMax'?Math.max(.1,r.speedMin+.05):responseBounds[key][0]} max={key==='speedMin'?Math.min(1,r.speedMax-.05):responseBounds[key][1]} step={.01} onChange={value=>set({[key]:value,preset:'Custom'})}/></div>)}
  <Toggle label="Show influence field" checked={c.debug} onChange={debug=>patch({debug})}/>
  <div className="recorder-actions"><button onClick={()=>patch({response:{...defaultResponse},coverage:{...defaultCoverage}})}>Reset interaction settings</button><button onClick={()=>save('Custom response')}>Save custom response preset</button><button onClick={()=>test(false)}>Test interaction</button><button onClick={()=>test(true)}>Compare baseline response</button><button onClick={stop}>Stop interaction test</button></div>
  <p className="hint">16 s sequence: idle, left, right, approach, retreat, rapid lateral motion, stop and settle. Compare runs the same path with 1× force amplification. Saved responses use Operator configurations below.</p>
 </Panel>;
}
const rCenter=(n:number)=>n.toFixed(2);
function display(value:unknown):string {if(value===null||value===undefined)return '—';if(typeof value==='number')return value.toFixed(3);if(typeof value==='object')return Object.entries(value).map(([k,v])=>`${k}: ${display(v)}`).join(' · ');return String(value);}
export function InteractionDiagnostics(){
 const d=useParticles(s=>s.diagnostics),c=useParticles(s=>s.config),filters=useRadar(s=>s.filters);
 const range=c.mapping.phase1Calibration?filters.range:c.mapping.horizontalRange;
 const [history,setHistory]=useState<{raw:number;filtered:number}[]>([]);
 useEffect(()=>{const raw=d.rawVelocity as {x:number;y:number}|undefined,filtered=d.filteredVelocity as typeof raw;if(raw&&filtered)setHistory(h=>[...h,{raw:Math.hypot(raw.x,raw.y),filtered:Math.hypot(filtered.x,filtered.y)}].slice(-100));},[d]);
 const raw=d.raw as {x:number;y:number}|undefined,normalized=d.normalized as {x:number;depth:number}|undefined;
 return <Panel title="Interaction Diagnostics" eyebrow="LIVE RESPONSE MONITOR">
  <dl className="interaction-readout">{[['Raw radar X/Y · m',d.raw],['Filtered X/Y · m',d.filtered],['Normalized X/depth',d.normalized],['World attractor X/Y/Z',d.world],['Raw movement velocity · m/s',d.rawVelocity],['Filtered movement velocity · m/s',d.filteredVelocity],['Motion energy',d.energy],['Interaction amplification',d.amplification],['Effective radius · world',d.radius],['Particle formation bounds',d.formationBounds],['Characteristic sculpture radius',d.characteristicRadius],['Global field radius / world',d.globalRadius],['Global field coverage',d.coverage],['World movement width/depth',d.worldRange],['Active interaction state',d.state],['Sensor frame age · ms',d.age]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{display(value)}</dd></div>)}</dl>
  <svg className="movement-graph" viewBox="0 0 500 100" role="img" aria-label="Raw versus filtered movement speed graph"><path d="M0 90H500 M0 50H500 M0 10H500" stroke="#23414c" fill="none"/>{['raw','filtered'].map((key,i)=><polyline key={key} fill="none" stroke={i?'#4ce2ca':'#e9b36a'} strokeWidth="2" points={history.map((v,n)=>`${n*5},${90-Math.min(5,v[key as keyof typeof v])*16}`).join(' ')}/>)}</svg><p className="hint">Raw speed: amber · filtered speed: teal · vertical scale 0–5 m/s · latest 50 s.</p>
  <svg className="calibration-graph" viewBox="0 0 300 150" role="img" aria-label="Radar calibration visualization"><rect x="10" y="10" width="280" height="130" fill="none" stroke="#4c8390"/><path d="M150 10V140 M10 75H290" stroke="#23414c"/>{normalized&&<circle cx={10+normalized.x*280} cy={140-normalized.depth*130} r="5" fill="#4ce2ca"/>}</svg>
  <p className="hint">Calibrated region: X {rCenter(c.response.radarCenterX-range)} to {rCenter(c.response.radarCenterX+range)} m, Y {c.mapping.depthMin} to {c.mapping.depthMax} m. Teal: local influence; blue: global envelope (one radius); amber: formation bounds. Raw position {display(raw)}.</p>
  <details><summary>Actual {String(d.backend??'simulation')} force uniforms</summary><dl className="interaction-readout">{Object.entries(d.uniforms??{}).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{display(value)}</dd></div>)}</dl></details>
 </Panel>;
}
