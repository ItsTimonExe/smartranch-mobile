/* Farm maps: live parcel map (Home), WaPOR pixel map, and the satellite map (Real / Moisture / WaPOR layers). */
import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SText } from 'react-native-svg';
import { BEDS, FMAP, MANI_X, MANI_Z } from '../data/farm';
import { LEAK, SAT, SIM, WAP, ZONES, Zone } from '../sim/state';
import { cropOf, zCss } from '../sim/helpers';
import { plantPositions } from '../sim/engine';
import { ProdKey, prodCss } from '../lib/colors';
import { clamp } from '../lib/format';
import { useWidth } from './charts';

/* ---------- Home: live parcels (colour = moisture vs crop target, blue outline = irrigating) ---------- */
export function FarmMap({ height = 150, selId, onZone }: { height?: number; selId?: string | null; onZone: (Z: Zone) => void }) {
  const [w, onLayout] = useWidth();
  let body: React.ReactNode = null;
  if (w > 0) {
    const s = Math.min(w / (FMAP.x1 - FMAP.x0), height / (FMAP.z1 - FMAP.z0));
    const ox = (w - (FMAP.x1 - FMAP.x0) * s) / 2, oz = (height - (FMAP.z1 - FMAP.z0) * s) / 2;
    const P = (x: number, z: number): [number, number] => [ox + (x - FMAP.x0) * s, oz + (z - FMAP.z0) * s];
    const grid: React.ReactNode[] = [];
    for (let x = ox % 12; x < w; x += 12) grid.push(<Line key={'x' + x} x1={x} x2={x} y1={0} y2={height} stroke="rgba(150,110,70,.10)" strokeWidth={1} />);
    for (let y = oz % 12; y < height; y += 12) grid.push(<Line key={'y' + y} x1={0} x2={w} y1={y} y2={y} stroke="rgba(150,110,70,.10)" strokeWidth={1} />);
    const t = SIM.t;
    const [m1x, m1y] = P(MANI_X, -5), [m2x, m2y] = P(MANI_X, 4.6), [m3x, m3y] = P(-1, MANI_Z), [m4x, m4y] = P(13.4, MANI_Z);
    body = (
      <Svg width={w} height={height}>
        <Rect x={0} y={0} width={w} height={height} fill="#efe3cf" />
        {grid}
        {BEDS.map(([a, b, c, e], i) => {
          const [x0, y0] = P(a, b), [x1, y1] = P(c, e);
          return <Rect key={i} x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={5} fill="#d6b48a" />;
        })}
        <Path d={`M${m1x} ${m1y}L${m2x} ${m2y}M${m3x} ${m3y}L${m4x} ${m4y}`} stroke="rgba(20,119,248,.6)" strokeWidth={1.6} />
        {ZONES.map((Z) => {
          const [a, b] = P(Z.x0, Z.z0), [c, e] = P(Z.x1, Z.z1), m = 1.7, cx = (a + c) / 2, cy = (b + e) / 2;
          const sel = selId === Z.id, ring = Z.valve || Z.queued || sel;
          const k = (t * 1.4 + Z.ph) % 1;
          return (
            <G key={Z.id} onPress={() => onZone(Z)}>
              <Rect x={a + m} y={b + m} width={c - a - 2 * m} height={e - b - 2 * m} rx={4} fill={zCss(Z, 0.94)}
                stroke={ring ? (Z.valve ? '#1477f8' : sel ? '#101914' : '#d97706') : 'none'} strokeWidth={ring ? 2.3 : 0}
                strokeDasharray={Z.queued && !Z.valve ? '3 2.5' : undefined} />
              <Circle cx={a + m + 6} cy={b + m + 6} r={3} fill={cropOf(Z).col} stroke="#fff" strokeWidth={1.2} />
              <SText x={cx} y={cy - 1} fontSize={9.5} fontWeight="800" fill="rgba(16,25,20,.9)" textAnchor="middle">{Z.id}</SText>
              <SText x={cx} y={cy + 10} fontSize={8.5} fontWeight="600" fill="rgba(16,25,20,.9)" textAnchor="middle">{Math.round(Z.hum)} %</SText>
              {Z.valve ? <Circle cx={cx} cy={cy} r={7 + k * 14} fill="none" stroke={`rgba(20,119,248,${0.7 * (1 - k)})`} strokeWidth={1.6} /> : null}
            </G>
          );
        })}
        {LEAK.on && LEAK.stage !== 'leak' && LEAK.site ? (() => {
          const [lx, lz] = P(clamp(LEAK.site.x, FMAP.x0 + 1, FMAP.x1 - 1), clamp(LEAK.site.z, FMAP.z0 + 0.6, FMAP.z1 - 0.6));
          const k = (t * 1.6) % 1;
          return (
            <G>
              <Circle cx={lx} cy={lz} r={4 + k * 11} fill="none" stroke={`rgba(239,68,68,${1 - k})`} strokeWidth={2} />
              <Circle cx={lx} cy={lz} r={3.6} fill="#ef4444" />
            </G>
          );
        })() : null}
        <SText x={P(-22.2, 6.4)[0]} y={P(-22.2, 6.4)[1]} fontSize={8} fontWeight="800" fill="rgba(110,78,46,.85)">FIELD A</SText>
        <SText x={P(-1.2, 1.2)[0]} y={P(-1.2, 1.2)[1]} fontSize={8} fontWeight="800" fill="rgba(110,78,46,.85)">FIELD B</SText>
      </Svg>
    );
  }
  return <View onLayout={onLayout} style={{ height, width: '100%' }}>{body}</View>;
}

