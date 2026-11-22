/* Small UI kit: cards, KPI tiles, segmented control, toggles, buttons, rows. */
import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Icon } from './Icon';
import { C, KIC, T, shadow } from './theme';
import { STATUS_COL, Status, STATUS_TXT } from '../sim/helpers';

export const Card = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.card, shadow, style]}>{children}</View>
);

export const SecHead = ({ title, sub }: { title: string; sub?: string }) => (
  <View style={s.secH}>
    <Text style={T.secH}>{title}</Text>
    {sub ? <Text style={T.small}>{sub}</Text> : null}
  </View>
);

export const Note = ({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) => <Text style={[T.note, { marginHorizontal: 3, marginVertical: 10 }, style]}>{children}</Text>;

export const IconTile = ({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) => (
  <View style={{ width: size, height: size, borderRadius: size * 0.31, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
    <Icon name={icon} size={size * 0.53} color="#fff" />
  </View>
);

export function Kpi({ icon, tint, label, value, sub, bad, onPress, children, flex = true }: {
  icon: string; tint: keyof typeof KIC; label: string; value: string; sub?: string; bad?: boolean; onPress?: () => void; children?: ReactNode; flex?: boolean;
}) {
  const body = (
    <>
      <View style={s.kh}>
        <View style={[s.kic, { backgroundColor: KIC[tint] }]}><Icon name={icon} size={13} color="#fff" /></View>
        <Text style={s.khT} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[s.kv, bad && { color: '#dc2626' }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={T.small} numberOfLines={1}>{sub}</Text> : null}
      {children}
    </>
  );
  const st = [s.kpi, shadow, flex && { width: '48.5%' as const }, bad && s.kpiBad];
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [st, pressed && { opacity: 0.85 }]}>{body}</Pressable> : <View style={st}>{body}</View>;
}
export const KpiGrid = ({ children }: { children: ReactNode }) => <View style={s.kpis}>{children}</View>;

export const Bar = ({ frac, color = '#06a7c4', h = 5, style }: { frac: number; color?: string; h?: number; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ height: h, borderRadius: h / 2, backgroundColor: C.track, overflow: 'hidden' }, style]}>
    <View style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%`, height: '100%', backgroundColor: color, borderRadius: h / 2 }} />
  </View>
);

export function Seg<V extends string | number>({ options, value, onChange, small, style }: {
  options: [V, string][]; value: V; onChange: (v: V) => void; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.seg, style]}>
      {options.map(([v, label]) => {
        const on = v === value;
        return (
          <Pressable key={String(v)} onPress={() => onChange(v)} style={[s.segB, small ? { paddingHorizontal: 10, paddingVertical: 5 } : { flex: 1 }, on && s.segOn]}>
            <Text style={[s.segT, small && { fontSize: 11 }, on && { color: C.ink }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Toggle({ on, onPress, label }: { on: boolean; onPress: () => void; label?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} style={[s.tog, on && { backgroundColor: '#34c759' }]}>
      <View style={[s.knob, { left: on ? 21 : 3 }]} />
    </Pressable>
  );
}

export function StatusChip({ st, text }: { st: Status; text?: string }) {
  const c = STATUS_COL[st];
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ color: c.fg, fontSize: 10, fontWeight: '800' }}>{text ?? STATUS_TXT[st]}</Text>
    </View>
  );
}

export function Cta({ label, icon, onPress, disabled, tone = 'blue', style }: {
  label: string; icon?: string; onPress: () => void; disabled?: boolean; tone?: 'blue' | 'red' | 'green'; style?: StyleProp<ViewStyle>;
}) {
  const bg = tone === 'red' ? C.red : tone === 'green' ? C.brand : C.blue;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.cta, { backgroundColor: bg }, disabled && { opacity: 0.45 }, pressed && { opacity: 0.85 }, style]}>
      {icon ? <Icon name={icon} size={18} color="#fff" /> : null}
      <Text style={s.ctaT}>{label}</Text>
    </Pressable>
  );
}

export function SoftBtn({ label, icon, onPress, style, color }: { label: string; icon?: string; onPress: () => void; style?: StyleProp<ViewStyle>; color?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.soft, color ? { backgroundColor: color } : null, pressed && { opacity: 0.8 }, style]}>
      {icon ? <Icon name={icon} size={15} color={C.ink} /> : null}
      <Text style={s.softT} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}
export const BtnRow = ({ children }: { children: ReactNode }) => <View style={s.btnRow}>{children}</View>;

export function Row({ icon, iconBg, title, sub, right, onPress, last }: {
  icon?: ReactNode; iconBg?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; onPress?: () => void; last?: boolean;
}) {
  const inner = (
    <View style={[s.li, last && { borderBottomWidth: 0 }]}>
      {icon ? <View style={[s.lic, iconBg ? { backgroundColor: iconBg } : null]}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.liT} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[T.small, { fontWeight: '500' }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { backgroundColor: '#f6f8f6' }}>{inner}</Pressable> : inner;
}
export const List = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.list, shadow, style]}>{children}</View>
);

export const Empty = ({ title, text, small }: { title: string; text?: string; small?: boolean }) => (
  <View style={[s.empty, small && { paddingVertical: 18, backgroundColor: '#fff', borderRadius: 17 }]}>
    <Icon name="check" size={small ? 30 : 40} color={C.green} />
    <Text style={{ color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 6 }}>{title}</Text>
    {text ? <Text style={{ color: C.sub, textAlign: 'center' }}>{text}</Text> : null}
  </View>
);

export const IconBtn = ({ icon, onPress, label, bg = '#e3e8e4', color = C.ink, size = 34, dot }: {
  icon: string; onPress: () => void; label: string; bg?: string; color?: string; size?: number; dot?: boolean;
}) => (
  <Pressable onPress={onPress} accessibilityLabel={label} style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, pressed && { opacity: 0.7 }]}>
    <Icon name={icon} size={size / 2} color={color} />
    {dot ? <View style={{ position: 'absolute', top: 5, right: 6, width: 8, height: 8, borderRadius: 4, backgroundColor: '#ff3b30', borderWidth: 2, borderColor: bg }} /> : null}
  </Pressable>
);

export const Pill = ({ label, icon, onPress, disabled }: { label: string; icon?: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable onPress={onPress} disabled={disabled} style={[s.pill, disabled && { backgroundColor: 'rgba(255,255,255,.22)' }]}>
    {icon ? <Icon name={icon} size={15} color={disabled ? '#e6fff4' : C.brandDark} /> : null}
    <Text style={[s.pillT, disabled && { color: '#e6fff4' }]}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 17, padding: 11, marginTop: 10 },
  secH: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 15, marginBottom: 8, marginHorizontal: 3 },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  kpi: { backgroundColor: C.card, borderRadius: 17, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 9, minWidth: 0, overflow: 'hidden' },
  kpiBad: { backgroundColor: '#fff1f0', borderWidth: 1.5, borderColor: '#fca5a5' },
  kh: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  khT: { color: C.sub, fontSize: 10.5, fontWeight: '600' },
  kic: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  kv: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3, color: C.ink },
  seg: { flexDirection: 'row', backgroundColor: C.chip, borderRadius: 12, padding: 3 },
  segB: { alignItems: 'center', borderRadius: 10, paddingVertical: 7 },
  segOn: { backgroundColor: '#fff', ...Object.assign({}, shadow) },
  segT: { fontSize: 12, fontWeight: '700', color: '#4b5852' },
  tog: { width: 46, height: 28, borderRadius: 14, backgroundColor: '#d5dbd7', justifyContent: 'center' },
  knob: { position: 'absolute', top: 3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 15, paddingVertical: 13, paddingHorizontal: 10 },
  ctaT: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
  soft: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: C.chip, borderRadius: 13, paddingVertical: 10, paddingHorizontal: 6 },
  softT: { fontWeight: '700', fontSize: 12, color: C.ink },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  li: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 11, borderBottomWidth: StyleSheet.hairlineWidth * 2, borderBottomColor: C.line },
  lic: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#e8f3ee', alignItems: 'center', justifyContent: 'center' },
  liT: { fontWeight: '600', fontSize: 12.5, color: C.ink },
  list: { backgroundColor: C.card, borderRadius: 17, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 4, paddingVertical: 40, paddingHorizontal: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13 },
  pillT: { fontWeight: '800', fontSize: 12, color: C.brandDark },
});
