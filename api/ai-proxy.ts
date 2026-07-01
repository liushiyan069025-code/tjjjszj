// Vercel Serverless Function: /api/ai-proxy
// 复刻 vite.config.ts 中的 AI 代理中间件，解决浏览器跨域 + 隐藏 API Key
// 支持 OpenAI 兼容 / Anthropic 两种格式，支持流式与非流式

export const config = {
  runtime: 'edge',
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method Not Allowed' }, { status: 405 });
  }

  const targetUrl = req.headers.get('x-proxy-target') as string;
  const apiKey = req.headers.get('x-proxy-key') as string;
  const apiType = (req.headers.get('x-proxy-type') as string) || 'openai';

  if (!targetUrl || !apiKey) {
    return Response.json({ error: '缺少代理配置 (targetUrl/apiKey)' }, { status: 400 });
  }

  const body = await req.text();

  // 检测是否为流式请求
  let isStream = false;
  try {
    const parsed = JSON.parse(body);
    isStream = parsed.stream === true;
  } catch {
    /* ignore */
  }

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

  let response: Response;
  try {
    response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body,
    });
  } catch (err: any) {
    console.error('[AI Proxy] 错误:', err.message);
    return Response.json({ error: '代理请求失败', detail: err.message }, { status: 502 });
  }

  console.log('[AI Proxy] 上游响应状态:', response.status, '| Content-Type:', response.headers.get('content-type'));

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[AI Proxy] 上游错误:', errorText.slice(0, 500));
    return Response.json(
      { error: `API 返回错误 ${response.status}`, detail: errorText.slice(0, 500) },
      { status: response.status }
    );
  }

  if (isStream) {
    // 流式转发响应
    return new Response(response.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Content-Type-Options': 'nosniff',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // 非流式：直接透传 JSON 响应
  const data = await response.text();
  return new Response(data, {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