/* ---------- pixel layer (0.5 m pixels of every parcel) ---------- */
function pixels(Z: Zone, prod: ProdKey, P: (x: number, z: number) => [number, number], sc: number, cut = 1e9, under = false) {
  const L = Z.wl, v = L.v[prod], pv = under && L.pv ? L.pv[prod] : null;
  const pw = ((Z.x1 - Z.x0) / L.cols) * sc, ph = ((Z.z1 - Z.z0) / L.rows) * sc;
  const out: React.ReactNode[] = [];
  for (let j = 0; j < L.rows; j++) {
    const z = Z.z0 + ((j + 0.5) * (Z.z1 - Z.z0)) / L.rows;
    const fresh = z <= cut, src = fresh ? v : pv;
    if (!src) continue;
    for (let i = 0; i < L.cols; i++) {
      const [a, b] = P(Z.x0 + (i * (Z.x1 - Z.x0)) / L.cols, Z.z0 + (j * (Z.z1 - Z.z0)) / L.rows);
      out.push(<Rect key={Z.id + j + '_' + i} x={a} y={b} width={pw + 0.6} height={ph + 0.6} fill={prodCss(prod, src[j * L.cols + i])} />);
    }
  }
  return out;
}

const WBOX = { x0: -23.5, z0: -7, w: 38.5, h: 23.5 };

