# 无自有服务器、在线部署可访问 — 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将本项目部署到公网可访问的地址，不依赖个人服务器；推荐使用 Vercel + Firebase（Firestore 作为线上数据源），本地仍可用 SQLite。

**Architecture:** 当前 API 仅使用 SQLite（`lib/notes-db.ts`），Vercel 无持久化盘，无法可靠使用 SQLite。方案：当配置了 Firebase 时，API 使用 Firestore 读写；未配置时（本地）继续使用 SQLite。这样部署到 Vercel 时只需在项目里配置 Firebase 环境变量即可持久化笔记。AI 流式接口与现有一致，仅需在 Vercel 配置 LLM 相关环境变量。

**Tech Stack:** Next.js 16, Vercel（部署）, Firebase Firestore（可选、线上推荐）, 现有 `better-sqlite3`（仅本地）.

---

## 前置条件

- 已有 GitHub 仓库并已 push 本仓库。
- （推荐）已有一个 Firebase 项目，并在 Firebase Console 中创建好 Web 应用，拿到配置（API Key、Project ID 等）。
- （推荐）已有 LLM API Key（OpenAI / DeepSeek / GML / Groq 等其一），用于 AI 功能。

---

## Task 1: 为 Firestore 增加服务端 getAll / getById

**目的:** API 需要「列表」与「单条」查询，当前 `lib/notes-firestore.ts` 仅有 `createNote`、`updateNote`、`deleteNote` 和客户端用的 `subscribeNotes`，需增加服务端可用的 `getAll`、`getById`。

**Files:**
- Modify: `lib/notes-firestore.ts`

**Step 1: 添加 getDocs / getDoc 引用**

在文件顶部 import 中增加 `getDocs`、`getDoc`：

```ts
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from "firebase/firestore";
```

**Step 2: 实现 getAll**

在 `subscribeNotes` 之后添加（保持 `docToNote` 复用）：

```ts
/**
 * Fetch all notes, newest first. For server-side use (e.g. API routes).
 */
export function getAll(): Promise<Note[]> {
  const db = getFirestoreInstance();
  if (!db) return Promise.resolve([]);
  const col = collection(db, COLLECTION_ID);
  return getDocs(col).then((snapshot) =>
    snapshot.docs
      .map((d) => docToNote(d.id, d.data()))
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
  );
}
```

**Step 3: 实现 getById**

```ts
/**
 * Fetch a single note by id. For server-side use (e.g. API routes).
 */
export function getById(id: string): Promise<Note | null> {
  const db = getFirestoreInstance();
  if (!db) return Promise.resolve(null);
  const ref = doc(db, COLLECTION_ID, id);
  return getDoc(ref).then((snap) =>
    snap.exists() ? docToNote(snap.id, snap.data()) : null
  );
}
```

**Step 4: 统一 create 接口名（供后端抽象用）**

Firestore 当前导出的是 `createNote`，而 `notes-db` 导出 `create`。为减少适配层分支，在 `lib/notes-firestore.ts` 增加别名即可（或在 Task 2 的适配层里映射）。此处选择在 Task 2 的适配层做映射，本 Task 不修改导出名。

**Step 5: 运行测试**

- 若有调用 `lib/notes-firestore` 的测试，执行：`npm run test:run`
- 预期：通过（或与 Firestore 无关的测试通过）

**Step 6: 提交**

```bash
git add lib/notes-firestore.ts
git commit -m "feat(data): add getAll and getById to notes-firestore for API use"
```

---

## Task 2: 抽象「笔记后端」并在 API 中按环境选择

**目的:** 当存在 Firebase 配置时，API 使用 Firestore；否则使用 SQLite，以便 Vercel 上仅用环境变量即可切到 Firestore，无需改代码。

**Files:**
- Create: `lib/notes-backend.ts`
- Modify: `app/api/notes/route.ts`
- Modify: `app/api/notes/[id]/route.ts`

**Step 1: 新增 lib/notes-backend.ts**

该模块根据是否配置了 Firestore 返回不同实现，避免在「仅用 Firestore」的部署里加载 `better-sqlite3`（Vercel 上可能不可用或不需要）。

