/* Pure-ish agronomy and network helpers (FAO-56). They read the shared farm state. */
import { CBY, Crop, SOILS, Soil } from '../data/crops';
import { clamp, clockAt } from '../lib/format';
import { humCss, humHex } from '../lib/colors';
import { GAME, LEAK, SIM, WAP, ZONES, Zone } from './state';

export const EFF = 0.75; //  sprinkler application efficiency
export const RISE = 1.25; // moisture gain per minute of irrigation (simulation)

let SOIL: Soil = SOILS.loam;
export const getSoil = () => SOIL;
export const setSoil = (id: string) => { SOIL = SOILS[id] ?? SOIL; };

export const cropOf = (Z: Zone): Crop => CBY[Z.crop] || CBY.tomato;
/** Irrigation trigger = wilting point + (1 − p) × available water (FAO-56 readily available water). */
export const cropTrigger = (c: Crop) => Math.round(SOIL.wp + (1 - c.p) * (SOIL.fc - SOIL.wp));
export const cropBand = (c: Crop): [number, number] => [cropTrigger(c), SOIL.fc - 3];

/** Equivalent moisture for colours: 10 = wilting, 40 = crop trigger, 58 = field capacity. */
export function zEq(Z: Zone, h = Z.hum) {
  const t = cropTrigger(cropOf(Z));
  if (h < t) return 10 + clamp((h - SOIL.wp) / Math.max(1, t - SOIL.wp), 0, 1) * 30;
  if (h <= SOIL.fc) return 40 + ((h - t) / Math.max(1, SOIL.fc - t)) * 18;
  return Math.min(72, 58 + (h - SOIL.fc) * 1.4);
}
export type Status = 'dry' | 'low' | 'ok' | 'wet';
export function zStatus(Z: Zone): Status {
  const e = zEq(Z);
  return e < 25 ? 'dry' : e < 40 ? 'low' : e <= 61 ? 'ok' : 'wet';
}
export const STATUS_TXT: Record<Status, string> = { dry: 'Dry · stressed', low: 'Needs water', ok: 'Optimal', wet: 'Too wet' };
export const STATUS_COL: Record<Status, { bg: string; fg: string }> = {
  dry: { bg: '#fde4e1', fg: '#b42318' }, low: { bg: '#fff0d1', fg: '#9a5a05' },
  ok: { bg: '#dcf5e3', fg: '#166534' }, wet: { bg: '#dbe9fe', fg: '#1e4fae' },
};
export const zNeeds = (Z: Zone) => zStatus(Z) === 'dry' || zStatus(Z) === 'low';
/** FAO-56 water stress coefficient Ks (1 = no stress). */
export const zKs = (Z: Zone, h = Z.hum) => clamp((h - SOIL.wp) / Math.max(1, cropTrigger(cropOf(Z)) - SOIL.wp), 0, 1);
export const zArea = (Z: Zone) => (Z.x1 - Z.x0) * (Z.z1 - Z.z0);
export const zETc = (Z: Zone) => cropOf(Z).kc[1] * WAP.ret; //       mm/day
export const zNeedL = (Z: Zone) => (zETc(Z) * zArea(Z)) / EFF; //     litres/day, sprinkler losses included
export const zRecMin = (Z: Zone) => {
  const [lo, hi] = cropBand(cropOf(Z));
  const target = lo + (hi - lo) * 0.7;
  return Math.max(0, Math.ceil((target - Z.hum) / RISE));
};
export const clampMin = (m: number) => clamp(Math.round(m), 5, 60);
export const zCss = (Z: Zone, a = 1) => humCss(zEq(Z), a);
export const humHexOf = (Z: Zone) => humHex(zEq(Z));

/** Salinity: soil ECe ≈ 1.5 × irrigation water ECw (FAO-29); yield loss = b × (ECe − threshold). */
export function saltCheck(c: Crop, ecwv: number) {
  const ece = 1.5 * ecwv;
  if (!c.ece || c.b === null) {
    return { ece, loss: null as number | null, txt: c.rate === 'MT' || c.rate === 'T' ? 'Tolerant enough for this water' : 'No FAO threshold: watch the crop' };
  }
  const loss = Math.max(0, (ece - c.ece[1]) * c.b);
  return { ece, loss: loss as number | null, txt: loss <= 0 ? 'No yield loss expected' : loss < 10 ? 'Small yield loss' : loss < 25 ? 'Moderate yield loss' : 'High yield loss' };
}
export const ecw = () => SIM.sal / 0.64; // irrigation water EC (dS/m) from the salinity probe (g/L)
export const salWord = (s: number) => (s > 2.2 ? 'high' : s > 1 ? 'medium' : 'low');

/* ---------- water network ---------- */
export const lineOpen = (f: string) => !!(SIM.V0 && (f === 'tomato' ? SIM.A : SIM.B));
export function leakLineOpen() {
  const s = LEAK.site;
  return !!(s && SIM.V0 && (s.valve === 'V0' || SIM[s.valve]));
}
export function leakOnLine(f: string) {
  if (!LEAK.on || !LEAK.site) return false;
  const v = LEAK.site.valve;
  return v === 'V0' || (v === 'A' && f === 'tomato') || (v === 'B' && f === 'pepper');
}
export const valveTxt = (Z: Zone) =>
  Z.valve
    ? (lineOpen(Z.field) ? 'irrigating · ' : 'paused (line closed) · ') + Math.max(0, Math.ceil(Z.tEnd - SIM.t)) + ' min left'
    : Z.queued ? 'queued (rotation)' : 'closed';

export const avgArea = () => ZONES.reduce((s, z) => s + zArea(z), 0) / ZONES.length;

/** Irrigation plan: parcels under their trigger, most urgent first, in rotation over SIM.maxOn channels. */
export interface PlanItem { Z: Zone; min: number; start: number; end: number; L: number; q: boolean }
export function planItems(): PlanItem[] {
  const ch = ZONES.filter((Z) => Z.valve).map((Z) => Math.max(0, Z.tEnd - SIM.t));
  while (ch.length < SIM.maxOn) ch.push(0);
  const need = ZONES.filter((Z) => zNeeds(Z) && !Z.valve && !Z.queued).sort((a, b) => zEq(a) - zEq(b));
  return [...SIM.queue, ...need].map((Z) => {
    const min = Z.queued ? Z.queued.dur : clampMin(zRecMin(Z));
    ch.sort((a, b) => a - b);
    const start = ch[0];
    ch[0] = start + min;
    return { Z, min, start, end: start + min, L: min * Z.flow, q: !!Z.queued };
  });
}

export const gameClock = () => clockAt(GAME.t);
export const clockIn = (d: number) => clockAt(GAME.t + d);
