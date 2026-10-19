import {defaultResponse,responseBounds,type ResponseConfig} from './response';
export const formations = ['sphere', 'torus', 'helix', 'galaxy', 'wave', 'cloud'] as const;
export type Formation = typeof formations[number];
export const paletteNames = ['glacier', 'nebula', 'ember', 'silver', 'custom'] as const;
export type Palette = typeof paletteNames[number];
export const qualities = ['low', 'medium', 'high', 'ultra'] as const;
export type Quality = typeof qualities[number];
export const profiles: Record<Quality, { count: number; dpr: number; bloomScale: number }> = {
  low: { count: 10000, dpr: .8, bloomScale: .25 }, medium: { count: 30000, dpr: 1, bloomScale: .35 },
  high: { count: 60000, dpr: 1.25, bloomScale: .5 }, ultra: { count: 100000, dpr: 1.5, bloomScale: .5 }
};
export interface MappingConfig {
  phase1Calibration: boolean; invertX: boolean; invertY: boolean; horizontalRange: number;
  depthMin: number; depthMax: number; worldScale: number; radius: number;
  sensitivity: number; smoothing: number; deadZone: number;
}
export interface CoverageConfig {
  mode: 'Local' | 'Wide' | 'Full Field'; global: number; balance: number; softness: number;
  dynamic: boolean; expansion: number; movementRange: number;
}
export const defaultCoverage: CoverageConfig = {mode:'Wide',global:.35,balance:.5,softness:1,dynamic:true,expansion:.65,movementRange:1};
export interface ParticleConfig {
  coverage: CoverageConfig;
  response: ResponseConfig; preset: string; formation: Formation; palette: Palette; colors: [string, string, string];
  quality: Quality; count: number; size: number; flow: number; turbulence: number;
  magnetic: number; repulsion: number; vortex: number; shape: number; damping: number;
  accelerationLimit: number; velocityLimit: number; boundary: boolean; boundaryRadius: number;
  morphDuration: number; rotation: number; bloom: number; trails: number; exposure: number;
  cameraDistance: number; autoMorph: boolean; adaptive: boolean; debug: boolean; mapping: MappingConfig;
}
export const defaultConfig: ParticleConfig = {
  coverage: {...defaultCoverage}, response: {...defaultResponse}, preset: 'magnetic-fluid', formation: 'cloud', palette: 'glacier', colors: ['#10a79f','#59ead7','#c5e9ff'],
  quality: 'high', count: 60000, size: 2.1, flow: .65, turbulence: .22,
  magnetic: 1.7, repulsion: .7, vortex: .75, shape: 1.1, damping: 1.25,
  accelerationLimit: 14, velocityLimit: 4, boundary: true, boundaryRadius: 7,
  morphDuration: 4, rotation: .06, bloom: .45, trails: .25, exposure: 1.15,
  cameraDistance: 13, autoMorph: false, adaptive: true, debug: false,
  mapping: { phase1Calibration: true, invertX: true, invertY: false, horizontalRange: 3,
    depthMin: .3, depthMax: 3, worldScale: 1, radius: 2.1, sensitivity: 1, smoothing: .65, deadZone: .025 }
};
export const palettes: Record<Palette, [string,string,string]> = {
  glacier:['#0b8e91','#4ce2ca','#b8ddff'], nebula:['#6452e8','#df56c1','#96b5ff'],
  ember:['#a55412','#e7ae42','#fff0be'], silver:['#536b8b','#b3c9df','#ffffff'], custom:defaultConfig.colors
};
type Preset = { id:string; name:string; description:string; values:Partial<ParticleConfig> };
export const presets: Preset[] = [
  {id:'magnetic-fluid', name:'Magnetic Fluid', description:'A luminous cloud pulled into liquid currents.', values:{formation:'cloud',flow:.65,turbulence:.22,magnetic:1.7,repulsion:.7,vortex:.75,shape:1.1,rotation:.06,palette:'glacier',autoMorph:false}},
  {id:'cosmic-vortex', name:'Cosmic Vortex', description:'Orbital ribbons around a shifting magnetic core.', values:{formation:'torus',flow:.65,turbulence:.18,magnetic:.9,repulsion:.4,vortex:2.4,shape:1.3,rotation:.1,palette:'nebula',autoMorph:false}},
  {id:'energy-burst', name:'Energy Burst', description:'A quiet sphere that releases energy with movement.', values:{formation:'sphere',flow:.2,turbulence:.1,magnetic:1,repulsion:2.1,vortex:.25,shape:2,rotation:.035,palette:'ember',autoMorph:false}},
  {id:'liquid-sculpture', name:'Liquid Sculpture', description:'Spring-bound forms dissolve and reform in flow.', values:{formation:'helix',flow:.35,turbulence:.16,magnetic:1,repulsion:.45,vortex:.45,shape:2.2,rotation:.09,palette:'glacier',autoMorph:true}},
  {id:'particle-ocean', name:'Particle Ocean', description:'A suspended wave field with visitor-driven ripples.', values:{formation:'wave',flow:.4,turbulence:.16,magnetic:1.3,repulsion:.6,vortex:.65,shape:2,rotation:0,palette:'glacier',autoMorph:false}},
  {id:'ambient-galaxy', name:'Ambient Galaxy', description:'Spiral arms drifting through a deep blue night.', values:{formation:'galaxy',flow:.22,turbulence:.08,magnetic:.5,repulsion:.2,vortex:.65,shape:1.7,rotation:.075,palette:'silver',autoMorph:false}}
];
export function applyPreset(config: ParticleConfig, id: string): ParticleConfig {
  const preset = presets.find(p=>p.id===id); if (!preset) throw new Error('Unknown visual preset');
  return validateConfig({...config,...preset.values,preset:id});
}
const bounds: Record<string,[number,number]> = {
  count:[10000,100000],size:[.5,6],flow:[0,3],turbulence:[0,3],magnetic:[0,5],repulsion:[0,5],vortex:[0,5],shape:[0,5],damping:[.1,5],
  accelerationLimit:[1,30],velocityLimit:[.2,10],boundaryRadius:[3,12],morphDuration:[.5,15],rotation:[0,.4],bloom:[0,1.5],trails:[0,.85],exposure:[.3,2.5],cameraDistance:[8,24]
};
const mappingBounds:Record<string,[number,number]> = {horizontalRange:[.25,10],depthMin:[0,5],depthMax:[.5,10],worldScale:[.25,2],radius:[.25,5],sensitivity:[.1,3],smoothing:[0,.95],deadZone:[0,.5]};
export function validateConfig(value: unknown): ParticleConfig {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error('Invalid particle configuration');
  const input=value as Record<string,unknown>;
  // Construct only known keys; don't retain prototype or arbitrary imported fields.
  const c=structuredClone(defaultConfig) as unknown as Record<string,unknown>;
  for(const key of Object.keys(c)) if(Object.hasOwn(input,key)) c[key]=input[key];
  for(const [key,[min,max]] of Object.entries(bounds)) if(typeof c[key]!=='number'||!Number.isFinite(c[key])||Number(c[key])<min||Number(c[key])>max) throw new Error(`Invalid ${key}: expected ${min}–${max}`);
  if (!Number.isInteger(c.count)) throw new Error('Particle count must be an integer');
  if (!formations.includes(c.formation as Formation)||!paletteNames.includes(c.palette as Palette)||!qualities.includes(c.quality as Quality)||!presets.some(p=>p.id===c.preset)) throw new Error('Unknown formation, palette, quality or preset');
  for(const key of ['boundary','autoMorph','adaptive','debug']) if(typeof c[key]!=='boolean') throw new Error(`Invalid ${key}`);
  if(!Array.isArray(c.colors)||c.colors.length!==3||!c.colors.every(color=>typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color))) throw new Error('Use three six-digit hex colors');
  if(!c.mapping||typeof c.mapping!=='object'||Array.isArray(c.mapping)) throw new Error('Invalid coordinate mapping');
  const m={...defaultConfig.mapping};
  for(const key of Object.keys(m)) if(Object.hasOwn(c.mapping,key)) (m as unknown as Record<string,unknown>)[key]=(c.mapping as Record<string,unknown>)[key];
  for(const [key,[min,max]] of Object.entries(mappingBounds)){const v=(m as unknown as Record<string,unknown>)[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid mapping ${key}`);}
  for(const key of ['phase1Calibration','invertX','invertY'])if(typeof (m as unknown as Record<string,unknown>)[key]!=='boolean')throw new Error(`Invalid mapping ${key}`);
  if(m.depthMax-m.depthMin<.2)throw new Error('Depth maximum must exceed minimum by at least 0.2 m');
  const response={...defaultResponse};
  if(input.response!==undefined&&(!input.response||typeof input.response!=='object'||Array.isArray(input.response)))throw new Error('Invalid response configuration');
  for(const key of Object.keys(response))if(input.response&&Object.hasOwn(input.response,key))(response as unknown as Record<string,unknown>)[key]=(input.response as Record<string,unknown>)[key];
  for(const [key,[min,max]] of Object.entries(responseBounds)){const v=response[key as keyof ResponseConfig];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid response ${key}`);}
  if(!['Subtle','Expressive','Dramatic','Custom'].includes(response.preset)||response.speedMax<=response.speedMin)throw new Error('Invalid response preset or speed thresholds');
  if(input.coverage!==undefined&&(!input.coverage||typeof input.coverage!=='object'||Array.isArray(input.coverage)))throw new Error('Invalid coverage');
  const coverage={...defaultCoverage};
  for(const key of Object.keys(coverage))if(input.coverage&&Object.hasOwn(input.coverage,key))(coverage as unknown as Record<string,unknown>)[key]=(input.coverage as Record<string,unknown>)[key];
  if(!['Local','Wide','Full Field'].includes(coverage.mode)||typeof coverage.dynamic!=='boolean')throw new Error('Invalid coverage mode or dynamic radius');
  for(const [key,min,max] of [['global',0,1],['balance',0,1],['softness',.25,3],['expansion',0,1.5],['movementRange',.25,2]] as const){const v=coverage[key];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid coverage ${key}`);}
  return {...c,coverage,response,mapping:m} as unknown as ParticleConfig;
}
export function exportConfig(c:ParticleConfig):string {return JSON.stringify({format:'mr60-particles',version:1,config:validateConfig(c)},null,2);}
export function importConfig(text:string):ParticleConfig {
  if(text.length>32768)throw new Error('Configuration exceeds 32 KB');
  const data=JSON.parse(text.replace(/^\uFEFF/,''));
  if(data.format!=='mr60-particles'||data.version!==1)throw new Error('Unsupported particle configuration');
  return validateConfig(data.config);
}