```ts
import { getFirestoreInstance } from "./firebase";
import * as notesDb from "./notes-db";
import * as notesFirestore from "./notes-firestore";
import type { Note } from "@/types/note";

export type NotesBackend = {
  getAll: () => Promise<Note[]>;
  getById: (id: string) => Promise<Note | null>;
  create: (note: {
    title?: string;
    content?: string;
  }) => Promise<Note>;
  update: (
    id: string,
    updates: { title?: string; content?: string }
  ) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
};

function firestoreBackend(): NotesBackend {
  return {
    getAll: notesFirestore.getAll,
    getById: notesFirestore.getById,
    create: (note) =>
      notesFirestore.createNote(note).then((n) => n),
    update: async (id, updates) => {
      const existing = await notesFirestore.getById(id);
      if (!existing) return null;
      await notesFirestore.updateNote(id, updates);
      return notesFirestore.getById(id);
    },
    deleteNote: (id) =>
      notesFirestore.deleteNote(id).then(() => true),
  };
}

function sqliteBackend(): NotesBackend {
  return {
    getAll: notesDb.getAll,
    getById: notesDb.getById,
    create: notesDb.create,
    update: notesDb.update,
    deleteNote: notesDb.deleteNote,
  };
}

let _backend: NotesBackend | null = null;

/**
 * Returns the notes backend: Firestore if configured, otherwise SQLite.
 * Use in API routes only (server-side).
 */
export function getNotesBackend(): NotesBackend {
  if (_backend) return _backend;
  _backend = getFirestoreInstance() ? firestoreBackend() : sqliteBackend();
  return _backend;
}
```

**Step 2: 修改 app/api/notes/route.ts**

- 将 `import * as notesDb from "@/lib/notes-db"` 改为 `import { getNotesBackend } from "@/lib/notes-backend"`。
- 在 `GET` 中：`const notes = await getNotesBackend().getAll();`
- 在 `POST` 中：`const note = await getNotesBackend().create({ title, content });`

**Step 3: 修改 app/api/notes/[id]/route.ts**

- 将 `import * as notesDb from "@/lib/notes-db"` 改为 `import { getNotesBackend } from "@/lib/notes-backend"`。
- `GET`：`const note = await getNotesBackend().getById(id);`
- `PUT`：`const note = await getNotesBackend().update(id, updates);`
- `DELETE`：`const deleted = await getNotesBackend().deleteNote(id);`

**Step 4: 本地验证**

- 无 Firebase 配置时：`npm run dev`，创建/编辑/删除笔记，列表与详情正常（仍走 SQLite）。
- 有 Firebase 配置时：同上，确认走 Firestore（可在 Firebase Console 看数据）。

**Step 5: 提交**

```bash
git add lib/notes-backend.ts app/api/notes/route.ts app/api/notes/\[id\]/route.ts
git commit -m "feat(api): use Firestore when configured, else SQLite for notes API"
```

---

## Task 3: Vercel 构建与运行时兼容（可选但推荐）

**目的:** 确保在 Vercel 上不加载 SQLite 时不会因 `better-sqlite3` 导致构建或运行时错误。当前设计下，若已配置 Firebase，`getNotesBackend()` 返回 Firestore，不会调用 `notes-db`；但 `notes-backend.ts` 顶层 `import * as notesDb from "./notes-db"` 会加载 `db.ts` 和 `better-sqlite3`。若 Vercel 支持该原生模块则无需改；若不支持，可改为动态 import 仅在使用 SQLite 分支时加载。

**Files:**
- Modify: `lib/notes-backend.ts`（仅在需要时）

**Step 1: 确认 Vercel 行为**

- 先部署一次（Task 4 完成后），在 Vercel 项目设置中配置好 Firebase 与 LLM 环境变量。
- 若部署成功且列表/详情/AI 均正常，可跳过本 Task。
- 若出现 `better-sqlite3` 相关报错，再执行 Step 2。

**Step 2: 改为按需加载 SQLite（仅在报错时做）**

将 `lib/notes-backend.ts` 中：

- 删除顶层 `import * as notesDb from "./notes-db"`。
- 在 `sqliteBackend()` 内改为：`const notesDb = await import("./notes-db");` 并令 `sqliteBackend` 变为 `async`；或保持同步，在 `getNotesBackend()` 里：若选 SQLite 则 `require("./notes-db")`（仅 Node 环境）。具体以你项目 ESM 与 Vercel 运行环境为准；若 Vercel 已能构建通过可暂不实现本步。

