/* Offline expert: rules + FAO-56 data, used when no Claude API key is configured or the API fails.
   Understands English, French and Tunisian Derja keywords. Port of offlineAnswer() from the prototype. */
import { CROPS, Crop, RATE_TXT } from '../data/crops';
import { nf, ago, clockAt } from '../lib/format';
import { GAME, LEAK, PREFS, SIM, WAP, ZBY, ZONES, Zone } from '../sim/state';
import {
  EFF, STATUS_TXT, avgArea, clampMin, cropBand, cropOf, cropTrigger, ecw, gameClock, leakLineOpen, planItems, saltCheck, salWord, valveTxt, zEq, zNeedL, zNeeds, zRecMin, zStatus,
} from '../sim/helpers';
import { doIrrigate, doStop, hooks, parseIds, setZoneCrop, smartIrrigate } from '../sim/engine';
import { findCrops } from './knowledge';

export interface Draft { text: string; acts: string[]; src?: string }

const fmtStatus = (Z: Zone) => `${Z.id} ${cropOf(Z).name}: ${Math.round(Z.hum)} % (target ${cropBand(cropOf(Z)).join('–')})`;
const saltTxt = (c: Crop) => {
  const sc = saltCheck(c, ecw());
  return sc.loss === null ? sc.txt.toLowerCase() : sc.loss <= 0 ? 'no yield loss expected' : `about −${Math.round(sc.loss)} % yield`;
};

