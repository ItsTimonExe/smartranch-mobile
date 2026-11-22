import React, { memo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';
import { CROP_ICO, ICO } from '../data/icons';
import { Crop } from '../data/crops';

type Node = { tag: string; props: Record<string, string> };
const cache = new Map<string, Node[]>();
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function parse(frag: string): Node[] {
  const hit = cache.get(frag);
  if (hit) return hit;
  const nodes: Node[] = [];
  const re = /<(path|circle|rect|ellipse)\s([^>]*?)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(frag))) {
    const props: Record<string, string> = {};
    const are = /([\w-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = are.exec(m[2]))) props[camel(a[1])] = a[2];
    nodes.push({ tag: m[1], props });
  }
  cache.set(frag, nodes);
  return nodes;
}

function Frag({ frag, size, color }: { frag: string; size: number; color: string }) {
  const nodes = parse(frag);
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      {nodes.map((n, i) => {
        const p: Record<string, any> = { ...n.props };
        for (const k of Object.keys(p)) if (p[k] === 'currentColor') p[k] = color;
        if (n.tag === 'path') return <Path key={i} {...p} />;
        if (n.tag === 'circle') return <Circle key={i} {...p} />;
        if (n.tag === 'rect') return <Rect key={i} {...p} />;
        return <Ellipse key={i} {...p} />;
      })}
    </Svg>
  );
}

export const Icon = memo(function Icon({ name, size = 18, color = '#101914' }: { name: string; size?: number; color?: string }) {
  return <Frag frag={ICO[name] || ''} size={size} color={color} />;
});

const SIZES = { sm: [20, 13, 6], md: [28, 17, 9], lg: [40, 24, 12], xl: [58, 34, 17] } as const;
/** Crop pictogram: tinted rounded tile with the crop icon in the crop colour. */
export const CropIcon = memo(function CropIcon({ crop, size = 'md', plain }: { crop: Crop; size?: keyof typeof SIZES; plain?: boolean }) {
  const [box, ic, rad] = SIZES[size];
  const tint = plain || size === 'xl' ? 'rgba(255,255,255,0.94)' : crop.col + '26';
  return (
    <View style={{ width: box, height: box, borderRadius: rad, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>
      <Frag frag={CROP_ICO[crop.icon] || CROP_ICO.leaf} size={ic} color={crop.col} />
    </View>
  );
});
