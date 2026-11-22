/* Farm simulation engine: port of simStep / gameStep / leak protection / irrigation queue / WaPOR.
   Time unit: 1 real second = 1 game minute (dt passed by tick() is in game minutes). */
import { CBY } from '../data/crops';
import { DEFAULT_CROPS, HUM0, LEAKS, LeakSite } from '../data/farm';
import { clamp, damp, nf, rng } from '../lib/format';
import {
  GAME, LEAK, NOTES, Note, NoteKind, PREFS, REPAIR, SAT, SIM, WAP, ZBY, ZONES, Zone, buildZones, seedHistory, DEFAULT_SETTINGS,
} from './state';
import {
  EFF, RISE, cropBand, cropOf, cropTrigger, ecw, gameClock, leakLineOpen, leakOnLine, lineOpen, planItems, saltCheck,
  setSoil, zArea, zEq, zETc, zKs, zNeeds, zRecMin, zStatus, clampMin, getSoil,
} from './helpers';

/* ---------- hooks (the UI store registers itself here; the engine never imports the UI) ---------- */
export const hooks: {
  onNotify: (n: Note) => void;
  onToast: (msg: string, ms?: number) => void;
  onSave: () => void;
  onChange: () => void;
} = { onNotify: () => {}, onToast: () => {}, onSave: () => {}, onChange: () => {} };

export const toast = (msg: string, ms = 1800) => hooks.onToast(msg, ms);
let noteId = 1;
export function notify(kind: NoteKind, title: string, text: string, o: { tab?: string; zone?: string } = {}) {
  const n: Note = { id: noteId++, kind, title, text, time: gameClock(), tab: o.tab || 'alerts', zone: o.zone || null };
  NOTES.unshift(n);
  if (NOTES.length > 40) NOTES.pop();
  hooks.onNotify(n);
}

/* ---------- irrigation ---------- */
export function openZone(Z: Zone, dur: number, src: string): string {
  if (leakOnLine(Z.field) && LEAK.site) return `Unrepaired leak on the ${LEAK.site.name}: repair it first.`;
  if (SIM.level <= 0.02) return 'The tank is empty: wait for the pump to refill it.';
  unqueueZone(Z);
  SIM.V0 = 1;
  SIM[Z.field === 'tomato' ? 'A' : 'B'] = 1;
  Z.valve = 1; Z.tEnd = SIM.t + dur; Z.h0 = Z.hum; Z.src = src;
  return '';
}
export function closeZone(Z: Zone, done: boolean) {
  if (!Z.valve) return;
  Z.valve = 0; Z.tEnd = 0; Z.lastW = GAME.t; Z.lastGain = Z.hum - Z.h0;
  if (done && (Z.src === 'phone' || Z.src === 'ai')) {
    const [lo, hi] = cropBand(cropOf(Z));
    notify('water', `Parcel ${Z.id} irrigated`, `${cropOf(Z).name}: moisture ${Math.round(Z.h0)} % → ${Math.round(Z.hum)} % (target ${lo}–${hi} %). Valve closed.`, { tab: 'parcels', zone: Z.id });
  }
}
/** Rotation queue: the server never opens more than SIM.maxOn parcels at once (pump and tank flow). */
export function queueZone(Z: Zone, dur: number, src: string) {
  if (Z.valve || Z.queued) return false;
  Z.queued = { dur, src };
  SIM.queue.push(Z);
  return true;
}
export function unqueueZone(Z: Zone) {
  if (!Z.queued) return;
  Z.queued = null;
  SIM.queue = SIM.queue.filter((q) => q !== Z);
}
/** Smart irrigation: every parcel below its crop trigger gets its own recommended duration. */
export function smartIrrigate(src = 'phone', quiet = false): Zone[] {
  const list = ZONES.filter((Z) => zNeeds(Z) && !Z.valve && !Z.queued).sort((a, b) => zEq(a) - zEq(b));
  if (!list.length) { if (!quiet) toast('No parcel needs water right now', 1800); return []; }
  const ok = list.filter((Z) => !leakOnLine(Z.field));
  const blocked = list.length - ok.length;
  if (!ok.length) { if (!quiet && LEAK.site) toast(`Unrepaired leak on the ${LEAK.site.name}`, 2400); return []; }
  ok.forEach((Z) => queueZone(Z, clampMin(zRecMin(Z)), src));
  const nOn = ZONES.reduce((s, Z) => s + Z.valve, 0);
  const first = ok.slice(0, Math.max(0, SIM.maxOn - nOn)).map((Z) => Z.id);
  const wait = ok.slice(first.length).map((Z) => Z.id);
  const litres = ok.reduce((s, Z) => s + clampMin(zRecMin(Z)) * Z.flow, 0);
  if (!quiet) {
    notify('water', 'Smart irrigation started',
      `${first.length ? 'Now: ' + first.join(', ') + '. ' : ''}${wait.length ? 'Queued: ' + wait.join(', ') + ' (' + SIM.maxOn + ' parcels at a time). ' : ''}Each parcel gets the time its crop needs · about ${nf(litres, 0)} L.${blocked ? ' ' + blocked + ' parcel(s) skipped: leak on their line.' : ''}`,
      { tab: 'parcels' });
  }
  return ok;
}

