/* Charts drawn with react-native-svg (ported from the canvas drawing code of the prototype). */
import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { clamp } from '../lib/format';
import { WAP, ZONES, Zone } from '../sim/state';
import { cropBand, cropOf, zNeedL } from '../sim/helpers';

export function useWidth() {
  const [w, setW] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width)), []);
  return [w, onLayout] as const;
}

/* ---------- ring gauge ---------- */
const RC = 2 * Math.PI * 17;
export function Ring({ frac, color, text, size = 46, dark, big }: { frac: number; color: string; text: string; size?: number; dark?: boolean; big?: boolean }) {
  const f = clamp(frac, 0.03, 1);
  const sw = big ? 4 : 4.5;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 40 40">
        <G rotation="-90" origin="20, 20">
          <Circle cx={20} cy={20} r={17} fill="none" stroke={dark ? 'rgba(255,255,255,.12)' : '#e8ece9'} strokeWidth={sw} />
          <Circle cx={20} cy={20} r={17} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeDasharray={`${f * RC} ${RC}`} />
        </G>
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' } as any}>
        <Text style={{ fontSize: big ? 21 : 11.5, fontWeight: '800', color: dark ? '#fff' : '#101914', letterSpacing: big ? -0.4 : 0 }}>{text}</Text>
      </View>
    </View>
  );
}

/* ---------- sparkline ---------- */
export function Spark({ data, color, height = 26, min, max, span = 1 }: { data: number[]; color: string; height?: number; min?: number; max?: number; span?: number }) {
  const [w, onLayout] = useWidth();
  let body: React.ReactNode = null;
  if (w > 0 && data.length > 1) {
    const lo = min ?? Math.min(...data);
    let hi = max ?? Math.max(...data);
    if (hi - lo < span) hi = lo + span;
    const n = data.length;
    const X = (i: number) => 1 + (i / (n - 1)) * (w - 2);
    const Y = (v: number) => height - 2 - ((clamp(v, lo, hi) - lo) / (hi - lo)) * (height - 4);
    const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    body = (
      <Svg width={w} height={height}>
        <Path d={`${line} L${X(n - 1)} ${height} L${X(0)} ${height} Z`} fill={color} fillOpacity={0.16} />
        <Path d={line} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      </Svg>
    );
  }
  return <View onLayout={onLayout} style={{ height, width: '100%' }}>{body}</View>;
}

/* ---------- parcel moisture chart: crop target band, irrigations, trigger ---------- */
export function ZoneChart({ Z, height = 124 }: { Z: Zone; height?: number }) {
  const [w, onLayout] = useWidth();
  let body: React.ReactNode = null;
  const data = Z.hist.slice(-60).concat(Z.hum);
  const Wv = Z.histW.slice(-60).concat(Z.valve ? 1 : 0);
  const n = data.length;
  if (w > 0 && n > 1) {
    const L = 28, Rr = 8, T = 6, B = 17, cw = w - L - Rr, ch = height - T - B;
    const [lo, hi] = cropBand(cropOf(Z));
    const X = (i: number) => L + (i / (n - 1)) * cw;
    const Y = (v: number) => T + (1 - clamp(v, 0, 70) / 70) * ch;
    const bw = cw / (n - 1);
    const irr: React.ReactNode[] = [];
    for (let i = 0; i < n; i++) {
      if (Wv[i]) {
        let j = i;
        while (j + 1 < n && Wv[j + 1]) j++;
        const a = Math.max(L, X(i) - bw / 2), b = Math.min(L + cw, X(j) + bw / 2);
        irr.push(<Rect key={i} x={a} y={T} width={b - a} height={ch} fill="rgba(20,119,248,.16)" />);
        i = j;
      }
    }
    const line = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
    body = (
      <Svg width={w} height={height}>
        <Rect x={L} y={Y(hi)} width={cw} height={Y(lo) - Y(hi)} fill="rgba(22,163,74,.12)" />
        {irr}
        {[0, 20, 40, 60].map((v) => (
          <G key={v}>
            <Line x1={L} x2={L + cw} y1={Y(v)} y2={Y(v)} stroke="#e6ebe7" strokeWidth={1} />
            <SText x={L - 5} y={Y(v) + 3} fontSize={9} fontWeight="600" fill="#93a09a" textAnchor="end">{v} %</SText>
          </G>
        ))}
        <Line x1={L} x2={L + cw} y1={Y(lo)} y2={Y(lo)} stroke="#f59e0b" strokeWidth={1.3} strokeDasharray="4 3" />
        <Path d={`${line} L${X(n - 1)} ${T + ch} L${X(0)} ${T + ch} Z`} fill="#1477f8" fillOpacity={0.12} />
        <Path d={line} fill="none" stroke="#1477f8" strokeWidth={2.2} strokeLinejoin="round" />
        <Circle cx={X(n - 1)} cy={Y(data[n - 1])} r={4.2} fill="#fff" stroke="#1477f8" strokeWidth={2.4} />
        <SText x={L} y={height - 3} fontSize={9} fontWeight="600" fill="#93a09a">−60 min</SText>
        <SText x={L + cw} y={height - 3} fontSize={9} fontWeight="600" fill="#93a09a" textAnchor="end">now</SText>
      </Svg>
    );
  }
  return <View onLayout={onLayout} style={{ height, width: '100%', marginTop: 7 }}>{body}</View>;
}

