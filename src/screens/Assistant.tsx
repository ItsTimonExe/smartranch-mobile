import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { PREFS } from '../sim/state';
import { hooks } from '../sim/engine';
import { Icon } from '../ui/Icon';
import { useTick } from '../ui/hooks';
import { C, shadow } from '../ui/theme';
import { ChatMsg, aiSend, chatMode, resetChat, stopChat, useChat } from '../ai/chat';

const SUG: [string, string][] = [
  ['Daily briefing', "Give me today's irrigation briefing."], ['Which parcels need water?', 'Which parcels need water?'], ['Water the dry parcels', 'Water all dry parcels.'],
  ['Best crop for my salty well?', 'What are the best crops for my well water salinity?'], ['Olive vs tomato', 'Olive vs tomato: compare their water needs.'],
  ['Plant olives on A5 and A6', 'Plant olive on A5 and A6.'], ['Explain WaPOR stress', 'Explain the WaPOR water stress of my parcels.'],
];

/** Minimal markdown: **bold**, _italic_, "- " bullets, headings. */
function Md({ text }: { text: string }) {
  const inline = (t: string, k: string) => {
    const parts = t.split(/(\*\*[^*]+\*\*|(?:^|[^\w*])_[^_\n]+_(?=[^\w]|$))/g);
    return parts.map((p, i) => {
      if (/^\*\*[^*]+\*\*$/.test(p)) return <Text key={k + i} style={{ fontWeight: '800' }}>{p.slice(2, -2)}</Text>;
      const m = p.match(/^([^\w*]?)_([^_\n]+)_$/);
      if (m) return <Text key={k + i}>{m[1]}<Text style={{ fontStyle: 'italic' }}>{m[2]}</Text></Text>;
      return p;
    });
  };
  return (
    <View style={{ gap: 5 }}>
      {text.split('\n').map((l, i) => {
        const b = l.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);
        if (b) return <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: 4 }}><Text style={s.mt}>•</Text><Text style={[s.mt, { flex: 1 }]}>{inline(b[1], 'b' + i)}</Text></View>;
        if (/^\s*#+\s/.test(l)) return <Text key={i} style={[s.mt, { fontWeight: '800' }]}>{l.replace(/^\s*#+\s*/, '')}</Text>;
        if (!l.trim()) return null;
        return <Text key={i} style={s.mt}>{inline(l, 'p' + i)}</Text>;
      })}
    </View>
  );
}

