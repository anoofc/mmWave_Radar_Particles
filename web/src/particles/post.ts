import * as THREE from 'three';
import {FullscreenPass} from './gpu';
import {quadVertex,brightFragment,blurFragment,historyFragment,outputFragment} from './shaders';
export class CinematicPost {
  readonly sceneTarget:THREE.WebGLRenderTarget;
  private bright:THREE.WebGLRenderTarget;private blur:THREE.WebGLRenderTarget;private history:THREE.WebGLRenderTarget[];
  private pass=new FullscreenPass();private index=0;private width=1;private height=1;private scale=.5;
  private extract:THREE.ShaderMaterial;private gaussian:THREE.ShaderMaterial;private temporal:THREE.ShaderMaterial;private output:THREE.ShaderMaterial;
  constructor(private renderer:THREE.WebGLRenderer,hdr:boolean){
    const make=()=>new THREE.WebGLRenderTarget(1,1,{type:hdr?THREE.HalfFloatType:THREE.UnsignedByteType,depthBuffer:false,stencilBuffer:false,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
    this.sceneTarget=make();this.bright=make();this.blur=make();this.history=[make(),make()];
    const material=(fragmentShader:string,uniforms:Record<string,THREE.IUniform>)=>new THREE.ShaderMaterial({vertexShader:quadVertex,fragmentShader,uniforms,depthWrite:false,depthTest:false});
    this.extract=material(brightFragment,{source:{value:this.sceneTarget.texture}});
    this.gaussian=material(blurFragment,{source:{value:null},direction:{value:new THREE.Vector2()}});
    this.temporal=material(historyFragment,{currentFrame:{value:this.sceneTarget.texture},bloomFrame:{value:this.bright.texture},previousFrame:{value:null},bloomStrength:{value:0},retention:{value:0}});
    this.output=material(outputFragment,{source:{value:null},exposure:{value:1}});
  }
  resize(width:number,height:number,scale:number){if(width===this.width&&height===this.height&&scale===this.scale)return;this.width=width;this.height=height;this.scale=scale;this.sceneTarget.setSize(width,height);for(const rt of [this.bright,this.blur])rt.setSize(Math.max(1,Math.round(width*scale)),Math.max(1,Math.round(height*scale)));for(const rt of this.history)rt.setSize(width,height);this.clearHistory();}
  clearHistory(){for(const rt of this.history){this.renderer.setRenderTarget(rt);this.renderer.clear();}this.renderer.setRenderTarget(null);}
  render(scene:THREE.Scene,camera:THREE.Camera,bloom:number,trails:number,exposure:number,dt:number){
    this.renderer.setRenderTarget(this.sceneTarget);this.renderer.clear();this.renderer.render(scene,camera);
    if(bloom>.001){
      this.pass.draw(this.renderer,this.extract,this.bright);
      this.gaussian.uniforms.source.value=this.bright.texture;this.gaussian.uniforms.direction.value.set(1/this.bright.width,0);this.pass.draw(this.renderer,this.gaussian,this.blur);
      this.gaussian.uniforms.source.value=this.blur.texture;this.gaussian.uniforms.direction.value.set(0,1/this.bright.height);this.pass.draw(this.renderer,this.gaussian,this.bright);
    }
    const next=1-this.index;
    this.temporal.uniforms.previousFrame.value=this.history[this.index].texture;this.temporal.uniforms.bloomStrength.value=bloom;
    this.temporal.uniforms.retention.value=trails>.001?Math.pow(.5+trails*.48,Math.max(.001,dt)*60):0;
    this.pass.draw(this.renderer,this.temporal,this.history[next]);this.index=next;
    this.output.uniforms.source.value=this.history[this.index].texture;this.output.uniforms.exposure.value=exposure;this.pass.draw(this.renderer,this.output,null);
  }
  dispose(){for(const rt of [this.sceneTarget,this.bright,this.blur,...this.history])rt.dispose();for(const m of [this.extract,this.gaussian,this.temporal,this.output])m.dispose();this.pass.dispose();}
}
