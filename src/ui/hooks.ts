import { useUI } from '../store/ui';

/** Subscribe the calling component to the 4 Hz simulation tick (re-renders it on every step). */
export const useTick = () => useUI((s) => s.tick);
