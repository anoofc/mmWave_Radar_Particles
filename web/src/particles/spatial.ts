import type {FormationBounds} from './formations';
export type SpatialMode='Off'|'Attractor Sweep'|'Uniform Field'|'Force Visualization';
export interface SpatialMeasurement {
 status:string;sampleCount:number;population:number;sampledAt:number;finite:boolean;
 bounds:FormationBounds;center:number[];dimensions:number[];sphereRadius:number;
 inside:number;insidePercent:number;meaningful:number;meaningfulPercent:number;estimatedInsideCount:number;estimatedMeaningfulCount:number;
 interactionAverage:number;interactionMaximum:number;restorationAverage:number;restorationMaximum:number;ratio:number|null;deformationAverage:number;deformationMaximum:number;
}
/** XYZ and force RGBA come from the same stratified GPU UVs; exclude texture padding. */
export function summarizeSpatial(positions:Float32Array,forces:Float32Array,population:number,radius:number,sampledAt:number):SpatialMeasurement {
 const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];
 let count=0,inside=0,meaningful=0,ia=0,im=0,ra=0,rm=0,da=0,dm=0,finite=true;const points:number[][]=[];
 for(let i=0;i<forces.length;i+=4){if(forces[i]<0)continue;const p=[positions[i],positions[i+1],positions[i+2]],f=Array.from(forces.subarray(i,i+4));
  if(![...p,...f].every(Number.isFinite)){finite=false;continue;}points.push(p);count++;
  for(let j=0;j<3;j++){min[j]=Math.min(min[j],p[j]);max[j]=Math.max(max[j],p[j]);}
  inside+=f[2]<=radius?1:0;meaningful+=f[0]>=.1?1:0;ia+=f[0];im=Math.max(im,f[0]);ra+=f[1];rm=Math.max(rm,f[1]);da+=f[3];dm=Math.max(dm,f[3]);
 }
 if(!count)throw new Error('No finite active GPU samples');
 const center=min.map((v,i)=>(v+max[i])/2),dimensions=min.map((v,i)=>max[i]-v);
 const sphereRadius=Math.max(...points.map(p=>Math.hypot(...p.map((v,i)=>v-center[i]))));
 return {status:'Measured 16x16 stratified GPU sample; population coverage and bounds are estimates',sampleCount:count,population,sampledAt,finite,bounds:{min,max,radius:sphereRadius},center,dimensions,sphereRadius,
 inside,insidePercent:inside/count*100,meaningful,meaningfulPercent:meaningful/count*100,estimatedInsideCount:Math.round(inside/count*population),estimatedMeaningfulCount:Math.round(meaningful/count*population),interactionAverage:ia/count,interactionMaximum:im,restorationAverage:ra/count,restorationMaximum:rm,ratio:ra>1e-8?ia/ra:null,deformationAverage:da/count,deformationMaximum:dm};
}
