import {create} from 'zustand';
import {applyPreset,defaultConfig,exportConfig,importConfig,validateConfig,profiles,type ParticleConfig,type MappingConfig,type Quality} from './config';
import type {SpatialMode} from './spatial';
import {initialMetrics,type EngineMetrics} from './performance';
interface ParticleStore {
  spatialEnabled:boolean; spatialMode:SpatialMode; spatial:Record<string,unknown>;
  diagnostics:Record<string,unknown>;config:ParticleConfig;metrics:EngineMetrics;error:string;saved:string[];
  patch:(value:Partial<ParticleConfig>)=>void;map:(value:Partial<MappingConfig>)=>void;preset:(id:string)=>void;quality:(q:Quality)=>void;
  reset:()=>void;load:(text:string)=>void;save:(name:string)=>void;restore:(name:string)=>void;refreshSaved:()=>void;
}
const key='mr60-particles-config';const savedPrefix='mr60-particles-preset:';
function readInitial(){try{const text=localStorage.getItem(key);return text?importConfig(text):structuredClone(defaultConfig);}catch{return structuredClone(defaultConfig);}}
function persist(c:ParticleConfig){try{localStorage.setItem(key,exportConfig(c));}catch{/* Export remains available when storage is disabled. */}}
export const useParticles=create<ParticleStore>((set,get)=>({
  spatialEnabled:false,spatialMode:'Off',spatial:{},diagnostics:{},config:readInitial(),metrics:initialMetrics,error:'',saved:[],
  patch:value=>{try{const config=validateConfig({...get().config,...value});persist(config);set({config,error:''});}catch(e){set({error:String(e)});}},
  map:value=>get().patch({mapping:{...get().config.mapping,...value}}),
  preset:id=>{try{get().patch(applyPreset(get().config,id));}catch(e){set({error:String(e)});}},
  quality:q=>get().patch({quality:q,count:profiles[q].count}),
  reset:()=>get().patch(structuredClone(defaultConfig)),
  load:text=>{try{get().patch(importConfig(text));}catch(e){set({error:String(e)});}},
  refreshSaved:()=>{try{set({saved:Object.keys(localStorage).filter(k=>k.startsWith(savedPrefix)).map(k=>k.slice(savedPrefix.length))});}catch{set({saved:[]});}},
  save:name=>{try{const clean=name.trim().slice(0,48);if(!clean)throw new Error('Enter a preset name');localStorage.setItem(savedPrefix+clean,exportConfig(get().config));get().refreshSaved();set({error:''});}catch(e){set({error:String(e)});}},
  restore:name=>{try{const text=localStorage.getItem(savedPrefix+name);if(!text)throw new Error('Saved preset unavailable');get().load(text);}catch(e){set({error:String(e)});}}
}));