function Bubble({ m }: { m: ChatMsg }) {
  if (m.role === 'user') {
    return <View style={s.u}><Text style={s.uT} selectable>{m.text}</Text></View>;
  }
  return (
    <View style={{ flexDirection: 'row', gap: 7, maxWidth: '100%' }}>
      <LinearGradient colors={['#6d28d9', '#c026d3']} style={s.av}><Icon name="ai" size={14} color="#fff" /></LinearGradient>
      <View style={[s.mb, shadow]}>
        {m.text ? <Md text={m.text} /> : <Typing />}
        {m.acts.length ? (
          <View style={s.acts}>
            {m.acts.map((a, i) => (
              <View key={i} style={s.act}><Icon name="check" size={11} color={C.brand} /><Text style={{ fontWeight: '700', fontSize: 10.5, color: C.brand }}>{a}</Text></View>
            ))}
          </View>
        ) : null}
        {m.src ? <Text style={{ color: '#9aa5a0', fontSize: 9.5, marginTop: 6 }}>{m.src}</Text> : null}
      </View>
    </View>
  );
}
function Typing() {
  const [n, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((x) => (x + 1) % 3), 300); return () => clearInterval(t); }, []);
  return <View style={{ flexDirection: 'row', gap: 4, paddingVertical: 6 }}>{[0, 1, 2].map((i) => <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#a78bfa', opacity: n === i ? 1 : 0.4 }} />)}</View>;
}

export function Assistant() {
  useTick();
  const { msgs, busy } = useChat();
  const [text, setText] = useState('');
  const list = useRef<FlatList<ChatMsg>>(null);
  const mode = chatMode();
  useEffect(() => { const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 60); return () => clearTimeout(t); }, [msgs]);
  const send = () => {
    if (busy) { stopChat(); return; }
    const v = text; setText(''); void aiSend(v);
  };
  const voice = PREFS.set.voice;
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={s.top}>
        <View style={[s.badge, mode === 'offline' && { backgroundColor: '#fef3c7' }]}>
          <View style={[s.dot, { backgroundColor: mode === 'claude' ? '#22c55e' : '#f59e0b' }]} />
          <Text style={{ fontWeight: '700', fontSize: 10.5, color: mode === 'claude' ? '#5b21b6' : '#92400e' }}>{mode === 'claude' ? 'Claude AI · online' : 'Offline expert'}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable accessibilityLabel="Read replies aloud" onPress={() => { PREFS.set.voice = !PREFS.set.voice; if (!PREFS.set.voice) { try { Speech.stop(); } catch { /* */ } } hooks.onSave(); hooks.onChange(); }} style={[s.ib, voice && { backgroundColor: '#ede9fe' }]}>
          <Icon name={voice ? 'spk' : 'spkoff'} size={15} color={voice ? '#6d28d9' : C.ink} />
        </Pressable>
        <Pressable accessibilityLabel="New conversation" onPress={resetChat} style={s.ib}><Icon name="reset" size={15} color={C.ink} /></Pressable>
      </View>
      <FlatList ref={list} data={msgs} keyExtractor={(m) => String(m.id)} renderItem={({ item }) => <Bubble m={item} />}
        contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 8, paddingTop: 4, gap: 9 }} style={{ flex: 1 }} keyboardShouldPersistTaps="handled" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ flexGrow: 0, maxHeight: 40 }, busy && { opacity: 0.45 }]} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 7, paddingTop: 2 }} keyboardShouldPersistTaps="handled">
        {SUG.map(([n, q]) => (
          <Pressable key={n} disabled={busy} onPress={() => void aiSend(q)} style={s.sug}><Text style={{ fontWeight: '700', fontSize: 11, color: '#5b21b6' }}>{n}</Text></Pressable>
        ))}
      </ScrollView>
      <View style={s.inRow}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={send} placeholder="Ask about crops, water, parcels…" placeholderTextColor="#93a09a" maxLength={600} returnKeyType="send" style={s.input} />
        <Pressable accessibilityLabel={busy ? 'Stop' : 'Send'} onPress={send}>
          <LinearGradient colors={busy ? ['#334155', '#334155'] : ['#6d28d9', '#c026d3']} style={s.send}><Icon name={busy ? 'stop' : 'send'} size={18} color="#fff" /></LinearGradient>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingBottom: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ede9fe', borderRadius: 999, paddingVertical: 4, paddingHorizontal: 9 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  ib: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.chip, alignItems: 'center', justifyContent: 'center' },
  u: { alignSelf: 'flex-end', maxWidth: '84%', backgroundColor: '#11845b', paddingVertical: 8, paddingHorizontal: 11, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  uT: { color: '#fff', fontSize: 12.5, lineHeight: 17 },
  av: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  mb: { flex: 1, minWidth: 0, backgroundColor: '#fff', borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, paddingVertical: 9, paddingHorizontal: 11 },
  mt: { fontSize: 12.3, lineHeight: 17, color: C.ink },
  acts: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 7 },
  act: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e8f3ee', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999 },
  sug: { borderWidth: 1, borderColor: '#ddd6fe', backgroundColor: '#f5f3ff', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999 },
  inRow: { flexDirection: 'row', gap: 6, alignItems: 'center', paddingHorizontal: 10, paddingTop: 7, paddingBottom: 9, backgroundColor: 'rgba(255,255,255,.92)', borderTopWidth: 1, borderTopColor: C.line },
  input: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: '#dde3df', borderRadius: 999, paddingVertical: 9, paddingHorizontal: 13, fontSize: 12.5, backgroundColor: '#fff', color: C.ink },
  send: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
