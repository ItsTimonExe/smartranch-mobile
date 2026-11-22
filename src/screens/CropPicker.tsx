/* Bottom sheet: pick the crop of one parcel (or of the whole field). */
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { CROPS, RATE_TXT } from '../data/crops';
import { FIELD, ZBY } from '../sim/state';
import { cropBand, cropTrigger } from '../sim/helpers';
import { setZoneCrop, toast } from '../sim/engine';
import { useUI } from '../store/ui';
import { CropIcon, Icon } from '../ui/Icon';
import { IconBtn } from '../ui/kit';
import { C } from '../ui/theme';

export function CropPicker() {
  const id = useUI((st) => st.sheetZone);
  const setSheetZone = useUI((st) => st.setSheetZone);
  const [all, setAll] = useState(false);
  const Z = id ? ZBY[id] : null;
  const close = () => { setSheetZone(null); setAll(false); };
  const groups = Array.from(new Set(CROPS.map((c) => c.group)));
  return (
    <Modal visible={!!Z} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.bg} onPress={close} />
      {Z ? (
        <View style={s.panel}>
          <View style={s.head}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.ink }}>Crop for parcel {Z.id}</Text>
            <IconBtn icon="close" label="Close" onPress={close} />
          </View>
          <View style={s.all}>
            <Switch value={all} onValueChange={setAll} trackColor={{ true: C.brand }} />
            <Text style={{ fontSize: 11.5, color: C.sub, flex: 1 }}>Apply to all 6 parcels of {FIELD[Z.field].name}</Text>
          </View>
          <ScrollView>
            {groups.map((g) => (
              <View key={g}>
                <Text style={s.g}>{g.toUpperCase()}</Text>
                {CROPS.filter((c) => c.group === g).map((c) => (
                  <Pressable key={c.id} style={[s.crow, c.id === Z.crop && { borderWidth: 2, borderColor: C.brand }]}
                    onPress={() => {
                      const list = all ? FIELD[Z.field].zones : [Z];
                      list.forEach((z) => setZoneCrop(z, c.id));
                      const [lo, hi] = cropBand(c);
                      toast(`${list.length > 1 ? FIELD[Z.field].name : Z.id} is now ${c.name} · new target ${lo}–${hi} %`, 2600);
                      close();
                    }}>
                    <CropIcon crop={c} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '700', fontSize: 12.5, color: C.ink }}>{c.name}</Text>
                      <Text style={{ color: C.sub, fontSize: 10 }}>Kc {c.kc[1]} · trigger {cropTrigger(c)} % · salt {c.rate ? RATE_TXT[c.rate].toLowerCase() : 'n/a'}</Text>
                    </View>
                    {c.id === Z.crop ? <Icon name="check" size={17} color={C.brand} /> : null}
                  </Pressable>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(10,16,13,.38)' },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', backgroundColor: C.bg, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 12, paddingBottom: 18 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  all: { flexDirection: 'row', alignItems: 'center', gap: 7, marginHorizontal: 2, marginBottom: 6 },
  g: { fontWeight: '800', fontSize: 10, letterSpacing: 0.8, color: '#93a09a', marginTop: 9, marginBottom: 5, marginLeft: 4 },
  crow: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: '#fff', borderRadius: 13, padding: 8, paddingHorizontal: 9, marginBottom: 5 },
});
