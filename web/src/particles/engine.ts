import {useParticles} from './store';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {interactionAPI} from '../core/interaction';
import {InteractionAdapter,mapInteraction,sceneInput,type Calibration} from './adapter';
import {formations,palettes,profiles,type ParticleConfig} from './config';
import {GPUSimulation,CPUSimulation,detectCapabilities,type Simulation,type Capabilities} from './gpu';
import {CinematicPost} from './post';
import {AdaptiveResolution,FixedStepClock,initialMetrics,type EngineMetrics} from './performance';
import {pointVertex,pointFragment} from './shaders';
import {randomFor,rotatedBounds,targetBounds} from './formations';

class GPUTimer {
  private ext:{TIME_ELAPSED_EXT:number;GPU_DISJOINT_EXT:number}|null;private active:WebGLQuery|null=null;private pending:WebGLQuery[]=[];
  value:number|null=null;
  constructor(private gl:WebGL2RenderingContext){this.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2');}
  begin(){if(!this.ext||this.pending.length>=3)return;this.active=this.gl.createQuery();if(this.active)this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT,this.active);}
  end(){if(this.active&&this.ext){this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);this.pending.push(this.active);this.active=null;}}
  poll(){if(!this.ext)return;const disjoint=this.gl.getParameter(this.ext.GPU_DISJOINT_EXT);while(this.pending[0]&&this.gl.getQueryParameter(this.pending[0],this.gl.QUERY_RESULT_AVAILABLE)){const q=this.pending.shift()!;if(!disjoint)this.value=this.gl.getQueryParameter(q,this.gl.QUERY_RESULT)/1e6;this.gl.deleteQuery(q);}if(disjoint)this.value=null;}
  dispose(){for(const q of this.pending)this.gl.deleteQuery(q);this.pending=[];}
}
export class ParticleEngine {
  readonly canvas:HTMLCanvasElement;
  private renderer:THREE.WebGLRenderer;private scene=new THREE.Scene();private group=new THREE.Group();private camera:THREE.PerspectiveCamera;
  private controls:OrbitControls;private post!:CinematicPost;private simulation!:Simulation;private geometry!:THREE.BufferGeometry;private material!:THREE.ShaderMaterial;private points!:THREE.Points;
  private debugMarker:THREE.Mesh;private debugSphere:THREE.Mesh;private globalSphere:THREE.Mesh;private boundsHelper:THREE.Box3Helper;private capabilities:Capabilities;private timer:GPUTimer;
  private observer:ResizeObserver;private unsubscribe:()=>void;private adapter=new InteractionAdapter();private clock=new FixedStepClock();private adaptive=new AdaptiveResolution();
  private frameId=0;private disposed=false;private lost=false;private exhibition=false;private last=0;private simTime=0;private lastMorph=0;
  private config:ParticleConfig;private requestedCount=0;private requestedFormation='';private requestedQuality='';private requestedCamera=13;private cameraGoal=13;
  private spatialAt=-Infinity;private debugStarted=0;private lastSpatialMode='Off';private observedMin=[Infinity,Infinity,Infinity];private observedMax=[-Infinity,-Infinity,-Infinity];private wasSpatialEnabled=false;private spatialFailure='';
  private formationSphere:THREE.Mesh;private mappedBoundary:THREE.Box3Helper;private measuredBox:THREE.Box3Helper;
  private path:THREE.Line;private pathData=new Float32Array(256*3);private pathCount=0;
  private reportAt=0;private frameTimes:number[]=[];private width=1;private height=1;private frames=0;private metric:EngineMetrics={...initialMetrics};
  constructor(private container:HTMLElement,private getConfig:()=>ParticleConfig,private calibration:()=>Calibration,private report:(metrics:EngineMetrics)=>void,private forceCPU=false){
    this.config=structuredClone(getConfig());this.requestedCamera=this.cameraGoal=this.config.cameraDistance;
    this.renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
    this.canvas=this.renderer.domElement;this.canvas.setAttribute('aria-label','Interactive 3D fluid particles');this.canvas.setAttribute('role','img');this.canvas.dataset.particleCanvas='true';
    this.renderer.setClearColor(0x000000,1);this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.info.autoReset=false;
    this.renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{this.metric.message=`Shader compilation failed: ${gl.getShaderInfoLog(vertex)||gl.getShaderInfoLog(fragment)||gl.getProgramInfoLog(program)}`;this.metric.status='unavailable';this.report({...this.metric});};
    container.appendChild(this.canvas);
    this.camera=new THREE.PerspectiveCamera(42,1,.1,100);this.camera.position.set(0,2.8,this.config.cameraDistance);
    this.controls=new OrbitControls(this.camera,this.canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.045;this.controls.minDistance=8;this.controls.maxDistance=24;this.controls.enablePan=false;
    this.controls.addEventListener('end',()=>{this.cameraGoal=this.controls.getDistance();});
    this.scene.add(this.group);
    this.debugSphere=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0x62dfc7,wireframe:true,transparent:true,opacity:.24,depthWrite:false}));this.group.add(this.debugSphere);
    this.debugMarker=new THREE.Mesh(new THREE.SphereGeometry(.09,12,8),new THREE.MeshBasicMaterial({color:0xffcc66,depthTest:false}));this.group.add(this.debugMarker);
    this.globalSphere=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0x779dff,wireframe:true,transparent:true,opacity:.12,depthWrite:false}));this.group.add(this.globalSphere);
    this.boundsHelper=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color(0xffcc66));this.group.add(this.boundsHelper);
    this.formationSphere=new THREE.Mesh(new THREE.SphereGeometry(1,24,16),new THREE.MeshBasicMaterial({color:0x66aaff,wireframe:true,transparent:true,opacity:.1,depthWrite:false}));this.group.add(this.formationSphere);
    this.mappedBoundary=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color(0xff44cc));this.scene.add(this.mappedBoundary);
    this.measuredBox=new THREE.Box3Helper(new THREE.Box3(),new THREE.Color(0xffffff));this.group.add(this.measuredBox);
    const pathGeometry=new THREE.BufferGeometry();pathGeometry.setAttribute('position',new THREE.BufferAttribute(this.pathData,3).setUsage(THREE.DynamicDrawUsage));pathGeometry.setDrawRange(0,0);
    this.path=new THREE.Line(pathGeometry,new THREE.LineBasicMaterial({color:0xffaa44,depthTest:false}));this.path.frustumCulled=false;this.scene.add(this.path);
    this.capabilities=detectCapabilities(this.renderer);if(forceCPU)this.capabilities.float=this.capabilities.half=false;
    this.timer=new GPUTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.metric.renderer=this.capabilities.renderer;
    this.createResources();
    this.adapter.accept(interactionAPI.getSnapshot(),performance.now());this.unsubscribe=interactionAPI.subscribe(s=>this.adapter.accept(s,performance.now()));
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
    this.canvas.addEventListener('webglcontextlost',this.contextLost,false);this.canvas.addEventListener('webglcontextrestored',this.contextRestored,false);
    document.addEventListener('visibilitychange',this.visibility);
    this.resize();this.frameId=requestAnimationFrame(this.frame);
  }
  private createResources(){
    const c=this.getConfig(),gpu=this.capabilities.float||this.capabilities.half;
    this.metric.backend=gpu?(this.capabilities.float?'GPU float32':'GPU float16'):'CPU fallback';
    this.metric.message=gpu?(/swiftshader|llvmpipe|software/i.test(this.capabilities.renderer)?'Software GPU renderer detected. Enable browser hardware acceleration or choose Low quality; native GPU performance is not represented.':''): 'Float render targets unavailable or reduced mode selected: 10,000-particle CPU simulation.';
    this.post=new CinematicPost(this.renderer,this.capabilities.half);
    this.createParticles(c);
  }
  private createParticles(c:ParticleConfig){
    if(this.points){this.group.remove(this.points);this.geometry.dispose();this.material.dispose();this.simulation.dispose();}
    const gpu=this.capabilities.float||this.capabilities.half,count=gpu?c.count:Math.min(10000,c.count);
    this.simulation=gpu?new GPUSimulation(this.renderer,count,c.formation,this.capabilities.float?THREE.FloatType:THREE.HalfFloatType):new CPUSimulation(count,c.formation);
    this.geometry=new THREE.BufferGeometry();const references=new Float32Array(count*2),seeds=new Float32Array(count);
    for(let i=0;i<count;i++){references[i*2]=(i%this.simulation.size+.5)/this.simulation.size;references[i*2+1]=(Math.floor(i/this.simulation.size)+.5)/this.simulation.size;seeds[i]=randomFor(i);}
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.simulation.cpuPositions??new Float32Array(count*3),3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('reference',new THREE.BufferAttribute(references,2));this.geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
    const colors=c.palette==='custom'?c.colors:palettes[c.palette];
    this.material=new THREE.ShaderMaterial({vertexShader:pointVertex,fragmentShader:pointFragment,uniforms:{uPositions:{value:this.simulation.positionTexture},uVelocities:{value:this.simulation.velocityTexture},uGPU:{value:gpu},uForces:{value:null},uForceDebug:{value:false},uSize:{value:c.size},uDpr:{value:1},colorA:{value:new THREE.Color(colors[0])},colorB:{value:new THREE.Color(colors[1])},colorC:{value:new THREE.Color(colors[2])},brightness:{value:1},energy:{value:0}},transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false});
    this.points=new THREE.Points(this.geometry,this.material);this.points.frustumCulled=false;this.group.add(this.points);
    this.requestedCount=c.count;this.requestedFormation=c.formation;
    this.metric.count=count;this.metric.status='ready';this.canvas.dataset.backend=this.metric.backend;this.canvas.dataset.count=String(count);
    this.post.clearHistory();this.report({...this.metric});
  }
  private contextLost=(event:Event)=>{event.preventDefault();this.lost=true;cancelAnimationFrame(this.frameId);this.timer.dispose();this.metric.status='context-lost';this.metric.message='GPU context lost. Waiting for the browser to restore it.';this.report({...this.metric});};
  private contextRestored=()=>{
    if(this.disposed)return;
    try{this.post.dispose();this.capabilities=detectCapabilities(this.renderer);if(this.forceCPU)this.capabilities.float=this.capabilities.half=false;this.timer=new GPUTimer(this.renderer.getContext() as WebGL2RenderingContext);this.createResources();this.clock.reset();this.last=0;this.lost=false;this.resize(true);this.frameId=requestAnimationFrame(this.frame);}catch(e){this.metric.status='unavailable';this.metric.message=String(e);this.report({...this.metric});}
  };
  private visibility=()=>{cancelAnimationFrame(this.frameId);this.clock.reset();this.last=0;this.frameTimes=[];this.post.clearHistory();if(!document.hidden&&!this.lost&&!this.disposed)this.frameId=requestAnimationFrame(this.frame);};
  setExhibition(exhibition:boolean){this.exhibition=exhibition;this.debugSphere.visible=false;if(exhibition){useParticles.setState({spatialEnabled:false,spatialMode:'Off'});this.simulation.releaseDiagnostics?.();this.pathCount=0;}}
  testInteraction(baseline=false){this.adapter.test(performance.now(),baseline);}
  stopInteractionTest(){this.adapter.stopTest();}
  resetCamera(){this.camera.position.set(0,2.8,this.getConfig().cameraDistance);this.controls.target.set(0,0,0);this.cameraGoal=this.getConfig().cameraDistance;this.controls.update();}
  private resize(force=false){
    const width=Math.max(1,Math.round(this.container.clientWidth)),height=Math.max(1,Math.round(this.container.clientHeight));
    const profile=profiles[this.getConfig().quality];
    const maxRatio=Math.min(window.devicePixelRatio||1,profile.dpr,1920/width*1.5);
    const ratio=Math.max(.6,Math.min(this.adaptive.ratio,maxRatio));
    if(!force&&width===this.width&&height===this.height&&Math.abs(ratio-this.renderer.getPixelRatio())<.01)return;
    this.width=width;this.height=height;this.renderer.setPixelRatio(ratio);this.renderer.setSize(width,height,false);
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();
    this.post.resize(Math.round(width*ratio),Math.round(height*ratio),profile.bloomScale);
    this.metric.pixelRatio=ratio;this.metric.width=Math.round(width*ratio);this.metric.height=Math.round(height*ratio);
  }
  private frame=(now:number)=>{
    if(this.disposed||this.lost||document.hidden)return;
    try{
      const frameDelta=this.last?Math.max(0,(now-this.last)/1000):1/60,dt=Math.min(frameDelta,.1);this.last=now;
      const requested=this.getConfig();
      if(requested.count!==this.requestedCount)this.createParticles(requested);
      if(requested.quality!==this.requestedQuality){this.requestedQuality=requested.quality;this.resize(true);}
      if(requested.formation!==this.requestedFormation){this.requestedFormation=requested.formation;this.simulation.formation(requested.formation,this.simTime,requested.morphDuration);this.lastMorph=this.simTime;}
      if(requested.autoMorph&&this.simTime-this.lastMorph>14){const f=formations[(Math.floor(this.simTime/14))%formations.length];this.simulation.formation(f,this.simTime,requested.morphDuration);this.lastMorph=this.simTime;}
      for(const key of ['size','flow','turbulence','magnetic','repulsion','vortex','shape','damping','accelerationLimit','velocityLimit','boundaryRadius','rotation','bloom','trails','exposure'] as const)this.config[key]+=(requested[key]-this.config[key])*(1-Math.exp(-dt*2));
      this.config.boundary=requested.boundary;
      this.config.response=requested.response;this.config.coverage=requested.coverage;
      const debugState=useParticles.getState(),spatialEnabled=debugState.spatialEnabled&&!this.exhibition;
      const debugMode=spatialEnabled?debugState.spatialMode:'Off';
      if((spatialEnabled&&!this.wasSpatialEnabled)||debugMode!==this.lastSpatialMode){this.observedMin=[Infinity,Infinity,Infinity];this.observedMax=[-Infinity,-Infinity,-Infinity];this.spatialAt=-Infinity;}
      this.wasSpatialEnabled=spatialEnabled;
      if(debugMode!==this.lastSpatialMode){this.debugStarted=now;this.lastSpatialMode=debugMode;this.pathCount=0;}
      if(!spatialEnabled){this.simulation.releaseDiagnostics?.();this.spatialFailure='';}
      const bounds=this.simulation.bounds(this.simTime),worldBounds=rotatedBounds(bounds,this.group.rotation.y);
      const input=this.adapter.step(dt,now,requested.mapping,this.calibration(),requested.response,bounds.radius,rotatedBounds(bounds,this.group.rotation.y),requested.coverage);
      const simulationInput={...input,position:[...input.position] as [number,number,number],direction:[...input.direction] as [number,number,number]};
      if(debugMode==='Attractor Sweep'){
        const t=(now-this.debugStarted)/1000,phase=t%8,progress=phase<4?phase/4:2-phase/4;
        simulationInput.position=[worldBounds.min[0]+(worldBounds.max[0]-worldBounds.min[0])*progress,0,0];
        simulationInput.direction=[(phase<4?1:-1)*(worldBounds.max[0]-worldBounds.min[0])/4,0,0];simulationInput.motion=1;simulationInput.activity=1;simulationInput.approach=0;simulationInput.pulse=0;
      }
      if(spatialEnabled)for(let i=0;i<3;i++){this.observedMin[i]=Math.min(this.observedMin[i],simulationInput.position[i]);this.observedMax[i]=Math.max(this.observedMax[i],simulationInput.position[i]);}
      simulationInput.uniformField=debugMode==='Uniform Field';
      this.group.rotation.y+=this.config.rotation*dt*(1-input.activity*.5);
      const localInput=sceneInput(simulationInput,this.group.rotation.y);
      this.renderer.info.reset();this.timer.poll();this.timer.begin();
      const integrationSteps=this.clock.advance(dt,step=>{this.simTime+=step;this.simulation.step(step,this.simTime,this.config,localInput);});
      if(this.simulation.cpuPositions)(this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;
      if(spatialEnabled&&now-this.spatialAt>=2000){
        this.spatialAt=now;
        let measurement:unknown={status:this.simulation.cpuPositions?'CPU positions available; GPU force readback unavailable':'Float32 readback unavailable; no force estimates reported'};
        if(this.simulation.cpuPositions){
          const p=this.simulation.cpuPositions,data=new Float32Array(this.simulation.count*4);for(let i=0;i<this.simulation.count;i++)data.set(p.subarray(i*3,i*3+3),i*4);
          const measuredBounds=targetBounds(data),center=measuredBounds.min.map((v,i)=>(v+measuredBounds.max[i])/2),dimensions=measuredBounds.min.map((v,i)=>measuredBounds.max[i]-v);let sphereRadius=0;
          for(let i=0;i<p.length;i+=3)sphereRadius=Math.max(sphereRadius,Math.hypot(p[i]-center[0],p[i+1]-center[1],p[i+2]-center[2]));
          measurement={status:'Exact CPU position bounds; GPU force statistics unavailable',bounds:measuredBounds,center,dimensions,sphereRadius,sampledAt:now,population:this.simulation.count,sampleCount:this.simulation.count};
        }
        if(this.capabilities.float&&this.simulation.measure&&!this.spatialFailure){try{measurement=this.simulation.measure(now);}catch(e){this.spatialFailure=String(e);}}
        if(this.spatialFailure)measurement={status:'GPU readback unavailable',reason:this.spatialFailure};
        const calibrated=this.calibration(),range=requested.mapping.phase1Calibration?calibrated.range:requested.mapping.horizontalRange;
        const endpoint=(x:number,y:number)=>mapInteraction({...interactionAPI.getSnapshot(),primary:{x,y}},requested.mapping,calibrated,requested.response,worldBounds,requested.coverage).world;
        const endpointA=endpoint(requested.response.radarCenterX-range,requested.mapping.depthMin),endpointB=endpoint(requested.response.radarCenterX+range,requested.mapping.depthMax);
        const travelMin=endpointA.map((v,i)=>Math.min(v,endpointB[i])),travelMax=endpointA.map((v,i)=>Math.max(v,endpointB[i]));
        this.group.updateMatrixWorld(true);
        const actualAttractor=this.simulation.forceUniforms.attractor as [number,number,number]??localInput.position;
        const actualRadius=Number(this.simulation.forceUniforms.radius??localInput.radius);
        const actualWorld=new THREE.Vector3().fromArray(actualAttractor).applyMatrix4(this.group.matrixWorld).toArray();
        const spatial={measurement,formationTargets:bounds,attractorSimulation:actualAttractor,attractorWorld:actualWorld,observedTravelMin:[...this.observedMin],observedTravelMax:[...this.observedMax],observedTravelDimensions:this.observedMin.map((v,i)=>this.observedMax[i]-v),travelMin,travelMax,travelDimensions:travelMax.map((v,i)=>v-travelMin[i]),radarNormalized:this.adapter.diagnostics.normalized,
          mappedWorld:this.adapter.diagnostics.world,influenceRadius:actualRadius,radiusPercentOfTarget:actualRadius/bounds.radius*100,
          textureDimensions:[this.simulation.size,this.simulation.size],precision:this.metric.backend,uniforms:this.simulation.forceUniforms,
          rendererPixelRatio:this.renderer.getPixelRatio(),modelScale:this.group.scale.toArray(),modelMatrix:this.group.matrixWorld.toArray(),cameraPosition:this.camera.position.toArray(),cameraFov:this.camera.fov,
          frameDelta:frameDelta,clampedFrameDelta:dt,integrationStep:this.clock.step,integrationSteps,integratedDelta:integrationSteps*this.clock.step,simulationTime:this.simTime,mode:debugMode};
        useParticles.setState({spatial});this.canvas.dataset.spatial=JSON.stringify(spatial);
        const measured=measurement as {bounds?:{min:[number,number,number];max:[number,number,number]}};
        if(measured.bounds){this.measuredBox.box.min.fromArray(measured.bounds.min);this.measuredBox.box.max.fromArray(measured.bounds.max);}
        this.mappedBoundary.box.min.fromArray(travelMin as [number,number,number]);this.mappedBoundary.box.max.fromArray(travelMax as [number,number,number]);this.mappedBoundary.box.min.y-=.02;this.mappedBoundary.box.max.y+=.02;
      }
      const u=this.material.uniforms;u.uForceDebug.value=debugMode==='Force Visualization'&&this.capabilities.float;
      u.uForces.value=u.uForceDebug.value?this.simulation.forceTexture?.():null;
      this.canvas.dataset.spatialMode=debugMode;this.canvas.dataset.spatialEnabled=String(spatialEnabled);
      u.uPositions.value=this.simulation.positionTexture;u.uVelocities.value=this.simulation.velocityTexture;u.uSize.value=this.config.size;u.uDpr.value=this.renderer.getPixelRatio();
      u.brightness.value=1+input.motion*.6+input.pulse*.3;u.energy.value=input.motion;
      const colors=requested.palette==='custom'?requested.colors:palettes[requested.palette];
      for(let i=0;i<3;i++)u[['colorA','colorB','colorC'][i]].value.lerp(new THREE.Color(colors[i]),1-Math.exp(-dt*1.8));
      if(requested.cameraDistance!==this.requestedCamera){this.cameraGoal=requested.cameraDistance;this.requestedCamera=requested.cameraDistance;}
      const delta=this.camera.position.clone().sub(this.controls.target),distance=delta.length();
      this.camera.position.copy(this.controls.target).add(delta.multiplyScalar((distance+(this.cameraGoal-distance)*(1-Math.exp(-dt*2)))/Math.max(.1,distance)));
      this.controls.update();
      const showSpatial=spatialEnabled;
      this.debugSphere.visible=(requested.debug||showSpatial)&&!this.exhibition&&(input.activity>.01||showSpatial);this.debugSphere.position.fromArray(this.simulation.forceUniforms.attractor as [number,number,number]??localInput.position);this.debugSphere.scale.setScalar(Number(this.simulation.forceUniforms.radius??input.radius));this.debugMarker.visible=this.debugSphere.visible;this.debugMarker.position.copy(this.debugSphere.position);
      this.globalSphere.visible=requested.debug&&!this.exhibition;this.globalSphere.scale.setScalar(input.globalRadius??input.radius);
      this.formationSphere.visible=showSpatial;this.formationSphere.scale.setScalar(bounds.radius);
      this.path.visible=showSpatial;this.mappedBoundary.visible=showSpatial;this.measuredBox.visible=showSpatial;
      if(showSpatial){if(this.pathCount===256){this.pathData.copyWithin(0,3);this.pathCount--;}this.pathData.set(simulationInput.position,this.pathCount++*3);(this.path.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;this.path.geometry.setDrawRange(0,this.pathCount);}
      this.boundsHelper.visible=this.globalSphere.visible||showSpatial;this.boundsHelper.box.min.fromArray(bounds.min);this.boundsHelper.box.max.fromArray(bounds.max);
      this.post.render(this.scene,this.camera,this.config.bloom,this.config.trails*(.65+input.motion*.35),this.config.exposure,dt);this.timer.end();
      this.frames++;this.frameTimes.push(frameDelta*1000);if(this.frameTimes.length>180)this.frameTimes.shift();
      if(now-this.reportAt>=500){
        const elapsed=this.reportAt?(now-this.reportAt)/1000:.5,fps=this.frames/elapsed,sorted=[...this.frameTimes].sort((a,b)=>a-b);
        const maxRatio=Math.min(window.devicePixelRatio||1,profiles[requested.quality].dpr);
        const ratio=this.adaptive.update(fps,elapsed,now,maxRatio,requested.adaptive);if(Math.abs(ratio-this.renderer.getPixelRatio())>.05)this.resize(true);
        this.metric={...this.metric,fps,frameMs:elapsed*1000/this.frames,p95Ms:sorted[Math.floor(sorted.length*.95)]??0,gpuMs:this.timer.value,textures:this.renderer.info.memory.textures,drawCalls:this.renderer.info.render.calls};
        let probe:unknown=undefined;
        if(new URLSearchParams(location.search).has('interactionProbe')&&this.capabilities.float&&this.simulation.sample){
          const samples=this.simulation.sample();let x=0,radius=0;for(let i=0;i<samples.length;i+=4){x+=samples[i];radius+=Math.hypot(samples[i],samples[i+1],samples[i+2]);}
          probe={x:x/64,radius:radius/64,finite:[...samples].every(Number.isFinite)};
        }
        const diagnostics={probe,...this.adapter.diagnostics,uniforms:this.simulation.forceUniforms,backend:this.metric.backend};
        useParticles.setState({diagnostics});this.canvas.dataset.interaction=JSON.stringify(diagnostics);
        this.canvas.dataset.frames=String(Number(this.canvas.dataset.frames??0)+this.frames);this.canvas.dataset.activity=input.activity.toFixed(3);this.canvas.dataset.metrics=JSON.stringify(this.metric);this.report({...this.metric});this.frames=0;this.reportAt=now;
      }
      this.frameId=requestAnimationFrame(this.frame);
    }catch(error){this.timer.end();this.metric.status='unavailable';this.metric.message=String(error);this.report({...this.metric});}
  };
  dispose(){
    if(this.disposed)return;this.disposed=true;useParticles.setState({spatialEnabled:false,spatialMode:'Off',spatial:{}});cancelAnimationFrame(this.frameId);this.observer.disconnect();this.unsubscribe();document.removeEventListener('visibilitychange',this.visibility);
    this.canvas.removeEventListener('webglcontextlost',this.contextLost);this.canvas.removeEventListener('webglcontextrestored',this.contextRestored);
    this.path.geometry.dispose();(this.path.material as THREE.Material).dispose();this.mappedBoundary.dispose();this.measuredBox.dispose();this.formationSphere.geometry.dispose();(this.formationSphere.material as THREE.Material).dispose();
    this.controls.dispose();this.timer.dispose();this.simulation.dispose();this.geometry.dispose();this.material.dispose();this.post.dispose();this.debugMarker.geometry.dispose();(this.debugMarker.material as THREE.Material).dispose();this.debugSphere.geometry.dispose();(this.debugSphere.material as THREE.Material).dispose();this.globalSphere.geometry.dispose();(this.globalSphere.material as THREE.Material).dispose();this.boundsHelper.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.canvas.remove();
  }
}