/* ---------- last dekads: ETa (bars) against the crop need ETp (line) ---------- */
export function WapHist({ height = 110 }: { height?: number }) {
  const [w, onLayout] = useWidth();
  let body: React.ReactNode = null;
  const H = WAP.hist, n = H.length;
  if (w > 0 && n) {
    const L = 24, B = 15, T = 6, cw = w - L - 6, ch = height - T - B, mx = 7;
    const Y = (v: number) => T + (1 - v / mx) * ch;
    const bw = cw / n;
    const pts = H.map(([, p], i) => `${i ? 'L' : 'M'}${(L + (i + 0.5) * bw).toFixed(1)} ${Y(p).toFixed(1)}`).join(' ');
    body = (
      <Svg width={w} height={height}>
        {[0, 2, 4, 6].map((v) => (
          <G key={v}>
            <Line x1={L} x2={L + cw} y1={Y(v)} y2={Y(v)} stroke="#e6ebe7" strokeWidth={1} />
            <SText x={L - 5} y={Y(v) + 3} fontSize={8.5} fontWeight="600" fill="#93a09a" textAnchor="end">{v}</SText>
          </G>
        ))}
        {H.map(([a], i) => (
          <Rect key={i} x={L + i * bw + bw * 0.2} y={Y(a)} width={bw * 0.6} height={Math.max(1, Y(0) - Y(a))} rx={2.5} fill={i === n - 1 ? '#1477f8' : '#8ab8f5'} />
        ))}
        <Path d={pts} fill="none" stroke="#16a34a" strokeWidth={2} />
        {H.map(([, p], i) => <Circle key={i} cx={L + (i + 0.5) * bw} cy={Y(p)} r={2.6} fill="#16a34a" />)}
        {H.map((_, i) => ((i % 2) === ((n - 1) % 2) ? (
          <SText key={i} x={L + (i + 0.5) * bw} y={height - 3} fontSize={8.5} fontWeight="600" fill="#93a09a" textAnchor="middle">{i === n - 1 ? 'now' : 'D−' + (n - 1 - i)}</SText>
        ) : null))}
      </Svg>
    );
  }
  return <View onLayout={onLayout} style={{ height, width: '100%', marginTop: 7 }}>{body}</View>;
}

/* ---------- water per parcel: used today vs crop need per day ---------- */
export function BudgetChart({ height = 120 }: { height?: number }) {
  const [w, onLayout] = useWidth();
  let body: React.ReactNode = null;
  if (w > 0) {
    const L = 26, B = 15, T = 6, cw = w - L - 4, ch = height - T - B, n = ZONES.length, bw = cw / n;
    const mx = Math.max(100, ...ZONES.map((Z) => Math.max(Z.usedL, zNeedL(Z)))) * 1.1;
    const Y = (v: number) => T + (1 - v / mx) * ch;
    body = (
      <Svg width={w} height={height}>
        {[0, 0.5, 1].map((f) => {
          const v = Math.round((mx * f) / 50) * 50;
          return (
            <G key={f}>
              <Line x1={L} x2={L + cw} y1={Y(v)} y2={Y(v)} stroke="#e6ebe7" strokeWidth={1} />
              <SText x={L - 4} y={Y(v) + 3} fontSize={8.5} fontWeight="600" fill="#93a09a" textAnchor="end">{v}</SText>
            </G>
          );
        })}
        {ZONES.map((Z, i) => {
          const x = L + i * bw;
          return (
            <G key={Z.id}>
              <Rect x={x + bw * 0.18} y={Y(Z.usedL)} width={bw * 0.64} height={Math.max(1, Y(0) - Y(Z.usedL))} rx={2.5} fill="#1477f8" />
              <Line x1={x + bw * 0.08} x2={x + bw * 0.92} y1={Y(zNeedL(Z))} y2={Y(zNeedL(Z))} stroke="#16a34a" strokeWidth={1.6} strokeDasharray="3 2" />
              <SText x={x + bw / 2} y={height - 3} fontSize={8.5} fontWeight="600" fill="#6b7872" textAnchor="middle">{Z.id}</SText>
            </G>
          );
        })}
      </Svg>
    );
  }
  return <View onLayout={onLayout} style={{ height, width: '100%', marginTop: 7 }}>{body}</View>;
}
