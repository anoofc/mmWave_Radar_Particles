import {Component,lazy,Suspense,useEffect,useState,type ReactNode} from 'react';
import type {ParticleExperienceProps} from '../particles/ParticleExperience';

const createView=()=>lazy(()=>import('../particles/ParticleExperience'));
class ParticleLoadBoundary extends Component<{children:ReactNode;retry:()=>void},{error:string}> {
  state={error:''};
  static getDerivedStateFromError(error:unknown){return {error:error instanceof Error?error.message:String(error)};}
  render(){return this.state.error?<section className="panel" role="alert" style={{marginTop:20}}><h2>Particle Experience could not load</h2><p className="hint">{this.state.error}</p><p className="hint">The radar connection is still running. Retry the particle view. If the development server was updated, restart it and reload the application. A full reload requires reconnecting USB.</p><div className="recorder-actions" style={{marginTop:12}}><button onClick={this.props.retry}>Retry Particle Experience</button><button onClick={()=>location.reload()}>Reload application</button></div></section>:this.props.children;}
}
function Loading({retry}:{retry:()=>void}){
  const [slow,setSlow]=useState(false);
  useEffect(()=>{const timer=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(timer);},[]);
  return <section className="panel" role="status" style={{marginTop:20}}><h2>Loading Particle Experience</h2><p className="hint">Loading the 3D renderer. Your radar connection remains active.</p>{slow&&<><p className="hint">Loading is taking longer than expected. Check that the Vite server is still running.</p><button onClick={retry}>Retry Particle Experience</button></>}</section>;
}
export function ParticleViewLoader(props:ParticleExperienceProps){
  const [View,setView]=useState(createView),[attempt,setAttempt]=useState(0);
  const retry=()=>{setView(()=>createView());setAttempt(v=>v+1);};
  return <ParticleLoadBoundary key={attempt} retry={retry}><Suspense fallback={<Loading retry={retry}/>}><View {...props}/></Suspense></ParticleLoadBoundary>;
}
