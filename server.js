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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

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

async function handleAiProxy(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const targetUrl = req.headers['x-proxy-target'];
  const apiKey = req.headers['x-proxy-key'];
  const apiType = req.headers['x-proxy-type'] || 'openai';

  // 调试日志：记录 Key 长度和前缀（不泄露完整 Key），便于排查 401 问题
  console.log('[AI Proxy] 收到请求 | targetUrl:', targetUrl, '| apiType:', apiType, '| keyLength:', apiKey ? String(apiKey).length : 0, '| keyPrefix:', apiKey ? String(apiKey).slice(0, 6) + '...' : '(空)');

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

      // 401 特殊提示：帮助用户排查 API Key 问题
      if (response.status === 401) {
        const keyLen = String(apiKey).trim().length;
        const keyPrefix = String(apiKey).trim().slice(0, 6);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: `API Key 无效 (401)`,
          detail: `DashScope 返回 invalid_api_key。请检查：1) API Key 是否以 sk- 开头（当前前缀: ${keyPrefix}...，长度: ${keyLen}）；2) Key 是否在阿里云百炼控制台已启用；3) Key 是否复制完整无多余空格。原始错误: ${cleanError.slice(0, 300)}`,
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
      'Access-Control-Allow-Headers': 'Content-Type, x-proxy-target, x-proxy-key, x-proxy-type',
    });
    res.end();
    return;
  }

  // AI 代理路由
  if (urlPath === '/api/ai-proxy') {
    await handleAiProxy(req, res);
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
