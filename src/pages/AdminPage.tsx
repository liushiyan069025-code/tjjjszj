// ============================================================
// 后台管理页面
// 通过 URL #admin 访问，查看所有用户的云端数据
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import {
  fetchOverview, fetchUsers, fetchCollection,
  getAdminToken, setAdminToken, clearAdminToken,
  type AdminUser,
} from '../services/adminApi';

type View = 'overview' | 'users' | 'collection';

export const AdminPage: React.FC = () => {
  const [token, setToken] = useState(getAdminToken());
  const [tokenInput, setTokenInput] = useState('');
  const [authed, setAuthed] = useState(!!getAdminToken());
  const [view, setView] = useState<View>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 数据
  const [overview, setOverview] = useState<{ stats: Record<string, number>; envId: string; devMode?: boolean; hint?: string } | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUid, setSelectedUid] = useState<string>('');
  const [colData, setColData] = useState<{ collection: string; uid: string | null; total: number; data: any[] } | null>(null);
  const [selectedCol, setSelectedCol] = useState('meals');

  // 登录
  const handleLogin = () => {
    setAdminToken(tokenInput.trim());
    setToken(tokenInput.trim());
    setAuthed(true);
    setError('');
  };

  // 退出
  const handleLogout = () => {
    clearAdminToken();
    setToken('');
    setAuthed(false);
    setOverview(null);
    setUsers([]);
    setColData(null);
  };

  // 加载概览
  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchOverview();
      setOverview(data);
    } catch (e: any) {
      setError(e.message);
      if (e.message.includes('未授权') || e.message.includes('密钥')) {
        setAuthed(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchUsers();
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载集合数据
  const loadCollection = useCallback(async (col: string, uid?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCollection(col, uid || undefined);
      setColData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 切换 tab 时自动加载
  useEffect(() => {
    if (!authed) return;
    if (view === 'overview') loadOverview();
    else if (view === 'users') loadUsers();
    else if (view === 'collection') loadCollection(selectedCol, selectedUid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, authed]);

  // 集合或用户变化时重新加载
  useEffect(() => {
    if (authed && view === 'collection') {
      loadCollection(selectedCol, selectedUid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCol, selectedUid]);

  // 未登录：显示登录表单
  if (!authed) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-gray-900 rounded-2xl p-6 border border-gray-800">
          <h1 className="text-xl font-bold text-white mb-1">🔧 后台管理</h1>
          <p className="text-sm text-gray-400 mb-4">输入管理密钥登录</p>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="ADMIN_TOKEN"
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 mb-3 border border-gray-700 focus:border-primary-500 outline-none"
          />
          <button
            onClick={handleLogin}
            className="w-full bg-primary-600 hover:bg-primary-500 text-white rounded-lg py-2 font-medium transition"
          >
            登录
          </button>
          <p className="text-xs text-gray-500 mt-3">
            密钥即服务器环境变量 <code className="text-gray-400">ADMIN_TOKEN</code> 的值。
            部署时在 CloudBase 服务环境变量中配置。
          </p>
          <a href="#/" className="block text-center text-sm text-primary-400 mt-4 hover:underline">
            ← 返回应用
          </a>
        </div>
      </div>
    );
  }

  const colLabels: Record<string, string> = {
    profile: '用户资料',
    goal: '营养目标',
    meals: '餐食记录',
    weights: '体重记录',
    workoutPlan: '健身计划',
    workoutLogs: '运动打卡',
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 bg-gray-900/90 backdrop-blur border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold">🔧 减脂打卡 · 后台管理</h1>
          {overview && <span className="text-xs text-gray-500">环境: {overview.envId}</span>}
        </div>
        <div className="flex items-center gap-2">
          <a href="#/" className="text-sm text-primary-400 hover:underline">返回应用</a>
          <button onClick={handleLogout} className="text-sm text-gray-400 hover:text-red-400">退出</button>
        </div>
      </header>

      {/* Tab 切换 */}
      <nav className="flex gap-1 px-4 py-2 border-b border-gray-800 bg-gray-900/50">
        {([
          { key: 'overview', label: '📊 概览' },
          { key: 'users', label: '👥 用户列表' },
          { key: 'collection', label: '📋 数据查询' },
        ] as { key: View; label: string }[]).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition ${
              view === t.key ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 内容区 */}
      <main className="p-4 max-w-5xl mx-auto">
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg p-3 mb-4 text-sm">
            ⚠️ {error}
          </div>
        )}
        {loading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* 概览 */}
        {!loading && view === 'overview' && overview && (
          <>
            {overview.devMode && (
              <div className="bg-amber-900/30 border border-amber-700 text-amber-300 rounded-lg p-3 mb-4 text-sm">
                ℹ️ {overview.hint || '本地开发模式：数据为空，仅在线上环境可查看真实数据'}
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(overview.stats).map(([key, val]) => (
                <div key={key} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                  <div className="text-2xl font-bold text-primary-400">{val}</div>
                  <div className="text-sm text-gray-400 mt-1">{colLabels[key] || key}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 用户列表 */}
        {!loading && view === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800">
                  <th className="py-2 px-2">UID</th>
                  <th className="py-2 px-2">性别</th>
                  <th className="py-2 px-2">年龄</th>
                  <th className="py-2 px-2">身高</th>
                  <th className="py-2 px-2">体重</th>
                  <th className="py-2 px-2">目标</th>
                  <th className="py-2 px-2">餐食</th>
                  <th className="py-2 px-2">体重记录</th>
                  <th className="py-2 px-2">运动</th>
                  <th className="py-2 px-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.uid} className="border-b border-gray-800/50 hover:bg-gray-900/50">
                    <td className="py-2 px-2 font-mono text-xs text-gray-500">{u.uid.slice(0, 16)}...</td>
                    <td className="py-2 px-2">{u.profile.gender === 'male' ? '男' : u.profile.gender === 'female' ? '女' : '-'}</td>
                    <td className="py-2 px-2">{u.profile.age || '-'}</td>
                    <td className="py-2 px-2">{u.profile.height || '-'}</td>
                    <td className="py-2 px-2">{u.profile.weight || '-'}</td>
                    <td className="py-2 px-2">{u.profile.targetWeight || '-'}</td>
                    <td className="py-2 px-2 text-primary-400">{u.counts.meals || 0}</td>
                    <td className="py-2 px-2 text-primary-400">{u.counts.weights || 0}</td>
                    <td className="py-2 px-2 text-primary-400">{u.counts.workoutLogs || 0}</td>
                    <td className="py-2 px-2">
                      <button
                        onClick={() => { setSelectedUid(u.uid); setView('collection'); }}
                        className="text-xs text-primary-400 hover:underline"
                      >
                        查看数据
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={10} className="py-8 text-center text-gray-500">暂无用户数据</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* 数据查询 */}
        {!loading && view === 'collection' && (
          <div>
            {/* 筛选栏 */}
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <select
                value={selectedCol}
                onChange={(e) => setSelectedCol(e.target.value)}
                className="bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 text-sm"
              >
                {Object.entries(colLabels).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <input
                type="text"
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value)}
                placeholder="按 UID 筛选（留空看全部）"
                className="flex-1 min-w-[200px] bg-gray-800 text-white rounded-lg px-3 py-1.5 border border-gray-700 text-sm"
              />
              <button
                onClick={() => loadCollection(selectedCol, selectedUid)}
                className="bg-primary-600 hover:bg-primary-500 text-white rounded-lg px-4 py-1.5 text-sm"
              >
                查询
              </button>
            </div>

            {/* 数据展示 */}
            {colData && (
              <div>
                <div className="text-sm text-gray-400 mb-2">
                  集合 <span className="text-white">{colLabels[colData.collection]}</span>
                  {colData.uid && <span> · 用户 <span className="text-white font-mono">{colData.uid.slice(0, 16)}...</span></span>}
                  · 共 <span className="text-primary-400">{colData.total}</span> 条
                </div>
                <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
                  <pre className="text-xs text-gray-300 p-4 overflow-auto max-h-[60vh] whitespace-pre-wrap break-all">
                    {JSON.stringify(colData.data, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
