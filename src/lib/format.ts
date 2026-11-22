export const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const damp = (a: number, b: number, k: number, dt: number) => lerp(a, b, 1 - Math.exp(-k * dt));

/** Number with fixed decimals and thousands separators (en-US like the prototype). */
export const nf = (v: number, d = 0) => {
  const n = Number(v);
  if (!isFinite(n)) return '—';
  const fixed = n.toFixed(d);
  const [i, f] = fixed.split('.');
  const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f ? `${withSep}.${f}` : withSep;
};

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Game clock: the farm starts at 08:00, 1 real second = 1 game minute. */
export const clockAt = (gameT: number) => {
  const m = 480 + Math.floor(gameT);
  return pad2(Math.floor(m / 60) % 24) + ':' + pad2(m % 60);
};
export const ago = (s: number) => (s < 60 ? Math.max(1, Math.round(s)) + ' min' : Math.floor(s / 60) + ' h ' + pad2(Math.round(s % 60)));
export const inT = (s: number) => (s <= 1 ? 'imminent' : 'in ' + (s < 60 ? Math.ceil(s) + ' min' : Math.floor(s / 60) + ' h ' + pad2(Math.ceil(s % 60))));
export const tempAt = (gameT: number) => {
  const h = ((480 + gameT) / 60) % 24;
  return Math.round(23 + 10 * Math.sin(((h - 8.6) / 12) * Math.PI));
};
