// ============================================================
// 后台管理 API 客户端
// 通过 server.js 的 /api/admin/* 接口读取所有用户数据
// 需要管理员密钥（ADMIN_TOKEN）
// ============================================================

/** 管理员密钥（登录后保存在 sessionStorage，关闭标签页即清除） */
const ADMIN_TOKEN_KEY = 'diet_admin_token';

export function getAdminToken(): string {
  return sessionStorage.getItem(ADMIN_TOKEN_KEY) || '';
}

export function setAdminToken(token: string): void {
  sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
}

/** 通用请求封装 */
async function adminFetch(path: string): Promise<any> {
  const token = getAdminToken();
  const res = await fetch(path, {
    headers: { 'x-admin-token': token },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }
  return data;
}

/** 全局统计概览 */
export async function fetchOverview(): Promise<{
  stats: Record<string, number>;
  envId: string;
  devMode?: boolean;
  hint?: string;
}> {
  return adminFetch('/api/admin/overview');
}

/** 用户列表 */
export interface AdminUser {
  uid: string;
  counts: Record<string, number>;
  profile: {
    gender?: string;
    age?: number;
    height?: number;
    weight?: number;
    targetWeight?: number;
  };
  updatedAt: number;
}

export async function fetchUsers(): Promise<{ users: AdminUser[]; total: number }> {
  return adminFetch('/api/admin/users');
}

/** 查看某集合数据（可选按 uid 筛选） */
export async function fetchCollection(
  colKey: string,
  uid?: string,
  limit = 500
): Promise<{ collection: string; uid: string | null; total: number; data: any[] }> {
  const params = new URLSearchParams();
  if (uid) params.set('uid', uid);
  params.set('limit', String(limit));
  return adminFetch(`/api/admin/collection/${colKey}?${params}`);
}
