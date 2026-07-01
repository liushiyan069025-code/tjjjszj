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

### 第 6 步：配置 AI

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
- `npm ci` 失败 → 检查 `package-lock.json` 是否已提交
- `tsc -b` 报错 → TypeScript 类型错误，本地 `npm run build` 排查

### Q: 访问报 502？

- 确认监听端口是 `80`（Dockerfile 中 `ENV PORT=80`）
- 确认访问服务的路径和端口配置正确

### Q: AI 功能不工作？

- 确认 API 地址是 `https://dashscope.aliyuncs.com/compatible-mode`（阿里云百炼）
- 确认 API Key 有效（[百炼控制台](https://bailian.console.aliyun.com/) → API-KEY 管理）
- 确认模型名 `qwen-vl-max` 拼写正确

### Q: 想用自定义域名？

1. CloudBase 控制台 → **访问服务** → **自定义域名**
2. 添加你的域名，按提示添加 CNAME 解析
3. 自动签发 HTTPS 证书

---

## 文件说明

| 文件 | 作用 |
|------|------|
| [`Dockerfile`](Dockerfile) | 多阶段构建：编译前端 + Node 运行时 |
| [`.dockerignore`](.dockerignore) | 排除 node_modules 等无关文件 |
| [`cloudbaserc.json`](cloudbaserc.json) | CloudBase 框架配置（CLI 部署用） |
| [`server.js`](server.js) | Node 服务器：静态托管 + AI 代理 |
