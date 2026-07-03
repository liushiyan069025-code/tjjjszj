# 腾讯云 CloudBase 部署指南

> **为什么选腾讯云 CloudBase？**
> - ✅ 国内直连，无需翻墙
> - ✅ 有免费额度（云托管每月 50 万次请求 + 1GB 流量）
> - ✅ 自动 HTTPS、自动扩缩容
> - ✅ 支持后端（AI 代理 + 图片上传），不是纯静态托管
> - ✅ 代码已在 GitHub，一键关联自动部署

---

## 前置准备

1. **GitHub 仓库**：代码已推送至 `https://github.com/liushiyan069025-code/tjjjszj`
2. **腾讯云账号**：注册 [cloud.tencent.com](https://cloud.tencent.com)
3. **阿里云百炼 API Key**：用于 AI 功能（拍照识别食物等）

---

## 方式一：控制台部署（推荐，最简单）

### 第 1 步：开通 CloudBase

1. 打开 [腾讯云 CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 点击 **新建环境**
3. 环境名称填 `tjjjszj`（或任意名）
4. **套餐选择「按量付费」**（有免费额度，不会乱扣费）
5. 地域选 **上海** 或 **广州**（国内访问最快）
6. 点击 **开通**，等待 1-2 分钟创建完成

### 第 2 步：开启云托管

1. 进入刚创建的环境
2. 左侧菜单 → **云托管** → **立即开启**
3. 选择 **代码托管部署**
4. 授权腾讯云访问你的 GitHub（首次会跳转 GitHub 授权页）
5. 选择仓库 `tjjjszj`，分支 `main`

### 第 3 步：配置服务

1. **服务名称**：`tjjjszj`
2. **部署方式**：Dockerfile（自动识别仓库中的 `Dockerfile`）
3. **监听端口**：`80`（Dockerfile 中已配置）
4. **规格**：0.5 核 CPU / 1GB 内存（免费额度内）
5. **扩缩容**：最小 0 实例，最大 5 实例（没人访问时不计费）
6. 点击 **部署**

### 第 4 步：等待构建

- CloudBase 会自动拉取代码、运行 `npm run build`、构建 Docker 镜像
- 首次构建约 3-5 分钟
- 构建日志可在 **服务详情 → 部署日志** 查看

### 第 5 步：绑定域名

1. 部署成功后，进入 **服务设置 → 访问服务**
2. 点击 **新建访问服务**
3. 填写：
   - 服务：`tjjjszj`
   - 路径：`/`
   - 端口：`80`
4. 保存后会自动分配一个域名，格式类似：
   ```
   https://tjjjszj-xxxx-xxxx.sh.run.tcloudbasegateway.com
   ```
5. 打开这个域名，即可访问应用（国内直连，无需翻墙）

### 第 6 步：开启数据库（云端历史数据，必做）

> 应用已接入 CloudBase 数据库，数据云端存储，**换设备/浏览器也能查看历史记录**。
> 需完成以下配置才能生效（一次性操作）。

1. 进入 [CloudBase 控制台](https://console.cloud.tencent.com/tcb) → 选择环境 `tjjjszj-276878`
2. 左侧菜单 → **数据库** → 确认已开通（新环境默认开通）
3. **创建集合**（共 6 个，名称必须完全一致）：
   | 集合名 | 用途 |
   |--------|------|
   | `diet_profile` | 用户资料 |
   | `diet_goal` | 营养目标 |
   | `diet_meals` | 餐食打卡记录 |
   | `diet_weights` | 体重记录 |
   | `diet_workout_plan` | 健身计划 |
   | `diet_workout_logs` | 运动打卡记录 |
4. **设置权限**：每个集合 → 权限设置 → 选择 **「仅创建者可读写」**
   （这样不同用户的数据互相隔离，匿名登录用户只能读写自己的数据）
5. **开启匿名登录**：
   - 左侧菜单 → **环境 → 登录授权**
   - 找到 **「匿名登录」**，点击 **启用**
   - （已登录方式中勾选「匿名登录」）

> 💡 完成后，打开网站，首次访问会自动匿名登录并生成唯一用户 ID。
> 之前存在 localStorage 的数据会**自动迁移**到云端，无需手动操作。

### 第 7 步：配置 AI

1. 打开部署后的网站
2. 进入底部导航 **「诺神配置」**
3. 填写：
   - **API 地址**：`https://dashscope.aliyuncs.com/compatible-mode`
   - **API Key**：你的阿里云百炼 Key
   - **模型**：`qwen-vl-max`
4. 保存，回到首页拍照测试

---

## 方式二：CLI 命令行部署（适合开发者）

### 安装 CloudBase CLI

```bash
npm install -g @cloudbase/cli
```

### 登录

```bash
tcb login
```

浏览器会打开授权页面，确认登录。

### 部署

```bash
cd 减脂打卡

# 修改 cloudbaserc.json 中的 envId 为你的环境 ID
# 然后一键部署
tcb framework deploy
```

---

## 费用说明

| 项目 | 免费额度 | 超出后 |
|------|---------|--------|
| 云托管请求 | 50 万次/月 | ¥0.04/万次 |
| 云托管流量 | 1 GB/月 | ¥0.08/GB |
| 云托管算力 | 10 万 GB·秒/月 | ¥0.00005/GB·秒 |

> 💡 个人使用基本不会超出免费额度。最小实例设为 0，没人访问时不产生算力费用。

---

## 常见问题

### Q: 构建失败怎么办？

检查 **部署日志**，常见原因：
- `npm ci` 失败 → 检查 `package-lock.json` 是否已提交（Dockerfile 已加 `npm install` 降级容错）
- `tsc -b` 报错 → TypeScript 类型错误，本地 `npm run build` 排查

### Q: 访问报 503？

503 = 服务暂不可用，通常是**实例未启动或健康检查失败**：

1. **查看部署日志**：CloudBase 控制台 → 云托管 → 服务 → 部署日志
   - 如果构建阶段就失败 → 修复构建错误后重新部署
   - 如果构建成功但实例起不来 → 检查 server.js 是否有运行时错误
2. **手动重启实例**：服务详情 → 服务设置 → 重启
3. **健康检查超时**：Dockerfile 中 `start-period=40s`，若实例启动慢可适当调大
4. **缩容到 0 后冷启动**：`minNum=0` 时无人访问会销毁实例，首次访问需等待冷启动（约 10-30s），刷新重试即可

### Q: 访问报 502？

- 确认监听端口是 `80`（Dockerfile 中 `ENV PORT=80`）
- 确认访问服务的路径和端口配置正确

### Q: 数据没同步到云端 / 换设备看不到历史数据？

1. 确认已完成 **第 6 步：开启数据库**（创建 6 个集合 + 开启匿名登录）
2. 打开浏览器控制台（F12），查看是否有 `[CloudBase] 初始化成功` 日志
   - 若显示 `初始化失败，降级为本地模式` → 检查匿名登录是否已开启
3. 确认集合权限设为 **「仅创建者可读写」**
4. 首次使用会自动迁移本地数据到云端，控制台会打印 `迁移本地数据到云端` 日志

### Q: AI 功能不工作？

- 确认 API 地址是 `https://dashscope.aliyuncs.com/compatible-mode`（阿里云百炼）
- 确认 API Key 有效（[百炼控制台](https://bailian.console.aliyun.com/) → API-KEY 管理）
- 确认模型名 `qwen-vl-max` 拼写正确

### Q: 想用自定义域名？

1. CloudBase 控制台 → **访问服务** → **自定义域名**
2. 添加你的域名，按提示添加 CNAME 解析
3. 自动签发 HTTPS 证书

---

## 后台管理（查看所有用户数据）

部署后，访问 `https://你的域名/#admin` 即可进入后台管理页面。

### 功能

- **📊 概览**：各集合记录数、独立用户数
- **👥 用户列表**：所有用户的资料 + 各类记录数，可点击查看详情
- **📋 数据查询**：按集合 + UID 筛选，查看原始 JSON 数据

### 登录密钥

后台管理需要输入管理密钥（`ADMIN_TOKEN`），默认值已配置在 [`cloudbaserc.json`](cloudbaserc.json) 中：
```
nuo-admin-2024
```

> ⚠️ **安全建议**：部署后请到 CloudBase 控制台 → 云托管 → 服务设置 → 环境变量，把 `ADMIN_TOKEN` 改成你自己的强密码。

### 工作原理

- 前端 `#admin` 路由 → [`AdminPage.tsx`](src/pages/AdminPage.tsx)
- 通过 [`adminApi.ts`](src/services/adminApi.ts) 调用 server.js 的 `/api/admin/*` 接口
- server.js 用 `@cloudbase/node-sdk`（管理员权限）读取所有用户数据
- 请求头 `x-admin-token` 鉴权

---

## 文件说明

| 文件 | 作用 |
|------|------|
| [`Dockerfile`](Dockerfile) | 多阶段构建：编译前端 + Node 运行时 |
| [`.dockerignore`](.dockerignore) | 排除 node_modules 等无关文件 |
| [`cloudbaserc.json`](cloudbaserc.json) | CloudBase 框架配置（CLI 部署用，envId 已填） |
| [`server.js`](server.js) | Node 服务器：静态托管 + AI 代理 |
| [`src/services/cloudbase.ts`](src/services/cloudbase.ts) | CloudBase SDK 初始化 + 匿名登录 |
| [`src/services/cloudDB.ts`](src/services/cloudDB.ts) | 云端数据访问层（增删查） |
| [`src/hooks/useCloudData.ts`](src/hooks/useCloudData.ts) | 云端优先 + 本地降级 + 自动迁移 Hook |
| [`src/services/adminApi.ts`](src/services/adminApi.ts) | 后台管理 API 客户端 |
| [`src/pages/AdminPage.tsx`](src/pages/AdminPage.tsx) | 后台管理页面（`#admin` 访问） |
| [`server.js`](server.js) | Node 服务器：静态托管 + AI 代理 + 后台管理 API |
