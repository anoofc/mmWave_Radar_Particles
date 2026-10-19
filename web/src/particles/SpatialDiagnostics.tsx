import {Panel,Toggle} from '../components/Controls';
import {useParticles} from './store';
import type {SpatialMeasurement,SpatialMode} from './spatial';
const display=(v:unknown):string=>v===undefined||v===null?'Unavailable':typeof v==='number'?v.toFixed(4):typeof v==='object'?JSON.stringify(v,(_key,value)=>typeof value==='number'?Number(value.toFixed(4)):value):String(v);
export function SpatialDiagnostics(){
 const {spatialEnabled,spatialMode,spatial}=useParticles();
 if(!import.meta.env.DEV&&!new URLSearchParams(location.search).has('particleSpatial'))return null;
 const m=(spatial.measurement??{}) as Partial<SpatialMeasurement>;
 const targets=spatial.formationTargets as {radius?:number}|undefined;
 const rows:Record<string,unknown>={
  'Measurement status':m.status,'Sample timestamp (performance ms)':m.sampledAt,
  'PARTICLE SPACE / sampled minimum XYZ':m.bounds?.min,'Sampled maximum XYZ':m.bounds?.max,'Sampled center XYZ':m.center,'Sampled box dimensions':m.dimensions,'Sampled bounding sphere radius':m.sphereRadius,'Generated target bounds (CPU exact / conservative during morph)':spatial.formationTargets,'Characteristic target formation radius':targets?.radius,
  'ATTRACTOR SPACE / simulation XYZ':spatial.attractorSimulation,'World XYZ':spatial.attractorWorld,'Mapped world XYZ (radar before debug override)':spatial.mappedWorld,'Calibrated travel minimum':spatial.travelMin,'Calibrated travel maximum':spatial.travelMax,'Calibrated travel width/height/depth':spatial.travelDimensions,'Observed world travel minimum':spatial.observedTravelMin,'Observed world travel maximum':spatial.observedTravelMax,'Observed travel dimensions':spatial.observedTravelDimensions,'Normalized radar X/depth':spatial.radarNormalized,
  'FORCE FIELD / actual shader radius':spatial.influenceRadius,'Radius % of target characteristic radius':spatial.radiusPercentOfTarget,'Active sample / total population':`${m.sampleCount??'unavailable'} / ${m.population??'unavailable'}`,
  'Samples inside local radius':m.inside,'Estimated population inside local radius':m.estimatedInsideCount,'Sample coverage %':m.insidePercent,'Samples with meaningful force':m.meaningful,'Estimated population with meaningful force':m.estimatedMeaningfulCount,'Sample meaningful force %':m.meaningfulPercent,
  'Average interaction acceleration (pre-cap)':m.interactionAverage,'Maximum sampled interaction acceleration (pre-cap)':m.interactionMaximum,'Average restoring spring + damping acceleration':m.restorationAverage,'Maximum sampled restoring acceleration':m.restorationMaximum,'Interaction / restoration ratio':m.ratio,'Average displacement from target':m.deformationAverage,'Maximum sampled displacement from target':m.deformationMaximum,
  'GPU STATUS / texture dimensions':spatial.textureDimensions,'Texture precision / backend':spatial.precision,'Renderer pixel ratio':spatial.rendererPixelRatio,'Model/world scale':spatial.modelScale,'Model matrix':spatial.modelMatrix,'Camera position':spatial.cameraPosition,'Camera FOV':spatial.cameraFov,'Actual frame delta (s)':spatial.frameDelta,'Clamped frame delta (s)':spatial.clampedFrameDelta,'Integration timestep (s)':spatial.integrationStep,'Integration steps this frame':spatial.integrationSteps,'Integrated delta this frame (s)':spatial.integratedDelta,'Diagnostic mode':spatial.mode
 };
 return <Panel title="Particle Spatial Diagnostics" eyebrow="DEVELOPER ONLY / SAMPLED GPU READBACK">
  <Toggle label="Enable spatial diagnostics" checked={spatialEnabled} onChange={enabled=>useParticles.setState({spatialEnabled:enabled,spatialMode:'Off'})}/>
  <label className="select-label">Diagnostic mode<select aria-label="Diagnostic mode" disabled={!spatialEnabled} value={spatialMode} onChange={e=>useParticles.setState({spatialMode:e.target.value as SpatialMode})}>{['Off','Attractor Sweep','Uniform Field','Force Visualization'].map(mode=><option key={mode}>{mode}</option>)}</select></label>
  <p className="hint">Readbacks run at most once per 2 seconds, only while enabled. Values are snapshots and may be up to 2 seconds older than the live overlay. Bounds, sphere, counts and force statistics estimate the population from 256 stratified texture samples; sample counts are measured. Meaningful force: raw interaction acceleration at least 0.1 simulation units/s^2. Force colors use the simulation shader: blue below 0.1, yellow at 1, red at 5. Debug modes and readbacks stop in exhibition. Off resumes sensor input.</p>
  <dl className="interaction-readout">{Object.entries(rows).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{display(value)}</dd></div>)}</dl>
  <details><summary>Actual shader uniforms at measurement</summary><pre>{JSON.stringify(spatial.uniforms,null,2)}</pre></details>
 </Panel>;
}
