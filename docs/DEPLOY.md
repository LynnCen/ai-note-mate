# 在线部署（无自有服务器）

本应用可部署到 [Vercel](https://vercel.com)，获得公网可访问的 URL，无需自备服务器。

## 前提

- 代码已推送到 GitHub（或 GitLab/Bitbucket，Vercel 支持）。
- **推荐**：已创建 [Firebase 项目](https://console.firebase.google.com/) 并添加 Web 应用，用于笔记持久化。未配置时，Vercel 无持久化盘，笔记无法可靠保存。
- **推荐**：已准备 LLM API Key（如 OpenAI / DeepSeek / 智谱 GML / Groq 等），用于 AI 功能。

## 步骤

### 1. 连接仓库

1. 打开 [Vercel](https://vercel.com)，使用 GitHub 登录。
2. 点击 "Add New" → "Project"，选择本仓库（如 `your-username/ai-note-mate`）。
3. Framework Preset 选择 "Next.js"，Root Directory 保持默认，Build Command 默认 `next build`，Output Directory 默认，无需改。

### 2. 配置环境变量

在 "Environment Variables" 中添加（生产/预览可都勾选）：

**笔记持久化（推荐 Firestore）：**

配置 Firestore 后，API 会使用 Firestore 读写笔记，数据持久化。未配置时线上无可靠存储。

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

值从 Firebase Console → 项目设置 → 你的应用 中复制。

**AI 功能（必填其一，否则 AI 接口返回 503）：**

- `LLM_PROVIDER`：`openai` | `deepseek` | `gml` | `groq` 其一。
- 对应 Key（与本地 .env.local 一致）：
  - OpenAI: `OPENAI_API_KEY`
  - DeepSeek: `DEEPSEEK_API_KEY`
  - 智谱 GML: `GML_API_KEY`
  - Groq: `GROQ_API_KEY`

### 3. 部署

点击 "Deploy"。等待构建结束，Vercel 会给出生产 URL，例如 `https://ai-note-mate-xxx.vercel.app`。

### 4. 验证

- 打开该 URL，应能看到笔记列表页。
- 新建笔记、编辑、删除、切换「编辑/预览」、选中文字使用 AI 浮层，均应正常。
- 若配置了 Firestore，数据会持久化；未配置时 Vercel 无持久化盘，笔记可能无法持久保存。

## 可选：自定义域名

在 Vercel 项目 → Settings → Domains 中添加你的域名，按提示配置 DNS 即可。

## 环境变量速查

| 变量名 | 本地 | Vercel | 说明 |
|--------|------|--------|------|
| `NEXT_PUBLIC_FIREBASE_*` | 可选 | 推荐 | 配置后 API 使用 Firestore，笔记持久化 |
| `LLM_PROVIDER` | 可选 | 推荐 | `openai` / `deepseek` / `gml` / `groq` |
| `OPENAI_API_KEY` 等 | 可选 | 推荐 | 与 `LLM_PROVIDER` 对应的 Key |
