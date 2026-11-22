import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ProdKey, PROD, prodCss, prodStops } from '../lib/colors';
import { ago, inT, nf } from '../lib/format';
import { GAME, SAT, WAP, ZONES } from '../sim/state';
import { cropOf } from '../sim/helpers';
import { requestSatellitePass, toast } from '../sim/engine';
import { useTick } from '../ui/hooks';
import { useUI } from '../store/ui';
import { CropIcon } from '../ui/Icon';
import { Card, Cta, Kpi, KpiGrid, List, Note, SecHead, Seg, SoftBtn } from '../ui/kit';
import { WaporMap } from '../ui/maps';
import { WapHist } from '../ui/charts';
import { C, T } from '../ui/theme';

export function Wapor() {
  useTick();
  const openZone = useUI((st) => st.openZone);
  const openSat = useUI((st) => st.openSat);
  const [prod, setProd] = React.useState<ProdKey>(WAP.prod);
  WAP.prod = prod;
  const P = PROD[prod], M = WAP.mean, g = prodStops(prod);
  const rev = WAP.dek + prod + SAT.scanned + ZONES.map((z) => z.crop).join();
  const prodOpts = (Object.keys(PROD) as ProdKey[]).map((k) => [k, PROD[k].short] as [ProdKey, string]);
  return (
    <View>
      <Seg<ProdKey> options={prodOpts} value={prod} onChange={setProd} style={{ marginBottom: 10 }} />
      <Card style={{ padding: 8, marginTop: 0 }}>
        <WaporMap prod={prod} rev={rev} />
        <View style={s.leg}>
          <Text style={s.legT}>{P.lo}</Text>
          <LinearGradient colors={g.colors as [string, string, ...string[]]} locations={g.locations as [number, number, ...number[]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1, height: 7, borderRadius: 4 }} />
          <Text style={s.legT}>{P.hi}</Text>
        </View>
        <Text style={[s.legT, { marginHorizontal: 2, marginTop: 2 }]}>{P.name}</Text>
      </Card>
      <View style={{ height: 10 }} />
      <KpiGrid>
        <Kpi icon="drop" tint="blue" label="ETa (AETI)" value={nf(M.aeti, 1) + ' mm/d'} sub={'crop need ETp ' + nf(M.etp, 1) + ' mm/d'} />
        <Kpi icon="sun" tint="amber" label="RET" value={nf(WAP.ret, 1) + ' mm/d'} sub="reference ET (FAO-56)" />
        <Kpi icon="warn" tint="red" label="Water stress" value={nf(M.relet, 2)} sub={WAP.stressed.length ? WAP.stressed.length + ' parcel(s) under 0.75' : 'ETa / ETp · no stress'} bad={WAP.stressed.length > 2} />
        <Kpi icon="leaf" tint="green" label="Productivity" value={nf(M.bwp, 1) + ' kg/m³'} sub="biomass per m³ of water" />
      </KpiGrid>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: C.ink }}>ETa versus crop need</Text>
          <Text style={{ fontSize: 10, color: C.sub }}>last dekads (10 days each)</Text>
        </View>
        <WapHist />
        <View style={{ flexDirection: 'row', gap: 11, marginTop: 5 }}>
          <Text style={s.legT}><Text style={{ color: '#1477f8' }}>■ </Text>ETa (actual)</Text>
          <Text style={s.legT}><Text style={{ color: '#16a34a' }}>■ </Text>ETp (crop need)</Text>
        </View>
      </Card>
      <SecHead title="Parcels this dekad" sub="tap for details" />
      <List>
        {ZONES.map((Z, i) => {
          const w = Z.wap;
          return (
            <Pressable key={Z.id} onPress={() => openZone(Z.id)} style={[s.li, i === ZONES.length - 1 && { borderBottomWidth: 0 }]}>
              <CropIcon crop={cropOf(Z)} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontWeight: '600', fontSize: 12.5, color: C.ink }}>{Z.id} · {cropOf(Z).name}</Text>
                <Text style={T.small} numberOfLines={1}>{`ETa ${nf(w.aeti, 1)} / ${nf(w.etp, 1)} mm/d` + (w.gapL > 1 ? ` · gap ${nf(w.gapL, 0)} L/d` : '')}</Text>
              </View>
              <View style={s.wbar}><View style={{ width: `${w.relet * 100}%`, height: '100%', backgroundColor: prodCss('relet', w.relet), borderRadius: 3 }} /></View>
              <Text style={{ fontWeight: '800', fontSize: 12, minWidth: 30, textAlign: 'right', color: C.ink }}>{nf(w.relet, 2)}</Text>
            </Pressable>
          );
        })}
      </List>
      <Note>
        {SAT.active && !SAT.scanned
          ? 'Satellite pass in progress: the fields are being imaged…'
          : `Dekad ${WAP.dek}${WAP.last > 0 ? ', processed ' + ago(Math.max(1, GAME.t - WAP.last)) + ' ago' : ', downloaded from the FAO portal'}. ${WAP.stressed.length ? 'Water stress (ETa/ETp < 0.75): ' + WAP.stressed.join(', ') + ' · about ' + nf(M.gapL, 0) + ' L/day missing.' : 'No parcel is water stressed.'} Next pass ${inT(SAT.next - GAME.t)}.`}
      </Note>
      <Cta tone="green" icon="sat" label="Open the WaPOR satellite view" onPress={() => openSat('wap')} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <SoftBtn icon="reset" label="New satellite pass" onPress={() => { if (!SAT.active) { requestSatellitePass(); toast('The satellite is passing over the farm…', 2400); } }} />
      </View>
      <Text style={[T.note, { fontSize: 10, opacity: 0.85, marginHorizontal: 3, marginTop: 10 }]}>
        Source: FAO WaPOR v3 · L1 300 m global, L2 100 m Africa & Near East, L3 20 m on selected irrigation schemes (two in Tunisia). In this demo the values are simulated from the parcel sensors with the same products and units.
      </Text>
    </View>
  );
}


const s = StyleSheet.create({
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 7, marginHorizontal: 2 },
  legT: { fontSize: 9.5, color: C.sub },
  li: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 11, borderBottomWidth: 1, borderBottomColor: C.line },
  wbar: { width: 50, height: 6, borderRadius: 3, backgroundColor: C.track, overflow: 'hidden' },
});
