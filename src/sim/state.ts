/* Mutable farm state (the "digital twin"). One module-level object graph, mutated by engine.ts at 4 Hz;
   screens subscribe through the UI store tick counter. Ported from the web prototype (SIM, LEAK, WAP, SAT…). */
import { FieldId, FIELD_META, HUM0, DEFAULT_CROPS, ZONE_DEFS, ZONE_FLOW, LeakSite } from '../data/farm';
import { CBY } from '../data/crops';
import { clamp, rng } from '../lib/format';
import type { ProdKey } from '../lib/colors';

export interface Settings {
  auto: boolean;
  maxOn: number;
  leakProt: boolean;
  soil: 'sandy' | 'loam' | 'clay';
  dryAlerts: boolean;
  voice: boolean;
  budget: number;
  aiTier: 'quick' | 'default' | 'complex';
  demoEvents: boolean;
}
export const DEFAULT_SETTINGS: Settings = {
  auto: false, maxOn: 3, leakProt: true, soil: 'loam', dryAlerts: true, voice: false, budget: 2500, aiTier: 'default', demoEvents: true,
};

export const PREFS: { crops: Record<string, string>; set: Settings } = {
  crops: { ...DEFAULT_CROPS },
  set: { ...DEFAULT_SETTINGS },
};

export interface Wap {
  etp: number; aeti: number; relet: number; rsm: number; npp: number; bio: number; bwp: number; gap: number; gapL: number; at: number;
}
export type Layers = Record<ProdKey, Float32Array>;
export interface WLayer { cols: number; rows: number; v: Layers; pv?: Layers }

export interface Zone {
  id: string;
  field: FieldId;
  x0: number; z0: number; x1: number; z1: number; cx: number; cz: number;
  hum: number; ema: number;
  valve: 0 | 1; open: number; tEnd: number; h0: number; dryN: boolean;
  flow: number; rate: number; ph: number;
  lastW: number | null; lastGain: number;
  queued: { dur: number; src: string } | null;
  hist: number[]; histW: number[];
  crop: string; usedL: number;
  src?: string;
  wap: Wap;
  wl: WLayer;
}

export const ZONES: Zone[] = [];
export const ZBY: Record<string, Zone> = {};
export const FIELD: Record<FieldId, { name: string; pre: string; col: string; zones: Zone[] }> = {
  tomato: { ...FIELD_META.tomato, zones: [] },
  pepper: { ...FIELD_META.pepper, zones: [] },
};

export interface Sim {
  t: number; level: number; pump: boolean; pumpLock: boolean;
  V0: 0 | 1; A: 0 | 1; B: 0 | 1;
  q: number; qExp: number; qa: number; qb: number; lq: number;
  pv: number; load: number; soc: number; pt: number;
  sal: number; salT: number; salUntil: number; salN: boolean;
  auto: boolean; maxOn: number; queue: Zone[];
  used: number; ewh: number; histT: number; qHist: number[]; pumpMin: number;
}
export const SIM: Sim = {
  t: 0, level: 0.66, pump: false, pumpLock: false, V0: 1, A: 1, B: 1, q: 0, qExp: 0, qa: 0, qb: 0, lq: 0,
  pv: 0.62, load: 0.03, soc: 0.78, pt: 0, sal: 1.6, salT: 1.6, salUntil: 0, salN: false,
  auto: false, maxOn: 3, queue: [], used: 0, ewh: 0, histT: 0, qHist: [], pumpMin: 0,
};

export const GAME = { t: 0, leakAuto: 80, welcome: false, budN: false };

export interface LeakLog { t: string; site: string; lost: number; auto: boolean; fixed?: string }
export const LEAK: {
  on: boolean; site: LeakSite | null; stage: '' | 'leak' | 'detected' | 'isolated' | 'repaired';
  det: number; rate: number; auto: boolean; lost: number; tDet: number; log: LeakLog[];
} = { on: false, site: null, stage: '', det: 0, rate: 16, auto: false, lost: 0, tDet: 0, log: [] };
export const REPAIR = { on: false, t: 0 };

