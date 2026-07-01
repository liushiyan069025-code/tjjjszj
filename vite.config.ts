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
              console.error('[AI Proxy] 上游错误:', errorText.slice(0, 500));
              res.statusCode = response.status;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: `API 返回错误 ${response.status}`, detail: errorText.slice(0, 500) }));
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
