import type { Telemetry } from '../shared/protocol';
export const packet = (overrides: Partial<Telemetry> = {}): Telemetry => ({ type:'telemetry',v:1,seq:1,ts:100,units:'m',radar:'responsive',presence:true,presence_at:100,report:'valid',target_at:100,targets:[{x:1,y:2,doppler:3,cluster:1}],distance:null,sensor_frames:1,target_frames:1,errors:0,...overrides });