/** Start/stop the irrigation of one parcel (drop button, detail, satellite view). Returns an error message or ''. */
export function toggleWater(Z: Zone, dur = 0): string {
  if (Z.valve) { closeZone(Z, false); toast(`Irrigation of ${Z.id} stopped`, 1500); return ''; }
  if (Z.queued) { unqueueZone(Z); toast(`${Z.id} removed from the queue`, 1500); return ''; }
  const m = dur || clampMin(zRecMin(Z) || 10);
  const err = openZone(Z, m, 'phone');
  toast(err || `${Z.id} · ${cropOf(Z).name}: irrigating ${m} min · whole parcel`, err ? 2600 : 1800);
  return err;
}

/* ---------- leak ---------- */
export function startLeak(id?: string): boolean {
  if (LEAK.on) return false;
  const site: LeakSite = LEAKS.find((l) => l.id === id) || LEAKS[Math.floor(Math.random() * LEAKS.length)];
  Object.assign(LEAK, { on: true, site, stage: 'leak', det: 0, auto: false, lost: 0, tDet: 0 });
  SIM.V0 = 1;
  if (site.valve !== 'V0') SIM[site.valve] = 1;
  return true;
}
/** Leak protection: the server stops the well pump and closes the motorised valve of the leaking line on its own. */
function emergencyShutdown() {
  const s = LEAK.site!;
  SIM.pumpLock = true; SIM.pump = false; SIM[s.valve] = 0;
  LEAK.auto = true; LEAK.stage = 'isolated';
  const off = ZONES.filter((Z) => Z.valve && !lineOpen(Z.field)).map((Z) => Z.id);
  LEAK.log.unshift({ t: gameClock(), site: s.name, lost: LEAK.lost, auto: true });
  notify('leak', 'Leak! Pump stopped automatically',
    `D0 measured ${nf(SIM.q, 1)} L/min for ${nf(SIM.qExp, 1)} L/min expected: leak on the ${s.name}. Emergency shutdown done in 1 s: well pump locked OFF, ${s.vname} closed${off.length ? ' (irrigation paused on ' + off.join(', ') + ')' : ''}. Only ${nf(LEAK.lost, 0)} L lost. Send a technician to repair it.`,
    { tab: 'home' });
}
export function startRepair() {
  if (!LEAK.on || REPAIR.on) return;
  REPAIR.on = true; REPAIR.t = 0;
  toast('Technician dispatched: repair in progress…', 2200);
}
function finishRepair() {
  const s = LEAK.site!;
  LEAK.on = false; REPAIR.on = false;
  if (LEAK.log[0]) LEAK.log[0].fixed = gameClock();
  toast('Leak repaired ✓', 2200);
  if (LEAK.auto) {
    SIM.pumpLock = false; SIM[s.valve] = 1; SIM.V0 = 1; LEAK.stage = '';
    notify('ok', 'Network restored automatically', `The ${s.name} is repaired. Pressure test OK: the pump is unlocked and ${s.vname} is open again. Paused irrigations resume.`, { tab: 'home' });
  } else {
    LEAK.stage = 'repaired';
    notify('ok', 'Leak repaired ✓', `The ${s.name} is repaired. Reopen ${s.vname} in the app to bring the water back${SIM.pumpLock ? ' and unlock the pump' : ''}.`, { tab: 'home' });
  }
}
export type LeakAct = 'close' | 'stop' | 'reopen' | 'repair';
export function leakAction(a: LeakAct) {
  const s = LEAK.site;
  if (!s) return;
  if (a === 'close') SIM[s.valve] = 0;
  if (a === 'stop') { SIM[s.valve] = 0; SIM.pumpLock = true; LEAK.auto = true; toast('Emergency stop: pump locked, valve closed', 2000); }
  if (a === 'reopen') { SIM[s.valve] = 1; SIM.V0 = 1; SIM.pumpLock = false; }
  if (a === 'repair') startRepair();
  hooks.onChange();
}

