import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Alert } from 'react-native';

/** Loads on focus, supports pull-to-refresh, and keeps the last good data when a refresh fails. */
export function useLoad<T>(fn: () => Promise<T>, deps: any[] = [], initial?: T) {
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const run = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await fn();
      if (alive.current) { setData(r); setError(''); }
    } catch (e: any) {
      if (alive.current) setError(e?.message || 'Could not load');
    } finally {
      if (alive.current) { setLoading(false); setRefreshing(false); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useFocusEffect(useCallback(() => { run(); }, [run]));
  return { data, loading, refreshing, error, reload: run, refresh: () => run(true), setData };
}

/** Debounce a fast-changing value (search boxes). */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export const confirm = (title: string, message: string, onYes: () => void, yes = 'Yes') =>
  Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: yes, style: 'destructive', onPress: onYes }]);

export const fail = (e: any) => Alert.alert('Something went wrong', e?.message || 'Request failed');

/** Matches any of the haystacks, case-insensitively (client-side search for loaded lists). */
export const matchesQ = (q: string, ...hay: (string | undefined | null)[]) => {
  const n = q.trim().toLowerCase();
  return !n || hay.some(h => (h ?? '').toLowerCase().includes(n));
};
