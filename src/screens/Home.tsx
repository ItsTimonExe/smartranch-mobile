import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GAME, LEAK, REPAIR, SIM, WAP, ZONES } from '../sim/state';
import { cap, nf, tempAt } from '../lib/format';
import { ecw, gameClock, salWord, zNeedL, zNeeds, zStatus } from '../sim/helpers';
import { leakAction, smartIrrigate, toggleKey, ToggleKey, togOn } from '../sim/engine';
import { useTick } from '../ui/hooks';
import { useUI } from '../store/ui';
import { Icon } from '../ui/Icon';
import { Bar, Card, Kpi, KpiGrid, List, Pill, Row, SecHead, Toggle } from '../ui/kit';
import { FarmMap } from '../ui/maps';
import { Spark } from '../ui/charts';
import { C } from '../ui/theme';
import { askAI } from '../ai/chat';
import { AI_BUSY_LABEL } from './aiLabels';

function AlertCard({ tone, icon, title, body, children }: { tone: 'red' | 'amb' | 'grn'; icon: string; title: string; body: React.ReactNode; children?: React.ReactNode }) {
  const colors = tone === 'red' ? ['#f05252', '#b91c1c'] : tone === 'amb' ? ['#f59e0b', '#b45309'] : ['#16a34a', '#0f766e'];
  return (
    <LinearGradient colors={colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.alert}>
      <View style={s.aic}><Icon name={icon} size={16} color="#fff" /></View>
      <Text style={s.aT}>{title}</Text>
      <Text style={s.aP}>{body}</Text>
      <View style={s.pbtns}>{children}</View>
    </LinearGradient>
  );
}
const PBtn = ({ label, onPress, ghost, disabled }: { label: string; onPress: () => void; ghost?: boolean; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.pbtn, ghost && { backgroundColor: 'rgba(255,255,255,.22)' }, disabled && { opacity: 0.6 }]}>
    <Text style={[s.pbtnT, ghost && { color: '#fff' }]}>{label}</Text>
  </Pressable>
);

function LeakCard() {
  const site = LEAK.site;
  if (!site) return null;
  const vk = site.valve === 'V0' ? 'V0' : 'valve ' + site.valve;
  const lost = nf(LEAK.lost, 0);
  const repair = (
    <PBtn label={REPAIR.on ? 'Technician on site…' : 'Send technician to repair'} disabled={REPAIR.on} onPress={() => leakAction('repair')} />
  );
  if (LEAK.on && LEAK.stage === 'detected') {
    return (
      <AlertCard tone="red" icon="drop" title="Leak detected" body={`${cap(site.name)}: D0 measures more water than the parcels use. Close ${site.vname} to stop the leak.`}>
        <PBtn label={`Close ${vk}`} onPress={() => leakAction('close')} />
        <PBtn ghost label="Emergency stop" onPress={() => leakAction('stop')} />
      </AlertCard>
    );
  }
  if (LEAK.on && LEAK.stage === 'isolated' && LEAK.auto) {
    return (
      <AlertCard tone="red" icon="shield" title="Emergency shutdown done" body={`The server stopped the well pump and closed ${site.vname} by itself: only ${lost} L lost. Repair the ${site.name} and the water comes back automatically.`}>
        {repair}
      </AlertCard>
    );
  }
  if (LEAK.on && LEAK.stage === 'isolated') {
    return (
      <AlertCard tone="amb" icon="warn" title="Leak isolated · to repair" body={`${lost} L lost. The ${site.name} must be repaired before water can flow again.`}>
        {repair}
      </AlertCard>
    );
  }
  if (!LEAK.on && LEAK.stage === 'repaired') {
    return (
      <AlertCard tone="grn" icon="check" title="Leak repaired" body={`The ${site.name} is repaired. Reopen ${site.vname} to bring the water back.`}>
        <PBtn label={`Reopen ${vk}`} onPress={() => leakAction('reopen')} />
      </AlertCard>
    );
  }
  return null;
}

