# ============================================================
# 腾讯云 CloudBase 云托管 - Dockerfile
# 多阶段构建：先编译前端，再用精简 Node 运行时托管
# ============================================================

# ---- 阶段 1：构建前端 ----
FROM node:20-slim AS builder

WORKDIR /app

# 先复制依赖清单，利用 Docker 缓存层
COPY package.json package-lock.json* ./

RUN npm ci

# 复制源码并构建
COPY . .

RUN npm run build

# ---- 阶段 2：运行时 ----
FROM node:20-slim AS runner

WORKDIR /app

# 只复制运行所需文件
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# 复制服务器和构建产物
COPY server.js ./
COPY --from=builder /app/dist ./dist

# CloudBase 云托管默认监听 80 端口
ENV PORT=80
ENV NODE_ENV=production

EXPOSE 80

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:80/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
