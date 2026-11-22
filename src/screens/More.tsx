import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Slider from '@react-native-community/slider';
import { CBY, CROPS, RATE_TXT, SOILS } from '../data/crops';
import { GAME, LEAK, NOTES, PREFS, SIM, WAP, ZBY, ZONES } from '../sim/state';
import { cap, nf } from '../lib/format';
import {
  EFF, RISE, STATUS_TXT, avgArea, clockIn, cropBand, cropOf, cropTrigger, ecw, getSoil, planItems, saltCheck, zArea, zETc, zNeedL,
} from '../sim/helpers';
import {
  runScenario, restoreDefaultCrops, resetFarm, setAiTier, setBudget, setMaxOn, setSoilById, setZoneCrop, smartIrrigate, toast, toggleKey, ToggleKey, togOn, Scenario,
} from '../sim/engine';
import { useTick } from '../ui/hooks';
import { Sub, useUI } from '../store/ui';
import { CropIcon, Icon } from '../ui/Icon';
import { Bar, BtnRow, Card, Cta, Empty, IconTile, Kpi, KpiGrid, List, Note, Row, SecHead, Seg, SoftBtn, Toggle } from '../ui/kit';
import { BudgetChart } from '../ui/charts';
import { C, KIND_COL, KIND_ICON, T, shadow } from '../ui/theme';
import { askAI, useChat, chatMode } from '../ai/chat';

/* ---------- headers (title + subtitle) of the sub screens ---------- */
export const SUB_META: Record<Exclude<Sub, ''>, { title: () => string; sub: () => string }> = {
  plan: { title: () => 'Irrigation plan', sub: () => 'today · rotation of ' + SIM.maxOn + ' parcels' },
  budget: { title: () => 'Water budget', sub: () => 'today · since 06:30' },
  crops: { title: () => 'Crop library', sub: () => CROPS.length + ' crops · FAO-56 water and salt data' },
  crop: { title: () => CBY[useUI.getState().cropId].name, sub: () => CBY[useUI.getState().cropId].group + ' · FAO-56 crop sheet' },
  alerts: { title: () => 'Alerts', sub: () => NOTES.length + (NOTES.length === 1 ? ' notification' : ' notifications') },
  settings: { title: () => 'Settings', sub: () => 'farm · irrigation · assistant' },
  demo: { title: () => 'Scenarios', sub: () => 'demo · for the presentation' },
};

/* ---------- More (grid) ---------- */
export function More() {
  useTick();
  const sub = useUI((st) => st.sub);
  const setTab = useUI((st) => st.setTab);
  if (sub === 'plan') return <Plan />;
  if (sub === 'budget') return <Budget />;
  if (sub === 'crops') return <Crops />;
  if (sub === 'crop') return <CropSheet />;
  if (sub === 'alerts') return <Alerts />;
  if (sub === 'settings') return <Settings />;
  if (sub === 'demo') return <Demo />;
  const unread = useUI.getState().unread;
  const pl = planItems();
  const T6: [Sub, string, string, string, string][] = [
    ['plan', 'plan', 'Irrigation plan', '#1477f8', pl.length ? pl.length + ' parcels · ' + nf(pl.reduce((s, p) => s + p.L, 0), 0) + ' L' : 'nothing to water'],
    ['budget', 'budget', 'Water budget', '#0d9488', nf(SIM.used, 0) + ' / ' + nf(PREFS.set.budget, 0) + ' L today'],
    ['crops', 'book', 'Crop library', '#16a34a', CROPS.length + ' crops · FAO-56'],
    ['alerts', 'alerts', 'Alerts', '#ff9f0a', unread ? unread + ' unread' : NOTES.length + ' notifications'],
    ['settings', 'gear', 'Settings', '#64748b', getSoil().name + ' · ' + SIM.maxOn + ' at a time'],
    ['demo', 'demo', 'Demo scenarios', '#7c3aed', 'for the jury'],
  ];
  return (
    <View>
      <View style={s.grid}>
        {T6.map(([k, ic, n, col, sm]) => (
          <Pressable key={k} onPress={() => setTab('more', k)} style={[s.mt, shadow]}>
            <View style={{ marginBottom: 6 }}><IconTile icon={ic} color={col} /></View>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>{n}</Text>
            <Text style={[T.small, { minHeight: 13 }]} numberOfLines={1}>{sm}</Text>
          </Pressable>
        ))}
      </View>
      <Card>
        <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Smart Ranch · v4</Text>
        <Text style={[T.note, { marginTop: 4 }]}>Smart irrigation for small farms: 12 sensors, solar pump, gravity tank, leak protection, FAO-56 crop library, FAO WaPOR and an AI agronomist. Mobile clone of the Water · Energy · Agriculture hackathon prototype.</Text>
      </Card>
    </View>
  );
}

