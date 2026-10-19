import { create } from 'zustand';
import type { Packet, Status, Telemetry, Ack } from '../../../shared/protocol';
import { Tracker, type InteractionState, type Track } from '../core/tracking';
import { defaultFilters, type FilterConfig } from '../core/filtering';
import { defaultSimulation, type SimulationConfig } from '../core/simulation';
import { newSession, MAX_EVENTS, type Session } from '../core/recording';
export type Mode = 'idle' | 'serial' | 'simulation' | 'replay';
interface State {
  lastRejectedLine: { message: string; line: string; receivedAt: string } | null;
  mode: Mode; connection: 'disconnected' | 'connecting' | 'connected' | 'lost'; error: string;
  packet: Telemetry | null; status: Status | null; ack: Ack | null; receivedAt: number; telemetryAt: number; clock: number;
  packets: number; parseErrors: number; bootLines: number; gaps: number; hz: number; targetHz: number;
  interaction: InteractionState; tracks: Track[]; duplicates: number;
  filters: FilterConfig; simulation: SimulationConfig; recording: boolean; session: Session;
  setMode: (mode: Mode) => void; setConnection: (connection: State['connection']) => void;
  fail: (message: string, line?: string) => void; configure: (c: Partial<FilterConfig>) => void; simulate: (c: Partial<SimulationConfig>) => void;
  ingest: (p: Packet, now?: number, record?: boolean) => void; tick: (now?: number) => void;
  resetData: () => void; startRecording: () => void; stopRecording: () => void; load: (s: Session) => void;
}
let tracker = new Tracker(), recordStart = 0;
let lastSeq: number | null = null;
let frequency: { now: number; frames: number; targets: number }[] = [];
const blankInteraction = (): InteractionState => ({presence:null,primary:null,screen:null,velocity:{x:0,y:0},movementIntensity:0,freshness:0,tracking:'disconnected',timestamp:Date.now()});
export const useRadar = create<State>((set, get) => ({
  lastRejectedLine: null,
  mode: 'idle', connection: 'disconnected', error: '', packet: null, status: null, ack: null, receivedAt: 0, telemetryAt: 0, clock: Date.now(),
  packets: 0, parseErrors: 0, bootLines: 0, gaps: 0, hz: 0, targetHz: 0, interaction: blankInteraction(), tracks: [], duplicates: 0,
  filters: defaultFilters, simulation: defaultSimulation, recording: false, session: newSession(),
  setMode: mode => { get().resetData(); set({mode}); },
  setConnection: connection => { set({connection}); if (connection === 'lost' || connection === 'disconnected') get().tick(); },
  fail: (error, line) => set(s => ({error, parseErrors: s.parseErrors + 1, ...(line === undefined ? {} : {lastRejectedLine:{message:error,line:line.slice(0,8192),receivedAt:new Date().toISOString()}})})),
  configure: c => set(s => ({filters: {...s.filters, ...c}})), simulate: c => set(s => ({simulation: {...s.simulation, ...c}})),
  resetData: () => { tracker = new Tracker(); lastSeq = null; frequency = []; set({lastRejectedLine: null, packet: null, status: null, ack: null, receivedAt: 0, telemetryAt: 0, packets: 0, parseErrors: 0, bootLines: 0, gaps: 0, error: '', hz:0, targetHz:0, tracks: [], duplicates:0, interaction: blankInteraction()}); },
  ingest: (p, now = Date.now(), record = true) => {
    const s = get();
    let gaps = s.gaps;
    if (lastSeq !== null) { const delta = (p.seq - lastSeq) >>> 0; if (delta > 1 && delta < 100000) gaps += delta - 1; }
    lastSeq = p.seq;
    if (record && s.recording) {
      if (s.session.events.length >= MAX_EVENTS) set({recording:false, error:'Recording limit reached. Export this session.'});
      else s.session.events.push({ at: Math.max(0, now - recordStart), packet:p });
    }
    if (p.type === 'telemetry') {
      tracker.ingest(p, now, s.filters);
      const prior = frequency.at(-1);
      if (prior && (p.sensor_frames < prior.frames || p.target_frames < prior.targets)) frequency = [];
      frequency.push({now,frames:p.sensor_frames,targets:p.target_frames});
      frequency = frequency.filter(v => now - v.now <= 4000);
      const first = frequency[0], seconds = (now - first.now) / 1000;
      set({packet:p, telemetryAt:now, hz:seconds > 0 ? (p.sensor_frames-first.frames)/seconds : 0, targetHz:seconds > 0 ? (p.target_frames-first.targets)/seconds : 0});
    }
    if (p.type === 'status') set({status:p});
    if (p.type === 'ack') set({ack:p});
    set({packets:s.packets + 1, receivedAt:now, gaps}); get().tick(now);
  },
  tick: (now = Date.now()) => {
    const s = get(); const connected = s.mode === 'serial' ? s.connection === 'connected' : s.mode !== 'idle';
    const interaction = tracker.state(now, connected, s.filters);
    set({clock:now, interaction, tracks:[...tracker.tracks.values()], duplicates:tracker.duplicates});
  },
  startRecording: () => {recordStart = Date.now(); set({recording:true, session:newSession()});},
  stopRecording: () => set({recording:false}), load: session => set({session,recording:false})
}));
