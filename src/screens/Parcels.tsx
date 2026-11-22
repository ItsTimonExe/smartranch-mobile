import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FieldId } from '../data/farm';
import { FIELD, GAME, SIM, WAP, ZBY } from '../sim/state';
import { ago, nf } from '../lib/format';
import { humHex } from '../lib/colors';
import {
  STATUS_TXT, clampMin, cropBand, cropOf, cropTrigger, ecw, saltCheck, valveTxt, zArea, zEq, zNeedL, zNeeds, zRecMin, zStatus,
} from '../sim/helpers';
import { toggleWater } from '../sim/engine';
import { useTick } from '../ui/hooks';
import { useUI } from '../store/ui';
import { Icon, CropIcon } from '../ui/Icon';
import { Card, Cta, Note, Seg, SoftBtn, StatusChip } from '../ui/kit';
import { Ring, Spark, ZoneChart } from '../ui/charts';
import { C, shadow } from '../ui/theme';
import { askAI } from '../ai/chat';

const ringColor = (Z: Parameters<typeof zEq>[0]) => humHex(zEq(Z));

export function Parcels() {
  useTick();
  const { field, view, sel } = useUI();
  const set = useUI((st) => st.set);
  const openZone = useUI((st) => st.openZone);
  if (view === 'zone' && sel && ZBY[sel]) return <ZoneDetail id={sel} />;
  const F = FIELD[field];
  const zs = F.zones;
  return (
    <View>
      <Seg<FieldId> options={[['tomato', 'Field A'], ['pepper', 'Field B']]} value={field} onChange={(f) => set({ field: f })} style={{ marginBottom: 10 }} />
      <Card style={s.fsum}>
        {[
          [zs.filter((Z) => zStatus(Z) === 'ok').length, 'optimal'],
          [zs.filter(zNeeds).length, 'need water'],
          [zs.filter((Z) => Z.valve).length, 'irrigating'],
          ['6/6', 'sensors'],
        ].map(([v, l], i) => (
          <View key={l as string} style={[s.fs, i < 3 && { borderRightWidth: 1, borderRightColor: C.line }]}>
            <Text style={{ fontSize: 16.5, fontWeight: '800', color: C.ink }}>{v}</Text>
            <Text style={{ fontSize: 9.5, color: C.sub }}>{l}</Text>
          </View>
        ))}
      </Card>
      <View style={{ gap: 8 }}>
        {zs.map((Z) => {
          const c = cropOf(Z), [lo, hi] = cropBand(c), st = zStatus(Z);
          const sub = Z.valve
            ? `Irrigating · ${Math.max(0, Math.ceil(Z.tEnd - SIM.t))} min left`
            : Z.queued ? 'Queued (rotation)'
            : `Target ${lo}–${hi} %` + (zNeeds(Z) ? ` · needs ${clampMin(zRecMin(Z))} min` : Z.lastW !== null ? ` · watered ${ago(Math.max(1, GAME.t - Z.lastW))} ago` : '');
          return (
            <Pressable key={Z.id} onPress={() => openZone(Z.id)} style={[s.zc, shadow, Z.valve ? s.zcW : Z.queued ? s.zcQ : null]}>
              <Ring frac={zEq(Z) / 70} color={ringColor(Z)} text={Math.round(Z.hum) + '%'} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <CropIcon crop={c} size="sm" />
                  <Text style={{ fontSize: 13.5, fontWeight: '800', color: C.ink, flexShrink: 1 }} numberOfLines={1}>{Z.id} · {c.name}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                  <StatusChip st={st} />
                  <Text style={{ fontSize: 10.5, color: C.sub, flexShrink: 1 }} numberOfLines={1}>{sub}</Text>
                </View>
                <View style={{ marginTop: 3 }}>
                  <Spark data={Z.hist.slice(-45).concat(Z.hum)} color={ringColor(Z)} height={20} min={0} max={70} />
                </View>
              </View>
              <Pressable accessibilityLabel={`Irrigate ${Z.id}`} onPress={() => toggleWater(Z)} style={[s.zgo, Z.valve ? { backgroundColor: '#ef4444' } : Z.queued ? { backgroundColor: '#fff4d6' } : null]}>
                <Icon name={Z.valve ? 'close' : 'spray'} size={19} color={Z.valve ? '#fff' : Z.queued ? '#b45309' : C.blue} />
              </Pressable>
            </Pressable>
          );
        })}
      </View>
      <Note>Every parcel has its own crop, 1 moisture sensor wired to box {F.pre} and 2 low-pressure sprinklers that wet the whole soil. Targets follow FAO-56 (root depth, allowed depletion p). Tap a parcel for details or to change its crop.</Note>
    </View>
  );
}

function InfoRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[s.ir, last && { borderBottomWidth: 0 }]}>
      <Text style={{ color: C.sub, fontSize: 12 }}>{k}</Text>
      <Text style={{ fontWeight: '700', fontSize: 12, color: C.ink, flex: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}

export function ZoneDetail({ id }: { id: string }) {
  const Z = ZBY[id];
  const dur = useUI((st) => st.dur);
  const set = useUI((st) => st.set);
  const setSheetZone = useUI((st) => st.setSheetZone);
  const openSat = useUI((st) => st.openSat);
  const [msg, setMsg] = React.useState('');
  const c = cropOf(Z), [lo, hi] = cropBand(c), rec = clampMin(zRecMin(Z) || 10), sc = saltCheck(c, ecw());
  const n = Z.hist.length, tr = n > 10 ? Z.hum - Z.hist[n - 10] : 0;
  const m = dur || rec;
  const label = Z.valve ? 'Stop irrigation' : Z.queued ? 'Remove from the queue' : `Irrigate the whole parcel · ${m} min`;
  return (
    <View>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 13, marginTop: 0 }}>
        <Ring big size={96} frac={zEq(Z) / 70} color={ringColor(Z)} text={Math.round(Z.hum) + ' %'} />
        <View style={{ flex: 1 }}>
          <StatusChip st={zStatus(Z)} />
          <Text style={{ fontSize: 14, fontWeight: '800', marginTop: 6, color: C.ink }}>Soil moisture</Text>
          <Text style={s.sm}>{(tr >= 0.05 ? '↗ +' : tr <= -0.05 ? '↘ ' : '→ ') + nf(tr, 1) + ' % in 10 min'}</Text>
          <Text style={s.sm}>{`${c.name} target: ${lo}–${hi} % (FAO-56)`}</Text>
        </View>
      </Card>

      <Pressable onPress={() => setSheetZone(Z.id)} style={[s.cropbar, shadow]}>
        <CropIcon crop={c} size="lg" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: C.ink }}>{c.name}</Text>
          <Text style={s.sm} numberOfLines={1}>{c.group} · Kc {c.kc[1]} · roots {c.zr[0]}–{c.zr[1]} m · p {c.p}</Text>
        </View>
        <View style={s.change}><Icon name="swap" size={13} color={C.brand} /><Text style={{ fontWeight: '700', fontSize: 11.5, color: C.brand }}>Change</Text></View>
      </Pressable>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>Moisture history</Text>
          <Text style={{ fontSize: 10, color: C.sub }}>last 60 minutes</Text>
        </View>
        <ZoneChart Z={Z} />
        <View style={{ flexDirection: 'row', gap: 11, flexWrap: 'wrap', marginTop: 5 }}>
          <Text style={s.leg}><Text style={{ color: 'rgba(20,119,248,.5)' }}>■ </Text>irrigation</Text>
          <Text style={s.leg}><Text style={{ color: 'rgba(22,163,74,.45)' }}>■ </Text>crop target</Text>
          <Text style={s.leg}><Text style={{ color: '#f59e0b' }}>┄ </Text>trigger {cropTrigger(c)} %</Text>
        </View>
      </Card>

      <Card>
        <InfoRow k="Valve" v={valveTxt(Z)} />
        <InfoRow k="Crop need today" v={`${nf(zNeedL(Z), 0)} L · ${nf(c.kc[1] * WAP.ret, 1)} mm/day`} />
        <InfoRow k="WaPOR ETa / ETp" v={`${nf(Z.wap.aeti, 1)} / ${nf(Z.wap.etp, 1)} mm/day`} />
        <InfoRow k="Water stress (WaPOR)" v={nf(Z.wap.relet, 2) + (Z.wap.relet < 0.75 ? ' · stressed' : ' · no stress')} />
        <InfoRow k="Salt check (well water)" v={sc.loss === null ? sc.txt : sc.loss <= 0 ? 'no yield loss' : '−' + Math.round(sc.loss) + ' % yield'} />
        <InfoRow k="Sprinklers" v={`2 × low pressure · ${nf(Z.flow, 1)} L/min`} />
        <InfoRow k="Area wetted" v={`whole parcel · ${nf(zArea(Z), 0)} m²`} />
        <InfoRow last k="Last irrigation" v={Z.valve ? 'now' : Z.lastW !== null ? `${ago(Math.max(1, GAME.t - Z.lastW))} ago · +${Math.max(0, Math.round(Z.lastGain))} %` : '—'} />
      </Card>

      <View style={s.durs}>
        <Text style={{ color: C.sub, fontSize: 11.5, fontWeight: '600', marginRight: 'auto' }}>Duration</Text>
        {[[0, (zNeeds(Z) ? 'Best · ' : 'Top-up · ') + rec + ' min'], [15, '15 min'], [30, '30 min'], [45, '45 min']].map(([v, l]) => (
          <Pressable key={v as number} onPress={() => set({ dur: v as number })} style={[s.dchip, dur === v && { backgroundColor: C.ink }]}>
            <Text style={{ fontWeight: '700', fontSize: 11.5, color: dur === v ? '#fff' : '#33413a' }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      <Cta label={label} icon={Z.valve ? 'close' : 'spray'} tone={Z.valve ? 'red' : 'blue'} onPress={() => setMsg(toggleWater(Z, dur) || '')} />
      {msg ? <Text style={{ color: '#dc2626', fontSize: 11.5, marginTop: 7, marginHorizontal: 3 }}>{msg}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        <SoftBtn icon="ai" label="AI advice" color="#ede9fe" onPress={() => askAI(`How is parcel ${Z.id} (${c.name}) doing and what should I do?`)} />
        <SoftBtn icon="sat" label="Satellite" onPress={() => openSat('hum')} />
      </View>
      <View style={s.tip}>
        <Icon name="leaf" size={16} color="#16a34a" />
        <Text style={{ flex: 1, color: '#245c3f', fontSize: 11.5, lineHeight: 16 }}><Text style={{ fontWeight: '800' }}>{c.name} tip · </Text>{c.tip}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fsum: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 4, marginTop: 0, marginBottom: 10 },
  fs: { flex: 1, alignItems: 'center' },
  zc: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 17, padding: 9, paddingLeft: 10 },
  zcW: { borderWidth: 2, borderColor: '#60a5fa' },
  zcQ: { borderWidth: 2, borderColor: '#fbbf24' },
  zgo: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e8f1ff' },
  sm: { color: C.sub, fontSize: 11, marginTop: 2 },
  leg: { fontSize: 10, color: C.sub },
  cropbar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, padding: 10, paddingHorizontal: 11, borderRadius: 17, backgroundColor: '#fff' },
  change: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.brandLight, paddingVertical: 6, paddingHorizontal: 9, borderRadius: 999 },
  ir: { flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
  durs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 13, marginBottom: 9, marginHorizontal: 3 },
  dchip: { backgroundColor: C.chip, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 11 },
  tip: { flexDirection: 'row', gap: 9, marginTop: 10, padding: 10, paddingHorizontal: 11, borderRadius: 15, backgroundColor: '#eef7f1' },
});
