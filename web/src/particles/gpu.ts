import * as THREE from 'three';
import type {ParticleConfig,Formation} from './config';
import type {ParticleInput} from './adapter';
import {formationTargets,morphEase,randomFor,targetBounds,blendBounds,type FormationBounds} from './formations';
import {summarizeSpatial,type SpatialMeasurement} from './spatial';
import {falloffPower,spatialInfluence,globalEnvelope} from './coverage';
import {quadVertex,copyFragment,velocityFragment,positionFragment} from './shaders';

export interface Capabilities {float:boolean;half:boolean;renderer:string;maxTexture:number}
export function detectCapabilities(renderer:THREE.WebGLRenderer):Capabilities {
  const gl=renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  // Verify actual framebuffer completeness instead of extension presence alone.
  function probe(type:THREE.TextureDataType){
    const rt=new THREE.WebGLRenderTarget(4,4,{type,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});
    const previous=renderer.getRenderTarget();let ok=false;
    try{renderer.setRenderTarget(rt);ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;}catch{ok=false;}
    finally{renderer.setRenderTarget(previous);rt.dispose();}return ok;
  }
  const colorFloat=!!gl.getExtension('EXT_color_buffer_float');
  const float=colorFloat&&probe(THREE.FloatType),half=(colorFloat||!!gl.getExtension('EXT_color_buffer_half_float'))&&probe(THREE.HalfFloatType);
  return {float,half,renderer:String(ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)),maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE)};
}
export function texture(data:Float32Array,size:number){const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.needsUpdate=true;return t;}
export class FullscreenPass {
  private scene=new THREE.Scene();private camera=new THREE.Camera();private geometry=new THREE.PlaneGeometry(2,2);private mesh:THREE.Mesh;
  constructor(){this.mesh=new THREE.Mesh(this.geometry);this.scene.add(this.mesh);}
  draw(renderer:THREE.WebGLRenderer,material:THREE.ShaderMaterial,target:THREE.WebGLRenderTarget|null){this.mesh.material=material;renderer.setRenderTarget(target);renderer.render(this.scene,this.camera);}
  dispose(){this.geometry.dispose();(this.mesh.material as THREE.Material).dispose();}
}
export interface Simulation {
  readonly count:number;readonly size:number;readonly cpuPositions:Float32Array|null;
  readonly positionTexture:THREE.Texture|null;readonly velocityTexture:THREE.Texture|null;
  bounds:(time:number)=>FormationBounds;
  forceUniforms:Record<string,number|number[]|boolean>;
  sample?:()=>Float32Array;
  measure?:(now:number)=>SpatialMeasurement;
  forceTexture?:()=>THREE.Texture;
  releaseDiagnostics?:()=>void;
  formation:(formation:Formation,now:number,duration:number)=>void;
  step:(dt:number,time:number,config:ParticleConfig,input:ParticleInput)=>void;
  dispose:()=>void;
}
class Targets {
  readonly size:number;readonly capacity:number;readonly a:THREE.DataTexture;readonly b:THREE.DataTexture;
  private fromBounds:FormationBounds;private toBounds:FormationBounds;
  bounds(time:number){return blendBounds(this.fromBounds,this.toBounds,this.mix(time));}
  from:Float32Array;to:Float32Array;private started=0;private duration=1;
  constructor(count:number,formation:Formation){this.size=Math.ceil(Math.sqrt(count));this.capacity=this.size*this.size;this.from=formationTargets(count,formation,this.capacity);this.to=this.from.slice();this.fromBounds=targetBounds(this.from);this.toBounds=this.fromBounds;this.a=texture(this.from,this.size);this.b=texture(this.to,this.size);}
  mix(time:number){return morphEase((time-this.started)/this.duration);}
  change(formation:Formation,now:number,duration:number){const blend=this.mix(now);for(let i=0;i<this.from.length;i++)this.from[i]+=(this.to[i]-this.from[i])*blend;this.to.set(formationTargets(this.capacity,formation,this.capacity));this.fromBounds=targetBounds(this.from);this.toBounds=targetBounds(this.to);this.a.needsUpdate=this.b.needsUpdate=true;this.started=now;this.duration=duration;}
  dispose(){this.a.dispose();this.b.dispose();}
}
export function forceValues(c:ParticleConfig,input:ParticleInput):Record<string,number|number[]|boolean> {
  return {uniformField:input.uniformField?1:0,falloffPower:falloffPower(c.coverage),globalRadius:input.globalRadius??input.radius*2,
    globalStrength:c.coverage.global*c.coverage.balance*2,localStrength:(1-c.coverage.balance)*2,dragForce:c.response.drag,attractionForce:c.response.attraction,expansionForce:c.response.expansion,
    vortexForce:c.response.vortex,turbulenceForce:c.response.turbulence,restorationWeight:c.response.restoration,
    approach:input.approach??0,pulseAge:input.pulseAge??10,pulseForce:c.response.pulseStrength};
}
export class GPUSimulation implements Simulation {
  forceUniforms:Record<string,number|number[]|boolean>={};
  readonly size:number;readonly cpuPositions=null;private targets:Targets;private index=0;
  private positions:THREE.WebGLRenderTarget[];private velocities:THREE.WebGLRenderTarget[];
  private velocity:THREE.ShaderMaterial;private position:THREE.ShaderMaterial;private pass=new FullscreenPass();
  private diagnosticTarget:THREE.WebGLRenderTarget|null=null;private diagnosticPositions:THREE.WebGLRenderTarget|null=null;private forceTarget:THREE.WebGLRenderTarget|null=null;
  private diagnosticCopy:THREE.ShaderMaterial|null=null;
  private debugTarget(size:number){return new THREE.WebGLRenderTarget(size,size,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false});}
  private drawForces(target:THREE.WebGLRenderTarget){
    const u=this.velocity.uniforms,previous=this.renderer.getRenderTarget(),positions=u.positions.value,velocities=u.velocities.value;
    try{u.positions.value=this.positionTexture;u.velocities.value=this.velocityTexture;u.diagnosticPass.value=1;this.pass.draw(this.renderer,this.velocity,target);}
    finally{u.diagnosticPass.value=0;u.positions.value=positions;u.velocities.value=velocities;this.renderer.setRenderTarget(previous);}
  }
  forceTexture(){this.forceTarget??=this.debugTarget(this.size);this.drawForces(this.forceTarget);return this.forceTarget.texture;}
  measure(now:number){
    this.diagnosticTarget??=this.debugTarget(16);this.diagnosticPositions??=this.debugTarget(16);
    this.diagnosticCopy??=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:copyFragment,uniforms:{source:{value:null}},depthTest:false,depthWrite:false});
    const previous=this.renderer.getRenderTarget(),positions=new Float32Array(1024).fill(NaN),forces=new Float32Array(1024).fill(NaN);
    try{
      this.drawForces(this.diagnosticTarget);this.diagnosticCopy.uniforms.source.value=this.positionTexture;this.pass.draw(this.renderer,this.diagnosticCopy,this.diagnosticPositions);
      this.renderer.readRenderTargetPixels(this.diagnosticTarget,0,0,16,16,forces);this.renderer.readRenderTargetPixels(this.diagnosticPositions,0,0,16,16,positions);
      const error=this.renderer.getContext().getError();if(error!==0)throw new Error(`GPU readback error ${error}`);
      return summarizeSpatial(positions,forces,this.count,Number(this.velocity.uniforms.radius.value),now);
    }finally{this.renderer.setRenderTarget(previous);}
  }
  releaseDiagnostics(){this.diagnosticTarget?.dispose();this.diagnosticPositions?.dispose();this.forceTarget?.dispose();this.diagnosticCopy?.dispose();this.diagnosticTarget=this.diagnosticPositions=this.forceTarget=null;this.diagnosticCopy=null;}
  sample(){const out=new Float32Array(8*8*4);this.renderer.readRenderTargetPixels(this.positions[this.index],0,0,8,8,out);return out;}
  get positionTexture(){return this.positions[this.index].texture;}get velocityTexture(){return this.velocities[this.index].texture;}
  constructor(private renderer:THREE.WebGLRenderer,readonly count:number,formation:Formation,type:THREE.TextureDataType){
    this.targets=new Targets(count,formation);this.size=this.targets.size;
    const options={type,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false};
    this.positions=[new THREE.WebGLRenderTarget(this.size,this.size,options),new THREE.WebGLRenderTarget(this.size,this.size,options)];
    this.velocities=this.positions.map(()=>new THREE.WebGLRenderTarget(this.size,this.size,options));
    const initial=this.targets.from.slice(),vel=new Float32Array(initial.length);
    for(let i=0;i<this.targets.capacity;i++){initial[i*4+3]=randomFor(i,3)*12;vel[i*4+3]=randomFor(i);}
    const posTexture=texture(initial,this.size),velTexture=texture(vel,this.size);
    const copy=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:copyFragment,uniforms:{source:{value:posTexture}},depthTest:false,depthWrite:false});
    for(const p of this.positions)this.pass.draw(renderer,copy,p);
    copy.uniforms.source.value=velTexture;for(const v of this.velocities)this.pass.draw(renderer,copy,v);
    renderer.setRenderTarget(null);copy.dispose();posTexture.dispose();velTexture.dispose();
    const uniforms:Record<string,THREE.IUniform>={positions:{value:null},velocities:{value:null},targetA:{value:this.targets.a},targetB:{value:this.targets.b},attractor:{value:new THREE.Vector3()},direction:{value:new THREE.Vector3()}};
    for(const name of ['dt','time','morph','flow','turbulence','magnetic','repulsion','vortex','shape','damping','accelerationLimit','velocityLimit','boundaryRadius','activity','motion','proximity','pulse','radius','dragForce','attractionForce','expansionForce','vortexForce','turbulenceForce','restorationWeight','approach','pulseAge','pulseForce','falloffPower','globalRadius','globalStrength','localStrength','uniformField','diagnosticPass','diagnosticCount','textureSide'])uniforms[name]={value:0};uniforms.boundary={value:true};uniforms.diagnosticCount.value=count;uniforms.textureSide.value=this.size;
    this.velocity=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:velocityFragment,uniforms,depthTest:false,depthWrite:false});
    this.position=new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader:positionFragment,uniforms:{positions:{value:null},velocities:{value:null},dt:{value:1/60}},depthTest:false,depthWrite:false});
  }
  bounds(time:number){return this.targets.bounds(time);}
  formation(f:Formation,now:number,duration:number){this.targets.change(f,now,duration);}
  step(dt:number,time:number,c:ParticleConfig,input:ParticleInput){
    const next=1-this.index,u=this.velocity.uniforms;
    for(const key of ['flow','turbulence','magnetic','repulsion','vortex','shape','damping','accelerationLimit','velocityLimit','boundaryRadius','boundary'] as const)u[key].value=c[key];
    for(const key of ['activity','motion','proximity','pulse','radius'] as const)u[key].value=input[key];
    for(const [key,value] of Object.entries(forceValues(c,input)))u[key].value=value;
    u.positions.value=this.positions[this.index].texture;u.velocities.value=this.velocities[this.index].texture;
    u.dt.value=dt;u.time.value=time;u.morph.value=this.targets.mix(time);u.attractor.value.fromArray(input.position);u.direction.value.fromArray(input.direction);
    this.forceUniforms=Object.fromEntries(Object.entries(u).filter(([,v])=>typeof v.value==='number'||typeof v.value==='boolean'||v.value instanceof THREE.Vector3).map(([k,v])=>[k,v.value instanceof THREE.Vector3?v.value.toArray():v.value]));
    this.pass.draw(this.renderer,this.velocity,this.velocities[next]);
    this.position.uniforms.positions.value=this.positions[this.index].texture;this.position.uniforms.velocities.value=this.velocities[next].texture;this.position.uniforms.dt.value=dt;
    this.pass.draw(this.renderer,this.position,this.positions[next]);this.index=next;
  }
  dispose(){this.releaseDiagnostics();this.targets.dispose();for(const rt of [...this.positions,...this.velocities])rt.dispose();this.velocity.dispose();this.position.dispose();this.pass.dispose();}
}
/** Reduced mode: one batched 10k point buffer, bounded fixed-step CPU integration. */
export class CPUSimulation implements Simulation {
  forceUniforms:Record<string,number|number[]|boolean>={};
  readonly size:number;readonly cpuPositions:Float32Array;readonly positionTexture=null;readonly velocityTexture=null;
  private velocities:Float32Array;private targets:Targets;
  constructor(readonly count:number,formation:Formation){this.targets=new Targets(count,formation);this.size=this.targets.size;this.cpuPositions=new Float32Array(count*3);this.velocities=new Float32Array(count*3);for(let i=0;i<count;i++)for(let j=0;j<3;j++)this.cpuPositions[i*3+j]=this.targets.from[i*4+j];}
  bounds(time:number){return this.targets.bounds(time);}
  formation(f:Formation,now:number,duration:number){this.targets.change(f,now,duration);}
  step(dt:number,time:number,c:ParticleConfig,input:ParticleInput){
    this.forceUniforms={...forceValues(c,input),activity:input.activity,motion:input.motion,radius:input.radius,attractor:[...input.position],direction:[...input.direction]};
    const blend=this.targets.mix(time),p=this.cpuPositions,v=this.velocities,r=c.response;
    for(let i=0;i<this.count;i++){
      const k=i*3,t=i*4,x=p[k],y=p[k+1],z=p[k+2],dx=input.position[0]-x,dy=input.position[1]-y,dz=input.position[2]-z;
      const distance=Math.max(.01,Math.hypot(dx,dy,dz)),falloff=spatialInfluence(distance,input.radius,falloffPower(c.coverage))*(1-c.coverage.balance)*2;
      const approach=input.approach??0,compression=Math.max(.62,Math.min(1.38,1-approach*input.activity*.38));
      const restoring=c.shape*(1+(r.restoration-1)*input.motion),wave=Math.exp(-Math.pow((distance-(input.pulseAge??10)*5)/.45,2));
      const inner=Math.min(1,distance/Math.max(.01,input.radius*.18));
      const radial=(falloff*input.activity*(c.magnetic*.25+Math.max(approach,0)*r.attraction*3-Math.max(-approach,0)*r.expansion*3)-c.repulsion*input.activity*(1-inner*inner*(3-2*inner))-r.pulseStrength*input.pulse*wave*8)/distance;
      const qx=x-input.position[0],qz=z-input.position[2],orbit=1/Math.max(1,Math.hypot(qx,qz)),noiseTime=time*.22;
      const curl=[-.9*Math.sin(x*.8+noiseTime*.5)*Math.sin(y*.72)-Math.cos(z*.8+noiseTime*.7)*Math.cos(x*.64),-.7*Math.sin(y*.8+noiseTime)*Math.sin(z*.56)-Math.cos(x*.8+noiseTime*.5)*Math.cos(y*.72),-.8*Math.sin(z*.8+noiseTime*.7)*Math.sin(x*.64)-Math.cos(y*.8+noiseTime)];
      const accel=[0,0,0],delta=[dx,dy,dz],swirl=[-qz*orbit,0,qx*orbit],handedness=input.direction[0]/(1+Math.abs(input.direction[0]));
      const len=Math.hypot(x,y,z)||.01;
      const broad=globalEnvelope(len,input.globalRadius??input.radius*2)*c.coverage.global*c.coverage.balance*2*input.motion*input.activity*r.drag;
      const variation=.65+.25*Math.sin(x*.7+z*.4+time*.3);
      const directionLength=Math.hypot(...input.direction),fluidLimit=Math.min(1,3/Math.max(.001,directionLength));
      const eddy=[Math.sin(z*.8+time*.2),Math.sin(x*.6-z*.5),Math.cos(x*.7+time*.2)];
      for(let j=0;j<3;j++){
        const target=this.targets.from[t+j]+(this.targets.to[t+j]-this.targets.from[t+j])*blend;
        accel[j]=(target*compression-p[k+j])*restoring-v[k+j]*Math.sqrt(restoring)*.25+curl[j]*(c.flow*.48+r.turbulence*input.motion*falloff*2)+delta[j]*radial+swirl[j]*(c.vortex*.25+r.vortex*handedness*input.motion*falloff*4)+input.direction[j]*r.drag*input.activity*falloff*(.7+.6*randomFor(i))+Math.sin(p[k+(j+1)%3]*3+time)*c.turbulence*.22;
        if(j===0&&input.uniformField)accel[j]+=.6;
        accel[j]+=broad*fluidLimit*(input.direction[j]*variation+eddy[j]*directionLength*.22);
        accel[j]-=p[k+j]/Math.max(1,len)*approach*input.activity*(approach>0?r.attraction:r.expansion)*.9;
        if(c.boundary)accel[j]-=p[k+j]/len*Math.max(0,len-c.boundaryRadius)*4;
      }
      const limit=Math.min(1,c.accelerationLimit/Math.max(.001,Math.hypot(...accel)));
      for(let j=0;j<3;j++)v[k+j]=v[k+j]*Math.exp(-c.damping*dt)+accel[j]*limit*dt;
      const speedLimit=Math.min(1,c.velocityLimit/Math.max(.001,Math.hypot(v[k],v[k+1],v[k+2])));
      for(let j=0;j<3;j++){v[k+j]*=speedLimit;p[k+j]+=v[k+j]*dt;}
    }
  }
  dispose(){this.targets.dispose();}
}
