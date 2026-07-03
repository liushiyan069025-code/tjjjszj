import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** 读取请求体 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** 清洗上游错误文本：HTML 错误页 → 简洁提示，避免把整段 HTML 透传给前端 */
function sanitizeUpstreamError(text: string): string {
  if (!text) return '';
  if (/<!doctype\s*html|<html[\s>]/i.test(text)) {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h2Match = text.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const code = titleMatch?.[1]?.trim() || h2Match?.[1]?.trim() || '';
    return `上游返回 HTML 错误页（非 JSON）。${code ? `页面标题: ${code}。` : ''}请检查 Base URL 路径是否正确，例如阿里云 DashScope 需填 https://dashscope.aliyuncs.com/compatible-mode`;
  }
  return text;
}

/**
 * 连接诊断：对单个候选 URL 发起最小化 POST 探测，
 * 返回标准化结果 { ok, status, kind, snippet }。
 * kind 取值：ok / auth / notfound / method / html / network / other
 */
async function probeEndpoint(
  targetUrl: string,
  apiKey: string,
  apiType: string,
  model: string
): Promise<{ ok: boolean; status: number; kind: string; snippet: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiType === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  // 最小请求体：1 token 上限，避免计费/长耗时
  const body = JSON.stringify({
    model,
    max_tokens: 1,
    messages: [{ role: 'user', content: 'ping' }],
  });
  try {
    const response = await fetch(targetUrl, { method: 'POST', headers, body });
    const text = await response.text();
    const clean = sanitizeUpstreamError(text);
    const isHtml = /<!doctype\s*html|<html[\s>]/i.test(text);

    let kind = 'other';
    if (response.ok) kind = 'ok';
    else if (response.status === 401 || response.status === 403) kind = 'auth';
    else if (response.status === 404) kind = 'notfound';
    else if (response.status === 405) kind = 'method';
    else if (isHtml) kind = 'html';

    return {
      ok: response.ok,
      status: response.status,
      kind,
      snippet: clean.slice(0, 200),
    };
  } catch (e: any) {
    return { ok: false, status: 0, kind: 'network', snippet: e?.message || '网络错误' };
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ai-proxy',
      configureServer(server) {
        // 诊断端点：前端请求 /api/ai-diagnose，服务端对单个候选 URL 发起最小化探测
        // 返回 { ok, status, kind, snippet }，用于自动定位正确的 chat 端点路径
        server.middlewares.use('/api/ai-diagnose', async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }
          const targetUrl = req.headers['x-proxy-target'] as string;
          const apiKey = req.headers['x-proxy-key'] as string;
          const apiType = (req.headers['x-proxy-type'] as string) || 'openai';
          if (!targetUrl || !apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '缺少代理配置 (targetUrl/apiKey)' }));
            return;
          }
          const rawBody = await readBody(req); // 消费请求体（含 model）
          let model = 'gpt-3.5-turbo';
          try { model = JSON.parse(rawBody || '{}').model || model; } catch { /* ignore */ }
          const result = await probeEndpoint(targetUrl, String(apiKey).trim(), apiType, model);
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        });

        // 代理中间件：前端请求 /api/ai-proxy，服务端转发到用户配置的 API
        // 解决浏览器直接调用第三方 API 的 CORS 问题
        server.middlewares.use('/api/ai-proxy', async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            return;
          }

          const targetUrl = req.headers['x-proxy-target'] as string;
          const apiKey = req.headers['x-proxy-key'] as string;
          const apiType = (req.headers['x-proxy-type'] as string) || 'openai';

          if (!targetUrl || !apiKey) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '缺少代理配置 (targetUrl/apiKey)' }));
            return;
          }

          try {
            const body = await readBody(req);

            // 检测是否为流式请求
            let isStream = false;
            try {
              const parsed = JSON.parse(body);
              isStream = parsed.stream === true;
            } catch { /* ignore */ }

            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
            };

            if (apiType === 'anthropic') {
              headers['x-api-key'] = apiKey;
              headers['anthropic-version'] = '2023-06-01';
            } else {
              headers['Authorization'] = `Bearer ${apiKey}`;
            }

            console.log('[AI Proxy] 请求目标:', targetUrl, '| apiType:', apiType, '| stream:', isStream);

            const response = await fetch(targetUrl, {
              method: 'POST',
              headers,
              body,
            });

            console.log('[AI Proxy] 上游响应状态:', response.status, '| Content-Type:', response.headers.get('content-type'));

            if (!response.ok) {
              const errorText = await response.text();
              const cleanError = sanitizeUpstreamError(errorText);
              console.error('[AI Proxy] 上游错误:', cleanError.slice(0, 500));

              // 404 特殊提示：通常是 Base URL 路径不正确
              if (response.status === 404) {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  error: `API 端点不存在 (404)`,
                  detail: `上游返回 404，通常是 Base URL 路径不正确。当前请求: ${targetUrl}。请检查 Base URL 是否包含多余路径（如 /compatible-mode），企业内部网关通常只需填 https://your-gateway.com。原始错误: ${cleanError.slice(0, 300)}`,
                }));
                return;
              }

              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `API 返回错误 ${response.status}`, detail: cleanError.slice(0, 500) }));
              return;
            }

            if (isStream) {
              // 流式转发响应
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/event-stream');
              res.setHeader('Cache-Control', 'no-cache');
              res.setHeader('Connection', 'keep-alive');
              res.setHeader('X-Content-Type-Options', 'nosniff');
              res.setHeader('X-Accel-Buffering', 'no');
              res.flushHeaders();

              if (response.body) {
                const reader = response.body.getReader();
                try {
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    res.write(value);
                  }
                } finally {
                  reader.releaseLock();
                }
              }
              res.end();
            } else {
              // 非流式：直接透传 JSON 响应
              const data = await response.text();
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(data);
            }
          } catch (err: any) {
            console.error('[AI Proxy] 错误:', err.message);
            if (!res.headersSent) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: '代理请求失败', detail: err.message }));
            }
          }
        });

        // ============================================================
        // 后台管理 API（dev 模式 mock，与 server.js 逻辑一致）
        // 通过动态 import 加载 @cloudbase/node-sdk
        // ============================================================
        server.middlewares.use('/api/admin', async (req: IncomingMessage, res: ServerResponse) => {
          const url = new URL(req.url || '', 'http://localhost');
          const urlPath = url.pathname;
          const token = req.headers['x-admin-token'] as string;
          const ADMIN_TOKEN = 'nuo-admin-2024';

          if (!token || token !== ADMIN_TOKEN) {
            res.statusCode = 401;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '未授权', detail: '密钥错误或缺少 x-admin-token 头' }));
            return;
          }

          // 本地 dev 没有 secretId/secretKey，无法用 node-sdk 管理员权限访问数据库
          // 返回友好提示，不调用 CloudBase，避免进程崩溃
          const hasCloudCreds = !!(process.env.TENCENTCLOUD_SECRETID && process.env.TENCENTCLOUD_SECRETKEY);
          const COLS: Record<string, string> = {
            profile: 'diet_profile', goal: 'diet_goal', meals: 'diet_meals',
            weights: 'diet_weights', workoutPlan: 'diet_workout_plan', workoutLogs: 'diet_workout_logs',
          };

          if (!hasCloudCreds) {
            // 本地无凭证：返回空数据 + 提示
            if (urlPath === '/overview') {
              const stats: Record<string, number> = {};
              for (const key of Object.keys(COLS)) stats[key] = 0;
              stats.uniqueUsers = 0;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ stats, envId: 'tjjjszj-276878', devMode: true, hint: '本地无腾讯云密钥，仅在线上可查看真实数据' }));
              return;
            }
            if (urlPath === '/users') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ users: [], total: 0, devMode: true, hint: '本地无腾讯云密钥，仅在线上可查看真实数据' }));
              return;
            }
            const colMatch = urlPath.match(/^\/collection\/(\w+)$/);
            if (colMatch) {
              const colKey = colMatch[1];
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ collection: colKey, uid: url.searchParams.get('uid') || null, total: 0, data: [], devMode: true, hint: '本地无腾讯云密钥，仅在线上可查看真实数据' }));
              return;
            }
            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '未知路径', path: urlPath }));
            return;
          }

          // 有云密钥时才真正调用 CloudBase
          try {
            const tcb = require('@cloudbase/node-sdk');
            const app = tcb.init({ env: 'tjjjszj-276878' });
            const db = app.database();

            if (urlPath === '/overview') {
              const stats: Record<string, number> = {};
              for (const [key, col] of Object.entries(COLS)) {
                const r = await db.collection(col).count();
                stats[key] = r.total;
              }
              const usersRes = await db.collection(COLS.meals).limit(1000).get();
              stats.uniqueUsers = new Set(usersRes.data.map((d: any) => d._uid).filter(Boolean)).size;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ stats, envId: 'tjjjszj-276878' }));
              return;
            }

            if (urlPath === '/users') {
              const uidSet = new Set<string>();
              for (const col of Object.values(COLS)) {
                const r = await db.collection(col).limit(1000).get();
                r.data.forEach((d: any) => { if (d._uid) uidSet.add(d._uid); });
              }
              const users = [];
              for (const uid of uidSet) {
                const counts: Record<string, number> = {};
                for (const [key, col] of Object.entries(COLS)) {
                  const r = await db.collection(col).where({ _uid: uid }).count();
                  counts[key] = r.total;
                }
                const profileRes = await db.collection(COLS.profile).where({ _uid: uid }).limit(1).get();
                const profile = profileRes.data[0] || {};
                users.push({
                  uid, counts,
                  profile: { gender: profile.gender, age: profile.age, height: profile.height, weight: profile.weight, targetWeight: profile.targetWeight },
                  updatedAt: profile._updatedAt || 0,
                });
              }
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ users, total: users.length }));
              return;
            }

            const colMatch = urlPath.match(/^\/collection\/(\w+)$/);
            if (colMatch) {
              const colKey = colMatch[1];
              const colName = COLS[colKey];
              if (!colName) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: `未知集合: ${colKey}` }));
                return;
              }
              const uid = url.searchParams.get('uid');
              const limit = parseInt(url.searchParams.get('limit') || '500', 10);
              let query = db.collection(colName);
              if (uid) query = query.where({ _uid: uid });
              const r = await query.limit(limit).get();
              const data = r.data.map(({ _id, _openid, ...rest }: any) => rest);
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ collection: colKey, uid: uid || null, total: data.length, data }));
              return;
            }

            res.statusCode = 404;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '未知路径', path: urlPath }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: '服务器错误', detail: err.message }));
          }
        });
      },
    },
  ],
});