/* ---------- toggles ---------- */
export type ToggleKey = 'auto' | 'pump' | 'leakProt' | 'dryAlerts' | 'voice' | 'demoEvents' | 'V0' | 'A' | 'B';
export function toggleKey(k: ToggleKey) {
  if (k === 'auto') {
    SIM.auto = !SIM.auto; PREFS.set.auto = SIM.auto;
    toast(SIM.auto ? `Auto mode: each parcel is watered when it drops under its crop trigger, ${SIM.maxOn} at a time` : 'Auto mode off', 2600);
  } else if (k === 'pump') {
    if (SIM.pumpLock && LEAK.on) { toast('Repair the leak first: the pump stays locked', 2400); return; }
    SIM.pumpLock = !SIM.pumpLock;
    toast(SIM.pumpLock ? 'Well pump locked OFF' : 'Well pump back to automatic (refills the tank under 35 %)', 2200);
  } else if (k === 'leakProt') {
    PREFS.set.leakProt = !PREFS.set.leakProt;
    toast(PREFS.set.leakProt ? 'Leak protection on: pump stop + valve close on any leak' : 'Leak protection off: you will close the valves yourself', 2600);
  } else if (k === 'dryAlerts' || k === 'voice' || k === 'demoEvents') {
    PREFS.set[k] = !PREFS.set[k];
  } else {
    SIM[k] = SIM[k] ? 0 : 1;
    toast((k === 'V0' ? 'Main valve V0' : 'Valve ' + k) + (SIM[k] ? ' open' : ' closed'), 1600);
  }
  hooks.onSave(); hooks.onChange();
}
export const togOn = (k: ToggleKey) =>
  k === 'pump' ? !SIM.pumpLock : k === 'auto' ? SIM.auto : k === 'V0' || k === 'A' || k === 'B' ? !!SIM[k] : !!PREFS.set[k];

export function setSoilById(id: 'sandy' | 'loam' | 'clay') {
  PREFS.set.soil = id; setSoil(id);
  ZONES.forEach((z) => { z.dryN = false; });
  hooks.onSave(); hooks.onChange();
}
export function setMaxOn(n: number) { SIM.maxOn = n; PREFS.set.maxOn = n; hooks.onSave(); hooks.onChange(); }
export function setBudget(n: number) { PREFS.set.budget = n; GAME.budN = SIM.used > n ? GAME.budN : false; hooks.onSave(); hooks.onChange(); }
export function setAiTier(t: 'quick' | 'default' | 'complex') { PREFS.set.aiTier = t; hooks.onSave(); hooks.onChange(); }

/* ---------- crops ---------- */
export function setZoneCrop(Z: Zone, id: string) {
  if (!CBY[id]) return;
  Z.crop = id; PREFS.crops[Z.id] = id; Z.dryN = false;
  const R = rng(500 + WAP.dek * 7 + Z.id.charCodeAt(0) + Number(Z.id.slice(1)));
  waporZone(Z, R); waporPixels(Z, R); updateWapMeans();
  hooks.onSave(); hooks.onChange();
}
export function restoreDefaultCrops() {
  ZONES.forEach((z) => { if (z.crop !== DEFAULT_CROPS[z.id]) setZoneCrop(z, DEFAULT_CROPS[z.id]); });
}

