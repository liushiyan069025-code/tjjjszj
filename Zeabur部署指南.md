# 减脂打卡 - Zeabur 部署指南（国内可访问，无需翻墙）

> 原来部署在 Vercel（`jianzhi-daka-psi.vercel.app`），国内访问需要翻墙。
> 改用 **Zeabur**（香港/亚洲节点，国内直连），体验和 Vercel 类似，但国内能直接打开。

---

## 为什么选 Zeabur？

| 对比项 | Vercel | Zeabur |
|--------|--------|--------|
| 国内访问 | ❌ 需翻墙 | ✅ 香港/亚洲节点，直连 |
| Node.js 后端 | 仅 Serverless 函数 | ✅ 原生支持长驻服务 |
| AI 代理 | 需 `api/ai-proxy.ts` | ✅ 直接跑 `server.js` |
| 部署方式 | Git 推送自动部署 | ✅ Git 推送自动部署 |
| 免费额度 | 有 | ✅ 有（含免费额度） |

---

## 前置准备

1. **GitHub 账号**（用于关联代码仓库）
2. **Zeabur 账号**：用 GitHub 登录 [https://zeabur.com](https://zeabur.com)
3. 项目代码已推送到 GitHub 仓库

---

## 部署步骤

### 第一步：注册 Zeabur

1. 打开 [https://zeabur.com](https://zeabur.com)
2. 点击右上角 **Login**，用 GitHub 账号登录
3. 授权后进入控制台 Dashboard

### 第二步：创建项目

1. 点击 **New Project**（新建项目）
2. 选择区域：**Asia (Hong Kong)** —— 香港节点，国内访问最快
3. 给项目起个名字，比如 `jianzhi-daka`

### 第三步：关联 GitHub 仓库

1. 在项目页面点击 **Add Service** → **Git Repository**
2. 授权 Zeabur 访问你的 GitHub
3. 选择「减脂打卡」所在的仓库
4. Zeabur 会自动检测到 [`zeabur.json`](zeabur.json:1) 配置：
   - **构建命令**：`npm run build`
   - **启动命令**：`node server.js`
   - **输出目录**：`dist`

### 第四步：配置环境变量（可选）

在服务的 **Variables** 标签页添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `NODE_ENV` | `production` | 生产环境 |
| `PORT` | `3000` | 监听端口（Zeabur 也会自动注入） |

> AI API Key 不需要在这里配置——应用是在前端「诺神配置」页面填写，保存在浏览器 localStorage 里。

### 第五步：绑定域名

1. 部署成功后，在服务页面点击 **Networking** → **Generate Domain**
2. Zeabur 会分配一个 `xxx.zeabur.app` 的域名
3. **国内可直接访问**，无需翻墙！

### 第六步：验证

打开分配的域名，确认：
- ✅ 页面能正常打开（不再需要翻墙）
- ✅ 进入「诺神配置」填写阿里云百炼 API Key
- ✅ AI 功能正常（算目标、认食物、写周报）

---

## 常见问题

### Q: Zeabur 免费额度够用吗？

个人项目完全够用。免费额度包含一定的构建时间和运行流量，减脂打卡这种轻量应用绰绰有余。

### Q: 想用自己的域名怎么办？

在 **Networking** → **Custom Domain** 添加你的域名，按提示添加 CNAME 解析即可。建议用国内注册的域名 + 国内 DNS，访问更稳定。

### Q: 部署后 AI 功能报错？

检查「诺神配置」页面：
- **API 地址**：`https://dashscope.aliyuncs.com/compatible-mode`（阿里云百炼，国内直连）
- **模型**：`qwen-vl-max`（识图）/ `qwen-plus`（纯文本）
- **API Key**：在 [阿里云百炼控制台](https://bailian.console.aliyun.com/) 申请

### Q: 和原来 Vercel 部署有什么区别？

- Vercel 用 `api/ai-proxy.ts`（Serverless Edge Function）做 AI 代理
- Zeabur 直接用 [`server.js`](server.js:1)（长驻 Node.js 服务）做 AI 代理 + 静态托管
- 两者逻辑一致，只是运行方式不同，Zeabur 的方式对国内更友好

---

## 备选方案：其他国内可访问平台

如果 Zeabur 不合适，还可以考虑：

| 平台 | 特点 | 适合场景 |
|------|------|----------|
| **腾讯云 CloudBase** | 国内大厂，稳定 | 静态托管 + 云函数 |
| **Sealos** | 国内 K8s 平台 | 需要完整后端服务 |
| **阿里云轻量服务器** | 最便宜（约 24 元/月） | 需自己运维，参考 [`阿里云部署指南.md`](阿里云部署指南.md:1) |