function offCrop(c: Crop) {
  const [lo, hi] = cropBand(c), etc = c.kc[1] * WAP.ret, on = ZONES.filter((z) => z.crop === c.id).map((z) => z.id);
  return `**${c.name}** (${c.group}) · FAO-56\n- Water: Kc ${c.kc.join(' → ')}, so about **${nf(etc, 1)} mm/day** now (RET ${nf(WAP.ret, 1)}), ≈ ${nf((etc * avgArea()) / EFF, 0)} L/day per parcel.\n- Irrigate when the sensor drops under **${lo} %** (p = ${c.p}); keep it in ${lo}–${hi} %.\n- Roots ${c.zr[0]}–${c.zr[1]} m · salt: ${RATE_TXT[c.rate].toLowerCase()}${c.ece ? ` (ECe ${c.ece[1]} dS/m)` : ''}.\n- With your well water (ECw ${nf(ecw(), 1)} dS/m): ${saltTxt(c)}.\n- ${c.tip}\n${on.length ? 'On your farm: ' + on.join(', ') + '.' : 'Not planted on your farm yet: say "plant ' + c.name.toLowerCase() + ' on B6" to try it.'}`;
}
function offCompare(cs: Crop[]) {
  const L = cs.map((c) => ({ c, etc: c.kc[1] * WAP.ret })).sort((a, b) => a.etc - b.etc), lo = L[0], hi = L[L.length - 1];
  return `**${cs.map((c) => c.name).join(' vs ')}** (FAO-56, RET ${nf(WAP.ret, 1)} mm/day)\n` +
    L.map(({ c, etc }) => `- ${c.name}: ${nf(etc, 1)} mm/day · irrigate under ${cropTrigger(c)} % (p ${c.p}) · roots ${c.zr[1]} m · salt: ${saltTxt(c)}`).join('\n') +
    `\n${lo.c.name} uses **${Math.round((1 - lo.etc / hi.etc) * 100)} % less water** than ${hi.c.name}${lo.c.p > hi.c.p ? ' and tolerates a drier soil' : ''}.`;
}
function offParcel(Z: Zone) {
  const c = cropOf(Z), [lo, hi] = cropBand(c), rec = clampMin(zRecMin(Z) || 10);
  return `**${Z.id} · ${c.name}** — ${STATUS_TXT[zStatus(Z)]}\n- Moisture ${Math.round(Z.hum)} % (target ${lo}–${hi} %, trigger ${lo} %).\n- ${zNeeds(Z) ? `Recommended: **${rec} min** of irrigation (≈ ${nf(rec * Z.flow, 0)} L).` : 'No irrigation needed now.'}\n- WaPOR: ETa ${nf(Z.wap.aeti, 1)} / ETp ${nf(Z.wap.etp, 1)} mm/day (stress ${nf(Z.wap.relet, 2)}).\n- Crop need today ${nf(zNeedL(Z), 0)} L · salt: ${saltTxt(c)}.\n- Valve ${valveTxt(Z)}${Z.lastW !== null ? ' · last irrigation ' + ago(Math.max(1, GAME.t - Z.lastW)) + ' ago' : ''}.` +
    (zNeeds(Z) && !Z.valve ? `\nSay "water ${Z.id}" and I start it.` : '');
}
function offStatus() {
  const need = ZONES.filter(zNeeds).sort((a, b) => zEq(a) - zEq(b)), ok = ZONES.filter((z) => !zNeeds(z));
  return (need.length
    ? `**${need.length} parcel${need.length > 1 ? 's need' : ' needs'} water:**\n` + need.map((Z) => `- ${fmtStatus(Z)} → ${Z.valve ? 'irrigating now' : Z.queued ? 'queued' : clampMin(zRecMin(Z)) + ' min'}`).join('\n')
    : '**Every parcel is above its crop trigger.**') +
    (ok.length ? `\n**Fine:** ${ok.map((z) => z.id).join(', ')}.` : '') +
    (need.some((z) => !z.valve && !z.queued) ? '\nSay "water all dry parcels" to start them in rotation.' : '');
}
function offBrief() {
  const pl = planItems(), ok = ZONES.filter((z) => zStatus(z) === 'ok').map((z) => z.id);
  const hit = ZONES.map((Z) => ({ Z, r: saltCheck(cropOf(Z), ecw()) })).filter((o) => (o.r.loss ?? 0) > 10).sort((a, b) => (b.r.loss ?? 0) - (a.r.loss ?? 0));
  return `**Briefing · ${gameClock()}**\n` +
    (pl.length ? `- To water: ${pl.map((p) => p.Z.id + ' ' + cropOf(p.Z).name + ' (' + p.min + ' min)').join(', ')} ≈ ${nf(pl.reduce((s, p) => s + p.L, 0), 0)} L, done by ${clockAt(GAME.t + Math.max(...pl.map((p) => p.end)))} (${SIM.maxOn} at a time).\n` : '- No parcel needs water right now.\n') +
    (ok.length ? `- Optimal: ${ok.join(', ')}.\n` : '') +
    `- WaPOR: ETa ${nf(WAP.mean.aeti, 1)} vs need ${nf(WAP.mean.etp, 1)} mm/day${WAP.stressed.length ? ' · stress in ' + WAP.stressed.join(', ') : ' · no stress'}.\n` +
    `- Well ${nf(SIM.sal, 1)} g/L (ECw ${nf(ecw(), 1)})${hit.length ? ': watch ' + hit.slice(0, 2).map((o) => cropOf(o.Z).name + ' on ' + o.Z.id + ' (−' + Math.round(o.r.loss ?? 0) + ' %)').join(', ') : ''}.\n` +
    `- Tank ${Math.round(SIM.level * 100)} % · pump ${SIM.pumpLock ? 'LOCKED' : SIM.pump ? 'running' : 'idle'} · battery ${Math.round(SIM.soc * 100)} % · ${LEAK.on && LEAK.site ? '**leak on the ' + LEAK.site.name + '**' : 'no leak'}.\n` +
    (pl.some((p) => !p.q) ? 'Say "run the plan" to start.' : '');
}
function offSalt() {
  const hit = ZONES.map((Z) => ({ Z, r: saltCheck(cropOf(Z), ecw()) })).filter((o) => (o.r.loss ?? 0) > 0).sort((a, b) => (b.r.loss ?? 0) - (a.r.loss ?? 0));
  const tol = CROPS.filter((c) => c.ece && c.ece[1] >= 4).sort((a, b) => b.ece![1] - a.ece![1]).map((c) => `${c.name.toLowerCase()} (${c.ece![1]})`);
  return `**Well salinity ${nf(SIM.sal, 1)} g/L** → ECw ≈ ${nf(ecw(), 1)} dS/m, soil ECe ≈ ${nf(1.5 * ecw(), 1)} dS/m (${salWord(SIM.sal)}).\n` +
    (hit.length ? '- Yield loss on your farm: ' + hit.slice(0, 4).map((o) => `${o.Z.id} ${cropOf(o.Z).name} −${Math.round(o.r.loss ?? 0)} %`).join(', ') + '.\n' : '- Your crops tolerate this water.\n') +
    `- Most tolerant (ECe threshold, dS/m): ${tol.join(', ')}, then olive.\n- Give about 15–20 % extra water (leaching) to push salts below the roots, and avoid wetting the leaves of sensitive crops in the heat.`;
}
function offLeak() {
  if (LEAK.on && LEAK.site) {
    return `**Leak on the ${LEAK.site.name}** · ${nf(LEAK.lost, 0)} L lost.\n- ${LEAK.stage === 'leak' ? 'D0 is confirming the mismatch…' : LEAK.auto ? 'Emergency shutdown done: pump locked OFF, ' + LEAK.site.vname + ' closed.' : leakLineOpen() ? 'Close ' + LEAK.site.vname + ' now.' : LEAK.site.vname + ' is closed.'}\n- Send a technician from the Home card to repair it; water comes back ${LEAK.auto ? 'automatically' : 'when you reopen the valve'}.`;
  }
  return `**No leak.** D0 reads ${nf(SIM.q, 1)} L/min for ${nf(SIM.qExp, 1)} L/min expected.\n- Leak protection is **${PREFS.set.leakProt ? 'ON' : 'OFF'}**: if D0 sees more flow than the parcels use for 3–4 minutes, the server ${PREFS.set.leakProt ? 'stops the well pump and closes the valve of the leaking line by itself' : 'alerts you to close the valve'}.\n- Pump: ${SIM.pumpLock ? 'locked' : SIM.pump ? 'running' : 'idle (refills the tank under 35 %)'} · tank ${Math.round(SIM.level * 100)} %.`;
}
function offWapor() {
  const st = ZONES.filter((z) => z.wap.relet < 0.75).sort((a, b) => a.wap.relet - b.wap.relet);
  return `**WaPOR dekad ${WAP.dek}** (FAO, 10-day values)\n- Farm ETa ${nf(WAP.mean.aeti, 1)} mm/day vs crop need ETp ${nf(WAP.mean.etp, 1)} → ratio ${nf(WAP.mean.relet, 2)}.\n` +
    (st.length ? `- Water stress (ETa/ETp < 0.75): ${st.map((z) => `${z.id} ${cropOf(z).name} ${nf(z.wap.relet, 2)}`).join(', ')}.\n- Missing ≈ ${nf(WAP.mean.gapL, 0)} L/day.\n` : '- No parcel is water stressed.\n') +
    `- Biomass water productivity ${nf(WAP.mean.bwp, 1)} kg/m³.\n- ETa is the water the crop really used, computed by FAO from satellite thermal and optical images; ETp = Kc × RET is what it needed.`;
}
function offRecommend() {
  const R = CROPS.map((c) => {
    const sc = saltCheck(c, ecw()), loss = sc.loss === null ? (c.rate === 'MT' || c.rate === 'T' ? 0 : 8) : sc.loss;
    return { c, loss, s: loss + c.kc[1] * 12 };
  }).sort((a, b) => a.s - b.s).slice(0, 5);
  return `With your well (${nf(SIM.sal, 1)} g/L, ECw ${nf(ecw(), 1)} dS/m) and RET ${nf(WAP.ret, 1)} mm/day, the most **water-smart** crops are:\n` +
    R.map(({ c, loss }) => `- ${c.name}: ${nf(c.kc[1] * WAP.ret, 1)} mm/day, irrigate under ${cropTrigger(c)} %, ${loss > 0 ? '−' + Math.round(loss) + ' % yield from salt' : 'no salt loss'}`).join('\n') +
    '\nFor cash income keep tomato or pepper on the best-quality water, and put tolerant crops on the rest.';
}
export const OFF_HELP = `I'm the **offline expert** (no Claude key set). I can:\n- give a **daily briefing** or list parcels that need water\n- irrigate or stop parcels ("water A2 15 min", "stop all")\n- change crops ("plant olive on A5 and A6")\n- explain crop water needs ("olive vs tomato", "date palm")\n- check salinity, leaks and WaPOR stress`;