/* ---------- WaPOR (FAO) — values simulated from the sensors, same products and units as WaPOR v3 ---------- */
const COVER_R: Record<string, number> = { tomato: 0.42, pepper: 0.42, bush: 0.55, leafy: 0.7, melon: 0.7, cereal: 0.7, olive: 1.15, citrus: 1.15, palm: 1.35 };
/** Decorative plant lattice of a parcel (rows for vegetables, grid for trees) used to texture the pixel layers. */
export function plantPositions(Z: Zone) {
  const w = Z.x1 - Z.x0, d = Z.z1 - Z.z0, a = cropOf(Z).arch, out: { x: number; z: number }[] = [];
  if (a === 'olive' || a === 'citrus' || a === 'palm') {
    const nx = Z.field === 'tomato' ? 3 : 2, nz = Z.field === 'tomato' ? 2 : 3;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out.push({ x: Z.x0 + (w * (i + 0.5)) / nx, z: Z.z0 + (d * (j + 0.5)) / nz });
    return out;
  }
  const rowsF = Z.field === 'tomato' ? [0.27, 0.73] : [0.2, 0.5, 0.8];
  if (Z.field === 'tomato') for (const f of rowsF) for (let x = Z.x0 + 0.4; x < Z.x1 - 0.2; x += 0.5) out.push({ x, z: Z.z0 + d * f });
  else for (const f of rowsF) for (let z = Z.z0 + 0.4; z < Z.z1 - 0.2; z += 0.5) out.push({ x: Z.x0 + w * f, z });
  return out;
}
function waporZone(Z: Zone, R: () => number) {
  const c = cropOf(Z), etp = zETc(Z), ks = zKs(Z, Z.ema);
  const icp = Z.lastW !== null && GAME.t - Z.lastW < 240 ? 0.15 : 0;
  const aeti = Math.max(0.2, etp * ks * (0.95 + R() * 0.07) + icp);
  const relet = clamp(aeti / etp, 0.05, 1);
  const cf = c.arch === 'olive' || c.arch === 'palm' || c.arch === 'citrus' ? 0.62 : c.arch === 'cereal' ? 0.9 : 1;
  const npp = Math.max(0.15, 4.6 * cf * relet * (0.94 + R() * 0.1));
  const bio = npp * 10 * 2.222; //            g of dry matter per m² over the 10 days
  const bwp = (2.222 * npp) / aeti; //          kg of biomass per m³ of water consumed
  const gap = Math.max(0, etp - aeti);
  Z.wap = { etp, aeti, relet, rsm: clamp((Z.ema - getSoil().wp) / (getSoil().fc - getSoil().wp), 0, 1), npp, bio, bwp, gap, gapL: gap * zArea(Z), at: WAP.dek };
}
function waporPixels(Z: Zone, R: () => number) {
  const L = Z.wl, w = Z.wap, pos = plantPositions(Z), cr = COVER_R[cropOf(Z).arch] || 0.5;
  for (let j = 0; j < L.rows; j++) {
    for (let i = 0; i < L.cols; i++) {
      const x = Z.x0 + ((i + 0.5) * (Z.x1 - Z.x0)) / L.cols, z = Z.z0 + ((j + 0.5) * (Z.z1 - Z.z0)) / L.rows;
      let dmin = 9;
      for (const p of pos) { const d = Math.hypot(p.x - x, p.z - z); if (d < dmin) dmin = d; }
      const cover = Math.exp(-Math.pow(dmin / cr, 2)), k = j * L.cols + i, n = R() - 0.5;
      L.v.aeti[k] = Math.max(0, w.aeti * (0.55 + 0.45 * cover) + 0.35 * (1 - cover) * w.rsm + n * 0.25);
      L.v.relet[k] = clamp(w.relet * (0.9 + 0.1 * cover) + n * 0.05, 0.05, 1);
      L.v.rsm[k] = clamp(w.rsm + n * 0.06, 0, 1);
      L.v.bio[k] = Math.max(0, w.bio * (0.35 + 0.65 * cover) + n * 6);
    }
  }
}
function updateWapMeans() {
  const A = ZONES.reduce((s, Z) => s + zArea(Z), 0);
  const avg = (k: 'aeti' | 'etp' | 'relet' | 'rsm' | 'bio' | 'bwp') => ZONES.reduce((s, Z) => s + Z.wap[k] * zArea(Z), 0) / A;
  Object.assign(WAP.mean, { aeti: avg('aeti'), etp: avg('etp'), relet: avg('relet'), rsm: avg('rsm'), bio: avg('bio'), bwp: avg('bwp'), gapL: ZONES.reduce((s, Z) => s + Z.wap.gapL, 0) });
  WAP.stressed = ZONES.filter((Z) => Z.wap.relet < 0.75).map((Z) => Z.id);
}
export function computeWapor() {
  const R = rng(97 + WAP.dek * 13);
  WAP.dek++;
  WAP.ret = Math.round((5.0 + R() * 0.8) * 10) / 10;
  ZONES.forEach((Z) => { waporZone(Z, R); waporPixels(Z, R); });
  updateWapMeans();
}
function startPass(fast: boolean) {
  if (SAT.active) return;
  SAT.active = true; SAT.u = fast ? 0.25 : 0; SAT.scanned = false; SAT.count++;
  ZONES.forEach((Z) => { const v = Z.wl.v; Z.wl.pv = { aeti: v.aeti.slice(), relet: v.relet.slice(), rsm: v.rsm.slice(), bio: v.bio.slice() }; });
  computeWapor();
  notify('sat', 'Satellite pass incoming', 'A Landsat-class satellite is imaging the fields for WaPOR. Open the WaPOR tab or the satellite view to watch the scan.', { tab: 'wapor' });
}
function finishScan() {
  SAT.scanned = true; WAP.last = GAME.t;
  WAP.hist.push([WAP.mean.aeti, WAP.mean.etp]);
  if (WAP.hist.length > 12) WAP.hist.shift();
  const st = WAP.stressed;
  notify('sat', 'New WaPOR dekad ready',
    `Farm ETa ${nf(WAP.mean.aeti, 1)} mm/day for a crop need of ${nf(WAP.mean.etp, 1)} mm/day (RET ${nf(WAP.ret, 1)}). ` +
    (st.length ? `Water stress in ${st.join(', ')}: about ${nf(WAP.mean.gapL, 0)} L/day missing.` : 'No parcel is water stressed.'), { tab: 'wapor' });
}
export function requestSatellitePass() {
  if (!SAT.active) { SAT.next = GAME.t; SAT.fast = true; }
}
function updateSat(dt: number) {
  if (!SAT.active && GAME.t >= SAT.next) startPass(SAT.fast);
  SAT.fast = false;
  if (SAT.active) {
    SAT.u += dt / SAT.dur;
    if (!SAT.scanned && SAT.u >= 0.7) finishScan();
    if (SAT.u >= 1) { SAT.active = false; SAT.next = GAME.t + 110; if (!SAT.scanned) finishScan(); }
  }
}