/* ---------- Irrigation plan ---------- */
function Plan() {
  const pl = planItems(), run = ZONES.filter((Z) => Z.valve);
  return (
    <View>
      <LinearGradient colors={['#0c4f39', '#11845b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.planH}>
        {[[pl.length, 'parcels to water'], [nf(pl.reduce((a, p) => a + p.L, 0), 0), 'litres'], [pl.length ? clockIn(Math.max(...pl.map((p) => p.end))) : '—', 'done by']].map(([v, l]) => (
          <View key={l as string} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{v}</Text>
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 10 }}>{l}</Text>
          </View>
        ))}
      </LinearGradient>
      {run.length ? (
        <>
          <SecHead title="Running now" sub={`${run.length} / ${SIM.maxOn}`} />
          <List>
            {run.map((Z, i) => (
              <Row key={Z.id} last={i === run.length - 1} icon={<CropIcon crop={cropOf(Z)} size="sm" plain />} iconBg="transparent" title={`${Z.id} · ${cropOf(Z).name}`}
                sub={Math.max(0, Math.ceil(Z.tEnd - SIM.t)) + ' min left'} right={<Text style={s.plR}>{nf(Z.flow, 1)} L/min</Text>} />
            ))}
          </List>
        </>
      ) : null}
      <View style={{ height: 10 }} />
      {pl.length ? (
        <List>
          {pl.map((p, i) => (
            <Row key={p.Z.id} last={i === pl.length - 1}
              icon={<View style={{ alignItems: 'center', width: 40 }}><Text style={{ fontWeight: '800', fontSize: 12, color: C.ink }}>{clockIn(p.start)}</Text><Text style={{ fontSize: 10, color: C.sub }}>{clockIn(p.end)}</Text></View>} iconBg="transparent"
              title={`${p.Z.id} · ${cropOf(p.Z).name}`} sub={`${Math.round(p.Z.hum)} % → target ${cropBand(cropOf(p.Z)).join('–')} %${p.q ? ' · queued' : ''}`}
              right={<View style={{ alignItems: 'flex-end' }}><Text style={s.plR}>{p.min} min</Text><Text style={{ fontSize: 10, color: C.sub }}>{nf(p.L, 0)} L</Text></View>} />
          ))}
        </List>
      ) : <Empty small title="Nothing to water" text="Every parcel is above its crop trigger." />}
      <Note>{(() => { const ok = ZONES.filter((Z) => !pl.some((p) => p.Z === Z) && !Z.valve).map((Z) => Z.id); return ok.length ? 'No water needed: ' + ok.join(', ') + '.' : ''; })()}</Note>
      <Cta icon="spray" label="Run the plan now" disabled={!pl.some((p) => !p.q)} onPress={() => smartIrrigate()} />
      <BtnRow>
        <SoftBtn icon="ai" label="Ask AI to optimise" onPress={() => askAI('Look at my irrigation plan for today and optimise it (water, order, timing).')} />
        <SoftBtn icon="auto" label={SIM.auto ? 'Auto mode: ON' : 'Auto mode: OFF'} onPress={() => toggleKey('auto')} />
      </BtnRow>
      <Note>Durations come from each crop's target band (FAO-56) and the sprinkler rate (about {RISE} % of moisture per minute). The server never opens more than {SIM.maxOn} parcels at once so the tank keeps its pressure.</Note>
    </View>
  );
}

