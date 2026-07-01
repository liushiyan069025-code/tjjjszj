#!/bin/bash
# ============================================================
# 减脂打卡 - 服务器端引导脚本
# 在阿里云 ECS Workbench 终端中粘贴运行
# ============================================================
# 此脚本在服务器上创建 server.js、PM2 配置、Nginx 配置
# 然后从本地 HTTP 服务器下载 dist/ 构建产物
# ============================================================

set -e

PROJECT_DIR="/opt/jianzhi-daka"
LOCAL_HTTP_PORT=9999
# 本地 Mac 的局域网 IP（脚本会自动检测，也可手动修改）
LOCAL_IP=""

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}  减脂打卡 - 服务器端引导${NC}"
echo -e "${CYAN}========================================${NC}"

# ============================================================
# 1. 创建项目目录
# ============================================================
echo -e "${YELLOW}[1/6] 创建项目目录...${NC}"
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR
echo -e "${GREEN}  ✅ 目录: $PROJECT_DIR${NC}"

# ============================================================
# 2. 创建 package.json
# ============================================================
echo -e "${YELLOW}[2/6] 创建 package.json...${NC}"
cat > package.json << 'PKGJSON'
{
  "name": "jianzhi-daka",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {}
}
PKGJSON
echo -e "${GREEN}  ✅ package.json${NC}"

# ============================================================
# 3. 创建 server.js
# ============================================================
echo -e "${YELLOW}[3/6] 创建 server.js...${NC}"
cat > server.js << 'SERVERJS'
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');

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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString(); });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
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

  if (!targetUrl || !apiKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少代理配置 (targetUrl/apiKey)' }));
    return;
  }

  try {
    const body = await readBody(req);
    let isStream = false;
    try {
      const parsed = JSON.parse(body);
      isStream = parsed.stream === true;
    } catch { /* ignore */ }

    const headers = { 'Content-Type': 'application/json' };
    if (apiType === 'anthropic') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    console.log('[AI Proxy] 请求目标:', targetUrl, '| apiType:', apiType, '| stream:', isStream);

    const response = await fetch(targetUrl, { method: 'POST', headers, body });

    console.log('[AI Proxy] 上游响应状态:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Proxy] 上游错误:', errorText.slice(0, 500));
      res.writeHead(response.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: `API 返回错误 ${response.status}`, detail: errorText.slice(0, 500) }));
      return;
    }

    if (isStream) {
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

function serveStatic(req, res, urlPath) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, safePath);
  if (safePath === '/' || safePath === '') {
    filePath = path.join(DIST_DIR, 'index.html');
  }
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const urlPath = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-proxy-target, x-proxy-key, x-proxy-type',
    });
    res.end();
    return;
  }

  if (urlPath === '/api/ai-proxy') {
    await handleAiProxy(req, res);
    return;
  }

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
SERVERJS
echo -e "${GREEN}  ✅ server.js${NC}"

# ============================================================
# 4. 创建 PM2 配置
# ============================================================
echo -e "${YELLOW}[4/6] 创建 PM2 配置...${NC}"
cat > ecosystem.config.cjs << 'ECOSYS'
module.exports = {
  apps: [{
    name: 'jianzhi-daka',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }],
};
ECOSYS
mkdir -p logs
echo -e "${GREEN}  ✅ ecosystem.config.cjs${NC}"

# ============================================================
# 5. 配置 Nginx
# ============================================================
echo -e "${YELLOW}[5/6] 配置 Nginx...${NC}"
cat > /etc/nginx/conf.d/jianzhi-daka.conf << 'NGINXCONF'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ai-proxy {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection '';
        chunked_transfer_encoding on;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
NGINXCONF
nginx -t 2>/dev/null && systemctl reload nginx
echo -e "${GREEN}  ✅ Nginx 配置完成${NC}"

# ============================================================
# 6. 启动 PM2
# ============================================================
echo -e "${YELLOW}[6/6] 启动 PM2 服务...${NC}"
cd $PROJECT_DIR
pm2 delete jianzhi-daka 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup 2>/dev/null || true
echo -e "${GREEN}  ✅ PM2 服务已启动${NC}"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  ✅ 服务器端配置完成！${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  现在需要上传前端构建产物 (dist/)"
echo -e "  请回到本地终端，我会启动临时 HTTP 服务"
echo -e "  然后在这里执行下载命令"
echo ""
echo -e "  服务状态："
pm2 status
echo ""
