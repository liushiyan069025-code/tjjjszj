import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'http';

/** 读取请求体 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'ai-proxy',
      configureServer(server) {
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

            /** 清洗上游错误文本：HTML 错误页 → 简洁提示，避免把整段 HTML 透传给前端 */
            const sanitizeUpstreamError = (text: string): string => {
              if (!text) return '';
              if (/<!doctype\s*html|<html[\s>]/i.test(text)) {
                const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                const h2Match = text.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
                const code = titleMatch?.[1]?.trim() || h2Match?.[1]?.trim() || '';
                return `上游返回 HTML 错误页（非 JSON）。${code ? `页面标题: ${code}。` : ''}请检查 Base URL 路径是否正确，例如阿里云 DashScope 需填 https://dashscope.aliyuncs.com/compatible-mode`;
              }
              return text;
            };

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
      },
    },
  ],
});