/* ---------- Water budget ---------- */
function Budget() {
  const need = ZONES.reduce((a, Z) => a + zNeedL(Z), 0), B = PREFS.set.budget, f = SIM.used / B;
  const etcA = ZONES.reduce((a, Z) => a + zETc(Z) * zArea(Z), 0);
  const lk = LEAK.log.reduce((a, l) => a + l.lost, 0) + (LEAK.on && LEAK.log.length === 0 ? LEAK.lost : 0);
  return (
    <View>
      <Card style={{ marginTop: 0 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View><Text style={T.small}>Used today</Text><Text style={s.big}>{nf(SIM.used, 0)} L</Text></View>
          <View style={{ alignItems: 'flex-end' }}><Text style={T.small}>Daily budget</Text><Text style={s.big}>{nf(B, 0)} L</Text></View>
        </View>
        <Bar h={9} frac={f} color={f > 1 ? '#ef4444' : f > 0.85 ? '#f59e0b' : '#1477f8'} style={{ marginVertical: 9 }} />
        <Text style={{ color: C.sub, fontSize: 11 }}>{`Crop need today (FAO-56): ${nf(need, 0)} L · ` + (f > 1 ? 'over budget!' : nf(Math.max(0, B - SIM.used), 0) + ' L left')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Text style={{ fontSize: 11.5, color: C.sub }}>Budget</Text>
          <Slider style={{ flex: 1, height: 32 }} minimumValue={500} maximumValue={4000} step={100} value={B} minimumTrackTintColor={C.brand} thumbTintColor={C.brand}
            onValueChange={(v) => { PREFS.set.budget = v; }} onSlidingComplete={(v) => setBudget(v)} />
          <Text style={{ fontWeight: '800', fontSize: 12, minWidth: 58, textAlign: 'right', color: C.ink }}>{nf(B, 0)} L</Text>
        </View>
      </Card>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Water per parcel</Text>
          <Text style={{ fontSize: 10, color: C.sub }}>used today vs crop need per day</Text>
        </View>
        <BudgetChart />
        <View style={{ flexDirection: 'row', gap: 11, marginTop: 5 }}>
          <Text style={T.small}><Text style={{ color: '#1477f8' }}>■ </Text>used today</Text>
          <Text style={T.small}><Text style={{ color: '#16a34a' }}>┄ </Text>crop need / day</Text>
        </View>
      </Card>
      <View style={{ height: 10 }} />
      <KpiGrid>
        <Kpi icon="leaf" tint="green" label="Saved vs furrows" value={nf(etcA / 0.5 - etcA / EFF, 0) + ' L/day'} sub="sprinklers 75 % vs furrow 50 %" />
        <Kpi icon="bolt" tint="amber" label="Solar energy" value={nf(SIM.ewh / 1000, 2) + ' kWh'} sub={'pump ran ' + Math.round(SIM.pumpMin || 0) + ' min today'} />
        <Kpi icon="sat" tint="teal" label="Productivity" value={nf(WAP.mean.bwp, 1) + ' kg/m³'} sub="WaPOR · biomass / water" />
        <Kpi icon="drop" tint="red" label="Lost to leaks" value={nf(lk, 0) + ' L'} sub={LEAK.log.length ? LEAK.log.length + ' leak(s) · ' + (LEAK.log.some((l) => l.auto) ? 'auto shutdown' : 'manual') : 'no leak today'} />
      </KpiGrid>
    </View>
  );
}

/* ---------- Crop library ---------- */
function Crops() {
  const { cropQ, cropG } = useUI();
  const set = useUI((st) => st.set);
  const openCrop = useUI((st) => st.openCrop);
  const groups = ['All', ...Array.from(new Set(CROPS.map((c) => c.group)))];
  const q = cropQ.trim().toLowerCase();
  const L = CROPS.filter((c) => (cropG === 'All' || c.group === cropG) && (!q || (c.name + ' ' + c.id + ' ' + c.group).toLowerCase().includes(q)));
  const wl = (k: number) => (k >= 1.1 ? 'High' : k >= 0.9 ? 'Medium' : 'Low');
  const WL: Record<string, [string, string]> = { High: ['#dbe9fe', '#1e4fae'], Medium: ['#e0f2fe', '#0369a1'], Low: ['#dcf5e3', '#166534'] };
  return (
    <View>
      <View style={s.srch}>
        <Icon name="search" size={16} color="#93a09a" />
        <TextInput value={cropQ} onChangeText={(t) => set({ cropQ: t })} placeholder="Search a crop…" placeholderTextColor="#93a09a" style={s.srchIn} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 9 }} contentContainerStyle={{ gap: 5 }}>
        {groups.map((g) => (
          <Pressable key={g} onPress={() => set({ cropG: g })} style={[s.chipB, cropG === g && { backgroundColor: C.ink }]}>
            <Text style={{ fontWeight: '700', fontSize: 11, color: cropG === g ? '#fff' : '#33413a' }}>{g}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {L.length ? (
        <List>
          {L.map((c, i) => {
            const n = ZONES.filter((z) => z.crop === c.id).length, w = wl(c.kc[1]);
            return (
              <Row key={c.id} last={i === L.length - 1} onPress={() => openCrop(c.id)} icon={<CropIcon crop={c} />} iconBg="transparent" title={c.name}
                sub={`Kc ${c.kc[1]} · trigger ${cropTrigger(c)} % · roots ${c.zr[1]} m${n ? ' · on ' + n + ' parcel' + (n > 1 ? 's' : '') : ''}`}
                right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ backgroundColor: WL[w][0], borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }}><Text style={{ fontSize: 9.5, fontWeight: '800', color: WL[w][1] }}>{w}</Text></View>
                  <Icon name="chev" size={14} color="#b3bcb7" />
                </View>} />
            );
          })}
        </List>
      ) : <Empty small title="No crop found" />}
      <Note>Water: crop coefficient Kc (mid-season). Trigger: soil moisture at which this crop should be irrigated on your {getSoil().name.toLowerCase()} soil. Salt: FAO tolerance rating.</Note>
    </View>
  );
}

/* ---------- Crop sheet ---------- */
function CropSheet() {
  const id = useUI((st) => st.cropId);
  const setTab = useUI((st) => st.setTab);
  const c = CBY[id], [lo, hi] = cropBand(c), sc = saltCheck(c, ecw()), etc = c.kc[1] * WAP.ret, on = ZONES.filter((z) => z.crop === c.id);
  const SOIL = getSoil();
  const cell = (k: string, v: string, sm: string, bad?: boolean) => (
    <View key={k} style={[s.cell, shadow, bad && { backgroundColor: '#fff1f0', borderWidth: 1.5, borderColor: '#fca5a5' }]}>
      <Text style={T.small}>{k}</Text>
      <Text style={[{ fontSize: 15, fontWeight: '800', marginVertical: 1, color: C.ink }, bad && { color: '#dc2626' }]}>{v}</Text>
      <Text style={{ color: C.sub, fontSize: 9.5, lineHeight: 12 }}>{sm}</Text>
    </View>
  );
  return (
    <View>
      <LinearGradient colors={[c.col + 'b3', c.col]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.chero}>
        <CropIcon crop={c} size="xl" />
        <View>
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800' }}>{c.name}</Text>
          <Text style={{ color: '#fff', opacity: 0.9, fontSize: 11 }}>{c.group} · salt {RATE_TXT[c.rate].toLowerCase()}</Text>
        </View>
      </LinearGradient>
      <View style={s.cgrid}>
        {cell('Water need now', nf(etc, 1) + ' mm/day', `≈ ${nf((etc * avgArea()) / EFF, 0)} L/day per parcel`)}
        {cell('Irrigate below', lo + ' %', `target ${lo}–${hi} % (${SOIL.name.toLowerCase()})`)}
        {cell('Kc ini / mid / end', c.kc.join(' / '), 'crop coefficient')}
        {cell('Root depth', `${c.zr[0]}–${c.zr[1]} m`, `allowed depletion p = ${c.p}`)}
        {cell('Salt threshold', c.ece ? 'ECe ' + c.ece[1] + ' dS/m' : 'n/a', c.b ? '−' + c.b + ' % yield per dS/m above' : RATE_TXT[c.rate])}
        {cell('With your well water', sc.loss === null ? (c.rate === 'MT' || c.rate === 'T' ? 'OK' : '?') : sc.loss <= 0 ? 'No loss' : '−' + Math.round(sc.loss) + ' %', `ECw ${nf(ecw(), 1)} → ECe ${nf(sc.ece, 1)} dS/m`, (sc.loss ?? 0) > 10)}
      </View>
      <View style={s.tip}>
        <Icon name="leaf" size={16} color="#16a34a" />
        <Text style={{ flex: 1, color: '#245c3f', fontSize: 11.5, lineHeight: 16 }}><Text style={{ fontWeight: '800' }}>Tip · </Text>{c.tip}</Text>
      </View>
      <SecHead title="Plant on parcels" sub={on.length ? 'now on ' + on.map((z) => z.id).join(', ') : 'not planted yet'} />
      <View style={s.pchips}>
        {ZONES.map((z) => (
          <Pressable key={z.id} style={[s.pchip, z.crop === c.id && { backgroundColor: C.brand }]}
            onPress={() => { if (z.crop === c.id) { toast(`${z.id} already grows ${c.name}`, 1500); return; } setZoneCrop(ZBY[z.id], c.id); toast(`${z.id} is now ${c.name} · target ${lo}–${hi} %`, 2200); }}>
            <Text style={{ fontWeight: '800', fontSize: 11.5, color: z.crop === c.id ? '#fff' : '#33413a' }}>{z.id}</Text>
          </Pressable>
        ))}
      </View>
      <BtnRow>
        <SoftBtn icon="ai" label={`Ask AI about ${c.name.toLowerCase()}`} onPress={() => askAI(`Tell me about growing ${c.name} on my farm: water needs, best parcel, and salinity risk.`)} />
        <SoftBtn icon="book" label="All crops" onPress={() => setTab('more', 'crops')} />
      </BtnRow>
    </View>
  );
}

/* ---------- Alerts ---------- */
function Alerts() {
  const openZone = useUI((st) => st.openZone);
  const clear = useUI((st) => st.clearAlerts);
  return (
    <View>
      {NOTES.length ? (
        <View style={{ gap: 8 }}>
          {NOTES.map((n) => (
            <View key={n.id} style={[s.ni, shadow]}>
              <IconTile icon={KIND_ICON[n.kind] || 'check'} color={KIND_COL[n.kind] || '#0a84ff'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'baseline' }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', flex: 1, color: C.ink }}>{n.title}</Text>
                  <Text style={{ color: '#9aa5a0', fontSize: 10 }}>{n.time}</Text>
                </View>
                <Text style={{ color: C.sub, fontSize: 11.5, lineHeight: 16, marginTop: 2 }}>{n.text}</Text>
                {n.zone ? (
                  <Pressable onPress={() => openZone(n.zone!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 }}>
                    <Text style={{ color: C.blue, fontWeight: '700', fontSize: 11.5 }}>See parcel {n.zone}</Text>
                    <Icon name="chev" size={13} color={C.blue} />
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : <Empty title="No alerts" text="Everything works normally." />}
      {LEAK.log.length ? (
        <>
          <SecHead title="Leak log" sub={String(LEAK.log.length)} />
          <List>
            {LEAK.log.map((l, i) => (
              <Row key={i} last={i === LEAK.log.length - 1} icon={<Icon name={l.auto ? 'shield' : 'drop'} size={17} color="#dc2626" />} iconBg="#fee2e2" title={`${cap(l.site)} · ${l.t}`}
                sub={`${nf(l.lost, 0)} L lost · ${l.auto ? 'auto shutdown' : 'closed by hand'}${l.fixed ? ' · repaired ' + l.fixed : ' · not repaired yet'}`} />
            ))}
          </List>
        </>
      ) : null}
      {NOTES.length ? <BtnRow><SoftBtn icon="close" label="Clear all" onPress={clear} /></BtnRow> : null}
    </View>
  );
}

/* ---------- Settings ---------- */
function Settings() {
  const hasKey = useChat((st) => st.hasKey);
  const setKey = useChat((st) => st.setKey);
  const [key, setKeyText] = React.useState('');
  const SOIL = getSoil();
  const tog = (k: ToggleKey, n: string, sm: string, last?: boolean) => (
    <Row key={k} last={last} title={n} sub={sm} right={<Toggle on={togOn(k)} label={n} onPress={() => toggleKey(k)} />} />
  );
  return (
    <View>
      <SecHead title="Soil" sub="sets every crop threshold" />
      <Card style={{ marginTop: 0 }}>
        <Seg options={Object.values(SOILS).map((x) => [x.id, x.name] as [string, string])} value={SOIL.id} onChange={(v) => { setSoilById(v as 'sandy' | 'loam' | 'clay'); toast(`Soil: ${SOILS[v].name} · field capacity ${SOILS[v].fc} % · wilting point ${SOILS[v].wp} %`, 2600); }} />
        <Text style={[T.note, { marginTop: 8, marginHorizontal: 0 }]}>Field capacity {SOIL.fc} %, wilting point {SOIL.wp} % on the sensor scale. Example: tomato is irrigated under {cropTrigger(CBY.tomato)} %, olive under {cropTrigger(CBY.olive)} %.</Text>
      </Card>
      <SecHead title="Irrigation" />
      <List>
        <Row title="Parcels at the same time" sub="limited by the pump and tank pressure" right={<Seg small options={[[2, '2'], [3, '3'], [4, '4']]} value={SIM.maxOn} onChange={setMaxOn} />} />
        {tog('auto', 'Auto irrigation', 'water each parcel under its crop trigger')}
        {tog('dryAlerts', 'Dry-parcel alerts', 'notify when a parcel becomes dry')}
        {tog('leakProt', 'Leak protection', 'stop the pump and close the valve automatically')}
        {tog('demoEvents', 'Demo events', 'a pipe leak happens by itself after ~80 s', true)}
      </List>
      <SecHead title="AI assistant" sub={hasKey ? 'Claude AI connected' : 'offline expert (no API key)'} />
      <List>
        <Row title="Model" sub="Expert is slower but reasons more" right={<Seg small options={[['quick', 'Fast'], ['default', 'Balanced'], ['complex', 'Expert']]} value={PREFS.set.aiTier} onChange={setAiTier} />} />
        {tog('voice', 'Read replies aloud', 'text-to-speech', true)}
      </List>
      <Card>
        <Text style={{ fontWeight: '800', fontSize: 12.5, color: C.ink }}>Anthropic API key</Text>
        <Text style={[T.note, { marginHorizontal: 0, marginVertical: 4 }]}>Stored on this device only (SecureStore). Leave empty to use the offline expert.</Text>
        <TextInput value={key} onChangeText={setKeyText} placeholder={hasKey ? '•••••••• (saved)' : 'sk-ant-…'} placeholderTextColor="#93a09a" secureTextEntry autoCapitalize="none" autoCorrect={false} style={s.keyIn} />
        <BtnRow>
          <SoftBtn icon="check" label="Save key" onPress={async () => { await setKey(key); setKeyText(''); toast(key.trim() ? 'API key saved' : 'API key removed', 1600); }} />
          {hasKey ? <SoftBtn icon="close" label="Remove" onPress={async () => { await setKey(''); toast('API key removed', 1600); }} /> : null}
        </BtnRow>
        <Text style={[T.note, { marginHorizontal: 0, marginTop: 6 }]}>Mode now: {chatMode() === 'claude' ? 'Claude' : 'offline expert'}.</Text>
      </Card>
      <SecHead title="Data" />
      <BtnRow>
        <SoftBtn icon="leaf" label="Default crops" onPress={() => { restoreDefaultCrops(); toast('Default crops restored', 1800); }} />
        <SoftBtn icon="reset" label="Reset farm" onPress={() => { resetFarm(); toast('Farm reset (crops kept)', 1800); }} />
      </BtnRow>
      <Note>Settings and crops are saved on this device only.</Note>
    </View>
  );
}

/* ---------- Demo scenarios ---------- */
function Demo() {
  const openSat = useUI((st) => st.openSat);
  const setTab = useUI((st) => st.setTab);
  const S: [string, string, string, string, string][] = [
    ['leak', 'drop', 'Pipe leak', 'D0 detects it · the pump stops automatically', '#ff3b30'],
    ['dry', 'warn', 'Drought', '4 parcels dry out', '#ff9f0a'],
    ['auto', 'auto', 'Auto irrigation', 'crop-based triggers, ' + SIM.maxOn + ' parcels at a time', '#7c3aed'],
    ['sal', 'salt', 'High salinity', 'the well probe passes 2.2 g/L', '#c9971a'],
    ['sat', 'sat', 'WaPOR satellite pass', 'new dekad of ETa and water-stress maps', '#20a56b'],
    ['view', 'map', 'Satellite view', 'open the farm from above', '#0f5d43'],
    ['grove', 'tree', 'Olive grove on Field A', 'new crop: new thresholds', '#65a30d'],
    ['ai', 'ai', 'AI agronomist', 'daily briefing', '#7c3aed'],
    ['reset', 'reset', 'Reset the farm', 'valves open, no leak, crops kept', '#5e6b75'],
  ];
  const run = (k: string) => {
    if (k === 'view') { openSat('hum'); return; }
    if (k === 'ai') { askAI("Give me today's irrigation briefing."); return; }
    runScenario(k as Scenario);
    if (k === 'leak') setTab('home');
    if (k === 'sat') setTab('wapor');
  };
  return (
    <View>
      <Note style={{ marginTop: 0 }}>Run a scenario during the presentation:</Note>
      <View style={{ gap: 8 }}>
        {S.map(([k, ic, b, sm, col]) => (
          <Pressable key={k} onPress={() => run(k)} style={[s.dbtn, shadow]}>
            <IconTile icon={ic} color={col} />
            <View style={{ flex: 1 }}><Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>{b}</Text><Text style={{ color: C.sub, fontSize: 11 }}>{sm}</Text></View>
            <Icon name="chev" size={16} color="#b3bcb7" />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  mt: { width: '48.5%', backgroundColor: '#fff', borderRadius: 17, paddingVertical: 12, paddingHorizontal: 11, gap: 3 },
  planH: { flexDirection: 'row', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 6, marginBottom: 4 },
  plR: { fontWeight: '800', fontSize: 12, color: C.ink },
  big: { fontSize: 21, fontWeight: '800', color: C.ink },
  srch: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff', borderRadius: 13, paddingHorizontal: 11, marginBottom: 8 },
  srchIn: { flex: 1, paddingVertical: 10, fontSize: 12.5, color: C.ink },
  chipB: { backgroundColor: C.chip, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10 },
  chero: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20 },
  cgrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 7, marginTop: 10 },
  cell: { width: '48.8%', backgroundColor: '#fff', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 10 },
  tip: { flexDirection: 'row', gap: 9, marginTop: 10, padding: 10, paddingHorizontal: 11, borderRadius: 15, backgroundColor: '#eef7f1' },
  pchips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  pchip: { width: '15.5%', alignItems: 'center', borderRadius: 10, paddingVertical: 8, backgroundColor: C.chip },
  ni: { flexDirection: 'row', gap: 10, backgroundColor: '#fff', borderRadius: 16, padding: 10, alignItems: 'flex-start' },
  dbtn: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#fff', borderRadius: 16, padding: 11 },
  keyIn: { borderWidth: 1, borderColor: '#dde3df', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 12.5, color: C.ink, backgroundColor: '#fff' },
});
void GAME; void STATUS_TXT;
