/**
 * 减脂打卡 - 独立 Node.js 服务器
 * 用于阿里云 ECS 部署，同时提供：
 *   1. 静态文件托管（dist/ 目录）
 *   2. AI 代理中间件（/api/ai-proxy）
 *
 * 用法：
 *   npm run build     # 先构建前端
 *   npm start         # 启动服务器
 *
 * 环境变量：
 *   PORT  监听端口，默认 3000
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// CloudBase 服务端 SDK（管理员权限，用于后台管理读取所有用户数据）
import tcb from '@cloudbase/node-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

// ============================================================
// CloudBase 服务端初始化（管理员权限）
// 用于后台管理 API，读取所有用户数据
// 需配置环境变量：TCB_ENV_ID（环境ID）、ADMIN_TOKEN（管理密钥）
// ============================================================

const TCB_ENV_ID = process.env.TCB_ENV_ID || 'tjjjszj-276878';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''; // 后台访问密钥，部署时在 CloudBase 环境变量配置

let tcbApp = null;
function getTcbApp() {
  if (!tcbApp) {
    tcbApp = tcb.init({ env: TCB_ENV_ID });
  }
  return tcbApp;
}

/** 管理集合名（与前端 cloudDB.ts 保持一致） */
const ADMIN_COLLECTIONS = {
  profile: 'diet_profile',
  goal: 'diet_goal',
  meals: 'diet_meals',
  weights: 'diet_weights',
  workoutPlan: 'diet_workout_plan',
  workoutLogs: 'diet_workout_logs',
};

/** 鉴权：检查请求头中的管理密钥 */
function checkAdminAuth(req) {
  if (!ADMIN_TOKEN) return { ok: false, reason: '服务器未配置 ADMIN_TOKEN 环境变量' };
  const token = req.headers['x-admin-token'];
  return { ok: token === ADMIN_TOKEN, reason: token ? '密钥错误' : '缺少 x-admin-token 头' };
}

/** 统一 JSON 响应 */
function jsonRes(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

/**
 * 后台管理 API
 * GET /api/admin/overview        → 全局统计（用户数、各集合记录数）
 * GET /api/admin/users           → 用户列表（uid + 各集合记录数）
 * GET /api/admin/collection/:name?uid=xxx → 查看某集合数据（可选按 uid 筛选）
 */
async function handleAdmin(req, res, url) {
  // 鉴权
  const auth = checkAdminAuth(req);
  if (!auth.ok) {
    jsonRes(res, 401, { error: '未授权', detail: auth.reason });
    return;
  }

  const db = getTcbApp().database();
  const urlPath = url.pathname;

  try {
    // 全局概览
    if (urlPath === '/api/admin/overview') {
      const stats = {};
      for (const [key, col] of Object.entries(ADMIN_COLLECTIONS)) {
        const r = await db.collection(col).count();
        stats[key] = r.total;
      }
      // 统计独立用户数（以 meals 集合的 _uid 去重近似）
      const usersRes = await db.collection(ADMIN_COLLECTIONS.meals).limit(1000).get();
      const uids = new Set(usersRes.data.map((d) => d._uid).filter(Boolean));
      stats.uniqueUsers = uids.size;
      jsonRes(res, 200, { stats, envId: TCB_ENV_ID });
      return;
    }

    // 用户列表
    if (urlPath === '/api/admin/users') {
      // 从所有集合收集 uid
      const uidSet = new Set();
      for (const col of Object.values(ADMIN_COLLECTIONS)) {
        const r = await db.collection(col).limit(1000).get();
        r.data.forEach((d) => { if (d._uid) uidSet.add(d._uid); });
      }
      // 每个用户的记录数
      const users = [];
      for (const uid of uidSet) {
        const counts = {};
        for (const [key, col] of Object.entries(ADMIN_COLLECTIONS)) {
          const r = await db.collection(col).where({ _uid: uid }).count();
          counts[key] = r.total;
        }
        // 取 profile 中的基本信息
        const profileRes = await db.collection(ADMIN_COLLECTIONS.profile).where({ _uid: uid }).limit(1).get();
        const profile = profileRes.data[0] || {};
        users.push({
          uid,
          counts,
          profile: {
            gender: profile.gender,
            age: profile.age,
            height: profile.height,
            weight: profile.weight,
            targetWeight: profile.targetWeight,
          },
          updatedAt: profile._updatedAt || 0,
        });
      }
      jsonRes(res, 200, { users, total: users.length });
      return;
    }

    // 查看某集合数据
    const colMatch = urlPath.match(/^\/api\/admin\/collection\/(\w+)$/);
    if (colMatch) {
      const colKey = colMatch[1];
      const colName = ADMIN_COLLECTIONS[colKey];
      if (!colName) {
        jsonRes(res, 400, { error: `未知集合: ${colKey}` });
        return;
      }
      const uid = url.searchParams.get('uid');
      const limit = parseInt(url.searchParams.get('limit') || '500', 10);

      let query = db.collection(colName);
      if (uid) query = query.where({ _uid: uid });

      const r = await query.limit(limit).get();
      // 清理内部字段
      const data = r.data.map(({ _id, _openid, ...rest }) => rest);
      jsonRes(res, 200, { collection: colKey, uid: uid || null, total: data.length, data });
      return;
    }

    jsonRes(res, 404, { error: '未知的管理 API 路径', path: urlPath });
  } catch (err) {
    console.error('[Admin] 错误:', err.message);
    jsonRes(res, 500, { error: '服务器错误', detail: err.message });
  }
}

// MIME 类型映射
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
};

