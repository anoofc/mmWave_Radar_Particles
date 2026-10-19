import type { Formation } from './config';
export function randomFor(index:number,salt=0):number {const n=Math.sin((index+1)*127.1+salt*311.7)*43758.5453;return n-Math.floor(n);}
/** Stable deterministic targets. Each texel is XYZ + a persistent seed. */
export function formationTargets(count:number,formation:Formation,capacity=count):Float32Array {
  const out=new Float32Array(capacity*4),golden=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<capacity;i++){
    const u=randomFor(i),v=randomFor(i,1),w=randomFor(i,2),a=i*golden;
    let x=0,y=0,z=0;
    switch(formation){
      case 'sphere':{const h=1-2*(i+.5)/capacity,r=2.6*Math.sqrt(Math.max(0,1-h*h));x=r*Math.cos(a);y=2.6*h;z=r*Math.sin(a);break;}
      case 'torus':{const t=2*Math.PI*v,r=.62+.22*w; x=(2.2+r*Math.cos(t))*Math.cos(a);y=r*Math.sin(t);z=(2.2+r*Math.cos(t))*Math.sin(a);break;}
      case 'helix':{const h=i/Math.max(1,capacity-1),t=h*Math.PI*8,thickness=(u-.5)*.35;x=(1.6+thickness)*Math.cos(t);y=(h-.5)*5;z=(1.6+thickness)*Math.sin(t);break;}
      case 'galaxy':{const r=Math.sqrt(u)*3.5,t=r*1.8+(i%4)*Math.PI/2+(v-.5)*.5;x=r*Math.cos(t);y=(w-.5)*.35*(1-r/4);z=r*Math.sin(t);break;}
      case 'wave':x=(u-.5)*7;z=(v-.5)*5;y=Math.sin(x*1.2)*Math.cos(z*1.3)*.5+(w-.5)*.12;break;
      case 'cloud':{const r=Math.cbrt(u)*2.5,h=2*v-1,s=Math.sqrt(1-h*h);x=r*s*Math.cos(a)*1.25;y=r*h*.8;z=r*s*Math.sin(a);break;}
    }
    out[i*4]=x;out[i*4+1]=y;out[i*4+2]=z;out[i*4+3]=u;
  }
  return out;
}
export function morphEase(t:number):number {const a=Math.max(0,Math.min(1,t));return a*a*(3-2*a);}

export interface FormationBounds { min:[number,number,number]; max:[number,number,number]; radius:number }
/** Scan generated targets only when they change; never read back the GPU for bounds. */
export function targetBounds(data:Float32Array):FormationBounds {
  const min:[number,number,number]=[Infinity,Infinity,Infinity],max:[number,number,number]=[-Infinity,-Infinity,-Infinity];let radius=0;
  for(let i=0;i<data.length;i+=4){for(let j=0;j<3;j++){min[j]=Math.min(min[j],data[i+j]);max[j]=Math.max(max[j],data[i+j]);}radius=Math.max(radius,Math.hypot(data[i],data[i+1],data[i+2]));}
  return {min,max,radius};
}
export function blendBounds(a:FormationBounds,b:FormationBounds,t:number):FormationBounds {
  return {min:a.min.map((v,i)=>v+(b.min[i]-v)*t) as [number,number,number],max:a.max.map((v,i)=>v+(b.max[i]-v)*t) as [number,number,number],radius:a.radius+(b.radius-a.radius)*t};
}

/** World-space AABB of the rotating sculpture, for the physical radar mapping. */
export function rotatedBounds(bounds:FormationBounds,rotation:number):FormationBounds {
  const c=Math.cos(rotation),s=Math.sin(rotation),min:[number,number,number]=[Infinity,bounds.min[1],Infinity],max:[number,number,number]=[-Infinity,bounds.max[1],-Infinity];
  for(const x of [bounds.min[0],bounds.max[0]])for(const z of [bounds.min[2],bounds.max[2]]){
    const wx=c*x+s*z,wz=-s*x+c*z;min[0]=Math.min(min[0],wx);max[0]=Math.max(max[0],wx);min[2]=Math.min(min[2],wz);max[2]=Math.max(max[2],wz);
  }
  return {min,max,radius:bounds.radius};
}
