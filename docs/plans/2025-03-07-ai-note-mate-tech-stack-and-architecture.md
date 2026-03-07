# AI 笔记应用 — 推荐技术栈与整体架构

> 面向「全部实现」（必做 + 所有加分项）的单一推荐方案，便于审查与后续实现。

---

## 1. 推荐技术栈总览

| 层级 | 选型 | 说明 |
|------|------|------|
| **前端框架** | React 18 + TypeScript | 满足「现代框架 + TS」，生态成熟。 |
| **构建/路由** | Next.js（App Router） | 内置构建与路由，列表 / 详情双视图。 |
| **样式** | Tailwind | 满足「CSS 作用域化」；实用类 + 响应式，与 Next 集成简单。 |
| **状态管理** | Zustand | 轻量、TS 友好，满足「企业级状态库」并为分类/标签预留扩展。 |
| **持久化（必做）** | 浏览器端：localStorage；服务端：见下 | 满足必做持久化；加分项用 Next API + Firestore。 |
| **后端（加分）** | Next.js API Routes + SQLite（better-sqlite3） | 单仓前后端；SQLite 本地即可。 |
| **实时协作（加分）** | Firebase Firestore | 实时同步与冲突由 SDK 处理。 |
| **LLM** | 可配置、可切换（不绑定单一厂商） | 环境变量选择 provider + API Key；后端代理流式请求，支持 OpenAI / DeepSeek / Groq 等。 |
| **测试（加分）** | Vitest + React Testing Library | 单元/组件测试，mock 流式 API 与悬浮框。 |
| **部署（加分）** | Vercel | 前端 + Next API 一键部署；环境变量配置 API Key 与 LLM 提供商。 |

**审查结论（已锁定）**：Next.js 全栈 + Firebase Firestore + Tailwind + LLM 可配置（不指定单一厂商）。

---

## 2. 整体架构推荐

### 2.1 方案 A：Next.js 全栈（推荐）

- **前端**：Next.js App Router 或 Pages Router 的 React 页面，Zustand 管理笔记列表与当前笔记。
- **后端**：Next.js API Routes 提供笔记 CRUD 与 AI 代理（转发流式请求，注入 API Key）。
- **数据**：SQLite（better-sqlite3）存笔记；可选：Firebase Firestore 作实时层，Next 与 Firestore 双写或仅用其一。
- **流程**：浏览器 ↔ Next API ↔ SQLite / Firestore；AI 请求：浏览器 → Next API → LLM API（流式）→ 浏览器。

**优点**：单仓、部署简单（Vercel）、面试官 clone 后 `npm i && npm run dev` 即可。  
**缺点**：前后端耦合在同一仓库，若后续拆离需小改。

### 2.2 方案 B：Vite SPA + 独立后端

- **前端**：Vite + React + Zustand，纯 SPA，调用后端 REST。
- **后端**：Node + Express（或 Fastify）+ SQLite，提供 REST 与 AI 代理。
- **数据**：同方案 A；实时仍推荐 Firebase Firestore。

**优点**：前后端完全解耦，可分别部署。  
**缺点**：需维护两个工程或两个启动命令，部署与 README 稍复杂。

---

## 3. 推荐结论：方案 A（Next.js 全栈）

- **技术栈**：Next.js（React）+ TypeScript + Tailwind + Zustand + SQLite + Firebase Firestore + 可配置 LLM（环境变量 provider + Key）+ Vitest + RTL + Vercel 部署。
- **架构要点**：
  - 笔记列表/详情由 Zustand 驱动，服务端数据通过 API 拉取/同步，本地可再用 localStorage 做离线或缓存（可选）。
  - 实时协作：Firestore 存笔记文档，Next API 与 Firestore 双写，或仅用 Firestore 作为「服务端」满足加分项。
  - AI：详情页「AI 处理」→ 请求 Next API → API 用服务端环境变量调 LLM 流式接口 → 响应以 SSE 回前端，前端流式渲染到悬浮框，接受/丢弃只改 Zustand 与持久层。
  - 万行不卡顿：悬浮框内流式区域使用虚拟化或分片渲染（如 react-window）+ 增量 append 与 requestAnimationFrame 节流（详见后续实现计划）。

---

## 4. 目录结构建议（方案 A）

```
ai-note-mate/
├── app/                    # Next.js App Router（或 pages/）
│   ├── page.tsx            # 列表页
│   ├── note/[id]/page.tsx  # 详情页
│   ├── api/
│   │   ├── notes/          # CRUD
│   │   └── ai/stream/      # AI 流式代理
│   └── layout.tsx
├── components/             # 通用组件（含悬浮框、流式展示）
├── stores/                 # Zustand stores
├── lib/                    # 数据库、Firestore、LLM 客户端等
├── styles/                 # 全局与 Tailwind
└── __tests__/              # Vitest + RTL 测试
```

---

## 5. 审查结论（已确认）

1. **Next.js 全栈** — 采用方案 A。
2. **实时协作** — 采用 Firebase Firestore。
3. **样式** — 采用 Tailwind。
4. **LLM** — 不指定单一厂商；实现可配置（环境变量选择 provider + API Key），支持切换多种 LLM API。

实现计划见：`docs/plans/2025-03-07-ai-note-mate-implementation-plan.md`。
