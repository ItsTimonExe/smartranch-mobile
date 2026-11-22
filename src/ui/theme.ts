import { Platform, TextStyle, ViewStyle } from 'react-native';

export const C = {
  bg: '#f2f4f1', card: '#ffffff', ink: '#101914', sub: '#66736d', line: '#e6eae6', mute: '#93a09a',
  brand: '#11845b', brandDark: '#0c4f39', brandLight: '#e8f3ee',
  blue: '#1477f8', red: '#ef4444', amber: '#f59e0b', green: '#16a34a', teal: '#0d9488', cyan: '#06a7c4', gold: '#c48a0a',
  purple: '#7c3aed', chip: '#e3e8e4', track: '#e9eeea',
};

export const KIC: Record<string, string> = {
  blue: C.blue, cyan: C.cyan, amber: C.amber, gold: C.gold, teal: C.teal, green: C.green, red: C.red,
};

export const shadow: ViewStyle = Platform.select({
  ios: { shadowColor: '#101914', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  android: { elevation: 2 },
  default: { boxShadow: '0 1px 2px rgba(16,25,20,.05), 0 4px 14px rgba(16,25,20,.05)' } as ViewStyle,
}) as ViewStyle;

export const T = {
  h2: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5, color: C.ink } as TextStyle,
  secH: { fontSize: 14.5, fontWeight: '800', color: C.ink } as TextStyle,
  small: { fontSize: 10.5, color: C.sub } as TextStyle,
  note: { fontSize: 11.5, lineHeight: 17, color: C.sub } as TextStyle,
};

/** Banner / icon tile colours per notification kind. */
export const KIND_COL: Record<string, string> = {
  leak: '#ff3b30', dry: '#ff9f0a', sal: '#c9971a', sat: '#20a56b', ok: '#0a84ff', water: '#1477f8', crop: '#16a34a', ai: '#7c3aed',
};
export const KIND_ICON: Record<string, string> = { leak: 'drop', water: 'spray', dry: 'warn', sal: 'salt', sat: 'sat', ok: 'check', crop: 'leaf', ai: 'ai' };
