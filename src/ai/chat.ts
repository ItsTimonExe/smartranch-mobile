/* Chat state and orchestration: Claude when a key is set, otherwise (or on failure) the offline expert. */
import { create } from 'zustand';
import * as Speech from 'expo-speech';
import { PREFS } from '../sim/state';
import { useUI } from '../store/ui';
import { aiContext, aiSystem } from './knowledge';
import { offlineAnswer } from './offline';
import { ClaudeError, MODEL_BY_TIER, askClaude, buildTools, loadKey, saveKey } from './claude';

export interface ChatMsg { id: number; role: 'user' | 'assistant'; text: string; acts: string[]; pending?: boolean; src?: string }

interface Chat {
  msgs: ChatMsg[];
  busy: boolean;
  hasKey: boolean;
  offlineForced: boolean;
  setKey: (k: string) => Promise<void>;
}

const WELCOME = "Hi! I'm **Ranch AI**, your agronomist. I know the water and salt needs of **24 crops** (FAO-56: olive, tomato, date palm, wheat…) and I read your 12 sensors, WaPOR, the tank and the well live.\nAsk me anything, or tell me what to do: \"water the dry parcels\", \"plant olive on A5\", \"is my water too salty for peppers?\"";
let id = 1;
const welcome = (): ChatMsg => ({ id: id++, role: 'assistant', acts: [], text: WELCOME });
let ctrl: AbortController | null = null;
let apiKey = '';

export const useChat = create<Chat>((set) => ({
  msgs: [welcome()],
  busy: false,
  hasKey: false,
  offlineForced: false,
  setKey: async (k) => { apiKey = k.trim(); await saveKey(apiKey); set({ hasKey: !!apiKey, offlineForced: false }); },
}));
export async function initChat() {
  apiKey = await loadKey();
  useChat.setState({ hasKey: !!apiKey });
}
export const chatMode = () => (useChat.getState().hasKey && !useChat.getState().offlineForced ? 'claude' : 'offline');
export function resetChat() { if (!useChat.getState().busy) useChat.setState({ msgs: [welcome()] }); }
export function stopChat() { ctrl?.abort(); }

const patch = (mid: number, p: Partial<ChatMsg>) =>
  useChat.setState((s) => ({ msgs: s.msgs.map((m) => (m.id === mid ? { ...m, ...p } : m)) }));

/** Strip markdown for text-to-speech. */
const plain = (t: string) => t.replace(/\*\*|__|_|`|#+\s?/g, '').replace(/^\s*[-•]\s+/gm, '').replace(/→/g, ' to ').replace(/–/g, ' to ').replace(/\n+/g, '. ').replace(/\.\s*\./g, '.');
export function speak(t: string) {
  if (!PREFS.set.voice || !t) return;
  try { Speech.stop(); Speech.speak(plain(t).slice(0, 1900)); } catch { /* no TTS */ }
}

export async function aiSend(raw: string) {
  const text = String(raw || '').trim();
  const st = useChat.getState();
  if (!text || st.busy) return;
  const um: ChatMsg = { id: id++, role: 'user', text, acts: [] };
  const am: ChatMsg = { id: id++, role: 'assistant', text: '', acts: [], pending: true };
  const history = st.msgs.filter((m) => m.text && !m.pending).slice(-8);
  useChat.setState({ msgs: [...st.msgs, um, am], busy: true });
  const acts: string[] = [];
  const act = (s: string) => { acts.push(s); patch(am.id, { acts: [...acts] }); };
  let final: { text: string; src?: string } = { text: '' };
  try {
    if (chatMode() === 'claude') {
      ctrl = new AbortController();
      // merge consecutive same-role messages and make sure the first one is from the user
      const hist: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const m of history) {
        const last = hist[hist.length - 1];
        if (last && last.role === m.role) last.content += '\n' + m.text.slice(0, 1500);
        else hist.push({ role: m.role, content: m.text.slice(0, 1500) });
      }
      while (hist.length && hist[0].role !== 'user') hist.shift();
      if (hist.length && hist[hist.length - 1].role === 'user') hist[hist.length - 1].content += '\n' + text;
      else hist.push({ role: 'user', content: text });
      const out = await askClaude({
        apiKey, model: MODEL_BY_TIER[PREFS.set.aiTier] || MODEL_BY_TIER.default,
        system: aiSystem() + '\n\n' + aiContext(), history: hist, tools: buildTools(act), signal: ctrl.signal,
        onText: (t) => patch(am.id, { text: t }),
      });
      final = { text: out || 'Done.', src: 'Claude AI · live farm data + FAO-56' };
    } else {
      const d = { text: '', acts, src: '' };
      offlineAnswer(text, d);
      final = { text: d.text, src: d.src };
      patch(am.id, { acts: [...acts] });
    }
  } catch (e: any) {
    if (ctrl?.signal.aborted) final = { text: (useChat.getState().msgs.find((m) => m.id === am.id)?.text || '') + ' _(stopped)_' };
    else {
      const d = { text: '', acts, src: '' };
      offlineAnswer(text, d);
      const why = e instanceof ClaudeError && e.code === 'auth' ? '_The API key was refused, so the offline expert answers:_' : e instanceof ClaudeError && e.code === 'rate_limited' ? '_Claude is busy for a moment; the offline expert answers:_' : '_Claude did not answer; the offline expert answers:_';
      final = { text: why + '\n\n' + d.text, src: d.src };
      patch(am.id, { acts: [...acts] });
    }
  }
  ctrl = null;
  patch(am.id, { text: final.text, src: final.src, pending: false });
  useChat.setState({ busy: false });
  speak(final.text);
}

/** Open the assistant tab and send a question (used by "AI advice", briefing, plan…). */
export function askAI(q: string) {
  useUI.getState().setTab('ai');
  setTimeout(() => { void aiSend(q); }, 120);
}
