// ============================================================
// useLocalStorage Hook - 响应式 localStorage 持久化
// ============================================================

import { useState, useCallback } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';

export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => loadFromStorage(key, defaultValue));

  const update = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      saveToStorage(key, next);
      return next;
    });
  }, [key]);

  return [state, update];
}
