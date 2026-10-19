import {defaultResponse,demoPosition,type ResponseConfig} from './response';
import type { InteractionState } from '../core/tracking';
import {defaultCoverage,type CoverageConfig,type MappingConfig} from './config';
import type {FormationBounds} from './formations';
export interface Calibration {invertX:boolean;invertY:boolean;range:number}
export interface ParticleInput { position:[number,number,number];direction:[number,number,number];activity:number;motion:number;proximity:number;pulse:number;radius:number; uniformField?:boolean; globalRadius?:number; approach?:number; pulseAge?:number }
export const clamp=(x:number,min=0,max=1)=>Math.max(min,Math.min(max,Number.isFinite(x)?x:0));
/** Keep the physical attractor fixed in world space while the sculpture rotates. */
export function sceneInput(input:ParticleInput,rotation:number):ParticleInput {
  const c=Math.cos(rotation),s=Math.sin(rotation);
  const rotate=(v:[number,number,number]):[number,number,number]=>[c*v[0]-s*v[2],v[1],s*v[0]+c*v[2]];
  return {...input,position:rotate(input.position),direction:rotate(input.direction)};
}
export function mapInteraction(state:InteractionState,config:MappingConfig,calibration:Calibration,response:ResponseConfig=defaultResponse,bounds?:FormationBounds,coverage:CoverageConfig=defaultCoverage) {
  const x=state.primary?.x??0,y=state.primary?.y??config.depthMax;
  const invertX=config.phase1Calibration?calibration.invertX:config.invertX;
  const invertY=config.phase1Calibration?calibration.invertY:config.invertY;
  const range=config.phase1Calibration?calibration.range:config.horizontalRange;
  const nx=clamp(.5+(invertX?-(x-response.radarCenterX):x-response.radarCenterX)/(2*range));
  const rawDepth=clamp((y-config.depthMin)/(config.depthMax-config.depthMin));
  const depth=invertY?1-rawDepth:rawDepth;
  const width=bounds?bounds.max[0]-bounds.min[0]:response.width,depthSize=bounds?bounds.max[2]-bounds.min[2]:response.depthSize;
  const center=bounds?bounds.min.map((v,i)=>(v+bounds.max[i])/2):[0,0,0];
  return {radar:{x,y},normalized:{x:nx,depth},screen:state.screen,
    world:[center[0]+(nx-.5)*width*(bounds?response.width/8:1)*coverage.movementRange*config.worldScale+response.offsetX,center[1]+response.offsetY,center[2]+(.5-depth)*depthSize*(bounds?response.depthSize/6:1)*coverage.movementRange*config.worldScale+response.offsetZ] as [number,number,number],proximity:1-depth,
    direction:[clamp(state.velocity.x*(invertX?-1:1),-3,3),0,clamp(-state.velocity.y*(invertY?-1:1),-3,3)] as [number,number,number]};
}
export class InteractionAdapter {
  private testMin=[Infinity,Infinity,Infinity];private testMax=[-Infinity,-Infinity,-Infinity];
  private state:InteractionState|null=null; private received=-Infinity; private lastMeasurement=-Infinity;
  private lastPulse=-Infinity; private lastEnergy=0; private demoStart:number|null=null; private demoFrame=-1; private demoPrevious:[number,number]|null=null;
  private target:[number,number,number]=[0,0,0]; private velocity:[number,number,number]=[0,0,0];
  private filtered:{x:number;y:number}|null=null; private identity:number|undefined; private confirmedSpeed=0; private confirmedApproach=0; private baseline=false;
  diagnostics:Record<string,unknown>={};
  readonly output:ParticleInput={position:[0,0,0],direction:[0,0,0],activity:0,motion:0,proximity:0,pulse:0,radius:2,approach:0,pulseAge:10};
  test(now:number,baseline=false){this.testMin=[Infinity,Infinity,Infinity];this.testMax=[-Infinity,-Infinity,-Infinity];this.demoStart=now;this.demoFrame=-1;this.demoPrevious=null;this.filtered=null;this.identity=undefined;this.lastMeasurement=-Infinity;this.confirmedSpeed=0;this.confirmedApproach=0;this.velocity=[0,0,0];this.lastEnergy=0;this.lastPulse=-Infinity;this.baseline=baseline;}
  stopTest(){this.demoStart=null;this.filtered=null;this.lastMeasurement=-Infinity;}
  accept(state:InteractionState,now:number){this.state=state;this.received=now;}
  step(dt:number,now:number,config:MappingConfig,calibration:Calibration,response:ResponseConfig=defaultResponse,cloudRadius=3.125,bounds?:FormationBounds,coverage:CoverageConfig=defaultCoverage):ParticleInput {
    dt=clamp(dt,0,.1);
    let s=this.state, received=this.received, testTime=this.demoStart===null?null:(now-this.demoStart)/1000;
    if(testTime!==null&&testTime>=16){this.stopTest();testTime=null;}
    if(testTime!==null){
      const frame=Math.floor(testTime*20),t=frame/20,demo=demoPosition(t),range=config.phase1Calibration?calibration.range:config.horizontalRange;
      const point:[number,number]=[response.radarCenterX+demo[0]/1.8*range,config.depthMin+(demo[1]-.3)/2.7*(config.depthMax-config.depthMin)];
      const prior=this.demoPrevious??point;
      if(frame!==this.demoFrame){this.demoPrevious=point;this.demoFrame=frame;}
      const delta=Math.max(.05,(t*1000-this.lastMeasurement)/1000);
      s={presence:true,primary:{x:point[0],y:point[1]},raw:{x:point[0],y:point[1]},screen:null,
        velocity:{x:(point[0]-prior[0])/delta,y:(point[1]-prior[1])/delta},rawVelocity:{x:(point[0]-prior[0])/delta,y:(point[1]-prior[1])/delta},
        movementIntensity:0,freshness:1,tracking:'tracking',timestamp:t*1000,measurementAt:t*1000,targetId:-1};received=now;
    }
    const age=s?.measurementAt===undefined?now-received:testTime!==null?testTime*1000-s.measurementAt:now-s.measurementAt;
    const live=!!s&&Number.isFinite(s.timestamp)&&!!s.primary&&Number.isFinite(s.primary.x)&&Number.isFinite(s.primary.y)&&s.presence!==false&&s.tracking==='tracking'&&s.freshness>0&&now-received<1500&&age<1500;
    const r=testTime!==null&&this.baseline?{...response,amplification:1}:response;
    const measurement=s?.measurementId??s?.measurementAt??s?.timestamp??-Infinity;
    if(live&&s?.primary&&measurement!==this.lastMeasurement){
      const raw=s.raw??s.primary,first=!this.filtered||s.targetId!==this.identity||measurement<this.lastMeasurement||measurement-this.lastMeasurement>700;
      const seconds=clamp(s.measurementDelta??(measurement-this.lastMeasurement)/1000,.001,.5);
      const previous=this.filtered?{...this.filtered}:null;
      const speed=Math.min(5,Math.hypot((s.rawVelocity??s.velocity).x,(s.rawVelocity??s.velocity).y));
      if(first)this.filtered={...raw};
      else if(Math.hypot(raw.x-this.filtered!.x,raw.y-this.filtered!.y)>=r.deadZone){
        const alpha=1-Math.exp(-seconds/(r.smoothing/(1+speed*2)));
        this.filtered!.x+=(raw.x-this.filtered!.x)*alpha;this.filtered!.y+=(raw.y-this.filtered!.y)*alpha;
      }
      const mapped=mapInteraction({...s,primary:this.filtered},config,calibration,r,bounds,coverage);this.target=mapped.world;
      const vx=clamp(!first&&previous?(this.filtered!.x-previous.x)/seconds:0,-5,5),vy=clamp(!first&&previous?(this.filtered!.y-previous.y)/seconds:0,-5,5);
      const invX=config.phase1Calibration?calibration.invertX:config.invertX;
      const invY=config.phase1Calibration?calibration.invertY:config.invertY;
      // Metres/second -> world units/second; amplification changes force energy, never target location.
      const range=config.phase1Calibration?calibration.range:config.horizontalRange;
      this.velocity=first?[0,0,0]:[clamp(vx*(invX?-1:1)*(bounds?(bounds.max[0]-bounds.min[0])*r.width/8:r.width)*coverage.movementRange*config.worldScale/(2*range)*r.horizontal*r.amplification*config.sensitivity,-12,12),0,
        clamp(-vy*(invY?-1:1)*(bounds?(bounds.max[2]-bounds.min[2])*r.depthSize/6:r.depthSize)*coverage.movementRange*config.worldScale/(config.depthMax-config.depthMin)*r.depth*r.amplification*config.sensitivity,-12,12)];
      this.confirmedSpeed=first?0:Math.hypot(vx,vy);this.confirmedApproach=first?0:clamp(-vy*r.depth,-1,1);
      this.lastMeasurement=measurement;this.identity=s.targetId;
      this.diagnostics={...this.diagnostics,raw,filtered:{...this.filtered!},normalized:mapped.normalized,rawVelocity:s.rawVelocity??s.velocity,filteredVelocity:{x:vx,y:vy}};
    }
    // A held velocity expires independently of dashboard refreshes. No extrapolated measurements.
    const decay=Math.exp(-Math.max(0,age-100)/180),speed=live?this.confirmedSpeed*decay:0;
    const energy=clamp((speed-r.speedMin)/(r.speedMax-r.speedMin));
    const smoothing=1-Math.exp(-dt/(energy>this.output.motion?r.attack:r.release));
    this.output.motion+=(energy-this.output.motion)*smoothing;
    if(live&&energy>=r.pulseThreshold&&this.lastEnergy<r.pulseThreshold&&now-this.lastPulse>1000){this.lastPulse=now;this.output.pulseAge=0;}
    this.lastEnergy=energy;this.output.pulseAge=(this.output.pulseAge??10)+dt;
    this.output.pulse=Number.isFinite(this.lastPulse)?Math.exp(-(this.output.pulseAge??10)*2.6):0;
    const alpha=1-Math.exp(-dt/.08);
    this.output.activity+=((live?clamp(s?.freshness??0):0)-this.output.activity)*(1-Math.exp(-dt/(live?r.attack:r.release)));
    this.output.proximity+=((live?mapInteraction(s!,config,calibration,r,bounds,coverage).proximity:0)-this.output.proximity)*alpha;
    this.output.approach=((this.output.approach??0)+((live?this.confirmedApproach*decay:0)-(this.output.approach??0))*alpha);
    const baseRadius=(bounds?.radius??cloudRadius)*r.radius;
    const desiredRadius=baseRadius*(1+(coverage.dynamic?coverage.expansion*this.output.motion:0));
    this.output.radius+=(desiredRadius-this.output.radius)*(1-Math.exp(-dt/.3));
    this.output.globalRadius=(bounds?.radius??cloudRadius)*({Local:1,Wide:1.75,'Full Field':2.5}[coverage.mode]);
    if(live&&s&&this.filtered)this.target=mapInteraction({...s,primary:this.filtered},config,calibration,r,bounds,coverage).world;
    for(let i=0;i<3;i++){
      if(live)this.output.position[i]+=(this.target[i]-this.output.position[i])*alpha;
      this.output.direction[i]+=((live?this.velocity[i]*decay:0)-this.output.direction[i])*alpha;
    }
    if(testTime!==null)for(let i=0;i<3;i++){this.testMin[i]=Math.min(this.testMin[i],this.output.position[i]);this.testMax[i]=Math.max(this.testMax[i],this.output.position[i]);}
    this.diagnostics={...this.diagnostics,testTravel:Number.isFinite(this.testMin[0])?{min:[...this.testMin],max:[...this.testMax]}:null,world:[...this.output.position],energy:this.output.motion,amplification:r.amplification,radius:this.output.radius,
      formationBounds:bounds,characteristicRadius:bounds?.radius??cloudRadius,globalRadius:this.output.globalRadius,coverage:coverage.mode,
      worldRange:bounds?{x:(bounds.max[0]-bounds.min[0])*r.width/8*coverage.movementRange*config.worldScale,z:(bounds.max[2]-bounds.min[2])*r.depthSize/6*coverage.movementRange*config.worldScale}:null,
      state:testTime!==null?`Test ${this.baseline?'baseline':'amplified'} ? ${testTime.toFixed(1)} s`:live?'Tracking':s?.tracking??'Idle',age:Number.isFinite(age)?Math.max(0,age):null};
    return this.output;
  }
}
