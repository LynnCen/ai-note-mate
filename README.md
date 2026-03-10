# AI Note Mate

AI Note Mate is an AI-powered note-taking web app built with Next.js.  
It helps you capture, organize, and refine notes with an inline AI assistant that understands your context, supports multiple LLM providers, and can work with local storage or Firestore sync.

---

## Features

- **AI note companion**
  - Chat with an agent about the current note
  - Ask for summaries, outlines, rewriting, or idea expansion
  - Uses a streaming API for responsive, incremental answers

- **Flexible storage**
  - **Local SQLite** (via `better-sqlite3`) for self-contained deployments
  - **Optional Firebase Firestore** sync for cloud persistence and multi-device usage

- **Multi-provider LLM support**
  - Switch between `openai`, `deepseek`, `gml` (Zhipu GLM), or `groq` via a single env variable
  - API keys are never exposed to the browser; all calls go through a server-side adapter

- **Modern UI & DX**
  - Next.js App Router
  - Tailwind CSS with shadcn/ui components
  - React 19, Zustand for state management
  - Streaming UI tuned for long-running outputs

- **Testing & tooling**
  - Vitest + Testing Library for unit / component tests
  - ESLint + Prettier + Tailwind Prettier plugin
  - Husky + lint-staged on pre-commit
  - Ready to deploy to Vercel

---

## Live Demo & Deployment

The app is designed to be deployed on **Vercel**.

- Connect this repository to Vercel
- Configure the same environment variables as your local setup (see **Configuration** below)
- Deploy

For more detailed deployment notes, see `docs/DEPLOY.md` (if present in your clone).

---

## Getting Started

### Prerequisites

- **Node.js**: 20.x (recommended; some dependencies require 20.19+)
- **npm**: included with Node 20

### 1. Clone the repository

```bash
git clone https://github.com/<your-org>/ai-note-mate.git
cd ai-note-mate
```

### 2. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Then edit `.env.local` and set:

#### LLM provider (required for AI features)

Choose one provider and set the corresponding key:

```bash
# One of: openai | deepseek | gml | groq
LLM_PROVIDER=openai

# Match the provider:
OPENAI_API_KEY=...
DEEPSEEK_API_KEY=...
GML_API_KEY=...
GROQ_API_KEY=...
```

If no valid provider/key is configured, AI features will respond with a friendly error (503) instead of crashing the app.

#### Firebase (optional, for Firestore sync)

If you want cloud sync for notes, add your Firebase web app config from  
Firebase Console → Project settings → Your apps:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

If you skip these, the app can still work with local storage only (depending on the configured data backend).

### 3. Install dependencies

```bash
npm install
```

### 4. Run the development server

```bash
npm run dev
```

Then open `http://localhost:3000` in your browser.

The app will hot reload when you edit files (e.g. `app/page.tsx`).

---

## Configuration

### LLM configuration

The LLM adapter is selected via `LLM_PROVIDER`:

- `openai` → uses `OPENAI_API_KEY`
- `deepseek` → uses `DEEPSEEK_API_KEY`
- `gml` → uses `GML_API_KEY` (Zhipu GLM)
- `groq` → uses `GROQ_API_KEY`

Internally, the backend code (see `src/server/llm/`) routes requests to the correct provider and exposes a unified streaming interface to the rest of the app.

### Data storage

Depending on your environment and configuration, the app can use:

- **SQLite (better-sqlite3)** as a local database on the server
- **Firestore** as a cloud database when Firebase is configured

You can adjust or extend the data-layer behavior in the `src`/`lib`/server utilities (for example, adding a new backend or toggling between SQLite and Firestore as the primary source).

### Tooling & formatting

The project includes:

- **ESLint** (flat config in `eslint.config.mjs`)
  - Based on `eslint-config-next` (core web vitals + TypeScript)
- **Prettier** with `prettier-plugin-tailwindcss`
  - Config: `.prettierrc`
- **Husky + lint-staged**
  - On `git commit`, staged files are checked and auto-fixed when possible:
    - JS/TS/JSX/TSX: `eslint --fix` + `prettier --write`
    - JSON/CSS/SCSS/MD/MDX: `prettier --write`

Relevant `package.json` scripts:

- `npm run lint` – run ESLint on the whole repo
- `npm run lint:fix` – ESLint with `--fix`
- `npm run format` – Prettier check
- `npm run format:fix` – Prettier write
- `npm run test` – run Vitest in watch mode
- `npm run test:run` – run Vitest once
- `npm run dev` – start the Next.js dev server

If you use VS Code or Cursor, the repo also includes `.vscode/settings.json` to:

- Enable format-on-save
- Use Prettier as the default formatter
- Optionally run ESLint code actions on save

---

## Usage Guide

> The exact UI may evolve, but this is the intended usage flow.

### Notes

- **Create a note** from the main page (notes list).
- **Open a note** to see the note editor.
- **Edit content** in the main editor area; changes are saved via the configured backend (SQLite and/or Firestore).

### AI assistant

In a note detail page:

- Select a piece of text or work on the entire note.
- Trigger the AI assistant (e.g. via an inline action/button).
- Ask the agent to:
  - Summarize or rewrite
  - Generate an outline or action list
  - Brainstorm ideas or follow-up questions

The backend uses a streaming API, so responses appear incrementally rather than blocking the UI.

### Document import (if enabled)

If you have document import wired up (e.g. via the document agent and tools in `src/agents/document-agent/`):

- Upload a PDF / DOCX
- Let the app extract and structure the content
- Use the AI assistant to summarize or refine imported sections

Check the relevant components and API routes in `src/agents/` and `src/server/` for the current implementation details.

---

## Architecture Overview

High-level architecture:

- **Frontend**
  - Next.js App Router (`app/` directory)
  - React 19 + TypeScript
  - Tailwind CSS with shadcn/ui components
  - Zustand for client-side state where appropriate
  - Dedicated UI for AI chat and note interaction

- **Backend**
  - Next.js Route Handlers under `app/api/*` (e.g. AI streaming, note operations)
  - LLM adapter in `src/server/llm/` selecting the provider based on env
  - Streaming response handling to push incremental tokens to the client

- **Persistence**
  - SQLite via `better-sqlite3` for local/server-side storage
  - Optional Firestore integration for cloud sync

- **Agents**
  - Agent logic and prompts under `src/agents/` (e.g. conversation agent, document agent, tool registry)
  - Tools that let the agent perform actions (like reading documents or notes)

This architecture is intentionally modular so you can:

- Swap in additional LLM providers
- Change persistence (e.g. use only Firestore or only SQLite)
- Extend the agent capabilities by adding new tools

---

## Testing

The project uses **Vitest** and **@testing-library/react**:

- Run tests in watch mode:

  ```bash
  npm test
  ```

- Run tests once (CI-style):

  ```bash
  npm run test:run
  ```

There are example tests under `__tests__/`, including LLM/tool-calling behavior and UI tests.  
You can add more tests following the same patterns.

---

## Roadmap / Status

This project is under active development. Planned / ongoing areas include:

- Polishing the AI conversation UX for very long notes
- Expanding document import and analysis tools
- Improving collaboration and sync options
- Hardening test coverage for agents and streaming behavior

Check the issues and pull requests on GitHub for the latest status.

---

## License

This project is released under the **MIT License** (or your chosen license).  
See `LICENSE` for details.
