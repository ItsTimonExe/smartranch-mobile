/* Farm geometry and fixed data, ported from the 3D world (metres, x = east, z = south). */

export type FieldId = 'tomato' | 'pepper';

export interface ZoneDef {
  id: string;
  field: FieldId;
  x0: number; z0: number; x1: number; z1: number;
}

export const MANI_X = -15.75; // field A manifold (north-south)
export const MANI_Z = 8.75; //  field B manifold (east-west)
export const SPR_FLOW = 4.2; //  L/min per low-pressure sprinkler
export const ZONE_FLOW = 2 * SPR_FLOW; // 2 sprinklers per parcel

export const FIELD_META: Record<FieldId, { name: string; pre: string; col: string }> = {
  tomato: { name: 'Field A', pre: 'A', col: '#ff7a4a' },
  pepper: { name: 'Field B', pre: 'B', col: '#7ddc4a' },
};

export const ZONE_DEFS: ZoneDef[] = (() => {
  const out: ZoneDef[] = [];
  // Field A (west): 3 bands × 2 halves of the manifold
  for (let r = 0; r < 3; r++) {
    for (let side = 0; side < 2; side++) {
      out.push({
        id: 'A' + (r * 2 + side + 1), field: 'tomato',
        x0: side ? MANI_X : -22, z0: [-5, -1.8, 1.4][r],
        x1: side ? -9 : MANI_X, z1: [-1.8, 1.4, 4.6][r],
      });
    }
  }
  // Field B (east): 3 groups × 2 halves of the manifold
  for (let half = 0; half < 2; half++) {
    for (let c = 0; c < 3; c++) {
      out.push({
        id: 'B' + (half * 3 + c + 1), field: 'pepper',
        x0: [-1, 3.8, 8.6][c], z0: half ? MANI_Z : 2,
        x1: [3.8, 8.6, 13.4][c], z1: half ? 15 : MANI_Z,
      });
    }
  }
  return out;
})();

/** Initial soil moisture (% volume) of the 12 sensors. */
export const HUM0: Record<string, number> = { A1: 46, A2: 21, A3: 38, A4: 55, A5: 29, A6: 17, B1: 52, B2: 34, B3: 19, B4: 44, B5: 61, B6: 27 };

export const DEFAULT_CROPS: Record<string, string> = {
  A1: 'tomato', A2: 'tomato', A3: 'tomato', A4: 'tomato', A5: 'olive', A6: 'olive',
  B1: 'pepper', B2: 'pepper', B3: 'pepper', B4: 'potato', B5: 'watermelon', B6: 'wheat',
};

export type ValveKey = 'V0' | 'A' | 'B';
export interface LeakSite { id: 'main' | 'a' | 'b'; name: string; x: number; z: number; valve: ValveKey; vname: string }
export const LEAKS: LeakSite[] = [
  { id: 'main', name: 'main pipe', x: 9.5, z: -6, valve: 'V0', vname: 'main valve V0' },
  { id: 'a', name: 'Field A pipe', x: -11.6, z: -6, valve: 'A', vname: 'valve A' },
  { id: 'b', name: 'Field B pipe', x: -3, z: 4.6, valve: 'B', vname: 'valve B' },
];

/** Bounds of the home map (metres). */
export const FMAP = { x0: -23, z0: -6.2, x1: 14.4, z1: 16 };
/** Soil beds drawn under the parcels on the maps. */
export const BEDS: [number, number, number, number][] = [
  [-22.35, -5.35, -8.65, 4.95],
  [-1.35, 1.65, 13.75, 15.35],
];
