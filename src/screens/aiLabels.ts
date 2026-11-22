import { chatMode, useChat } from '../ai/chat';

export const AI_BUSY_LABEL = () =>
  useChat.getState().busy ? 'Thinking…' : (chatMode() === 'claude' ? 'Claude AI · ' : 'Offline expert · ') + "get today's briefing";