/* ---------- the farm step ---------- */
function simStep(dt: number) {
  SIM.t += dt;
  let qa = 0, qb = 0;
  const autoQ: string[] = [];
  for (const Z of ZONES) {
    if (Z.valve && Z.tEnd && SIM.t >= Z.tEnd) closeZone(Z, true);
    const flowing = Z.valve && lineOpen(Z.field) && SIM.level > 0.02;
    Z.open = damp(Z.open, flowing ? 1 : 0, 3, dt);
    if (flowing) { if (Z.field === 'tomato') qa += Z.flow; else qb += Z.flow; Z.usedL += Z.flow * dt; }
    const kcf = cropOf(Z).kc[1] / 1.05;
    Z.hum = clamp(Z.hum + (Z.open * RISE - Z.rate * kcf * (0.75 + 0.5 * Math.sin(SIM.t * 0.05 + Z.ph))) * dt, 6, 72);
    Z.ema += (Z.hum - Z.ema) * Math.min(1, dt / 30);
    const st = zStatus(Z);
    if (GAME.t > 12 && st === 'dry' && !Z.dryN && !Z.valve && !Z.queued && PREFS.set.dryAlerts) {
      Z.dryN = true;
      notify('dry', `Parcel ${Z.id} is dry`, `${cropOf(Z).name}: sensor ${Z.id} reads ${Math.round(Z.hum)} %, under its trigger of ${cropTrigger(cropOf(Z))} %. Recommended: ${clampMin(zRecMin(Z))} min of irrigation.`, { tab: 'parcels', zone: Z.id });
    }
    if (st === 'ok' || st === 'wet') Z.dryN = false;
    if (SIM.auto && !Z.valve && !Z.queued && zNeeds(Z) && !leakOnLine(Z.field) && queueZone(Z, clampMin(zRecMin(Z)), 'auto')) autoQ.push(Z.id);
  }
  let nOn = ZONES.reduce((s, Z) => s + Z.valve, 0);
  while (SIM.queue.length && nOn < SIM.maxOn) {
    const Z = SIM.queue.shift()!, q = Z.queued;
    Z.queued = null;
    if (!q || Z.valve || leakOnLine(Z.field)) continue;
    if (!openZone(Z, q.dur, q.src)) nOn++;
  }
  if (autoQ.length) {
    const wait = SIM.queue.map((Z) => Z.id);
    notify('water', 'Automatic irrigation', `Below their crop trigger: ${autoQ.join(', ')}. The server waters ${SIM.maxOn} parcels at a time${wait.length ? ' · queued: ' + wait.join(', ') : ''}.`, { tab: 'parcels' });
  }
  SIM.qa = qa; SIM.qb = qb; SIM.qExp = qa + qb;
  SIM.lq = LEAK.on && leakLineOpen() && SIM.level > 0.01 ? LEAK.rate : 0;
  SIM.q = SIM.V0 ? qa + qb + SIM.lq : 0;
  if (SIM.pumpLock) SIM.pump = false;
  else { if (SIM.level < 0.35) SIM.pump = true; if (SIM.level > 0.9) SIM.pump = false; }
  SIM.level = clamp(SIM.level + (((SIM.pump ? 25 : 0) - SIM.q) / 3000) * dt, 0, 1);
  SIM.pv = 0.62 + Math.sin(SIM.t * 0.07) * 0.04 + Math.sin(SIM.t * 0.53) * 0.01;
  SIM.load = (SIM.pump ? 0.3 : 0) + 0.025 + ZONES.reduce((s, Z) => s + Z.valve * 0.003, 0);
  SIM.soc = clamp(SIM.soc + (((SIM.pv - SIM.load) / 2.4) * dt) / 60, 0.05, 1);
  SIM.pt = 0.15 * 9.81 * ((qa + qb) / 60) * 3;
  if (SIM.salUntil && SIM.t > SIM.salUntil) { SIM.salT = 1.6; SIM.salUntil = 0; }
  SIM.sal = damp(SIM.sal, SIM.salT, 0.35, dt);
  if (SIM.sal > 2.2 && !SIM.salN) {
    SIM.salN = true;
    const hit = ZONES.map((Z) => ({ Z, r: saltCheck(cropOf(Z), ecw()) })).filter((o) => (o.r.loss ?? 0) > 10).sort((a, b) => (b.r.loss ?? 0) - (a.r.loss ?? 0));
    notify('sal', 'High salinity at the well',
      `The probe reads ${nf(SIM.sal, 1)} g/L (ECw ≈ ${nf(ecw(), 1)} dS/m). ` +
      (hit.length ? `Most affected: ${hit.slice(0, 3).map((o) => o.Z.id + ' ' + cropOf(o.Z).name + ' −' + Math.round(o.r.loss ?? 0) + ' %').join(', ')}. Salt-tolerant options: barley, date palm, sugar beet.` : 'Your crops tolerate this water.'),
      { tab: 'home' });
  }
  if (SIM.sal < 1.9) SIM.salN = false;
  if (LEAK.on && SIM.lq > 0) LEAK.lost += SIM.lq * dt;
  if (LEAK.on && LEAK.stage === 'leak') {
    if (SIM.lq > 0) LEAK.det += dt;
    if (LEAK.det > 3.5) {
      LEAK.stage = 'detected'; LEAK.tDet = GAME.t;
      if (PREFS.set.leakProt) emergencyShutdown();
      else {
        LEAK.log.unshift({ t: gameClock(), site: LEAK.site!.name, lost: LEAK.lost, auto: false });
        notify('leak', 'Leak detected!', `D0 measures ${nf(SIM.q, 1)} L/min while the parcels ask for ${nf(SIM.qExp, 1)} L/min. Probable leak on the ${LEAK.site!.name}: close ${LEAK.site!.vname} in the app (auto shutdown is off).`, { tab: 'home' });
      }
    }
  }
  if (LEAK.on && LEAK.stage === 'detected' && !leakLineOpen()) {
    LEAK.stage = 'isolated';
    if (LEAK.log[0]) LEAK.log[0].lost = LEAK.lost;
    notify('ok', 'Leak isolated', `${LEAK.site!.vname[0].toUpperCase() + LEAK.site!.vname.slice(1)} is closed and the water has stopped (${nf(LEAK.lost, 0)} L lost). Send a technician to repair the pipe.`, { tab: 'home' });
  }
  if (!LEAK.on && LEAK.stage === 'repaired' && leakLineOpen()) {
    LEAK.stage = ''; SIM.pumpLock = false;
    notify('ok', 'Network restored', 'The valve is open again: the flow measured by D0 is back to normal.', { tab: 'home' });
  }
  /* daily counters + history (1 point per game minute) */
  SIM.used += SIM.q * dt;
  SIM.ewh += ((SIM.pv * 1000 + SIM.pt) * dt) / 60;
  SIM.histT += dt;
  if (SIM.histT >= 1) { SIM.histT -= 1; pushHist(); }
}
function pushHist() {
  for (const Z of ZONES) {
    Z.hist.push(Z.hum); Z.histW.push(Z.valve ? 1 : 0);
    if (Z.hist.length > 90) { Z.hist.shift(); Z.histW.shift(); }
  }
  SIM.qHist.push(SIM.q);
  if (SIM.qHist.length > 90) SIM.qHist.shift();
}
function gameStep(dt: number) {
  GAME.t += dt;
  if (SIM.pump) SIM.pumpMin += dt;
  if (REPAIR.on) { REPAIR.t += dt; if (REPAIR.t >= 4) finishRepair(); }
  if (!GAME.welcome && GAME.t > 4) {
    GAME.welcome = true;
    notify('ok', 'Welcome to Smart Ranch', 'Tap the parcels on the Home map to irrigate, ask the AI agronomist, or open the satellite view.', { tab: 'home' });
  }
  if (PREFS.set.demoEvents && GAME.leakAuto && GAME.t > GAME.leakAuto && !LEAK.on && !LEAK.stage) { GAME.leakAuto = 0; startLeak('main'); }
  if (!GAME.budN && SIM.used > PREFS.set.budget) {
    GAME.budN = true;
    notify('dry', 'Daily water budget reached', `${nf(SIM.used, 0)} L used for a budget of ${nf(PREFS.set.budget, 0)} L. Check the plan or raise the budget in More › Water budget.`, { tab: 'more' });
  }
}

