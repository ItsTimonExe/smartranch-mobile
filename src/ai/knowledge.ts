/* What the AI agronomist knows: crop library, rules, live farm snapshot. */
import { CBY, CROPS, CROP_SYN, Crop, RATE_TXT } from '../data/crops';
import { nf } from '../lib/format';
import { GAME, LEAK, PREFS, SIM, WAP, ZONES } from '../sim/state';
import {
  EFF, RISE, STATUS_TXT, avgArea, clampMin, cropBand, cropOf, cropTrigger, ecw, gameClock, getSoil, saltCheck, valveTxt, zArea, zNeedL, zNeeds, zRecMin, zStatus,
} from '../sim/helpers';

const cropLine = (c: Crop) =>
  `${c.id} | ${c.name} (${c.group}) | Kc ${c.kc.join('/')} | roots ${c.zr[0]}-${c.zr[1]} m | p ${c.p} | trigger ${cropTrigger(c)} % | salt ${c.ece ? 'ECe ' + c.ece[1] + ' dS/m, b ' + c.b + ' %/dS/m' : 'no threshold'}, ${RATE_TXT[c.rate]}`;

export function aiSystem() {
  const SOIL = getSoil();
  return `You are "Ranch AI", the agronomist assistant inside the Smart Ranch app, a smart-irrigation app for small farms in Tunisia.
THE FARM: a well with a solar pump fills an elevated tank; water flows by gravity through the main valve V0 and the flow meter D0, then valve A feeds Field A (parcels A1-A6) and valve B feeds Field B (parcels B1-B6). Each parcel has its own crop, one capacitive soil-moisture sensor and 2 low-pressure sprinklers (8.4 L/min per parcel) that wet the whole parcel. The server runs at most ${SIM.maxOn} parcels at once (rotation queue). A salinity probe sits in the well. Leak protection: when D0 measures more flow than the parcels use, the server stops the pump and closes the valve of the leaking line. FAO WaPOR dekadal data (ETa actual evapotranspiration, ETp crop need, stress ratio ETa/ETp) is available per parcel; here it is simulated from the sensors.
AGRONOMY RULES: soil ${SOIL.name}: field capacity ${SOIL.fc} %, wilting point ${SOIL.wp} % on the sensor scale. Irrigate when moisture < trigger = WP + (1 - p) x (FC - WP) (FAO-56 readily available water); target band = trigger to ${SOIL.fc - 3} %. Crop water need ETc = Kc x RET (RET now ${nf(WAP.ret, 1)} mm/day); litres per day = ETc x area / ${EFF} (sprinkler efficiency). Irrigation raises moisture by about ${RISE} % per minute. Salinity: soil ECe = 1.5 x ECw of the water; yield loss % = b x (ECe - threshold).
CROP LIBRARY (FAO-56 tables 12, 22, 23): id | name | Kc ini/mid/end | max root depth | p | trigger on this soil | salt threshold, slope b, tolerance
${CROPS.map(cropLine).join('\n')}
HOW TO ANSWER: be a practical, confident field agronomist. Base every number on the live data and the library; never invent sensor values. When the farmer asks you to act (irrigate, stop, change a crop, auto mode, satellite pass), call the matching tool, then confirm in one short line what you did. Keep answers short: about 120 words maximum, '- ' bullets for lists, always name parcel ids and crops. Reply in the farmer's language: English by default; if they write in Tunisian Derja (Arabic or Latin letters), French or Arabic, answer in that language.`;
}

export function aiContext() {
  const yn = (v: number) => (v ? 'open' : 'closed');
  const parcels = ZONES.map((Z) => {
    const c = cropOf(Z), [lo, hi] = cropBand(c);
    return `${Z.id} | ${c.name} | ${Math.round(Z.hum)} % (target ${lo}-${hi}) | ${STATUS_TXT[zStatus(Z)]} | ${valveTxt(Z)} | recommended ${zNeeds(Z) ? clampMin(zRecMin(Z)) : 0} min | need ${Math.round(zNeedL(Z))} L/day | WaPOR ETa ${nf(Z.wap.aeti, 1)}/${nf(Z.wap.etp, 1)} mm/d, stress ${nf(Z.wap.relet, 2)} | ${Math.round(zArea(Z))} m²`;
  }).join('\n');
  return `LIVE FARM DATA at ${gameClock()} (farm clock):
Tank ${Math.round(SIM.level * 100)} % · well pump ${SIM.pumpLock ? 'LOCKED by leak protection' : SIM.pump ? 'running' : 'idle (automatic)'} · valves V0 ${yn(SIM.V0)}, A ${yn(SIM.A)}, B ${yn(SIM.B)} · leak: ${LEAK.on && LEAK.site ? LEAK.stage + ' on the ' + LEAK.site.name + ' (' + nf(LEAK.lost, 0) + ' L lost)' : 'none'} · leak protection ${PREFS.set.leakProt ? 'on' : 'off'}
Well salinity ${nf(SIM.sal, 1)} g/L (ECw ${nf(ecw(), 1)} dS/m) · auto irrigation ${SIM.auto ? 'on' : 'off'} · water used today ${nf(SIM.used, 0)} L of a ${nf(PREFS.set.budget, 0)} L budget · solar ${Math.round(SIM.pv * 1000)} W · battery ${Math.round(SIM.soc * 100)} %
WaPOR dekad ${WAP.dek}: farm ETa ${nf(WAP.mean.aeti, 1)} vs ETp ${nf(WAP.mean.etp, 1)} mm/day, RET ${nf(WAP.ret, 1)}, stressed: ${WAP.stressed.join(', ') || 'none'}
Parcels (id | crop | moisture (target) | status | valve | recommended minutes | crop need | WaPOR | area):
${parcels}`;
}

