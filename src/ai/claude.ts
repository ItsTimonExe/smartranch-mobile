/* Claude (Anthropic Messages API) with tool use. The user supplies an API key in Settings (stored in SecureStore).
   NOTE: for a public release, route this through your own backend so the key never ships with the app. */
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CBY, CROPS } from '../data/crops';
import { cropBand } from '../sim/helpers';
import { PREFS, SAT, SIM, GAME, ZBY, ZONES } from '../sim/state';
import { doIrrigate, doStop, hooks, normIds, requestSatellitePass, setZoneCrop, smartIrrigate } from '../sim/engine';
import { clampMin, zRecMin } from '../sim/helpers';
import { cropInfo, farmSnapshot, findCrops } from './knowledge';

const KEY_NAME = 'smartranch.anthropicKey';
export async function loadKey(): Promise<string> {
  try {
    if (Platform.OS === 'web') return (await AsyncStorage.getItem(KEY_NAME)) || '';
    return (await SecureStore.getItemAsync(KEY_NAME)) || '';
  } catch { return ''; }
}
export async function saveKey(k: string) {
  try {
    if (Platform.OS === 'web') { if (k) await AsyncStorage.setItem(KEY_NAME, k); else await AsyncStorage.removeItem(KEY_NAME); return; }
    if (k) await SecureStore.setItemAsync(KEY_NAME, k); else await SecureStore.deleteItemAsync(KEY_NAME);
  } catch { /* ignore */ }
}

export const MODEL_BY_TIER = { quick: 'claude-haiku-5-5', default: 'claude-sonnet-5-5', complex: 'claude-opus-5-5' } as const;

interface Tool { name: string; description: string; input_schema: object; execute: (i: any) => unknown }

export function buildTools(act: (s: string) => void): Tool[] {
  const parcelsSchema = { type: 'array', items: { type: 'string' }, description: 'parcel ids such as ["A2","B3"], or ["all"], or ["field A"]' };
  return [
    { name: 'get_farm_status', description: 'Fresh live snapshot of the farm: every parcel (crop, moisture, target band, status, valve, recommended minutes, daily need, WaPOR), tank, pump, valves, leak, well salinity, auto mode.', input_schema: { type: 'object', properties: {} }, execute: () => farmSnapshot() },
    {
      name: 'get_crop_info', description: 'FAO-56 water and salt data of one crop from the library, with its irrigation trigger on this soil, its water need now and the expected yield loss with the current well water.',
      input_schema: { type: 'object', properties: { crop: { type: 'string', description: 'crop id or name, e.g. tomato, olive, date palm' } }, required: ['crop'] },
      execute: ({ crop }: { crop: string }) => { const c = findCrops(crop)[0]; if (!c) throw new Error('Unknown crop. Library ids: ' + CROPS.map((x) => x.id).join(', ')); return cropInfo(c); },
    },
    {
      name: 'irrigate_parcels', description: 'Start irrigation of parcels (or queue them: limited number at once). minutes is optional; default = recommended duration for each crop.',
      input_schema: { type: 'object', properties: { parcels: parcelsSchema, minutes: { type: 'number' } }, required: ['parcels'] },
      execute: ({ parcels, minutes }: { parcels: unknown; minutes?: number }) => {
        const ids = normIds(parcels); if (!ids.length) throw new Error('No valid parcel id (A1-A6, B1-B6)');
        const r = doIrrigate(ids, minutes || 0, 'ai'); r.started.forEach((x) => act('Irrigating ' + x)); r.queued.forEach((x) => act('Queued ' + x)); return r;
      },
    },
    {
      name: 'stop_irrigation', description: 'Stop irrigation (or remove from the queue) for parcels, or ["all"].',
      input_schema: { type: 'object', properties: { parcels: parcelsSchema }, required: ['parcels'] },
      execute: ({ parcels }: { parcels: unknown }) => { const ids = /all/i.test(String(parcels)) ? ZONES.map((z) => z.id) : normIds(parcels); const r = doStop(ids); if (r.length) act('Stopped ' + r.join(', ')); return { stopped: r }; },
    },
    {
      name: 'set_parcel_crop', description: 'Change the crop grown on parcels (updates thresholds and water needs).',
      input_schema: { type: 'object', properties: { parcels: parcelsSchema, crop: { type: 'string', description: 'crop id or name from the library' } }, required: ['parcels', 'crop'] },
      execute: ({ parcels, crop }: { parcels: unknown; crop: string }) => {
        const c = findCrops(crop)[0]; if (!c) throw new Error('Unknown crop. Library ids: ' + CROPS.map((x) => x.id).join(', '));
        const ids = normIds(parcels); if (!ids.length) throw new Error('No valid parcel id');
        ids.forEach((id) => setZoneCrop(ZBY[id], c.id)); act(ids.join(', ') + ' → ' + c.name); return { parcels: ids, crop: c.name, new_target_pct: cropBand(CBY[c.id]) };
      },
    },
    {
      name: 'smart_irrigate_all', description: 'Irrigate every parcel that is below its crop trigger, each for its recommended time, in rotation.', input_schema: { type: 'object', properties: {} },
      execute: () => {
        const L = smartIrrigate('ai', true); if (L.length) act('Smart irrigation: ' + L.map((z) => z.id).join(', '));
        return { started_or_queued: L.map((z) => ({ id: z.id, minutes: z.queued ? z.queued.dur : clampMin(zRecMin(z)) })) };
      },
    },
    {
      name: 'set_auto_irrigation', description: 'Turn automatic irrigation (crop-based triggers) on or off.',
      input_schema: { type: 'object', properties: { on: { type: 'boolean' } }, required: ['on'] },
      execute: ({ on }: { on: boolean }) => { SIM.auto = !!on; PREFS.set.auto = !!on; hooks.onSave(); hooks.onChange(); act('Auto irrigation ' + (on ? 'ON' : 'OFF')); return { auto: !!on }; },
    },
    {
      name: 'start_satellite_pass', description: 'Ask for a new WaPOR satellite pass (new dekad of ETa and water-stress maps).', input_schema: { type: 'object', properties: {} },
      execute: () => { if (!SAT.active) requestSatellitePass(); act('Satellite pass requested'); return { ok: true, at: GAME.t }; },
    },
  ];
}