// ============================================================
// AI 代理中间件 —— 复刻 vite.config.ts 中的逻辑
// ============================================================

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/** 清洗上游错误文本：HTML 错误页 → 简洁提示，避免把整段 HTML 透传给前端 */
function sanitizeUpstreamError(text) {
  if (!text) return '';
  // 检测 HTML 错误页（阿里云/CDN 网关常返回 <!doctype html> ...）
  if (/<!doctype\s*html|<html[\s>]/i.test(text)) {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h2Match = text.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const code = titleMatch?.[1]?.trim() || h2Match?.[1]?.trim() || '';
    return `上游返回 HTML 错误页（非 JSON）。${code ? `页面标题: ${code}。` : ''}请检查 Base URL 路径是否正确，例如阿里云 DashScope 需填 https://dashscope.aliyuncs.com/compatible-mode`;
  }
  return text;
}

/** 构建上游鉴权头 */
function buildUpstreamAuthHeaders(apiKey, apiType, authStyle) {
  const key = String(apiKey).trim();
  if (apiType === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  }
  if (authStyle === 'api-key') {
    return { 'api-key': key };
  }
  return { Authorization: `Bearer ${key}` };
}

/** 分类上游 HTTP 状态（供诊断用） */
function classifyUpstreamStatus(status, snippet) {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404) return 'notfound';
  if (status === 405) return 'method';
  if (snippet && /<!doctype\s*html|<html[\s>]/i.test(snippet)) return 'html';
  return 'other';
}

async function handleAiDiagnose(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const targetUrl = req.headers['x-proxy-target'];
  const apiKey = req.headers['x-proxy-key'];
  const apiType = req.headers['x-proxy-type'] || 'openai';
  const authStyle = req.headers['x-proxy-auth'] || 'bearer';

  if (!targetUrl || !apiKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少代理配置' }));
    return;
  }

  try {
    const raw = await readBody(req);
    let model = 'ping';
    try { model = JSON.parse(raw || '{}').model || model; } catch { /* ignore */ }

    const headers = {
      'Content-Type': 'application/json',
      ...buildUpstreamAuthHeaders(apiKey, apiType, authStyle),
    };
    const body = JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    });

    const response = await fetch(targetUrl, { method: 'POST', headers, body });
    const snippet = sanitizeUpstreamError((await response.text()).slice(0, 300));
    const kind = classifyUpstreamStatus(response.status, snippet);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: response.status,
      ok: kind === 'ok' || kind === 'auth', // 401 说明路径对、Key 可能错
      kind,
      snippet,
    }));
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 0, ok: false, kind: 'network', snippet: err.message }));
  }
}

