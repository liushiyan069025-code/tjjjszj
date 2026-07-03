// ============================================================
// CloudBase 云开发初始化模块
// 负责：SDK 初始化、匿名登录、用户唯一标识管理
// ============================================================

// @cloudbase/js-sdk 的类型定义不完善，使用默认导出 + any 断言
import cloudbase from '@cloudbase/js-sdk';

/** CloudBase 环境 ID（腾讯云控制台 → 环境概览） */
export const ENV_ID = 'tjjjszj-276878';

/** 本地存储中保存用户唯一标识的 key */
const UID_KEY = 'diet_app_uid';

let app: any = null;
let db: any = null;
let initPromise: Promise<{ db: any; uid: string; online: boolean }> | null = null;
let currentUid: string | null = null;

/** 获取/生成设备级匿名 UID（localStorage 持久化，换设备会变） */
function getLocalUid(): string {
  let uid = localStorage.getItem(UID_KEY);
  if (!uid) {
    // 生成随机 UID，格式：anon_时间戳_随机串
    uid = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(UID_KEY, uid);
  }
  return uid;
}

/**
 * 初始化 CloudBase 并完成匿名登录。
 * - 首次调用会真正初始化，后续调用复用同一实例。
 * - 匿名登录失败时降级为纯本地 UID，保证离线可用。
 * 返回数据库实例与用户标识。
 */
export function ensureCloudReady(): Promise<{ db: any; uid: string; online: boolean }> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const uid = getLocalUid();

    try {
      // 初始化应用实例
      app = (cloudbase as any).init({ env: ENV_ID });
      const auth = app.auth({ persistence: 'local' });

      // 匿名登录（需在控制台「环境 → 登录授权 → 匿名登录」开启）
      await auth.signInAnonymously();

      db = app.database();
      currentUid = uid;
      console.log('[CloudBase] 初始化成功，匿名登录完成，uid:', uid);
      return { db, uid, online: true };
    } catch (err) {
      // 降级：网络不通或未开启匿名登录时，仍用本地 UID
      console.warn('[CloudBase] 初始化失败，降级为本地模式:', err);
      currentUid = uid;
      return { db: null, uid, online: false };
    }
  })();
  return initPromise;
}

/** 获取当前数据库实例（需先 ensureCloudReady） */
export function getDB(): any {
  return db;
}

/** 获取当前用户标识 */
export function getUid(): string {
  return currentUid || getLocalUid();
}

/** 当前是否已连上云端 */
export function isOnline(): boolean {
  return db !== null;
}