export function tick(dt: number) {
  gameStep(dt);
  updateSat(dt);
  simStep(dt);
}

/* ---------- reset, scenarios, init ---------- */
export function resetFarm() {
  LEAK.on = false; LEAK.stage = ''; LEAK.auto = false; REPAIR.on = false;
  SIM.V0 = SIM.A = SIM.B = 1; SIM.pumpLock = false; SIM.salT = 1.6; SIM.salUntil = 0; SIM.auto = false; PREFS.set.auto = false; SIM.queue = [];
  ZONES.forEach((Z) => { Z.valve = 0; Z.tEnd = 0; Z.queued = null; Z.hum = Z.ema = HUM0[Z.id]; Z.dryN = false; });
  hooks.onSave(); hooks.onChange();
}
export function makeDry(n: number) {
  const pick = ZONES.filter((Z) => !Z.valve).sort(() => Math.random() - 0.5).slice(0, n);
  pick.forEach((Z) => { const t = cropTrigger(cropOf(Z)), wp = getSoil().wp; Z.hum = Z.ema = wp + (t - wp) * (0.15 + Math.random() * 0.2); Z.dryN = true; });
  return pick;
}
export type Scenario = 'leak' | 'dry' | 'auto' | 'sal' | 'sat' | 'grove' | 'reset';
export function runScenario(k: Scenario) {
  if (k === 'leak') { GAME.leakAuto = 0; toast(startLeak() ? 'Leak simulated: watch D0 and the pump…' : 'A leak is already in progress', 2400); }
  if (k === 'sal') { SIM.salT = 2.9; SIM.salUntil = SIM.t + 70; toast('The well salinity is rising…', 1800); }
  if (k === 'dry') {
    const pick = makeDry(4);
    notify('dry', `Drought: ${pick.length} parcels are dry`, `${pick.map((Z) => Z.id + ' ' + cropOf(Z).name).join(', ')} dropped far under their crop trigger. Use smart irrigation, the AI assistant or auto mode.`, { tab: 'parcels' });
  }
  if (k === 'auto') { makeDry(5); SIM.auto = true; PREFS.set.auto = true; hooks.onSave(); toast(`Auto mode: the server waters every parcel under its crop trigger, ${SIM.maxOn} at a time`, 2800); }
  if (k === 'sat') { requestSatellitePass(); toast('The WaPOR satellite is passing: open the WaPOR tab', 2400); }
  if (k === 'grove') {
    ZONES.filter((Z) => Z.field === 'tomato').forEach((Z) => setZoneCrop(Z, 'olive'));
    toast(`Field A is now an olive grove · irrigated under ${cropTrigger(CBY.olive)} % instead of ${cropTrigger(CBY.tomato)} %`, 3200);
  }
  if (k === 'reset') { resetFarm(); toast('Farm reset (crops kept)', 1600); }
  hooks.onChange();
}