const NETWORK: [ToggleKey, string, string][] = [
  ['V0', 'valve', 'Main valve V0'], ['A', 'valve', 'Valve A'], ['B', 'valve', 'Valve B'],
  ['pump', 'pump', 'Well pump'], ['auto', 'auto', 'Auto irrigation'], ['leakProt', 'shield', 'Leak protection'],
];
function netSub(k: ToggleKey) {
  switch (k) {
    case 'V0': return 'tank outlet';
    case 'A': return 'Field A line';
    case 'B': return 'Field B line';
    case 'pump': return SIM.pumpLock ? (LEAK.on ? 'LOCKED by leak protection' : 'locked OFF') : SIM.pump ? 'running · refills the tank' : 'automatic (35–90 %)';
    case 'auto': return 'crop-based triggers · ' + SIM.maxOn + ' parcels at a time';
    default: return 'auto pump stop + valve close';
  }
}

export function Home() {
  useTick();
  const openZone = useUI((st) => st.openZone);
  const setTab = useUI((st) => st.setTab);
  const openSat = useUI((st) => st.openSat);
  const sel = useUI((st) => st.sel);
  const ok = ZONES.filter((Z) => zStatus(Z) === 'ok').length;
  const todo = ZONES.filter((Z) => zNeeds(Z) && !Z.valve && !Z.queued).length;
  const need = ZONES.reduce((sum, Z) => sum + zNeedL(Z), 0);
  return (
    <View>
      <LeakCard />
      <LinearGradient colors={['#0c4f39', '#11845b', '#1aa06c']} start={{ x: 0, y: 0 }} end={{ x: 0.7, y: 1 }} style={s.hero}>
        <View style={s.heroTop}>
          <View>
            <Text style={s.heroSm}>Today · {gameClock()}</Text>
            <Text style={s.heroB}>Good morning!</Text>
          </View>
          <View style={s.wx}>
            <Icon name="sun" size={17} color="#ffd166" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{tempAt(GAME.t)} °C</Text>
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 10.5 }}>sunny</Text>
          </View>
        </View>
        <View style={s.heroMap}>
          <FarmMap selId={sel} onZone={(Z) => openZone(Z.id)} />
          <View style={s.hmTag}><View style={s.hmDot} /><Text style={{ fontSize: 9.5, fontWeight: '800', color: C.brandDark }}>Live parcels</Text></View>
        </View>
        <View style={s.heroBot}>
          <View style={{ flex: 1 }}>
            <Text style={s.heroN}>{ok} / 12</Text>
            <Text style={{ color: '#fff', opacity: 0.85, fontSize: 10.5 }}>parcels in their crop's optimal range</Text>
          </View>
          <Pill icon="spray" label={todo ? `Smart irrigate · ${todo}` : 'All good'} disabled={!todo} onPress={() => smartIrrigate()} />
        </View>
      </LinearGradient>

      <Pressable onPress={() => askAI("Give me today's irrigation briefing.")} style={{ marginTop: 10 }}>
        <LinearGradient colors={['#4f2bd6', '#7c3aed', '#c026d3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0.4 }} style={s.brief}>
          <View style={s.aib}><Icon name="ai" size={18} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13.5 }}>AI agronomist</Text>
            <Text style={{ color: '#fff', opacity: 0.88, fontSize: 10.5 }}>{AI_BUSY_LABEL()}</Text>
          </View>
          <Icon name="chev" size={15} color="#fff" />
        </LinearGradient>
      </Pressable>

      <SecHead title="Resources" sub="real time" />
      <KpiGrid>
        <Kpi icon="drop" tint="blue" label="Water used" value={nf(SIM.used, 0) + ' L'} sub={'crop need ' + nf(need, 0) + ' L/day'}>
          <Spark data={SIM.qHist.slice(-60).concat(SIM.q)} color="#1477f8" min={0} span={10} />
        </Kpi>
        <Kpi icon="tank" tint="cyan" label="Tank" value={Math.round(SIM.level * 100) + ' %'} sub={SIM.pumpLock ? 'pump LOCKED (safety)' : SIM.pump ? 'well pump running' : 'pump idle (auto)'}>
          <Bar frac={SIM.level} style={{ marginTop: 7 }} />
        </Kpi>
        <Kpi icon="bolt" tint="amber" label="Energy" value={Math.round(SIM.pv * 1000) + ' W'} sub={'2 panels · battery ' + Math.round(SIM.soc * 100) + ' %'}>
          <Bar frac={SIM.soc} color="#f59e0b" style={{ marginTop: 7 }} />
        </Kpi>
        <Kpi icon="salt" tint="gold" label="Well salinity" value={nf(SIM.sal, 1) + ' g/L'} sub={salWord(SIM.sal) + ' · ECw ' + nf(ecw(), 1) + ' dS/m'} bad={SIM.sal > 2.2} />
        <Kpi icon="flow" tint="teal" label="Flow D0" value={nf(SIM.q, 1) + ' L/min'} sub={'expected ' + nf(SIM.qExp, 1) + ' L/min'} bad={LEAK.on && LEAK.stage !== 'leak'} />
        <Kpi icon="sat" tint="green" label="WaPOR ETa" value={nf(WAP.mean.aeti, 1) + ' mm/d'} sub={WAP.stressed.length ? 'stress: ' + WAP.stressed.join(', ') : 'no water stress'} onPress={() => setTab('wapor')} />
      </KpiGrid>

      <SecHead title="Water network" sub="remote-controlled" />
      <List>
        {NETWORK.map(([k, ic, n], i) => (
          <Row key={k} last={i === NETWORK.length - 1} icon={<Icon name={ic} size={17} color={C.brand} />} title={n} sub={netSub(k)}
            right={<Toggle on={togOn(k)} label={n} onPress={() => toggleKey(k)} />} />
        ))}
      </List>
      <Pressable onPress={() => openSat()} style={{ marginTop: 10 }}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 0 }}>
          <View style={[s.aib, { backgroundColor: '#0f5d43' }]}><Icon name="sat" size={18} color="#7df5c8" /></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: C.ink }}>Satellite view</Text>
            <Text style={{ fontSize: 11, color: C.sub }}>Real · Moisture · WaPOR layers over the farm</Text>
          </View>
          <Icon name="chev" size={15} color="#b3bcb7" />
        </Card>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  alert: { borderRadius: 18, padding: 12, paddingLeft: 50, marginBottom: 10 },
  aic: { position: 'absolute', left: 12, top: 12, width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(255,255,255,.22)', alignItems: 'center', justifyContent: 'center' },
  aT: { color: '#fff', fontSize: 14, fontWeight: '800' },
  aP: { color: '#fff', opacity: 0.95, fontSize: 12, lineHeight: 17, marginTop: 3, marginBottom: 9 },
  pbtns: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  pbtn: { backgroundColor: '#fff', borderRadius: 11, paddingVertical: 9, paddingHorizontal: 12 },
  pbtnT: { fontWeight: '800', fontSize: 12, color: '#111' },
  hero: { borderRadius: 22, padding: 13, paddingBottom: 12, marginBottom: 4 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroSm: { color: '#fff', opacity: 0.82, fontSize: 11, fontWeight: '600' },
  heroB: { color: '#fff', fontSize: 18, fontWeight: '800', marginTop: 1 },
  wx: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.16)', paddingVertical: 5, paddingLeft: 7, paddingRight: 10, borderRadius: 999 },
  heroMap: { marginVertical: 10, borderRadius: 15, overflow: 'hidden', backgroundColor: '#efe3cf' },
  hmTag: { position: 'absolute', right: 8, top: 7, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.9)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  hmDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  heroBot: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroN: { color: '#fff', fontSize: 19, fontWeight: '800' },
  brief: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, paddingHorizontal: 12, borderRadius: 18 },
  aib: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
});
