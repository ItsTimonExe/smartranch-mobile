/* FAO-56 crop library (Kc ini/mid/end, max root depth Zr, depletion fraction p, salt tolerance).
   Source: FAO Irrigation & Drainage Paper 56, tables 12, 22, 23 — ported from the web prototype. */

export type SaltRate = 'S' | 'MS' | 'MT' | 'T' | '';
export type Arch = 'tomato' | 'pepper' | 'bush' | 'leafy' | 'melon' | 'cereal' | 'olive' | 'citrus' | 'palm';

export interface Crop {
  id: string;
  name: string;
  group: string;
  arch: Arch;
  icon: string;
  col: string;
  kc: [number, number, number];
  zr: [number, number];
  p: number;
  ece: [number, number] | null;
  b: number | null;
  rate: SaltRate;
  h: number;
  tip: string;
}

export const CROPS: Crop[] = [
  { id: 'tomato', name: 'Tomato', group: 'Vegetables', arch: 'tomato', icon: 'fruit', col: '#e5483a', kc: [0.6, 1.15, 0.8], zr: [0.7, 1.5], p: 0.4, ece: [0.9, 2.5], b: 9, rate: 'MS', h: 0.6,
    tip: 'Keep soil moisture steady: big swings cause fruit cracking and blossom-end rot. Most sensitive at flowering and fruit set.' },
  { id: 'pepper', name: 'Sweet pepper', group: 'Vegetables', arch: 'pepper', icon: 'pepper', col: '#3f9a3a', kc: [0.6, 1.05, 0.9], zr: [0.5, 1.0], p: 0.3, ece: [1.5, 1.7], b: 13, rate: 'MS', h: 0.7,
    tip: 'Shallow roots and quick to stress (p = 0.30): irrigate little and often. Sensitive to salty water.' },
  { id: 'eggplant', name: 'Eggplant', group: 'Vegetables', arch: 'pepper', icon: 'pepper', col: '#6b3fa0', kc: [0.6, 1.05, 0.9], zr: [0.7, 1.2], p: 0.45, ece: null, b: null, rate: 'MS', h: 0.8,
    tip: 'Likes heat and regular moisture through fruiting.' },
  { id: 'potato', name: 'Potato', group: 'Vegetables', arch: 'bush', icon: 'root', col: '#b8864a', kc: [0.5, 1.15, 0.75], zr: [0.4, 0.6], p: 0.35, ece: [1.7, 1.7], b: 12, rate: 'MS', h: 0.6,
    tip: 'Tubers need steady moisture, above all at tuber initiation. Avoid waterlogging near harvest.' },
  { id: 'onion', name: 'Onion (dry)', group: 'Vegetables', arch: 'leafy', icon: 'root', col: '#c77d3b', kc: [0.7, 1.05, 0.75], zr: [0.3, 0.6], p: 0.3, ece: [1.2, 1.2], b: 16, rate: 'S', h: 0.4,
    tip: 'Shallow roots: frequent light irrigations. Stop watering a couple of weeks before harvest so the bulbs cure.' },
  { id: 'lettuce', name: 'Lettuce', group: 'Vegetables', arch: 'leafy', icon: 'leaf', col: '#7cc242', kc: [0.7, 1.0, 0.95], zr: [0.3, 0.5], p: 0.3, ece: [1.3, 1.7], b: 12, rate: 'MS', h: 0.3,
    tip: 'Shallow roots, light frequent irrigation. Heat and water stress make it bolt.' },
  { id: 'artichoke', name: 'Artichoke', group: 'Vegetables', arch: 'bush', icon: 'leaf', col: '#6f8f6a', kc: [0.5, 1.0, 0.95], zr: [0.6, 0.9], p: 0.45, ece: null, b: null, rate: 'MT', h: 0.7,
    tip: 'Perennial and moderately salt tolerant. Needs regular water during spring growth.' },
  { id: 'watermelon', name: 'Watermelon', group: 'Vegetables', arch: 'melon', icon: 'melon', col: '#2f8a3a', kc: [0.4, 1.0, 0.75], zr: [0.8, 1.5], p: 0.4, ece: null, b: null, rate: 'MS', h: 0.4,
    tip: 'Deep roots. Cut irrigation back during ripening for sweeter fruit.' },
  { id: 'melon', name: 'Melon', group: 'Vegetables', arch: 'melon', icon: 'melon', col: '#d9a23a', kc: [0.5, 1.05, 0.75], zr: [0.8, 1.5], p: 0.4, ece: null, b: null, rate: 'MS', h: 0.4,
    tip: 'Regular water until fruit sizing, then less to raise sugar content.' },
  { id: 'cucumber', name: 'Cucumber', group: 'Vegetables', arch: 'melon', icon: 'melon', col: '#4f9e3c', kc: [0.6, 1.0, 0.75], zr: [0.7, 1.2], p: 0.5, ece: [1.1, 2.5], b: 10, rate: 'MS', h: 0.3,
    tip: 'High water use while fruiting. Keep the leaves dry when possible to limit disease.' },
  { id: 'strawberry', name: 'Strawberry', group: 'Fruit', arch: 'bush', icon: 'berry', col: '#e23d55', kc: [0.4, 0.85, 0.75], zr: [0.2, 0.3], p: 0.2, ece: [1.0, 1.5], b: 22, rate: 'S', h: 0.2,
    tip: 'Very shallow roots and salt sensitive: frequent light irrigations with good-quality water.' },
  { id: 'beans', name: 'Green beans', group: 'Legumes', arch: 'bush', icon: 'bean', col: '#5aa83f', kc: [0.5, 1.05, 0.9], zr: [0.5, 0.7], p: 0.45, ece: [1.0, 1.0], b: 19, rate: 'S', h: 0.4,
    tip: 'Salt sensitive (ECe 1.0 dS/m). Most critical stage: flowering.' },
  { id: 'faba', name: 'Faba bean', group: 'Legumes', arch: 'bush', icon: 'bean', col: '#7a9a3a', kc: [0.5, 1.15, 1.1], zr: [0.5, 0.7], p: 0.45, ece: [1.5, 1.6], b: 9.6, rate: 'MS', h: 0.8,
    tip: 'Winter legume that fixes nitrogen for the next crop.' },
  { id: 'chickpea', name: 'Chickpea', group: 'Legumes', arch: 'bush', icon: 'bean', col: '#b9a05a', kc: [0.4, 1.0, 0.35], zr: [0.6, 1.0], p: 0.5, ece: null, b: null, rate: '', h: 0.4,
    tip: 'Hardy crop grown on stored soil water; one or two irrigations at flowering and podding raise yield.' },
  { id: 'wheat', name: 'Wheat', group: 'Cereals', arch: 'cereal', icon: 'grain', col: '#c9a83a', kc: [0.3, 1.15, 0.3], zr: [1.0, 1.5], p: 0.55, ece: [6.0, 6.0], b: 7.1, rate: 'MT', h: 1.0,
    tip: "Durum wheat is Tunisia's main cereal. Most sensitive to water stress at heading and flowering." },
  { id: 'barley', name: 'Barley', group: 'Cereals', arch: 'cereal', icon: 'grain', col: '#b89a46', kc: [0.3, 1.15, 0.25], zr: [1.0, 1.5], p: 0.55, ece: [8.0, 8.0], b: 5, rate: 'T', h: 1.0,
    tip: 'The most salt-tolerant cereal (ECe 8 dS/m): a good fit for brackish well water.' },
  { id: 'alfalfa', name: 'Alfalfa', group: 'Fodder', arch: 'cereal', icon: 'leaf', col: '#4f9a4a', kc: [0.4, 0.95, 0.9], zr: [1.0, 2.0], p: 0.55, ece: [2.0, 2.0], b: 7.3, rate: 'MS', h: 0.7,
    tip: 'Fodder for livestock with high water use; irrigate after each cut.' },
  { id: 'sugarbeet', name: 'Sugar beet', group: 'Field crops', arch: 'leafy', icon: 'root', col: '#a0507a', kc: [0.35, 1.2, 0.7], zr: [0.7, 1.2], p: 0.55, ece: [7.0, 7.0], b: 5.9, rate: 'T', h: 0.5,
    tip: 'Salt tolerant (ECe 7 dS/m), with deep roots that use stored soil water.' },
  { id: 'olive', name: 'Olive', group: 'Trees', arch: 'olive', icon: 'tree', col: '#6f8a4a', kc: [0.65, 0.7, 0.7], zr: [1.2, 1.7], p: 0.65, ece: null, b: null, rate: 'MT', h: 4,
    tip: "Tunisia's iconic tree and very drought tolerant (p = 0.65). Extra water at flowering and fruit growth lifts yield a lot." },
  { id: 'citrus', name: 'Citrus (orange)', group: 'Trees', arch: 'citrus', icon: 'tree', col: '#f08a1c', kc: [0.7, 0.65, 0.7], zr: [1.2, 1.5], p: 0.5, ece: [1.7, 1.7], b: 16, rate: 'S', h: 4,
    tip: 'Evergreen, so it needs water all year. Sensitive to salt (ECe 1.7 dS/m).' },
  { id: 'almond', name: 'Almond', group: 'Trees', arch: 'olive', icon: 'tree', col: '#9a7b52', kc: [0.4, 0.9, 0.65], zr: [1.0, 2.0], p: 0.4, ece: [1.5, 1.5], b: 19, rate: 'S', h: 5,
    tip: 'Drought adapted but salt sensitive. Spring irrigation is key for kernel filling.' },
  { id: 'pistachio', name: 'Pistachio', group: 'Trees', arch: 'olive', icon: 'tree', col: '#8aa04a', kc: [0.4, 1.1, 0.45], zr: [1.0, 1.5], p: 0.4, ece: null, b: null, rate: '', h: 4,
    tip: 'Very hardy tree; summer irrigation improves nut filling.' },
  { id: 'grapes', name: 'Table grapes', group: 'Trees', arch: 'bush', icon: 'berry', col: '#7a3f8a', kc: [0.3, 0.85, 0.45], zr: [1.0, 2.0], p: 0.35, ece: [1.5, 1.5], b: 9.6, rate: 'MS', h: 2,
    tip: 'Moderate water needs; mild stress after fruit set improves berry quality.' },
  { id: 'datepalm', name: 'Date palm', group: 'Trees', arch: 'palm', icon: 'palm', col: '#b07a2a', kc: [0.9, 0.95, 0.95], zr: [1.5, 2.5], p: 0.5, ece: [4.0, 4.0], b: 3.6, rate: 'T', h: 8,
    tip: 'Handles heat and salt (ECe 4 dS/m) but needs a lot of water for good dates.' },
];