const cropKeys = (c: Crop) => [c.name.toLowerCase(), c.id, ...(CROP_SYN[c.id] || [])].sort((a, b) => b.length - a.length);
/** Crops mentioned in free text (EN / FR / Derja), in order of appearance. */
export function findCrops(q: string): Crop[] {
  const t = String(q).toLowerCase();
  let s = ' ' + t + ' ';
  const out: Crop[] = [];
  for (const id of ['watermelon', 'sugarbeet', 'datepalm', 'faba', ...CROPS.map((c) => c.id)]) {
    const c = CBY[id];
    if (out.includes(c)) continue;
    for (const k of cropKeys(c)) {
      if (k && s.includes(k)) { out.push(c); s = s.split(k).join(' # '); break; }
    }
  }
  const at = (c: Crop) => Math.min(...cropKeys(c).map((k) => { const i = t.indexOf(k); return i < 0 ? 1e9 : i; }));
  return out.sort((a, b) => at(a) - at(b));
}

export function cropInfo(c: Crop) {
  const [lo, hi] = cropBand(c), sc = saltCheck(c, ecw()), etc = c.kc[1] * WAP.ret;
  return {
    id: c.id, name: c.name, group: c.group, kc_ini_mid_end: c.kc, root_depth_m: c.zr, depletion_p: c.p, irrigate_below_pct: lo, target_pct: [lo, hi],
    water_need_mm_day: +etc.toFixed(2), litres_day_per_average_parcel: Math.round((etc * avgArea()) / EFF),
    salt: { tolerance: RATE_TXT[c.rate], ece_threshold_dS_m: c.ece ? c.ece[1] : null, slope_pct_per_dS_m: c.b,
      with_current_well_water: { ECw: +ecw().toFixed(2), ECe: +sc.ece.toFixed(2), yield_loss_pct: sc.loss === null ? null : Math.round(sc.loss) } },
    tip: c.tip, parcels_now: ZONES.filter((z) => z.crop === c.id).map((z) => z.id),
  };
}

export function farmSnapshot() {
  return {
    time: gameClock(), soil: getSoil().name, ret_mm_day: WAP.ret, tank_pct: Math.round(SIM.level * 100), pump: SIM.pumpLock ? 'locked' : SIM.pump ? 'running' : 'idle',
    valves: { V0: !!SIM.V0, A: !!SIM.A, B: !!SIM.B }, leak: LEAK.on && LEAK.site ? { stage: LEAK.stage, where: LEAK.site.name, litres_lost: Math.round(LEAK.lost) } : null,
    well_salinity_g_l: +SIM.sal.toFixed(2), ecw_dS_m: +ecw().toFixed(2), auto_irrigation: SIM.auto, max_parcels_at_once: SIM.maxOn, water_used_today_l: Math.round(SIM.used),
    parcels: ZONES.map((Z) => {
      const c = cropOf(Z), [lo, hi] = cropBand(c);
      return {
        id: Z.id, crop: c.name, moisture_pct: Math.round(Z.hum), target_pct: [lo, hi], status: STATUS_TXT[zStatus(Z)], valve: valveTxt(Z),
        recommended_min: zNeeds(Z) ? clampMin(zRecMin(Z)) : 0, need_l_day: Math.round(zNeedL(Z)),
        wapor: { eta: +Z.wap.aeti.toFixed(1), etp: +Z.wap.etp.toFixed(1), stress: +Z.wap.relet.toFixed(2) },
      };
    }),
  };
}
void GAME;
