import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { newSession,importSession,sessionCsv,Replay } from '../web/src/core/recording';
import { Tracker } from '../web/src/core/tracking';
import { defaultFilters } from '../web/src/core/filtering';
import { packet } from './fixtures';
describe('recording and replay',()=>{
  it('round trips a session without losing empty and unavailable reports',()=>{const s={...newSession(),events:[{at:0,packet:packet()},{at:100,packet:packet({targets:[]})},{at:200,packet:packet({report:'unavailable',targets:[],target_at:null})}]};expect(importSession(JSON.stringify(s))).toEqual(s);expect(sessionCsv(s).split('\r\n')).toHaveLength(4);});
  it('replays with original offsets and adjustable speed',()=>{const r=new Replay({...newSession(),events:[{at:0,packet:packet()},{at:500,packet:packet({seq:2})},{at:1000,packet:packet({seq:3})}]});const out:number[]=[];r.advance(250,2,e=>out.push(e.packet.seq));expect(out).toEqual([1,2]);expect(r.position).toBe(500);r.advance(250,2,e=>out.push(e.packet.seq));expect(out).toEqual([1,2,3]);});
  it('rebuilds tracking consistently when seeking backwards',()=>{const events=Array.from({length:10},(_,i)=>({at:i*100,packet:packet({seq:i,ts:i*100,target_at:i*100,presence_at:i*100,targets:[{x:i*.2,y:2,doppler:0,cluster:1}]})}));const r=new Replay({...newSession(),events});let tracker=new Tracker();const emit=(e:typeof events[number])=>tracker.ingest(e.packet,e.at,defaultFilters);r.advance(500,1,emit);const original=tracker.state(500,true,defaultFilters);r.advance(400,1,emit);r.seek(500,()=>{tracker=new Tracker();},emit);expect(tracker.state(500,true,defaultFilters)).toEqual(original);});
  it('rejects unordered or invalid imports',()=>{expect(()=>importSession(JSON.stringify({...newSession(),events:[{at:20,packet:packet()},{at:10,packet:packet()}]}))).toThrow(/ordered/);expect(()=>importSession('{}')).toThrow();});
  it('validates the bundled offline sample',()=>{const s=importSession(readFileSync('web/public/sample-session.json','utf8'));expect(s.events.length).toBeGreaterThan(20);});
});