/* ---------- AI actions shared by Claude tools and the offline expert ---------- */
export function parseIds(q: string): string[] {
  const s = ' ' + String(q) + ' ', out = new Set<string>();
  for (const m of s.matchAll(/(?:^|[^a-z0-9])([ab])\s?-?([1-6])(?![0-9])/gi)) out.add(m[1].toUpperCase() + m[2]);
  if (/\b(field|champ)\s*a\b/i.test(s)) ZONES.filter((z) => z.field === 'tomato').forEach((z) => out.add(z.id));
  if (/\b(field|champ)\s*b\b/i.test(s)) ZONES.filter((z) => z.field === 'pepper').forEach((z) => out.add(z.id));
  if (/^\s*all\s*$|all (the )?parcels|every parcel|toutes les parcelles|koul el parcel/i.test(s)) ZONES.forEach((z) => out.add(z.id));
  return [...out].sort();
}
export const normIds = (x: unknown) => parseIds(Array.isArray(x) ? x.join(' ') : String(x || ''));
export function doIrrigate(ids: string[], minutes: number, src: string) {
  const out = { started: [] as string[], queued: [] as string[], skipped: [] as string[] };
  let nOn = ZONES.reduce((s, Z) => s + Z.valve, 0);
  for (const id of ids) {
    const Z = ZBY[id];
    if (!Z) { out.skipped.push(id + ': unknown parcel'); continue; }
    if (Z.valve) { out.skipped.push(id + ': already irrigating'); continue; }
    if (leakOnLine(Z.field)) { out.skipped.push(id + ': leak on its line, repair first'); continue; }
    const m = minutes ? clamp(Math.round(minutes), 1, 120) : clampMin(zRecMin(Z) || 10);
    if (Z.queued) unqueueZone(Z);
    if (nOn < SIM.maxOn) {
      const e = openZone(Z, m, src);
      if (e) { out.skipped.push(id + ': ' + e); continue; }
      nOn++; out.started.push(id + ' ' + m + ' min');
    } else { queueZone(Z, m, src); out.queued.push(id + ' ' + m + ' min'); }
  }
  hooks.onChange();
  return out;
}
export function doStop(ids: string[]) {
  const out: string[] = [];
  ids.forEach((id) => {
    const Z = ZBY[id];
    if (!Z) return;
    if (Z.valve) { closeZone(Z, false); out.push(id); }
    else if (Z.queued) { unqueueZone(Z); out.push(id + ' (queue)'); }
  });
  hooks.onChange();
  return out;
}

