export const responsePresets = {
  Subtle: { amplification:1, radius:.4, restoration:.8, drag:1.5, vortex:.5, pulseStrength:.5, turbulence:.3 },
  Expressive: { amplification:4, radius:.9, restoration:.4, drag:3, vortex:1.4, pulseStrength:2, turbulence:.8 },
  Dramatic: { amplification:7, radius:.9, restoration:.2, drag:4, vortex:2.5, pulseStrength:3.5, turbulence:1.3 }
};
export const defaultResponse = {
  preset:'Expressive', ...responsePresets.Expressive, horizontal:1, depth:1, attraction:3, expansion:3,
  pulseThreshold:.65, attack:.07, release:.65, smoothing:.12, deadZone:.015, speedMin:.04, speedMax:1.4,
  radarCenterX:0, width:8, depthSize:6, offsetX:0, offsetY:0, offsetZ:0
};
export type ResponseConfig = typeof defaultResponse;
export const responseBounds:Record<Exclude<keyof ResponseConfig,'preset'>,[number,number]> = {
  amplification:[.1,10],radius:[.2,1.5],restoration:[.05,1],drag:[0,8],vortex:[0,5],pulseStrength:[0,5],turbulence:[0,3],
  horizontal:[0,3],depth:[0,3],attraction:[0,8],expansion:[0,8],pulseThreshold:[.05,1],attack:[.01,1],release:[.05,3],
  smoothing:[.01,1],deadZone:[0,.5],speedMin:[0,1],speedMax:[.1,5],radarCenterX:[-5,5],width:[1,12],depthSize:[1,10],offsetX:[-5,5],offsetY:[-5,5],offsetZ:[-5,5]
};
/** Deterministic 16 second adapter test; physical transport and raw recording are untouched. */
export function demoPosition(t:number):[number,number] {
  if(t<2)return [0,1.65];
  if(t<4)return [-1.8*(t-2)/2,1.65];
  if(t<6)return [-1.8+3.6*(t-4)/2,1.65];
  if(t<8)return [1.8*(1-(t-6)/2),1.65-1.1*(t-6)/2];
  if(t<10)return [0,.55+2.2*(t-8)/2];
  if(t<12)return [1.8*Math.sin((t-10)*Math.PI*3),2.75];
  return [0,2.75];
}
