/* UI state (navigation, banners, toast, unread count) + the 4 Hz tick counter that re-renders the screens. */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { FieldId } from '../data/farm';
import { NOTES, Note, PREFS } from '../sim/state';
import { applySaved, hooks } from '../sim/engine';

export type Tab = 'home' | 'parcels' | 'ai' | 'wapor' | 'more';
export type Sub = '' | 'plan' | 'budget' | 'crops' | 'crop' | 'alerts' | 'settings' | 'demo';
export type SatLayer = 'real' | 'hum' | 'wap';

interface UI {
  tick: number;
  ready: boolean;
  tab: Tab;
  sub: Sub;
  view: '' | 'zone';
  sel: string | null;
  field: FieldId;
  dur: number;
  cropId: string;
  cropQ: string;
  cropG: string;
  sheetZone: string | null;
  satOpen: boolean;
  satLayer: SatLayer;
  unread: number;
  banners: Note[];
  toast: { msg: string; id: number } | null;

  setTab: (tab: Tab, sub?: Sub) => void;
  openZone: (id: string) => void;
  closeZone: () => void;
  openNote: (n: Note) => void;
  back: () => boolean;
  setSheetZone: (id: string | null) => void;
  openSat: (layer?: SatLayer) => void;
  closeSat: () => void;
  setSatLayer: (l: SatLayer) => void;
  openCrop: (id: string) => void;
  clearAlerts: () => void;
  dismissBanner: (id: number) => void;
  set: (p: Partial<UI>) => void;
}

let toastId = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useUI = create<UI>((set, get) => ({
  tick: 0,
  ready: false,
  tab: 'home',
  sub: '',
  view: '',
  sel: null,
  field: 'tomato',
  dur: 0,
  cropId: 'tomato',
  cropQ: '',
  cropG: 'All',
  sheetZone: null,
  satOpen: false,
  satLayer: 'real',
  unread: 0,
  banners: [],
  toast: null,

  setTab: (tab, sub) =>
    set((s) => {
      const nextSub = sub !== undefined ? sub : tab === s.tab ? s.sub : '';
      return {
        tab, sub: tab === 'more' ? nextSub : '', view: tab === 'parcels' ? s.view : '', sheetZone: null, satOpen: false,
        unread: tab === 'more' && nextSub === 'alerts' ? 0 : s.unread,
      };
    }),
  openZone: (id) => set((s) => ({ tab: 'parcels', sub: '', view: 'zone', sel: id, field: id[0] === 'A' ? 'tomato' : 'pepper', dur: 0, sheetZone: null, satOpen: false, unread: s.unread })),
  closeZone: () => set({ view: '', sel: null }),
  openNote: (n) => {
    if (n.zone) get().openZone(n.zone);
    else if (n.tab === 'alerts') get().setTab('more', 'alerts');
    else get().setTab(n.tab as Tab, n.tab === 'more' ? '' : undefined);
    set((s) => ({ banners: s.banners.filter((b) => b.id !== n.id) }));
  },
  back: () => {
    const s = get();
    if (s.sheetZone) { set({ sheetZone: null }); return true; }
    if (s.satOpen) { set({ satOpen: false }); return true; }
    if (s.tab === 'parcels' && s.view === 'zone') { set({ view: '' }); return true; }
    if (s.tab === 'more' && s.sub) { set({ sub: s.sub === 'crop' ? 'crops' : '' }); return true; }
    if (s.tab !== 'home') { set({ tab: 'home', sub: '', view: '' }); return true; }
    return false;
  },
  setSheetZone: (id) => set({ sheetZone: id }),
  openSat: (layer) => set((s) => ({ satOpen: true, satLayer: layer ?? s.satLayer, sheetZone: null })),
  closeSat: () => set({ satOpen: false }),
  setSatLayer: (l) => set({ satLayer: l }),
  openCrop: (id) => set({ tab: 'more', sub: 'crop', cropId: id }),
  clearAlerts: () => { NOTES.length = 0; set((s) => ({ unread: 0, tick: s.tick + 1 })); },
  dismissBanner: (id) => set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
  set: (p) => set(p),
}));

/* ---------- engine → UI bridge ---------- */
hooks.onChange = () => useUI.setState((s) => ({ tick: s.tick + 1 }));
hooks.onToast = (msg, ms = 1800) => {
  const id = toastId++;
  useUI.setState({ toast: { msg, id } });
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (useUI.getState().toast?.id === id) useUI.setState({ toast: null }); }, ms);
};
hooks.onNotify = (n) => {
  const s = useUI.getState();
  const viewingAlerts = s.tab === 'more' && s.sub === 'alerts';
  useUI.setState((st) => ({
    unread: viewingAlerts ? st.unread : st.unread + 1,
    banners: [...st.banners, n].slice(-2),
  }));
  setTimeout(() => useUI.getState().dismissBanner(n.id), 6500);
  try { Haptics.notificationAsync(n.kind === 'leak' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Warning).catch(() => {}); } catch { /* no haptics */ }
};

/* ---------- persistence ---------- */
const KEY = 'smartRanch.v4';
let saveTimer: ReturnType<typeof setTimeout> | undefined;
hooks.onSave = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify({ crops: PREFS.crops, set: PREFS.set })).catch(() => {});
  }, 300);
};
export async function hydrate() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) applySaved(JSON.parse(raw));
  } catch { /* storage unavailable */ }
  useUI.setState({ ready: true });
}