export const CBY: Record<string, Crop> = Object.fromEntries(CROPS.map((c) => [c.id, c]));

export const RATE_TXT: Record<string, string> = {
  S: 'Sensitive',
  MS: 'Moderately sensitive',
  MT: 'Moderately tolerant',
  T: 'Tolerant',
  '': 'No FAO data',
};

/** Soil water on the sensor scale (% volume): field capacity and wilting point. */
export interface Soil { id: 'sandy' | 'loam' | 'clay'; name: string; fc: number; wp: number }
export const SOILS: Record<string, Soil> = {
  sandy: { id: 'sandy', name: 'Sandy loam', fc: 52, wp: 12 },
  loam: { id: 'loam', name: 'Loam', fc: 60, wp: 15 },
  clay: { id: 'clay', name: 'Clay loam', fc: 66, wp: 24 },
};

/** Synonyms (EN / FR / Derja in latin and arabic letters) used by the offline expert. */
export const CROP_SYN: Record<string, string[]> = {
  tomato: ['tomat', 'tmatem', 'tmatim', 'tomatem', 'طماطم'], pepper: ['poivron', 'felfel', 'filfil', 'flfel', 'فلفل'],
  eggplant: ['aubergine', 'bedenjal', 'badhinjan', 'batinjen', 'باذنجان'], potato: ['pomme de terre', 'batata', 'بطاطا'],
  onion: ['oignon', 'bsal', 'بصل'], lettuce: ['laitue', 'salade', 'khass', 'خس'], artichoke: ['artichaut', 'qnariya', 'gnaria', '9naria', 'قنارية'],
  watermelon: ['pastèque', 'pasteque', 'dellaa', 'dalla3', 'dela3', 'دلاع'], melon: ['battikh', 'bettikh', 'بطيخ'], cucumber: ['concombre', 'faqous', 'fa9ous', 'feggous', 'فقوس'],
  strawberry: ['strawberr', 'fraise', 'فراولة'], beans: ['green bean', 'bean', 'haricot', 'loubia', 'لوبيا'], faba: ['faba bean', 'fava', 'broad bean', 'fève', 'feve', 'foul', 'فول'],
  chickpea: ['pois chiche', 'hommos', '7ommos', 'حمص'], wheat: ['blé', 'qmah', '9mah', 'gamh', 'قمح'], barley: ['orge', 'cha3ir', 'sh3ir', 'شعير'], alfalfa: ['luzerne', 'fessa', 'fassa', 'فصة'],
  sugarbeet: ['sugar beet', 'betterave', 'شمندر'], olive: ['olivier', 'zitoun', 'zaytoun', 'zeytoun', 'زيتون'], citrus: ['orange', 'lemon', 'agrume', 'bourdgen', 'bordgen', 'qaress', 'برتقال', 'قوارص'],
  almond: ['amande', 'louz', 'لوز'], pistachio: ['pistache', 'fosto9', 'fostok', 'فستق'], grapes: ['grape', 'vine', 'raisin', '3neb', 'aneb', 'عنب'],
  datepalm: ['date palm', 'palm', 'palmier', 'dattier', 'nakhla', 'nakhel', 'deglet', 'نخلة', 'تمر'],
};
