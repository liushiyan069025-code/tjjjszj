// ============================================================
// 云端数据访问层
// 封装 CloudBase 数据库的增删查操作，按 uid 隔离用户数据
// ============================================================

import { getDB, getUid, isOnline } from './cloudbase';

/** 集合名常量 */
export const COLLECTIONS = {
  profile: 'diet_profile',
  goal: 'diet_goal',
  meals: 'diet_meals',
  weights: 'diet_weights',
  workoutPlan: 'diet_workout_plan',
  workoutLogs: 'diet_workout_logs',
} as const;

/** 带时间戳的写入辅助 */
function withMeta(data: any) {
  return { ...data, _uid: getUid(), _updatedAt: Date.now() };
}

// ------------------------------------------------------------
// 单文档类型（profile / goal / workoutPlan）：每用户一条
// ------------------------------------------------------------

/** 读取单文档（profile/goal/workoutPlan） */
export async function fetchSingle<T>(colName: string): Promise<T | null> {
  if (!isOnline()) return null;
  const db = getDB();
  try {
    const res = await db.collection(colName).where({ _uid: getUid() }).limit(1).get();
    if (res.data && res.data.length > 0) {
      // 去掉内部字段
      const { _id, _uid, _updatedAt, ...rest } = res.data[0];
      return rest as T;
    }
    return null;
  } catch (err) {
    console.error(`[cloudDB] fetchSingle(${colName}) 失败:`, err);
    return null;
  }
}

/** 写入单文档（存在则更新，不存在则插入） */
export async function saveSingle<T>(colName: string, data: T): Promise<boolean> {
  if (!isOnline()) return false;
  const db = getDB();
  const col = db.collection(colName);
  const payload = withMeta(data);
  try {
    // 先查是否存在
    const existing = await col.where({ _uid: getUid() }).limit(1).get();
    if (existing.data && existing.data.length > 0) {
      await col.doc(existing.data[0]._id).update(payload);
    } else {
      await col.add(payload);
    }
    return true;
  } catch (err) {
    console.error(`[cloudDB] saveSingle(${colName}) 失败:`, err);
    return false;
  }
}

// ------------------------------------------------------------
// 列表类型（meals / weights / workoutLogs）：每用户多条
// ------------------------------------------------------------

/** 读取列表（可选按日期范围过滤） */
export async function fetchList<T>(
  colName: string,
  opts?: { dateFrom?: string; dateTo?: string; limit?: number }
): Promise<T[]> {
  if (!isOnline()) return [];
  const db = getDB();
  try {
    let query = db.collection(colName).where({ _uid: getUid() });

    // 日期范围过滤（字段名 date，YYYY-MM-DD 字符串可直接比较）
    if (opts?.dateFrom || opts?.dateTo) {
      const dateFilter: any = {};
      if (opts.dateFrom) dateFilter.$gte = opts.dateFrom;
      if (opts.dateTo) dateFilter.$lte = opts.dateTo;
      query = db.collection(colName).where({ _uid: getUid(), date: dateFilter });
    }

    const limit = opts?.limit ?? 1000;
    const res = await query.limit(limit).get();

    if (res.data) {
      return res.data.map(({ _id, _uid, _updatedAt, ...rest }: any) => rest as T);
    }
    return [];
  } catch (err) {
    console.error(`[cloudDB] fetchList(${colName}) 失败:`, err);
    return [];
  }
}

/** 新增一条列表记录 */
export async function addListItem<T>(colName: string, item: T): Promise<boolean> {
  if (!isOnline()) return false;
  const db = getDB();
  try {
    await db.collection(colName).add(withMeta(item));
    return true;
  } catch (err) {
    console.error(`[cloudDB] addListItem(${colName}) 失败:`, err);
    return false;
  }
}

/** 删除一条列表记录（按指定字段值匹配，默认 id 字段） */
export async function removeListItem(colName: string, id: string, idField = 'id'): Promise<boolean> {
  if (!isOnline()) return false;
  const db = getDB();
  try {
    // 按 _uid + idField 定位，防止越权删除
    const res = await db.collection(colName).where({ _uid: getUid(), [idField]: id }).remove();
    return res.deleted > 0;
  } catch (err) {
    console.error(`[cloudDB] removeListItem(${colName}) 失败:`, err);
    return false;
  }
}

/** 全量覆盖列表（用于体重等需要去重/排序的场景） */
export async function replaceList<T>(colName: string, items: T[]): Promise<boolean> {
  if (!isOnline()) return false;
  const db = getDB();
  const col = db.collection(colName);
  try {
    // 先删除该用户所有记录
    await col.where({ _uid: getUid() }).remove();
    // 再批量插入
    const payload = items.map((item) => withMeta(item));
    // CloudBase 支持批量 add（单次最多 20 条，这里分批）
    for (let i = 0; i < payload.length; i += 20) {
      const batch = payload.slice(i, i + 20);
      await Promise.all(batch.map((p) => col.add(p)));
    }
    return true;
  } catch (err) {
    console.error(`[cloudDB] replaceList(${colName}) 失败:`, err);
    return false;
  }
}