export const WAP: {
  ret: number; dek: number; last: number; prod: ProdKey;
  mean: { aeti: number; etp: number; relet: number; rsm: number; bio: number; bwp: number; gapL: number };
  stressed: string[]; hist: [number, number][];
} = {
  ret: 5.4, dek: 0, last: -1, prod: 'aeti',
  mean: { aeti: 0, etp: 0, relet: 1, rsm: 0, bio: 0, bwp: 0, gapL: 0 }, stressed: [],
  hist: [[3.4, 4.9], [3.7, 5.0], [3.9, 5.2], [3.6, 5.3], [4.1, 5.2], [3.8, 5.5], [4.2, 5.4], [3.9, 5.6], [4.0, 5.3]],
};

/** Satellite pass. u: 0 → 1 over `dur` game seconds; the scan sweeps north → south for u in [0.3, 0.7]. */
export const SAT = { next: 24, active: false, u: 0, dur: 38, scanned: false, count: 0, fast: false };

export type NoteKind = 'leak' | 'water' | 'dry' | 'sal' | 'sat' | 'ok' | 'crop' | 'ai';
export interface Note { id: number; kind: NoteKind; title: string; text: string; time: string; tab: string; zone: string | null }
export const NOTES: Note[] = [];

/* ---------- construction ---------- */
function makeLayer(cols: number, rows: number): WLayer {
  const n = cols * rows;
  return { cols, rows, v: { aeti: new Float32Array(n), relet: new Float32Array(n), rsm: new Float32Array(n), bio: new Float32Array(n) } };
}

const emptyWap = (): Wap => ({ etp: 0, aeti: 0, relet: 1, rsm: 0, npp: 0, bio: 0, bwp: 0, gap: 0, gapL: 0, at: 0 });

export function buildZones(seed = 7) {
  ZONES.length = 0;
  FIELD.tomato.zones.length = 0;
  FIELD.pepper.zones.length = 0;
  const R = rng(seed);
  for (const d of ZONE_DEFS) {
    const h = HUM0[d.id] ?? 40;
    const cols = Math.round((d.x1 - d.x0) / 0.5);
    const rows = Math.round((d.z1 - d.z0) / 0.5);
    const Z: Zone = {
      ...d, cx: (d.x0 + d.x1) / 2, cz: (d.z0 + d.z1) / 2, hum: h, ema: h,
      valve: 0, open: 0, tEnd: 0, h0: 0, dryN: false, flow: ZONE_FLOW,
      rate: 0.085 + R() * 0.05, ph: R() * 6, lastW: null, lastGain: 0, queued: null,
      hist: [], histW: [], crop: CBY[PREFS.crops[d.id]] ? PREFS.crops[d.id] : DEFAULT_CROPS[d.id], usedL: 0,
      wap: emptyWap(), wl: makeLayer(cols, rows),
    };
    ZONES.push(Z);
    ZBY[d.id] = Z;
    FIELD[d.field].zones.push(Z);
  }
}

/** 90 minutes of history before 08:00 (5 irrigations ended N minutes ago), so the charts are not empty. */
export function seedHistory(RISE: number) {
  const IRR: Record<string, number> = { A4: 38, B5: 30, B1: 55, A1: 64, B4: 47 };
  for (const Z of ZONES) {
    const a = IRR[Z.id];
    const H: number[] = [];
    const Wv: number[] = [];
    let h = 0;
    for (let m = 90; m >= 1; m--) {
      const w = a && m <= a + 30 && m > a ? 1 : 0;
      h += (w ? RISE : 0) - Z.rate * 0.75 * (1 + 0.3 * Math.sin(m * 0.21 + Z.ph));
      H.push(h);
      Wv.push(w);
    }
    const off = Z.hum - H[H.length - 1];
    Z.hist = H.map((v) => clamp(v + off, 6, 72));
    Z.histW = Wv;
    if (a) {
      Z.lastW = -a;
      Z.lastGain = 30 * RISE - 30 * Z.rate * 0.75;
      Z.usedL = 30 * Z.flow;
    }
  }
  SIM.qHist = Array.from({ length: 90 }, (_, i) => ZONES.reduce((s, Z) => s + (Z.histW[i] ? Z.flow : 0), 0));
  SIM.used = SIM.qHist.reduce((s, v) => s + v, 0);
}
