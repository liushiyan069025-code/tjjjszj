// ============================================================
// useCloudData Hooks - 云端优先 + 本地降级 + 自动迁移
// 替代 useLocalStorage，数据持久化到 CloudBase 数据库
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadFromStorage, saveToStorage } from '../utils/storage';
import { ensureCloudReady, isOnline } from '../services/cloudbase';
import {
  fetchSingle, saveSingle, fetchList, addListItem, removeListItem, replaceList,
} from '../services/cloudDB';

/** 迁移标记 key：记录某数据是否已从本地迁移到云端 */
function migrateKey(colKey: string): string {
  return `migrated_${colKey}`;
}

// ------------------------------------------------------------
// 单文档 Hook（profile / goal / workoutPlan）
// ------------------------------------------------------------

export function useCloudSingle<T>(
  colKey: string,
  colName: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, { loading: boolean; online: boolean }] {
  const [state, setState] = useState<T>(() => loadFromStorage(colKey, defaultValue));
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const skipNextSave = useRef(false);

  // 初始化：加载云端数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { online: ol } = await ensureCloudReady();
      if (cancelled) return;
      setOnline(ol);

      if (ol) {
        const cloudData = await fetchSingle<T>(colName);
        if (cancelled) return;
        if (cloudData !== null) {
          // 云端有数据，使用云端
          skipNextSave.current = true;
          setState(cloudData);
          saveToStorage(colKey, cloudData); // 同步到本地缓存
        } else {
          // 云端无数据，检查本地是否有数据需迁移
          const localData = loadFromStorage<T>(colKey, defaultValue);
          const migrated = localStorage.getItem(migrateKey(colKey));
          if (!migrated && !deepEqual(localData, defaultValue)) {
            // 本地有数据且未迁移过 → 上传到云端
            console.log(`[useCloudSingle] 迁移本地数据到云端: ${colKey}`);
            await saveSingle(colName, localData);
            localStorage.setItem(migrateKey(colKey), '1');
          }
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKey, colName]);

  // 写入：双写（本地 + 云端）
  const update = useCallback((value: T | ((prev: T) => T)) => {
    setState((prev) => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      // 写本地
      saveToStorage(colKey, next);
      // 写云端（非阻塞，失败仅打日志）
      if (isOnline()) {
        saveSingle(colName, next).catch((e) => console.warn(`[useCloudSingle] 云端写入失败 ${colKey}:`, e));
      }
      return next;
    });
  }, [colKey, colName]);

  return [state, update, { loading, online }];
}

// ------------------------------------------------------------
// 列表 Hook（meals / weights / workoutLogs）
// ------------------------------------------------------------

export function useCloudList<T>(
  colKey: string,
  colName: string,
  defaultValue: T[],
  idField: keyof T = 'id' as keyof T
): [
  T[],
  {
    add: (item: T) => void;
    remove: (id: string) => void;
    replaceAll: (items: T[]) => void;
    update: (items: T[]) => void;
  },
  { loading: boolean; online: boolean }
] {
  const [state, setState] = useState<T[]>(() => loadFromStorage(colKey, defaultValue));
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);

  // 初始化：加载云端数据
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { online: ol } = await ensureCloudReady();
      if (cancelled) return;
      setOnline(ol);

      if (ol) {
        const cloudData = await fetchList<T>(colName);
        if (cancelled) return;
        if (cloudData.length > 0) {
          // 云端有数据，使用云端
          setState(cloudData);
          saveToStorage(colKey, cloudData);
        } else {
          // 云端无数据，检查本地是否有数据需迁移
          const localData = loadFromStorage<T[]>(colKey, defaultValue);
          const migrated = localStorage.getItem(migrateKey(colKey));
          if (!migrated && localData.length > 0) {
            console.log(`[useCloudList] 迁移本地数据到云端: ${colKey} (${localData.length} 条)`);
            await replaceList(colName, localData);
            localStorage.setItem(migrateKey(colKey), '1');
          }
        }
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colKey, colName]);

  // 新增
  const add = useCallback((item: T) => {
    setState((prev) => {
      const next = [...prev, item];
      saveToStorage(colKey, next);
      if (isOnline()) {
        addListItem(colName, item).catch((e) => console.warn(`[useCloudList] 云端新增失败:`, e));
      }
      return next;
    });
  }, [colKey, colName]);

  // 删除（按 idField 字段值匹配）
  const remove = useCallback((id: string) => {
    setState((prev) => {
      const next = prev.filter((m) => String((m as any)[idField]) !== id);
      saveToStorage(colKey, next);
      if (isOnline()) {
        removeListItem(colName, id, String(idField)).catch((e) => console.warn(`[useCloudList] 云端删除失败:`, e));
      }
      return next;
    });
  }, [colKey, colName, idField]);

  // 全量替换（用于 weights 等去重排序场景）
  const replaceAll = useCallback((items: T[]) => {
    setState(items);
    saveToStorage(colKey, items);
    if (isOnline()) {
      replaceList(colName, items).catch((e) => console.warn(`[useCloudList] 云端全量替换失败:`, e));
    }
  }, [colKey, colName]);

  // 通用更新（直接设置整个列表）
  const update = useCallback((items: T[]) => {
    setState(items);
    saveToStorage(colKey, items);
    if (isOnline()) {
      replaceList(colName, items).catch((e) => console.warn(`[useCloudList] 云端更新失败:`, e));
    }
  }, [colKey, colName]);

  return [state, { add, remove, replaceAll, update }, { loading, online }];
}

// ------------------------------------------------------------
// 工具函数
// ------------------------------------------------------------

/** 深比较（用于判断本地数据是否等于默认值） */
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