async function handleAiProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const targetUrl = req.headers['x-proxy-target'];
  const apiKey = req.headers['x-proxy-key'];
  const apiType = req.headers['x-proxy-type'] || 'openai';
  const authStyle = req.headers['x-proxy-auth'] || 'bearer';

  // 调试日志：记录 Key 长度和前缀（不泄露完整 Key），便于排查 401 问题
  console.log('[AI Proxy] 收到请求 | targetUrl:', targetUrl, '| apiType:', apiType, '| authStyle:', authStyle, '| keyLength:', apiKey ? String(apiKey).length : 0, '| keyPrefix:', apiKey ? String(apiKey).slice(0, 6) + '...' : '(空)');

  if (!targetUrl || !apiKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
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

    const headers = {
      'Content-Type': 'application/json',
      ...buildUpstreamAuthHeaders(apiKey, apiType, authStyle),
    };

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

      // 401 特殊提示：帮助用户排查 API Key 问题
      if (response.status === 401) {
        const keyLen = String(apiKey).trim().length;
        const keyPrefix = String(apiKey).trim().slice(0, 6);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `API Key 无效 (401)`,
          detail: `上游返回 invalid_api_key。请检查：1) API Key 是否正确（当前前缀: ${keyPrefix}...，长度: ${keyLen}）；2) Key 是否在对应平台已启用；3) Key 是否复制完整无多余空格。原始错误: ${cleanError.slice(0, 300)}`,
        }));
        return;
      }

      // 404 特殊提示：通常是 Base URL 路径不正确
      if (response.status === 404) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `API 端点不存在 (404)`,
          detail: `上游返回 404，通常是 Base URL 路径不正确。当前请求: ${targetUrl}。申通网关请试「标准 OpenAI」模式 + 地址填 https://devops-llmgateway.sto.cn/v1。原始错误: ${cleanError.slice(0, 300)}`,
        }));
        return;
      }

      if (response.status === 405) {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: 'API 方法不允许 (405)',
          detail: `当前请求: ${targetUrl}。申通网关通常用 /v1/chat/completions（非 compatible-mode）。请在 App 选「标准 OpenAI」并把地址改为 https://devops-llmgateway.sto.cn/v1，或点「探测可用路径」。`,
        }));
        return;
      }

      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API 返回错误 ${response.status}`, detail: cleanError.slice(0, 500) }));
      return;
    }

    if (isStream) {
      // 流式转发响应
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      });

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
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    }
  } catch (err) {
    console.error('[AI Proxy] 错误:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: '代理请求失败', detail: err.message }));
    } else {
      res.end();
    }
  }
}

// ============================================================
// 静态文件服务
// ============================================================

function serveStatic(req, res, urlPath) {
  // 安全：防止路径穿越
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);

  // 如果是目录，尝试 index.html
  if (safePath === '/' || safePath === '') {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback：所有未匹配的路径返回 index.html
      const fallback = path.join(DIST_DIR, 'index.html');
      fs.readFile(fallback, (e, data) => {
        if (e) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (e, data) => {
      if (e) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
  });
}

// ============================================================
// HTTP 服务器
// ============================================================

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;

  // CORS 预检（如果将来需要跨域访问）
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-proxy-target, x-proxy-key, x-proxy-type, x-proxy-auth',
    });
    res.end();
    return;
  }

  // AI 代理路由
  if (urlPath === '/api/ai-proxy') {
    await handleAiProxy(req, res);
    return;
  }

  if (urlPath === '/api/ai-diagnose') {
    await handleAiDiagnose(req, res);
    return;
  }

  // 后台管理 API（需 x-admin-token 鉴权）
  if (urlPath.startsWith('/api/admin/')) {
    await handleAdmin(req, res, url);
    return;
  }

  // 静态文件
  serveStatic(req, res, urlPath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  减脂打卡服务器已启动`);
  console.log(`  本地访问:  http://localhost:${PORT}`);
  console.log(`  AI 代理:   http://localhost:${PORT}/api/ai-proxy`);
  console.log(`  静态目录:  ${DIST_DIR}`);
  console.log(`========================================\n`);
});
