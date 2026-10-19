export const quadVertex = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
export const copyFragment = `uniform sampler2D source;varying vec2 vUv;void main(){gl_FragColor=texture2D(source,vUv);}`;
export const velocityFragment = `
precision highp float;
varying vec2 vUv;
uniform sampler2D positions,velocities,targetA,targetB;
uniform float dt,time,morph,flow,turbulence,magnetic,repulsion,vortex,shape,damping,accelerationLimit,velocityLimit,boundaryRadius;
uniform float activity,motion,proximity,pulse,radius;
uniform float falloffPower,globalRadius,globalStrength,localStrength;
uniform float diagnosticPass,diagnosticCount,textureSide,uniformField;
uniform float dragForce,attractionForce,expansionForce,vortexForce,turbulenceForce,restorationWeight,approach,pulseAge,pulseForce;
uniform bool boundary;
uniform vec3 attractor,direction;
vec3 limited(vec3 v,float limit){float n=length(v);return v*min(1.,limit/max(n,0.00001));}
// Analytic curl of a smooth trigonometric vector potential. No discontinuous RNG.
vec3 curl(vec3 p,float t){
  return vec3(-.9*sin(p.x+t*.5)*sin(p.y*.9)-cos(p.z+t*.7)*cos(p.x*.8),
    -.7*sin(p.y+t)*sin(p.z*.7)-cos(p.x+t*.5)*cos(p.y*.9),
    -.8*sin(p.z+t*.7)*sin(p.x*.8)-cos(p.y+t)*cos(p.z*.7));
}
void main(){
  vec4 old=texture2D(velocities,vUv);vec3 p=texture2D(positions,vUv).xyz,v=old.xyz;
  vec3 target=mix(texture2D(targetA,vUv).xyz,texture2D(targetB,vUv).xyz,morph);
  float compression=clamp(1.-approach*activity*.38,.62,1.38);
  float restoring=shape*mix(1.,restorationWeight,motion);
  vec3 restoration=(target*compression-p)*restoring-v*sqrt(restoring)*.25;
  vec3 interaction=vec3(0.);
  vec3 a=restoration;
  interaction-=limited(p,1.)*approach*activity*(approach>0.?attractionForce:expansionForce)*.9;
  vec3 delta=attractor-p;float d=length(delta);vec3 n=delta/max(d,.01);
  float influence=pow(max(0.,1.-smoothstep(0.,1.,d/max(radius,.1))),max(.75,.5+falloffPower))*localStrength;
  vec3 field=curl(p*.8,time*.22)+.35*curl(p*1.6+4.,time*.14);
  a+=field*flow*.48;
  interaction+=field*turbulenceForce*motion*influence*2.;
  float broad=exp(-.5*pow(length(p)/max(globalRadius,.1),2.))*globalStrength*motion*activity*dragForce;
  float variation=.65+.25*sin(p.x*.7+p.z*.4+time*.3);
  vec3 eddy=vec3(sin(p.z*.8+time*.2),sin(p.x*.6-p.z*.5),cos(p.x*.7+time*.2));
  vec3 fluidVelocity=limited(direction,3.);
  interaction+=broad*(fluidVelocity*variation+eddy*length(fluidVelocity)*.22);
  interaction+=direction*dragForce*activity*influence*(.7+.6*old.w);
  interaction+=n*influence*activity*(magnetic*.25+max(approach,0.)*attractionForce*3.-max(-approach,0.)*expansionForce*3.);
  interaction-=n*repulsion*activity*(1.-smoothstep(0.,radius*.18,d));
  vec3 q=p-attractor;
  float handedness=direction.x/(1.+abs(direction.x));
  vec3 orbit=limited(vec3(-q.z,.15*sin(q.x+time),q.x),1.);
  a+=orbit*vortex*.25;
  interaction+=orbit*vortexForce*handedness*motion*influence*4.;
  float wave=exp(-pow((d-pulseAge*5.)/.45,2.));
  interaction-=n*pulseForce*pulse*wave*8.;
  vec3 noise=vec3(sin(p.y*3.+time*1.3+old.w*6.),cos(p.z*2.7-time),sin(p.x*3.1+time*.8));
  a+=noise*turbulence*.22;
  if(boundary){float distance=length(p);a-=p/max(distance,.01)*max(0.,distance-boundaryRadius)*4.;}
  interaction+=vec3(.6,0.,0.)*uniformField;
  if(diagnosticPass>.5){
    float index=floor(vUv.y*textureSide)*textureSide+floor(vUv.x*textureSide);
    gl_FragColor=index<diagnosticCount?vec4(length(interaction),length(restoration),d,length(p-target)):vec4(-1.);return;
  }
  a+=interaction;
  v=v*exp(-damping*dt)+limited(a,accelerationLimit)*dt;
  gl_FragColor=vec4(limited(v,velocityLimit),old.w);
}`;
export const positionFragment = `
varying vec2 vUv;uniform sampler2D positions,velocities;uniform float dt;
void main(){vec4 p=texture2D(positions,vUv),v=texture2D(velocities,vUv);gl_FragColor=vec4(p.xyz+v.xyz*dt,mod(p.w+dt,12.+v.w*8.));}`;
export const pointVertex = `
attribute vec2 reference;attribute float aSeed;
uniform sampler2D uPositions,uVelocities,uForces;uniform bool uGPU,uForceDebug;
uniform float uSize,uDpr;
varying float vSeed,vSpeed,vAge,vDepth,vForce;
void main(){
  vec4 p=uGPU?texture2D(uPositions,reference):vec4(position,0.);
  vec3 velocity=uGPU?texture2D(uVelocities,reference).xyz:vec3(0.);
  vec4 mv=modelViewMatrix*vec4(p.xyz,1.);
  vForce=uForceDebug?texture2D(uForces,reference).r:0.;
  vDepth=-mv.z;vSeed=aSeed;vSpeed=length(velocity);vAge=p.w;
  gl_PointSize=clamp(uSize*uDpr*(13./max(2.,-mv.z)),.6,16.);
  gl_Position=projectionMatrix*mv;
}`;
export const pointFragment = `
uniform vec3 colorA,colorB,colorC;uniform float brightness,energy;uniform bool uForceDebug;
varying float vSeed,vSpeed,vAge,vDepth,vForce;
void main(){
  float radius=length(gl_PointCoord-.5)*2.;if(radius>1.)discard;
  float core=exp(-radius*radius*5.5),edge=pow(max(0.,1.-radius),1.7);
  vec3 color=mix(colorA,colorB,smoothstep(0.,.65,vSeed));color=mix(color,colorC,smoothstep(.5,1.,vSeed)*.8);
  color=mix(color,colorC,min(.65,energy*min(vSpeed*.25,1.)));
  if(uForceDebug){color=vForce<.1?vec3(.05,.2,1.):vForce<1.?mix(vec3(.05,.2,1.),vec3(1.,.85,0.),(vForce-.1)/.9):mix(vec3(1.,.85,0.),vec3(1.,.02,.01),clamp((vForce-1.)/4.,0.,1.));}
  float twinkle=.85+.15*sin(vAge*.7+vSeed*24.);
  float fog=1.-smoothstep(15.,27.,vDepth);
  gl_FragColor=vec4(color*(.5+core*.7+min(vSpeed,4.)*.18)*brightness,(core*.6+edge*.2)*twinkle*fog);
}`;
export const brightFragment = `varying vec2 vUv;uniform sampler2D source;void main(){vec3 c=texture2D(source,vUv).rgb;float brightness=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c*smoothstep(.3,1.2,brightness),1.);}`;
export const blurFragment = `varying vec2 vUv;uniform sampler2D source;uniform vec2 direction;void main(){vec3 c=texture2D(source,vUv).rgb*.227027;c+=(texture2D(source,vUv+direction*1.384615).rgb+texture2D(source,vUv-direction*1.384615).rgb)*.316216;c+=(texture2D(source,vUv+direction*3.230769).rgb+texture2D(source,vUv-direction*3.230769).rgb)*.070270;gl_FragColor=vec4(c,1.);}`;
export const historyFragment = `
varying vec2 vUv;uniform sampler2D currentFrame,bloomFrame,previousFrame;uniform float bloomStrength,retention;
void main(){vec3 current=texture2D(currentFrame,vUv).rgb+texture2D(bloomFrame,vUv).rgb*bloomStrength;vec3 previous=texture2D(previousFrame,vUv).rgb;gl_FragColor=vec4(max(current,previous*retention),1.);}`;
export const outputFragment = `
varying vec2 vUv;uniform sampler2D source;uniform float exposure;
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
void main(){vec3 c=texture2D(source,vUv).rgb;float vignette=1.-smoothstep(.15,.85,length(vUv-.5));vec3 background=mix(vec3(.001,.002,.005),vec3(.003,.009,.014),vignette);c=aces(c*exposure+background);gl_FragColor=vec4(pow(c,vec3(1./2.2)),1.);}`;
