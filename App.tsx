import React, { useEffect, useRef } from 'react';
import { Animated, AppState, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { initFarm, tick } from './src/sim/engine';
import { FIELD, NOTES, WAP, ZBY, ZONES } from './src/sim/state';
import { Tab, hydrate, useUI } from './src/store/ui';
import { initChat } from './src/ai/chat';
import { Home } from './src/screens/Home';
import { Parcels } from './src/screens/Parcels';
import { Wapor } from './src/screens/Wapor';
import { More, SUB_META } from './src/screens/More';
import { Assistant } from './src/screens/Assistant';
import { Satellite } from './src/screens/Satellite';
import { CropPicker } from './src/screens/CropPicker';
import { Icon } from './src/ui/Icon';
import { IconBtn } from './src/ui/kit';
import { C, KIND_COL, KIND_ICON } from './src/ui/theme';
import { Note } from './src/sim/state';

initFarm(); // build the 12 parcels before the first render

const NAV: [Tab, string, string][] = [['home', 'home', 'Home'], ['parcels', 'parcels', 'Parcels'], ['ai', 'ai', 'Assistant'], ['wapor', 'wapor', 'WaPOR'], ['more', 'more', 'More']];

function headerFor(tab: Tab, sub: string, view: string, sel: string | null) {
  if (tab === 'parcels' && view === 'zone' && sel && ZBY[sel]) {
    const Z = ZBY[sel];
    return { title: `Parcel ${Z.id}`, small: `${FIELD[Z.field].name} · sensor ${Z.id} · box ${FIELD[Z.field].pre}`, back: true };
  }
  if (tab === 'more' && sub && SUB_META[sub as keyof typeof SUB_META]) {
    const m = SUB_META[sub as keyof typeof SUB_META];
    return { title: m.title(), small: m.sub(), back: true };
  }
  const T: Record<Tab, [string, string]> = {
    home: ['Home', 'Smart Ranch farm · online'],
    parcels: ['Parcels', '12 sensors · 2 LoRa boxes · ' + new Set(ZONES.map((z) => z.crop)).size + ' crops'],
    ai: ['Assistant', 'AI agronomist · 24 crops · live farm data'],
    wapor: ['WaPOR', 'FAO water productivity · dekad ' + WAP.dek],
    more: ['More', 'Plan · budget · crops · settings'],
  };
  return { title: T[tab][0], small: T[tab][1], back: false };
}

function Banner({ n }: { n: Note }) {
  const a = useRef(new Animated.Value(0)).current;
  const openNote = useUI((st) => st.openNote);
  useEffect(() => { Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 7 }).start(); }, [a]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-26, 0] }) }] }}>
      <Pressable onPress={() => openNote(n)} style={s.nb}>
        <View style={[s.nic, { backgroundColor: KIND_COL[n.kind] || '#0a84ff' }]}><Icon name={KIND_ICON[n.kind] || 'check'} size={17} color="#fff" /></View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#6b7280', fontSize: 10, letterSpacing: 0.5, fontWeight: '700' }}>SMART RANCH · {n.time}</Text>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#111', marginTop: 1 }}>{n.title}</Text>
          <Text style={{ fontSize: 12, color: '#374151', lineHeight: 16, marginTop: 2 }} numberOfLines={3}>{n.text}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

