/* Satellite view (2D replacement of the 3D "camera rises above the farm"): Real / Moisture / WaPOR layers, live scan, parcel card. */
import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PROD, ProdKey, prodStops } from '../lib/colors';
import { ago, nf } from '../lib/format';
import { GAME, SAT, SIM, WAP, ZBY, ZONES } from '../sim/state';
import { STATUS_TXT, clampMin, cropBand, cropOf, gameClock, humHexOf, lineOpen, zEq, zNeedL, zNeeds, zRecMin, zStatus } from '../sim/helpers';
import { smartIrrigate, toggleWater } from '../sim/engine';
import { FIELD } from '../sim/state';
import { SatLayer, useUI } from '../store/ui';
import { useTick } from '../ui/hooks';
import { CropIcon, Icon } from '../ui/Icon';
import { Ring } from '../ui/charts';
import { SatMap } from '../ui/maps';
import { askAI } from '../ai/chat';
import { zArea } from '../sim/helpers';

const G = '#5df2c0';

export function Satellite() {
  useTick();
  const ins = useSafeAreaInsets();
  const { satLayer, sel } = useUI();
  const set = useUI((st) => st.set);
  const closeSat = useUI((st) => st.closeSat);
  const openZone = useUI((st) => st.openZone);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [prod, setProd] = useState<ProdKey>(WAP.prod);
  WAP.prod = prod;
  const Z = sel ? ZBY[sel] : null;
  const onLayout = (e: LayoutChangeEvent) => setBox({ w: Math.round(e.nativeEvent.layout.width), h: Math.round(e.nativeEvent.layout.height) });
  const layers: [SatLayer, string][] = [['real', 'Real'], ['hum', 'Moisture'], ['wap', 'WaPOR']];
  const g = prodStops(prod);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#050b12', zIndex: 20 }]}>
      <View style={{ paddingTop: ins.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={s.live} />
            <Text style={{ color: '#e2fff6', fontWeight: '800', fontSize: 13, letterSpacing: 2 }}>SATELLITE VIEW <Text style={{ fontWeight: '600', letterSpacing: 0.4, fontSize: 11, opacity: 0.85 }}>· live</Text></Text>
          </View>
          <Text style={{ color: '#e2fff6', opacity: 0.92, fontSize: 11, marginTop: 3 }}>Smart Ranch · 2 fields · 12 parcels · FAO WaPOR</Text>
          <Text style={{ color: '#e2fff6', opacity: 0.8, fontSize: 10.5, marginTop: 3, fontVariant: ['tabular-nums'] }}>
            {gameClock()} · {SAT.active ? 'WaPOR satellite over the farm' : 'WaPOR dekad ' + WAP.dek + (WAP.last > 0 ? ' · updated ' + ago(Math.max(1, GAME.t - WAP.last)) + ' ago' : ' · from the FAO portal')}
          </Text>
        </View>
        <Pressable onPress={closeSat} style={s.back} accessibilityLabel="Back to the app"><Icon name="back" size={14} color="#e6fffb" /><Text style={{ color: '#e6fffb', fontWeight: '700', fontSize: 12 }}>Back</Text></Pressable>
      </View>

      <View style={{ flex: 1, marginHorizontal: 10, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(93,242,192,.3)' }} onLayout={onLayout}>
        {box.w > 0 ? (
          <SatMap layer={satLayer} prod={prod} selId={sel} width={box.w} height={box.h}
            onZone={(z) => useUI.setState({ sel: z ? z.id : null })} />
        ) : null}
        <View pointerEvents="none" style={[s.corner, { left: 8, top: 8, borderRightWidth: 0, borderBottomWidth: 0 }]} />
        <View pointerEvents="none" style={[s.corner, { right: 8, top: 8, borderLeftWidth: 0, borderBottomWidth: 0 }]} />
        <View pointerEvents="none" style={[s.corner, { left: 8, bottom: 8, borderRightWidth: 0, borderTopWidth: 0 }]} />
        <View pointerEvents="none" style={[s.corner, { right: 8, bottom: 8, borderLeftWidth: 0, borderTopWidth: 0 }]} />
      </View>

      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: ins.bottom + 10, gap: 9 }}>
        {Z ? <ParcelCard id={Z.id} onApp={() => { closeSat(); openZone(Z.id); }} onClose={() => set({ sel: null })} /> : <Summary />}
        <View style={{ alignItems: 'center', gap: 8 }}>
          <View style={s.layers}>
            {layers.map(([k, n]) => (
              <Pressable key={k} onPress={() => set({ satLayer: k })} style={[s.lb, satLayer === k && { backgroundColor: G }]}>
                <Text style={{ fontWeight: '700', fontSize: 12.5, color: satLayer === k ? '#03241b' : '#bfeee0' }}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <View style={s.leg}>
            {satLayer === 'hum' ? (
              <>
                <Text style={s.legT}>dry</Text>
                <LinearGradient colors={['rgb(214,64,48)', 'rgb(240,150,47)', 'rgb(226,204,72)', 'rgb(108,196,88)', 'rgb(44,168,112)', 'rgb(58,160,232)', 'rgb(42,108,222)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 140, height: 8, borderRadius: 4 }} />
                <Text style={s.legT}>optimal → too wet</Text>
              </>
            ) : satLayer === 'wap' ? (
              <View style={{ gap: 6, alignItems: 'center' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 3 }}>
                  {(Object.keys(PROD) as ProdKey[]).map((k) => (
                    <Pressable key={k} onPress={() => setProd(k)} style={[s.pb, prod === k && { backgroundColor: G }]}>
                      <Text style={{ fontWeight: '700', fontSize: 10.5, color: prod === k ? '#03241b' : '#cfeee4' }}>{PROD[k].short}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.legT}>{PROD[prod].lo}</Text>
                  <LinearGradient colors={g.colors as [string, string, ...string[]]} locations={g.locations as [number, number, ...number[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ width: 120, height: 8, borderRadius: 4 }} />
                  <Text style={s.legT}>{PROD[prod].hi}</Text>
                </View>
              </View>
            ) : <Text style={[s.legT, { fontStyle: 'italic' }]}>Real image · tap a parcel to control it</Text>}
          </View>
        </View>
      </View>
    </View>
  );
}

function ParcelCard({ id, onApp, onClose }: { id: string; onApp: () => void; onClose: () => void }) {
  const Z = ZBY[id], c = cropOf(Z), st = zStatus(Z), [lo, hi] = cropBand(c), rec = clampMin(zRecMin(Z));
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
        <CropIcon crop={c} size="md" plain />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>Parcel {Z.id} · {c.name}</Text>
          <Text style={{ color: '#93c6ba', fontSize: 10.5 }}>{FIELD[Z.field].name} · sensor {Z.id} · 2 sprinklers · {nf(zArea(Z), 0)} m²</Text>
        </View>
        <Pressable onPress={onClose} style={s.x}><Icon name="close" size={14} color="#fff" /></Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
        <Ring dark size={52} frac={zEq(Z) / 70} color={humHexOf(Z)} text="" />
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 24 }}>{Math.round(Z.hum)} %</Text>
          <Text style={{ color: '#b7e2d6', fontSize: 11.5 }}>{STATUS_TXT[st]} · target {lo}–{hi} %</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: '#8fb8ad', fontSize: 10 }}>WaPOR ETa / stress</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{nf(Z.wap.aeti, 1)} · {nf(Z.wap.relet, 2)}</Text>
          <Text style={{ color: '#8fb8ad', fontSize: 10, marginTop: 3 }}>Valve · need today</Text>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>{Z.valve ? (lineOpen(Z.field) ? 'open · ' : 'paused · ') + Math.max(0, Math.ceil(Z.tEnd - SIM.t)) + ' min' : Z.queued ? 'queued' : 'closed'} · {nf(zNeedL(Z), 0)} L</Text>
        </View>
      </View>
      <Pressable onPress={() => toggleWater(Z)} style={[s.go, !!Z.valve && { backgroundColor: '#ff453a' }]}>
        <Icon name={Z.valve ? 'close' : 'spray'} size={17} color="#fff" />
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{Z.valve ? 'Stop irrigation' : Z.queued ? 'Remove from queue' : zNeeds(Z) ? `Irrigate ${rec} min (recommended)` : `Irrigate ${rec || 10} min`}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
        <Pressable onPress={onApp} style={s.sb}><Icon name="phone" size={14} color="#e6fffb" /><Text style={s.sbT}>Details</Text></Pressable>
        <Pressable onPress={() => { useUI.getState().closeSat(); askAI(`How is parcel ${Z.id} (${c.name}) doing and what should I do?`); }} style={s.sb}><Icon name="ai" size={14} color="#e6fffb" /><Text style={s.sbT}>Ask AI</Text></Pressable>
      </View>
    </View>
  );
}

function Summary() {
  const need = ZONES.filter(zNeeds), on = ZONES.filter((z) => z.valve).map((z) => z.id), todo = need.filter((z) => !z.valve && !z.queued);
  const nc = new Set(ZONES.map((z) => z.crop)).size;
  const rows: [string, string][] = [
    ['Optimal', ZONES.filter((z) => zStatus(z) === 'ok').length + ' / 12'], ['Need water', need.length ? need.map((z) => z.id).join(', ') : 'none'],
    ['Irrigating', on.length ? on.join(', ') + (SIM.queue.length ? ' (+' + SIM.queue.length + ')' : '') : 'none'], ['Water today', nf(SIM.used, 0) + ' L'],
    ['WaPOR ETa', nf(WAP.mean.aeti, 1) + ' mm/d'], ['Stressed (WaPOR)', WAP.stressed.length ? WAP.stressed.join(', ') : 'none'],
  ];
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 8 }}>
        <View style={{ width: 12, height: 12, borderRadius: 4, backgroundColor: G }} />
        <View><Text style={{ color: '#fff', fontWeight: '800', fontSize: 14.5 }}>Farm · 12 parcels · {nc} crops</Text><Text style={{ color: '#93c6ba', fontSize: 10.5 }}>Tap a parcel to control it</Text></View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 6, marginBottom: 9 }}>
        {rows.map(([k, v]) => (
          <View key={k} style={s.cell}><Text style={{ color: '#8fb8ad', fontSize: 10 }}>{k}</Text><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }} numberOfLines={1}>{v}</Text></View>
        ))}
      </View>
      <Pressable disabled={!todo.length} onPress={() => smartIrrigate()} style={[s.go, !todo.length && { backgroundColor: 'rgba(255,255,255,.12)' }]}>
        <Icon name="spray" size={17} color={todo.length ? '#fff' : '#9cc'} />
        <Text style={{ color: todo.length ? '#fff' : '#9cc', fontWeight: '800', fontSize: 13 }}>{todo.length ? `Smart irrigate ${todo.length} parcel${todo.length > 1 ? 's' : ''}` : 'Nothing to irrigate'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  live: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#ff453a' },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(93,242,192,.5)', backgroundColor: 'rgba(6,24,28,.8)' },
  corner: { position: 'absolute', width: 26, height: 26, borderWidth: 2, borderColor: 'rgba(93,242,192,.85)' },
  card: { backgroundColor: 'rgba(5,20,25,.92)', borderWidth: 1, borderColor: 'rgba(93,242,192,.28)', borderRadius: 18, padding: 12 },
  x: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,.1)', alignItems: 'center', justifyContent: 'center' },
  go: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#1d8cff', borderRadius: 12, paddingVertical: 11 },
  sb: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,.1)', borderRadius: 10, paddingVertical: 8 },
  sbT: { color: '#e6fffb', fontWeight: '700', fontSize: 11 },
  cell: { width: '48.5%', backgroundColor: 'rgba(255,255,255,.05)', borderWidth: 1, borderColor: 'rgba(93,242,192,.12)', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 8 },
  layers: { flexDirection: 'row', backgroundColor: 'rgba(5,20,25,.82)', borderWidth: 1, borderColor: 'rgba(93,242,192,.32)', borderRadius: 999, padding: 4 },
  lb: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 999 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(5,20,25,.7)' },
  legT: { color: '#e2fff6', fontSize: 11 },
  pb: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,.12)' },
});