/* ---------- WaPOR tab map ---------- */
export const WaporMap = memo(function WaporMap({ prod, rev }: { prod: ProdKey; rev: string }) {
  const [w, onLayout] = useWidth();
  const height = Math.round((w * 360) / 560);
  let body: React.ReactNode = null;
  if (w > 0) {
    const sc = Math.min(w / WBOX.w, height / WBOX.h), oy = (height - WBOX.h * sc) / 2;
    const P = (x: number, z: number): [number, number] => [(x - WBOX.x0) * sc, oy + (z - WBOX.z0) * sc];
    body = (
      <Svg width={w} height={height}>
        <Rect x={0} y={0} width={w} height={height} fill="#0e151b" />
        {[[-22, -5, -9, 4.6], [-1, 2, 13.4, 15]].map(([a, b, c, e], i) => {
          const [x, y] = P(a, b);
          return <Rect key={i} x={x} y={y} width={(c - a) * sc} height={(e - b) * sc} fill="#5b3424" />;
        })}
        {ZONES.map((Z) => pixels(Z, prod, P, sc))}
        {ZONES.map((Z) => {
          const [a, b] = P(Z.x0, Z.z0), [cx, cz] = P(Z.cx, Z.cz);
          return (
            <G key={Z.id}>
              <Rect x={a + 1} y={b + 1} width={(Z.x1 - Z.x0) * sc - 2} height={(Z.z1 - Z.z0) * sc - 2} fill="none" stroke={Z.wap.relet < 0.75 ? '#ff5a4a' : 'rgba(255,255,255,.8)'} strokeWidth={1.4} />
              <Rect x={cx - 11} y={cz - 7} width={22} height={14} fill="rgba(0,0,0,.55)" rx={2} />
              <SText x={cx} y={cz + 3.5} fontSize={10} fontWeight="800" fill="#fff" textAnchor="middle">{Z.id}</SText>
            </G>
          );
        })}
        <SText x={w - 8} y={14} fontSize={10} fontWeight="800" fill="#fff" textAnchor="end">N ↑</SText>
      </Svg>
    );
  }
  void rev;
  return <View onLayout={onLayout} style={{ width: '100%', height, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0e151b' }}>{body}</View>;
});

/* ---------- plants of the Real layer (static until a crop changes) ---------- */
const Plants = memo(function Plants({ P, sc, rev }: { P: (x: number, z: number) => [number, number]; sc: number; rev: string }) {
  void rev;
  const out: React.ReactNode[] = [];
  for (const Z of ZONES) {
    const c = cropOf(Z), tree = c.arch === 'olive' || c.arch === 'citrus' || c.arch === 'palm';
    const r = (tree ? (c.arch === 'palm' ? 1.3 : 1.0) : c.arch === 'cereal' || c.arch === 'leafy' ? 0.3 : 0.26) * sc;
    plantPositions(Z).forEach((p, i) => {
      const [x, y] = P(p.x, p.z);
      out.push(<Circle key={Z.id + i} cx={x} cy={y} r={r} fill={c.col} fillOpacity={tree ? 0.9 : 0.8} stroke="rgba(0,0,0,.18)" strokeWidth={0.5} />);
    });
  }
  return <G>{out}</G>;
});

/* ---------- Satellite screen map ---------- */
export function SatMap({ layer, prod, selId, onZone, width, height }: {
  layer: 'real' | 'hum' | 'wap'; prod: ProdKey; selId: string | null; onZone: (Z: Zone | null) => void; width: number; height: number;
}) {
  const bw = 40, bh = 26, x0 = -24, z0 = -8;
  const sc = Math.min(width / bw, height / bh), ox = (width - bw * sc) / 2, oy = (height - bh * sc) / 2;
  const P = (x: number, z: number): [number, number] => [ox + (x - x0) * sc, oy + (z - z0) * sc];
  const cropsKey = ZONES.map((z) => z.crop).join();
  // scan line: sweeps north → south while the satellite images the farm (u in [0.3, 0.7])
  const scanning = SAT.active && !SAT.scanned;
  const frac = clamp((SAT.u - 0.3) / 0.4, 0, 1);
  const cut = scanning ? z0 + frac * bh : 1e9;
  const cutQ = scanning ? Math.round(cut * 2) / 2 : 1e9;
  const scanY = P(0, cut)[1];
  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill={layer === 'real' ? '#c98a5f' : '#15202a'} onPress={() => onZone(null)} />
      {BEDS.map(([a, b, c, e], i) => {
        const [x, y] = P(a, b), [x1, y1] = P(c, e);
        return <Rect key={i} x={x} y={y} width={x1 - x} height={y1 - y} rx={4} fill={layer === 'real' ? '#a8683f' : '#3a2a20'} />;
      })}
      {layer === 'wap' ? ZONES.map((Z) => pixels(Z, prod, P, sc, cutQ, true)) : null}
      {layer === 'hum' ? ZONES.map((Z) => {
        const [a, b] = P(Z.x0, Z.z0);
        return <Rect key={Z.id} x={a + 1} y={b + 1} width={(Z.x1 - Z.x0) * sc - 2} height={(Z.z1 - Z.z0) * sc - 2} rx={4} fill={zCss(Z, 0.88)} />;
      }) : null}
      {layer === 'real' ? <Plants P={P} sc={sc} rev={cropsKey} /> : null}
      {ZONES.map((Z) => {
        const [a, b] = P(Z.x0, Z.z0), sel = selId === Z.id;
        const stressed = layer === 'wap' && Z.wap.relet < 0.75;
        return (
          <G key={Z.id} onPress={() => onZone(Z)}>
            <Rect x={a + 1} y={b + 1} width={(Z.x1 - Z.x0) * sc - 2} height={(Z.z1 - Z.z0) * sc - 2} rx={3} fill="rgba(255,255,255,0.001)"
              stroke={sel ? '#ffffff' : stressed ? '#ff5a4a' : Z.valve ? '#4aa3ff' : layer === 'real' ? 'rgba(255,255,255,.55)' : zCss(Z)} strokeWidth={sel ? 3 : Z.valve ? 2.4 : 1.6} />
          </G>
        );
      })}
      {ZONES.map((Z) => {
        const [cx, cz] = P(Z.cx, Z.cz);
        return (
          <G key={'t' + Z.id} onPress={() => onZone(Z)}>
            <Rect x={cx - 24} y={cz - 9} width={48} height={18} rx={9} fill={selId === Z.id ? '#fff' : 'rgba(14,18,24,.8)'} />
            <SText x={cx - 12} y={cz + 3.6} fontSize={10} fontWeight="800" fill={selId === Z.id ? '#111' : '#fff'} textAnchor="middle">{Z.id}</SText>
            <SText x={cx + 11} y={cz + 3.6} fontSize={10} fontWeight="700" fill={selId === Z.id ? '#111' : '#fff'} textAnchor="middle">
              {layer === 'wap' ? (prod === 'relet' ? Z.wap.relet.toFixed(2) : prod === 'aeti' ? Z.wap.aeti.toFixed(1) : prod === 'rsm' ? Z.wap.rsm.toFixed(2) : Math.round(Z.wap.bio) + '') : Math.round(Z.hum) + '%'}
            </SText>
          </G>
        );
      })}
      {scanning && frac > 0 && frac < 1 ? (
        <G>
          <Rect x={0} y={scanY - 14} width={width} height={14} fill="rgba(93,242,192,.18)" />
          <Line x1={0} x2={width} y1={scanY} y2={scanY} stroke="#86ffdc" strokeWidth={2.5} />
        </G>
      ) : null}
      <SText x={width - 10} y={18} fontSize={11} fontWeight="800" fill="#fff" textAnchor="end">N ↑</SText>
      <SText x={10} y={height - 8} fontSize={10} fontWeight="700" fill="#fff">{WAP.dek > 0 ? `WaPOR dekad ${WAP.dek}` : ''}</SText>
    </Svg>
  );
}