function Shell() {
  const ins = useSafeAreaInsets();
  const { tab, sub, view, sel, unread, banners, toast, satOpen } = useUI();
  const setTab = useUI((st) => st.setTab);
  const openSat = useUI((st) => st.openSat);
  const h = headerFor(tab, sub, view, sel);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);

  useEffect(() => { scroller.current?.scrollTo({ y: 0, animated: false }); }, [tab, sub, view, sel]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const sbk = BackHandler.addEventListener('hardwareBackPress', () => useUI.getState().back());
    return () => sbk.remove();
  }, []);

  return (
    <View style={[s.root, { paddingTop: ins.top }]}>
      <StatusBar style="dark" />
      <View style={s.head}>
        {h.back ? <View style={{ alignSelf: 'center', marginTop: 12 }}><IconBtn icon="back" label="Back" bg="#fff" onPress={() => useUI.getState().back()} /></View> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.small} numberOfLines={1}>{h.small}</Text>
          <Text style={[s.h2, h.back && { fontSize: 22 }]} numberOfLines={1}>{h.title}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 7 }}>
          {tab === 'home' ? <IconBtn icon="sat" label="Satellite view" bg="#0f5d43" color="#7df5c8" onPress={() => openSat()} /> : null}
          <IconBtn icon="alerts" label="Alerts" dot={unread > 0} onPress={() => setTab('more', 'alerts')} />
        </View>
      </View>

      {tab === 'ai' ? (
        <View style={{ flex: 1 }}><Assistant /></View>
      ) : (
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 2, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {tab === 'home' ? <Home /> : tab === 'parcels' ? <Parcels /> : tab === 'wapor' ? <Wapor /> : <More />}
        </ScrollView>
      )}

      <View style={[s.nav, { paddingBottom: Math.max(ins.bottom, 10) }]}>
        {NAV.map(([k, ic, n]) => {
          const on = tab === k;
          const col = on ? (k === 'ai' ? '#7c3aed' : C.brand) : '#8b968f';
          return (
            <Pressable key={k} style={s.nb2} onPress={() => setTab(k, k === 'more' ? '' : undefined)} accessibilityLabel={n}>
              {k === 'ai' ? (
                <LinearGradient colors={['#6d28d9', '#c026d3']} style={s.aiBubble}><Icon name={ic} size={20} color="#fff" /></LinearGradient>
              ) : <Icon name={ic} size={22} color={col} />}
              <Text style={{ fontSize: 9.5, fontWeight: '700', color: col }}>{n}</Text>
              {k === 'more' && unread > 0 ? <View style={s.dotb} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={[s.banners, { top: ins.top + 6 }]}>
        {banners.map((n) => <Banner key={n.id} n={n} />)}
      </View>
      {toast ? <View pointerEvents="none" style={s.toastW}><View style={s.toast}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 13.5, textAlign: 'center' }}>{toast.msg}</Text></View></View> : null}
      <CropPicker />
      {satOpen ? <Satellite /> : null}
    </View>
  );
}

export default function App() {
  const ready = useUI((st) => st.ready);
  useEffect(() => { void hydrate(); void initChat(); }, []);
  // 4 Hz game loop: 1 real second = 1 game minute; paused while the app is in the background
  useEffect(() => {
    let last = Date.now(), active = true;
    const sub = AppState.addEventListener('change', (st) => { active = st === 'active'; last = Date.now(); });
    const id = setInterval(() => {
      const now = Date.now(), dt = Math.min((now - last) / 1000, 0.5);
      last = now;
      if (!active || !useUI.getState().ready) return;
      tick(dt);
      useUI.setState((st) => ({ tick: st.tick + 1 }));
    }, 250);
    return () => { clearInterval(id); sub.remove(); };
  }, []);
  void NOTES;
  return (
    <SafeAreaProvider>
      {ready ? <Shell /> : <View style={{ flex: 1, backgroundColor: C.bg }} />}
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  small: { color: C.sub, fontSize: 11, fontWeight: '600' },
  h2: { fontSize: 25, fontWeight: '800', letterSpacing: -0.6, color: C.ink, marginTop: 1 },
  nav: { flexDirection: 'row', paddingTop: 6, paddingHorizontal: 4, backgroundColor: 'rgba(255,255,255,.96)', borderTopWidth: 1, borderTopColor: C.line },
  nb2: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  aiBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: -10 },
  dotb: { position: 'absolute', top: 2, right: '28%', width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3b30', borderWidth: 2, borderColor: '#fff' },
  banners: { position: 'absolute', left: 12, right: 12, gap: 8, zIndex: 30 },
  nb: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: 11, borderRadius: 20, backgroundColor: 'rgba(246,247,246,.97)', borderWidth: 1, borderColor: 'rgba(255,255,255,.7)', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  nic: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  toastW: { position: 'absolute', left: 16, right: 16, bottom: 96, alignItems: 'center', zIndex: 40 },
  toast: { backgroundColor: 'rgba(14,18,24,.92)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 18, maxWidth: '100%' },
});
