import { lerp } from './format';

type RGB = [number, number, number];

/** Moisture colours (crop-relative: red = wilting, yellow = needs water, green = optimal, blue = too wet). */
const HUM_STOPS: [number, RGB][] = [
  [10, [214, 64, 48]], [25, [240, 150, 47]], [36, [226, 204, 72]], [44, [108, 196, 88]],
  [55, [44, 168, 112]], [61, [58, 160, 232]], [70, [42, 108, 222]],
];

function ramp(stops: [number, RGB][], v: number): RGB {
  if (v <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const [a, ca] = stops[i - 1];
      const [b, cb] = stops[i];
      const k = (v - a) / (b - a);
      return [Math.round(lerp(ca[0], cb[0], k)), Math.round(lerp(ca[1], cb[1], k)), Math.round(lerp(ca[2], cb[2], k))];
    }
  }
  return stops[stops.length - 1][1];
}

export const humRGB = (h: number) => ramp(HUM_STOPS, h);
export const humCss = (h: number, a = 1) => {
  const c = humRGB(h);
  return a === 1 ? `rgb(${c.join(',')})` : `rgba(${c.join(',')},${a})`;
};
export const humHex = (h: number) => '#' + humRGB(h).map((v) => v.toString(16).padStart(2, '0')).join('');

/* WaPOR palettes (same product names and units as WaPOR v3) */
export type ProdKey = 'aeti' | 'relet' | 'rsm' | 'bio';
export const PALS: Record<ProdKey, [number, RGB][]> = {
  aeti: [[0, [222, 196, 140]], [1.5, [246, 226, 150]], [3, [176, 219, 110]], [4.5, [64, 174, 96]], [6, [28, 136, 160]], [8, [24, 72, 156]]],
  relet: [[0.3, [178, 24, 43]], [0.5, [239, 110, 70]], [0.7, [253, 208, 104]], [0.85, [160, 212, 104]], [1, [26, 150, 80]]],
  rsm: [[0, [166, 97, 26]], [0.3, [223, 194, 125]], [0.55, [190, 225, 200]], [0.75, [90, 180, 220]], [1, [25, 90, 180]]],
  bio: [[0, [250, 240, 200]], [40, [200, 225, 140]], [80, [110, 190, 90]], [120, [40, 140, 70]], [160, [10, 90, 50]]],
};
export const PROD: Record<ProdKey, { name: string; short: string; unit: string; d: number; lo: string; hi: string }> = {
  aeti: { name: 'Actual ET (AETI)', short: 'ETa', unit: 'mm/day', d: 1, lo: '0', hi: '8 mm/day' },
  relet: { name: 'Water stress (ETa / ETp)', short: 'Stress', unit: '', d: 2, lo: '0.3 stressed', hi: '1.0 no stress' },
  rsm: { name: 'Relative soil moisture (RSM)', short: 'RSM', unit: '', d: 2, lo: '0 dry', hi: '1 wet' },
  bio: { name: 'Biomass (dekad)', short: 'Biomass', unit: 'g/m²', d: 0, lo: '0', hi: '160 g/m²' },
};
export const prodCss = (p: ProdKey, v: number) => `rgb(${ramp(PALS[p], v).join(',')})`;
/** Colour stops of a palette for LinearGradient. */
export const prodStops = (p: ProdKey) => {
  const pal = PALS[p];
  const a = pal[0][0];
  const b = pal[pal.length - 1][0];
  return {
    colors: pal.map(([, c]) => `rgb(${c.join(',')})`),
    locations: pal.map(([v]) => (v - a) / (b - a)),
  };
};