type Block = { type: string; [k: string]: any };
interface Msg { role: 'user' | 'assistant'; content: string | Block[] }

export class ClaudeError extends Error {
  constructor(public code: 'auth' | 'rate_limited' | 'network' | 'api', msg: string) { super(msg); }
}

/** Run one user turn with the tool loop. Returns the final assistant text. */
export async function askClaude(o: {
  apiKey: string; model: string; system: string; history: Msg[]; tools: Tool[]; signal?: AbortSignal; onText?: (t: string) => void;
}): Promise<string> {
  const messages: Msg[] = [...o.history];
  let text = '';
  for (let turn = 0; turn < 6; turn++) {
    let res: Response;
    try {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: o.signal,
        headers: {
          'content-type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: o.model, max_tokens: 1024, system: o.system, messages,
          tools: o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema })),
        }),
      });
    } catch (e: any) {
      if (o.signal?.aborted) throw e;
      throw new ClaudeError('network', e?.message || 'Network error');
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ClaudeError(res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate_limited' : 'api', `HTTP ${res.status} ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const blocks: Block[] = data.content || [];
    const t = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (t) { text = (text ? text + '\n' : '') + t; o.onText?.(text); }
    if (data.stop_reason !== 'tool_use') break;
    messages.push({ role: 'assistant', content: blocks });
    const results: Block[] = [];
    for (const b of blocks) {
      if (b.type !== 'tool_use') continue;
      const tool = o.tools.find((x) => x.name === b.name);
      try {
        if (!tool) throw new Error('Unknown tool');
        results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await tool.execute(b.input || {})) });
      } catch (e: any) {
        results.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: String(e?.message || e) });
      }
    }
    messages.push({ role: 'user', content: results });
  }
  return text;
}
