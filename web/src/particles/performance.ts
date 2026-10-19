export class FixedStepClock {
  private accumulator=0;readonly step=1/60;readonly maxSteps=4;
  advance(delta:number,run:(dt:number)=>void){this.accumulator+=Math.min(Math.max(0,delta),.1);let count=0;while(this.accumulator>=this.step&&count<this.maxSteps){run(this.step);this.accumulator-=this.step;count++;}if(count===this.maxSteps)this.accumulator=0;return count;}
  reset(){this.accumulator=0;}
}
export class AdaptiveResolution {
  ratio=1;private low=0;private high=0;private changed=-Infinity;
  update(fps:number,seconds:number,now:number,maximum:number,enabled:boolean):number {
    if(!enabled){this.low=this.high=0;return this.ratio=maximum;}
    this.ratio=Math.min(maximum,this.ratio);
    this.low=fps<48?this.low+seconds:0;this.high=fps>58?this.high+seconds:0;
    if(now-this.changed<12000)return this.ratio;
    if(this.low>=5&&this.ratio>.6){this.ratio=Math.max(.6,this.ratio-.15);this.changed=now;this.low=this.high=0;}
    else if(this.high>=15&&this.ratio<maximum){this.ratio=Math.min(maximum,this.ratio+.1);this.changed=now;this.low=this.high=0;}
    return this.ratio;
  }
}
export interface EngineMetrics {
  status:'initializing'|'ready'|'context-lost'|'unavailable';backend:'GPU float32'|'GPU float16'|'CPU fallback'|'none';
  renderer:string;count:number;fps:number;frameMs:number;p95Ms:number;gpuMs:number|null;pixelRatio:number;width:number;height:number;textures:number;drawCalls:number;message:string;
}
export const initialMetrics:EngineMetrics={status:'initializing',backend:'none',renderer:'Detecting GPU',count:0,fps:0,frameMs:0,p95Ms:0,gpuMs:null,pixelRatio:1,width:0,height:0,textures:0,drawCalls:0,message:''};
