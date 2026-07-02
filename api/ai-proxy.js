// Vercel Serverless Function: /api/ai-proxy
// Node.js 运行时（比 Edge 在 Vite 静态部署上更稳定）

function sanitizeUpstreamError(text) {
  if (!text) return '';
  if (/<!doctype\s*html|<html[\s>]/i.test(text)) {
    const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h2Match = text.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const code = titleMatch?.[1]?.trim() || h2Match?.[1]?.trim() || '';
    return `上游返回 HTML 错误页（非 JSON）。${code ? `页面标题: ${code}。` : ''}请检查 Base URL 路径是否正确。`;
  }
  return text;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const targetUrl = req.headers['x-proxy-target'];
  const apiKey = req.headers['x-proxy-key'];
  const apiType = req.headers['x-proxy-type'] || 'openai';

  if (!targetUrl || !apiKey) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '缺少代理配置 (targetUrl/apiKey)' }));
    return;
  }

  if (/^sk-/i.test(String(targetUrl).trim())) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      error: 'API 地址配置错误',
      detail: 'x-proxy-target 看起来是 API Key 而不是 URL。请在 App 里把 Key 填到 API Key 框，地址填 https://.../compatible-mode/v1',
    }));
    return;
  }

  try {
    const body = await readBody(req);

    let isStream = false;
    try {
      isStream = JSON.parse(body).stream === true;
    } catch { /* ignore */ }

    const headers = { 'Content-Type': 'application/json' };
    if (apiType === 'anthropic') {
      headers['x-api-key'] = String(apiKey).trim();
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${String(apiKey).trim()}`;
    }

    console.log('[AI Proxy] 请求目标:', targetUrl);

    const response = await fetch(targetUrl, { method: 'POST', headers, body });

    if (!response.ok) {
      const errorText = await response.text();
      const cleanError = sanitizeUpstreamError(errorText);
      const payload = response.status === 404
        ? {
            error: 'API 端点不存在 (404)',
            detail: `当前请求: ${targetUrl}。请核对 Base URL 路径，或粘贴 IT 提供的含 chat/completions 的完整地址。原始: ${cleanError.slice(0, 200)}`,
          }
        : response.status === 405
        ? {
            error: 'API 方法不允许 (405)',
            detail: `当前请求: ${targetUrl}。该路径不接受 POST，请向 IT 确认 chat 接口完整路径（常见 .../v1 或 .../compatible-mode/v1，或完整 .../chat/completions）。`,
          }
        : {
            error: `API 返回错误 ${response.status}`,
            detail: `${cleanError.slice(0, 500)}${targetUrl ? `\n当前请求: ${targetUrl}` : ''}`,
          };
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(payload));
      return;
    }

    if (isStream) {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      if (response.body) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }
      res.end();
      return;
    }

    const data = await response.text();
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(data);
  } catch (err) {
    console.error('[AI Proxy] 错误:', err.message);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '代理请求失败', detail: err.message }));
  }
}