export function offlineAnswer(q: string, m: Draft) {
  const s = ' ' + q.toLowerCase().replace(/[’']/g, "'") + ' ';
  const has = (...w: string[]) => w.some((x) => s.includes(x));
  const ids = parseIds(q), crops = findCrops(q), mm = q.match(/(\d{1,3})\s*(?:min|mn|minute|dq|d9)/i), mins = mm ? +mm[1] : 0;
  const ask = has('need', 'how much', 'which', 'what', 'when', 'should', 'chnowa', 'kadech', 'combien', 'quand', 'quel', '?');
  let out: string;
  if (has(' stop', 'arrête', 'arrete', 'wa9ef', 'wa9f', 'waqef', 'sakker', 'halt') && !has('auto')) {
    const L = doStop(ids.length ? ids : ZONES.map((z) => z.id));
    out = L.length ? `Stopped: ${L.join(', ')}.` : 'Nothing was irrigating.';
    if (L.length) m.acts.push('Stopped ' + L.join(', '));
  } else if (crops.length && ids.length && has('plant', 'set ', 'change', 'grow', 'switch', 'put ', 'make ', 'convert', 'replace', 'a7ot', '7ot', 'zra3', 'plante', 'mettre', 'cultiv', 'sow')) {
    const c = crops[0];
    ids.forEach((id) => setZoneCrop(ZBY[id], c.id));
    const [lo, hi] = cropBand(c);
    m.acts.push(ids.join(', ') + ' → ' + c.name);
    out = `Done: **${ids.join(', ')}** now grow **${c.name}**.\n- New target ${lo}–${hi} % (irrigate under ${lo} %).\n- Water need ${nf(c.kc[1] * WAP.ret, 1)} mm/day · salt: ${saltTxt(c)}.`;
  } else if (has('wapor', 'evapotrans', ' eta ', 'eta/etp', 'water stress', 'biomass', 'productivity') && !ids.length && !crops.length) out = offWapor();
  else if ((has('irrigate', 'water all', 'water the ', 'water my ', 'water them', 'water it', 'water ' + (ids[0] || '#').toLowerCase(), 'arros', 'as9i', 'asqi', 'sa9i', 'es9i', 'is9i', 'start the plan', 'run plan') && !ask && !has('explain', 'why', 'how ')) || has('run the plan')) {
    if (ids.length) {
      const r = doIrrigate(ids, mins, 'ai');
      r.started.forEach((x) => m.acts.push('Irrigating ' + x));
      r.queued.forEach((x) => m.acts.push('Queued ' + x));
      out = (r.started.length ? `Irrigating ${r.started.join(', ')}. ` : '') + (r.queued.length ? `Queued ${r.queued.join(', ')} (${SIM.maxOn} at a time). ` : '') + (r.skipped.length ? `Skipped: ${r.skipped.join('; ')}.` : '');
    } else {
      const L = smartIrrigate('ai', true);
      if (L.length) m.acts.push('Smart irrigation: ' + L.map((z) => z.id).join(', '));
      const busy = ZONES.filter((z) => zNeeds(z) && (z.valve || z.queued) && !L.includes(z));
      out = L.length
        ? `Smart irrigation started for **${L.map((z) => z.id + ' ' + cropOf(z).name).join(', ')}**, each for its recommended time, ${SIM.maxOn} at a time (≈ ${nf(L.reduce((t, z) => t + (z.queued ? z.queued.dur : 10) * z.flow, 0), 0)} L).` + (busy.length ? ` Already running or queued: ${busy.map((z) => z.id).join(', ')}.` : '')
        : busy.length ? `Already on it: ${busy.map((z) => z.id + (z.valve ? ' (irrigating)' : ' (queued)')).join(', ')}. Every parcel under its trigger is covered.` : 'No parcel is below its crop trigger: nothing to water now.';
    }
  } else if (!crops.length && !ids.length && has('brief', 'today', 'plan', 'lyoum', 'lyom', 'el youm', "aujourd", 'summary', 'résumé', 'overview', 'situation')) out = offBrief();
  else if ((ids.length && !crops.length) || ids.length === 1) out = ids.map((id) => offParcel(ZBY[id])).join('\n\n');
  else if (crops.length >= 2) out = offCompare(crops);
  else if (crops.length === 1) out = offCrop(crops[0]);
  else if (has('salt', 'salin', 'mel7', 'mle7', ' sel ', 'brackish', 'saum')) out = offSalt();
  else if (has('leak', 'fuite', 'fwit', 'fuit', 'pipe', 'pump', 'pompe', 'pompa')) out = offLeak();
  else if (has('wapor', 'stress', 'evapo', ' eta', 'satellite', 'fao', 'biomass', 'productivity')) out = offWapor();
  else if (has('auto')) {
    const on = !has(' off', 'disable', 'désactiv', 'desactiv', 'sakker', 'stop');
    SIM.auto = on; PREFS.set.auto = on; hooks.onSave();
    m.acts.push('Auto irrigation ' + (on ? 'ON' : 'OFF'));
    out = on ? `Auto irrigation is **ON**: each parcel is watered when it drops under its crop trigger, ${SIM.maxOn} at a time.` : 'Auto irrigation is **OFF**.';
  } else if (has('best crop', 'which crop', 'what crop', 'what should i plant', 'what to plant', 'recommend', 'suggest', 'nzra3', 'nazra3', 'quelle culture')) out = offRecommend();
  else if (has('need water', 'dry', 'thirst', 'status', 'how are', 'which parcel', 'parcel', 'moisture', 'humid', 'chnowa', 'water')) out = offStatus();
  else out = OFF_HELP;
  m.text = out;
  m.src = 'Offline expert · rules + FAO-56 data';
}