**Step 3: 提交（仅当做了修改时）**

```bash
git add lib/notes-backend.ts
git commit -m "fix(vercel): avoid loading better-sqlite3 when using Firestore"
```

---

## Task 4: 部署文档与 Vercel 步骤

**目的:** 任何人按文档即可在无自有服务器的情况下，把应用部署到公网并访问。

**Files:**
- Create or Modify: `docs/DEPLOY.md`（或合并进 `README.md` 的「部署」小节）

**Step 1: 编写 docs/DEPLOY.md**

内容建议包含（按步骤、可复制执行）：

```markdown
# 在线部署（无自有服务器）

本应用可部署到 [Vercel](https://vercel.com)，获得公网可访问的 URL，无需自备服务器。

## 前提

- 代码已推送到 GitHub（或 GitLab/Bitbucket，Vercel 支持）。
- （推荐）已创建 [Firebase 项目](https://console.firebase.google.com/) 并添加 Web 应用，用于笔记持久化。
- （推荐）已准备 LLM API Key（如 OpenAI / DeepSeek / 智谱 GML / Groq 等），用于 AI 功能。

## 步骤

### 1. 连接仓库

1. 打开 [Vercel](https://vercel.com)，使用 GitHub 登录。
2. 点击 "Add New" → "Project"，选择本仓库（如 `your-username/ai-note-mate`）。
3. Framework Preset 选择 "Next.js"，Root Directory 保持默认，Build Command 默认 `next build`，Output Directory 默认，无需改。

### 2. 配置环境变量

在 "Environment Variables" 中添加（生产/预览可都勾选）：

**笔记持久化（二选一，推荐 Firestore）：**

- 若使用 **Firestore**（推荐，无需自建数据库）：
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
- 若配置了 Firestore，数据会持久化；未配置时 Vercel 无持久化盘，笔记可能无法持久保存（依赖 Firestore 作为线上数据源）。

## 可选：自定义域名

在 Vercel 项目 → Settings → Domains 中添加你的域名，按提示配置 DNS 即可。
```

**Step 2: 在 README 中增加部署入口**

在 `README.md` 的「可访问链接 / Demo」或文末增加一行：

```markdown
详细部署步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。
```

**Step 3: 提交**

```bash
git add docs/DEPLOY.md README.md
git commit -m "docs: add online deploy guide (Vercel, no server)"
```

---

## Task 5: 本地与线上环境变量说明（可选）

**目的:** 明确哪些变量在「仅本地」「仅 Vercel」「两者都要」使用，避免遗漏。

**Files:**
- Modify: `.env.local.example`（若存在）或 `docs/DEPLOY.md`

**Step 1: 在 .env.local.example 或 DEPLOY.md 中列出清单**

示例表格（可放在 DEPLOY.md 末尾）：

| 变量名 | 本地 | Vercel | 说明 |
|--------|------|--------|------|
| NEXT_PUBLIC_FIREBASE_* | 可选 | 推荐 | 配置后 API 使用 Firestore，笔记持久化 |
| LLM_PROVIDER | 可选 | 推荐 | openai / deepseek / gml / groq |
| OPENAI_API_KEY 等 | 可选 | 推荐 | 与 LLM_PROVIDER 对应 |

**Step 2: 提交**

```bash
git add .env.local.example docs/DEPLOY.md
git commit -m "docs: env vars summary for local vs Vercel"
```

---

## 执行顺序与验收

- 顺序：Task 1 → Task 2 → Task 4 → 部署到 Vercel 并验证；若遇 better-sqlite3 问题再执行 Task 3；Task 5 随时可做。
- 验收：在 Vercel 生产 URL 上能打开应用、创建/编辑/删除笔记（Firestore 配置时数据持久）、AI 流式与选中浮层正常。

---

## 执行方式

计划已保存到 `docs/plans/2025-03-07-online-deploy-no-server.md`。

**两种执行方式：**

1. **Subagent-Driven（本会话）** — 按任务逐个执行并做代码审查，迭代快。  
2. **Parallel Session（新会话）** — 在新会话中打开本仓库/worktree，使用 executing-plans 按检查点批量执行。

若选 1，请在本会话回复「Subagent-Driven」；若选 2，请在新会话中说明「按 2025-03-07-online-deploy-no-server 计划执行」。