/** Boot: build parcels with defaults, seed history, first WaPOR dekad (call once, synchronously, before rendering). */
export function initFarm() {
  setSoil(PREFS.set.soil);
  SIM.auto = !!PREFS.set.auto;
  SIM.maxOn = PREFS.set.maxOn || 3;
  buildZones();
  seedHistory(RISE);
  computeWapor();
  WAP.last = 0;
  WAP.hist.push([WAP.mean.aeti, WAP.mean.etp]);
}
/** Apply preferences loaded asynchronously from storage. */
export function applySaved(saved: { crops?: Record<string, string>; set?: Partial<typeof DEFAULT_SETTINGS> } | null) {
  if (!saved) return;
  Object.assign(PREFS.set, saved.set || {});
  setSoil(PREFS.set.soil);
  SIM.auto = !!PREFS.set.auto;
  SIM.maxOn = PREFS.set.maxOn || 3;
  for (const [id, c] of Object.entries(saved.crops || {})) {
    const Z = ZBY[id];
    if (Z && CBY[c] && Z.crop !== c) { Z.crop = c; PREFS.crops[id] = c; }
  }
  const R = rng(321);
  ZONES.forEach((Z) => { waporZone(Z, R); waporPixels(Z, R); });
  updateWapMeans();
  hooks.onChange();
}
export { EFF, planItems, DEFAULT_CROPS };
