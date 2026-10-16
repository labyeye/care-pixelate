import { useCallback, useRef, useState } from "react";

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

const LIMIT = 100;
const MERGE_MS = 700;

// State with undo / redo. `set(next, group)` records a step; consecutive sets with the same group
// inside MERGE_MS (typing, dragging a slider or a colour) collapse into ONE undo step.
// The history lives in a ref (updated synchronously) so React's double-invoked updaters can't
// double-count a step.
export function useHistoryState<T>(initial: T) {
  const ref = useRef<History<T>>({ past: [], present: initial, future: [] });
  const last = useRef<{ group: string; at: number } | null>(null);
  const [, rerender] = useState(0);

  const commit = (next: History<T>) => {
    ref.current = next;
    rerender((n) => n + 1);
  };

  const set = useCallback((next: T | ((cur: T) => T), group?: string) => {
    const cur = ref.current;
    const value = typeof next === "function" ? (next as (c: T) => T)(cur.present) : next;
    if (value === cur.present) return;
    const now = Date.now();
    const merge = !!group && last.current?.group === group && now - last.current.at < MERGE_MS;
    last.current = group ? { group, at: now } : null;
    commit(merge ? { ...cur, present: value, future: [] } : { past: [...cur.past, cur.present].slice(-LIMIT), present: value, future: [] });
  }, []);

  const undo = useCallback(() => {
    const cur = ref.current;
    if (!cur.past.length) return;
    last.current = null;
    commit({ past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] });
  }, []);

  const redo = useCallback(() => {
    const cur = ref.current;
    if (!cur.future.length) return;
    last.current = null;
    commit({ past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) });
  }, []);

  // Replaces the state and forgets history (after loading from / saving to the server).
  const reset = useCallback((value: T) => {
    last.current = null;
    commit({ past: [], present: value, future: [] });
  }, []);

  const h = ref.current;
  return { state: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
