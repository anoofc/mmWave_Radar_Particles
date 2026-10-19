import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { Command } from '../../shared/protocol';
import { SerialTransport } from './core/serial';
import { Simulator } from './core/simulation';
import { Replay, importSession, sessionCsv } from './core/recording';
import { useRadar, type Mode } from './state/store';
import { uptimeAge, MAX_RANGE_METRES } from './core/coordinates';
import { RadarPlot } from './components/RadarPlot';
import { HealthDiagnostics } from './components/HealthDiagnostics';
import { ParticleViewLoader } from './components/ParticleViewLoader';
import { Panel, Slider, Toggle, FilterControls, SimulationControls } from './components/Controls';

function download(text:string,type:string,extension:string){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=`mr60-${new Date().toISOString().replace(/[:.]/g,'-')}.${extension}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const fmt=(n:number|undefined|null,places=2)=>n===undefined||n===null?'—':n.toFixed(places);
export default function App(){
  const [page,setPage]=useState<'diagnostics'|'particles'>(()=>location.hash==='#particles'?'particles':'diagnostics');
  const selectPage=(next:'diagnostics'|'particles',event:MouseEvent<HTMLAnchorElement>|PointerEvent<HTMLAnchorElement>)=>{
    // Preserve modified clicks for opening a section in another browser tab.
    if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(event.type==='click')event.preventDefault();
    setPage(next);
    const hash=next==='particles'?'#particles':'#diagnostics';
    if(location.hash!==hash)location.hash=hash;
  };
  // Native section links and direct URLs share the same navigation path.
  // Hash navigation keeps the application mounted, including its USB connection.
  useEffect(()=>{const changed=()=>setPage(location.hash==='#particles'?'particles':'diagnostics');window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
  const s=useRadar(), serial=useRef<SerialTransport|null>(null), simulator=useRef(new Simulator()), replay=useRef<Replay|null>(null);
  const [busy,setBusy]=useState(false), [playing,setPlaying]=useState(false), [speed,setSpeed]=useState(1), [position,setPosition]=useState(0), [tab,setTab]=useState<'telemetry'|'protocol'>('telemetry');
  const playingRef=useRef(false), speedRef=useRef(1), pending=useRef(new Map<string,ReturnType<typeof setTimeout>>());
  playingRef.current=playing;speedRef.current=speed;
  const command=async(name:Command['command'],interval_ms?:number)=>{
    const id=crypto.randomUUID();
    try{
      await serial.current?.send({type:'command',v:1,id,command:name,...(interval_ms?{interval_ms}:{})});
      const timer=setTimeout(()=>{pending.current.delete(id);useRadar.getState().fail(`Command timed out: ${name}`);},3000);
      pending.current.set(id,timer);
    }catch(e){s.fail(String(e));}
  };
  useEffect(()=>{
    const transport=new SerialTransport(p=>{
      if(p.type==='ack'){const timer=pending.current.get(p.id);if(timer){clearTimeout(timer);pending.current.delete(p.id);}if(!p.ok)useRadar.getState().fail(p.message);}
      useRadar.getState().ingest(p);
    },(message,line)=>useRadar.getState().fail(message,line),()=>{useRadar.getState().setConnection('lost');useRadar.getState().stopRecording();},()=>useRadar.setState(state=>({bootLines:state.bootLines+1})));
    serial.current=transport;
    return()=>{void transport.disconnect();for(const timer of pending.current.values())clearTimeout(timer);pending.current.clear();};
  },[]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    if(s.mode==='simulation'){
      const loop=()=>{const state=useRadar.getState();if(state.mode!=='simulation')return;state.ingest(simulator.current.packet(performance.now(),state.simulation));timer=setTimeout(loop,simulator.current.interval(state.simulation));};loop();
    }
    return()=>clearTimeout(timer);
  },[s.mode]);
  useEffect(()=>{
    let last=performance.now();
    const timer=setInterval(()=>{
      const now=performance.now(), state=useRadar.getState(), player=replay.current;
      if(state.mode==='replay'&&player){
        if(playingRef.current){player.advance(now-last,speedRef.current,e=>state.ingest(e.packet,e.at,false));setPosition(player.position);if(player.cursor>=player.session.events.length)setPlaying(false);}
        state.tick(player.position);
      }else state.tick();
      last=now;
    },50);
    return()=>clearInterval(timer);
  },[]);
  const switchMode=async(mode:Mode,reconnect=false)=>{
    if(busy)return;setBusy(true);setPlaying(false);s.stopRecording();
    for(const timer of pending.current.values())clearTimeout(timer);pending.current.clear();
    try{
      await serial.current?.disconnect();s.setConnection('disconnected');s.setMode(mode);
      if(mode==='serial'){s.setConnection('connecting');await serial.current?.connect(reconnect);s.setConnection('connected');await command('hello');}
    }catch(e){s.setConnection('disconnected');s.setMode('idle');s.fail(String(e));}
    finally{setBusy(false);}
  };
  const beginReplay=async()=>{const session=useRadar.getState().session;if(!session.events.length)return;await switchMode('replay');replay.current=new Replay(session);replay.current.seek(0,()=>s.resetData(),e=>s.ingest(e.packet,e.at,false));setPosition(0);setPlaying(true);};
  const seek=(value:number)=>{replay.current?.seek(value,()=>s.resetData(),e=>s.ingest(e.packet,e.at,false));setPosition(value);s.tick(value);};
  const importFile=async(file:File|undefined)=>{if(!file)return;try{if(file.size>30_000_000)throw new Error('Recording exceeds 30 MB');const session=importSession(await file.text());await switchMode('idle');s.load(session);replay.current=null;setPosition(0);}catch(e){s.fail(String(e));}};
  const loadSample=async()=>{try{const response=await fetch(`${import.meta.env.BASE_URL}sample-session.json`);if(!response.ok)throw new Error('Sample could not be loaded');const session=importSession(await response.text());await switchMode('idle');s.load(session);replay.current=null;setPosition(0);}catch(e){s.fail(String(e));}};
  const age=s.packets?Math.max(0,s.clock-s.receivedAt):null;
  const targetAge=s.packet?.target_at!=null?uptimeAge(s.packet.ts,s.packet.target_at)+Math.max(0,s.clock-s.telemetryAt):null;
  const live=s.mode==='simulation'||(s.mode==='serial'&&s.connection==='connected');
  const source=s.mode==='simulation'?'SIMULATED':s.mode==='replay'?'RECORDED':s.connection==='connected'?'USB SERIAL':'OFFLINE';
  const stale=s.interaction.tracking==='stale';
  return <div className="app-shell">
    <aside className="rail"><div className="rail-logo">m<span>°</span></div><div className="rail-line"/><span className="rail-icon active" title="Radar diagnostics">⌖</span><span className="rail-caption">{page==='particles'?'PHASE 02':'PHASE 01'}</span><span className="rail-bottom">60<span>GHz</span></span></aside>
    <main>
      <header className="app-header"><div><div className="eyebrow">SENSOR SYSTEMS / INTERACTIVE INSTALLATION</div><h1>Radar <span>Console</span><span className="version">v1.0</span></h1><p>MR60BHA2 <span className="separator">/</span> Real-time spatial diagnostics</p></div><div className="header-actions"><span className={`source-badge ${live?'online':''}`}><i/>{source}</span><button className="icon-button" aria-label="Toggle fullscreen" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void document.documentElement.requestFullscreen().catch(e=>s.fail(String(e)));}}>⛶</button></div></header>
      <nav className="experience-nav" aria-label="Application sections"><a href="#diagnostics" aria-current={page==='diagnostics'?'page':undefined} onPointerUpCapture={e=>selectPage('diagnostics',e)} onClickCapture={e=>selectPage('diagnostics',e)}>Radar Diagnostics</a><a href="#particles" aria-current={page==='particles'?'page':undefined} onPointerUpCapture={e=>selectPage('particles',e)} onClickCapture={e=>selectPage('particles',e)}>Particle Experience</a></nav>
      {s.error&&<div className="error-banner" role="alert"><span>{s.error}</span><button onClick={()=>useRadar.setState({error:''})} aria-label="Dismiss error">×</button></div>}
      <div className="connection-strip"><div className="connection-label"><span className={`status-dot ${live?'on':''}`}/><div><strong>{busy?'Connecting…':s.mode==='simulation'?'Simulation running':s.mode==='replay'?'Session replay':s.connection==='lost'?'Serial connection lost':s.connection==='connected'?'USB connected':'Awaiting connection'}</strong><small>{s.mode==='simulation'?'Virtual sensor · no hardware required':s.mode==='replay'?'Local recording · original packet timing':'XIAO ESP32C6 · 115200 baud · USB CDC'}</small></div></div><div className="connection-buttons"><button disabled={busy} className="primary" onClick={()=>void switchMode(s.connection==='connected'?'idle':'serial')}>{s.connection==='connected'?'Disconnect':'Connect USB'} <span>↗</span></button><button disabled={busy} onClick={()=>void switchMode(s.mode==='simulation'?'idle':'simulation')}>{s.mode==='simulation'?'Stop simulation':'Run simulation'}</button><button disabled={busy} onClick={()=>void switchMode('serial',true)}>Reconnect</button></div></div>
      {page==='particles'&&<ParticleViewLoader onSample={async()=>{await loadSample();await beginReplay();}} onReplay={beginReplay} onRestart={()=>seek(0)} onPause={()=>setPlaying(v=>!v)} onSeek={seek} onSpeed={setSpeed} playing={playing} position={position} duration={replay.current?.duration??s.session.events.at(-1)?.at??0} speed={speed}/>}
      <div style={{display:page==='diagnostics'?'contents':'none'}}>
      <div className="metrics"><Metric label="HUMAN PRESENCE" value={s.interaction.presence===null?'Unknown':s.interaction.presence?'Present':'Absent'} detail={s.packet?.presence_at!=null?'Independent presence report':'Awaiting a valid presence report'} accent={s.interaction.presence===true}/><Metric label="TARGET REPORT" value={stale?'Stale':s.packet?.report==='valid'?String(s.packet.targets.length).padStart(2,'0'):'Unavailable'} detail={s.packet?.report==='valid'?'Targets in latest valid report':'No valid target report'} /><Metric label="SENSOR FRAME RATE" value={`${fmt(age!==null&&age>2200?0:s.hz,1)}`} suffix="Hz" detail={`Target reports ${fmt(age!==null&&age>2200?0:s.targetHz,1)} Hz`} /><Metric label="MEASUREMENT AGE" value={fmt(targetAge,0)} suffix="ms" detail={`USB packet age ${fmt(age,0)} ms`} accent={targetAge!==null&&targetAge<500}/></div>
      <div className="workspace"><div className="main-column">
        <Panel title="Spatial overview" eyebrow="01 / LIVE RADAR" className="plot-panel" aside={<span className={`tag ${stale?'warning':'cyan'}`}>{s.interaction.tracking.toUpperCase()}</span>}>
          <div className="plot-toolbar"><span><i className="legend-dot"/> Filtered <i className="legend-cross">+</i> Raw <i className="legend-trail"/> Trail</span><label>View ± <select aria-label="Visible range" value={s.filters.range} onChange={e=>s.configure({range:Number(e.target.value)})}>{[1,2,MAX_RANGE_METRES].map(v=><option key={v} value={v}>{v} m</option>)}</select></label></div>
          <div className="plot-wrap"><div className="plot-corner">TOP VIEW <span>XY PLANE</span></div><RadarPlot/>{!s.packet&&<div className="plot-empty">Ready for a signal<span>Connect the radar or run a simulation</span></div>}<span className="plot-source">{source}</span></div>
          <div className="plot-footer"><span><i className="zone-legend"/> Reference zone · {MAX_RANGE_METRES} m / ±60°</span><div><Toggle label="Invert X" checked={s.filters.invertX} onChange={invertX=>s.configure({invertX})}/><Toggle label="Invert Y" checked={s.filters.invertY} onChange={invertY=>s.configure({invertY})}/></div></div><p className="hint plot-hint">Dashed sector is a visual reference, not a verified detection boundary. Dashed near-zone ring: 1.5 m. Coordinates retain the sensor’s native orientation.</p>
        </Panel>
        <Panel title="Target telemetry" eyebrow="02 / MEASUREMENTS" aside={<div className="tabs"><button className={tab==='telemetry'?'selected':''} onClick={()=>setTab('telemetry')}>Targets</button><button className={tab==='protocol'?'selected':''} onClick={()=>setTab('protocol')}>Raw JSON</button></div>}>
          {tab==='protocol'?<pre className="json-view">{s.packet?JSON.stringify(s.packet,null,2):'Waiting for telemetry…'}</pre>:<div className="table-scroll"><table><thead><tr><th>CLUSTER</th><th>RAW X / Y · m</th><th>FILTERED X / Y · m</th><th>DOPPLER</th><th>RADIAL SPEED</th></tr></thead><tbody>{s.packet?.targets.length?s.packet.targets.map((t,i)=>{const track=s.tracks.find(v=>v.cluster===t.cluster);return <tr key={i}><td><span className="cluster-chip">C{String(t.cluster).padStart(2,'0')}</span></td><td>{fmt(t.x)} <span>/</span> {fmt(t.y)}</td><td>{fmt(track?.position.x)} <span>/</span> {fmt(track?.position.y)}</td><td>{t.doppler}</td><td>{fmt(t.doppler*(s.status?.doppler_step_cm_s??17.28)/100)} <small>m/s</small></td></tr>;}):<tr><td colSpan={5} className="table-empty">{s.packet?.report==='valid'?'Valid report · zero targets':'Target report unavailable'}</td></tr>}</tbody></table></div>}
          <div className="telemetry-foot"><span>Duplicate candidates <b>{s.duplicates}</b></span><span>Distance <b>{s.packet?.distance?`${s.packet.distance.value.toFixed(3)} sensor units`:'Unavailable'}</b></span></div>
        </Panel>
        <Panel title="Session recorder" eyebrow="05 / CAPTURE & REPLAY" aside={<span className={`tag ${s.recording?'recording':''}`}>{s.recording?'● REC':`${s.session.events.length} EVENTS`}</span>}>
          <div className="recorder-actions"><button className={s.recording?'danger':'primary'} disabled={!live&&!s.recording} onClick={()=>s.recording?s.stopRecording():s.startRecording()}>{s.recording?'■ Stop recording':'● Start recording'}</button><button disabled={!s.session.events.length||s.recording} onClick={()=>download(JSON.stringify(s.session,null,2),'application/json','json')}>Export JSON</button><button disabled={!s.session.events.length||s.recording} onClick={()=>download(sessionCsv(s.session),'text/csv','csv')}>Export CSV</button><label className="file-button">Import JSON<input type="file" accept=".json,application/json" onChange={e=>{void importFile(e.target.files?.[0]);e.target.value='';}}/></label><button onClick={()=>void loadSample()}>Load sample</button></div>
          <div className="replay-controls"><button disabled={!s.session.events.length||s.recording} onClick={()=>{if(s.mode!=='replay')void beginReplay();else setPlaying(!playing);}}>{s.mode==='replay'&&playing?'Ⅱ Pause':'▶ Replay'}</button><button aria-label="Restart replay" disabled={!replay.current||s.mode!=='replay'} onClick={()=>seek(0)}>↺</button><input aria-label="Replay position" type="range" min="0" max={replay.current?.duration||1} value={position} disabled={s.mode!=='replay'} onChange={e=>seek(Number(e.target.value))}/><span className="timecode">{fmt(position/1000,1)} / {fmt((replay.current?.duration??s.session.events.at(-1)?.at??0)/1000,1)} s</span><select aria-label="Replay speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{[.25,.5,1,2,4].map(v=><option key={v} value={v}>{v}×</option>)}</select></div><p className="hint">JSON preserves the full protocol for replay. CSV exports target rows and empty-report markers.</p>
        </Panel>
      </div><div className="side-column"><Panel title="Device & link" eyebrow="CONNECTION HEALTH" aside={<span className="tag">V{s.status?.v??1}</span>}><dl className="device-details"><div><dt>Controller</dt><dd>{s.status?.board??'XIAO ESP32C6'}</dd></div><div><dt>Sensor</dt><dd>{s.status?.sensor??'MR60BHA2'}</dd></div><div><dt>Bridge firmware</dt><dd>{s.status?.firmware??'Awaiting handshake'}</dd></div><div><dt>Sensor firmware</dt><dd>{s.status?.sensor_firmware??'Not reported'}</dd></div><div><dt>Radar link</dt><dd className={s.packet?.radar==='unresponsive'?'text-warning':''}>{s.packet?.radar??'Unknown'}</dd></div></dl><div className="counter-grid"><div><strong>{s.packets.toLocaleString()}</strong><span>PACKETS</span></div><div><strong>{s.parseErrors+(s.packet?.errors??0)}</strong><span>ERRORS</span></div><div><strong>{s.gaps}</strong><span>SEQ GAPS</span></div></div><HealthDiagnostics/><div className="device-actions"><button disabled={s.connection!=='connected'} onClick={()=>void command('status')}>Refresh status</button><button disabled={s.connection!=='connected'} onClick={()=>void command('recover')}>Recover UART</button></div><label className="select-label">USB output interval<select defaultValue="100" disabled={s.connection!=='connected'} onChange={e=>void command('set_interval',Number(e.target.value))}>{[50,100,200,500,1000].map(v=><option value={v} key={v}>{v} ms</option>)}</select></label>{s.ack&&<p className="hint">Device: {s.ack.message}</p>}{!SerialTransport.supported()&&<p className="hint text-warning">USB requires Chrome or Edge on localhost / HTTPS. Simulation remains available.</p>}</Panel><FilterControls/><SimulationControls/><Panel title="Interaction output" eyebrow="PHASE 02 / API"><dl className="device-details"><div><dt>Tracking state</dt><dd>{s.interaction.tracking}</dd></div><div><dt>Screen X / Y</dt><dd>{fmt(s.interaction.screen?.x)} / {fmt(s.interaction.screen?.y)}</dd></div><div><dt>Velocity X / Y</dt><dd>{fmt(s.interaction.velocity.x)} / {fmt(s.interaction.velocity.y)} m/s</dd></div><div><dt>Movement intensity</dt><dd>{fmt(s.interaction.movementIntensity)}</dd></div></dl><div className="freshness-bar"><span style={{width:`${s.interaction.freshness*100}%`}}/></div><p className="hint">Position-derived velocity. Freshness reflects measurement age, not sensor confidence.</p></Panel></div></div>
      </div>
      <footer><span><span className="status-dot on"/> {page==='particles'?'MR60 / PHASE 2 PARTICLES':'MR60 / PHASE 1 DIAGNOSTICS'}</span><span>LOCAL PROCESSING <span className="separator">/</span> PROTOCOL 1 <span className="separator">/</span> NO CLOUD</span></footer>
    </main>
  </div>;
}
function Metric({label,value,suffix,detail,accent=false}:{label:string;value:string;suffix?:string;detail:string;accent?:boolean}){return <div className="metric"><span className="eyebrow">{label}</span><div className={accent?'accent':''}>{value}<small>{suffix}</small></div><p>{detail}</p></div>;}
