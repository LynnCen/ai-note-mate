This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

After cloning the repo:

1. Copy the example env file and fill in your values:
   ```bash
   cp .env.local.example .env.local
   ```
2. Edit `.env.local`:
   - **LLM (required for AI features):** Set `LLM_PROVIDER` to `openai`, `deepseek`, `gml`, or `groq`, and set the matching API key:
     - `OPENAI_API_KEY` (OpenAI)
     - `DEEPSEEK_API_KEY` (DeepSeek)
     - `GML_API_KEY` (GML / 智谱 GLM)
     - `GROQ_API_KEY` (Groq)
   - **Firebase (optional):** For Firestore notes sync, add your Firebase web app config from [Firebase Console](https://console.firebase.google.com/) → Project settings → Your apps:
     - `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

   If no API key is configured, AI actions return a friendly error (503); the app does not crash.

3. Install dependencies and run the dev server:
   ```bash
   npm i && npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) in your browser.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## 可访问链接 / Demo

将应用部署到 Vercel 即可获得公网链接：连接本仓库并配置环境变量后部署。详细步骤见 [docs/DEPLOY.md](docs/DEPLOY.md)。

环境变量与本地一致：`LLM_PROVIDER`、对应 API Key（如 `OPENAI_API_KEY`、`GML_API_KEY` 等），以及可选的 `NEXT_PUBLIC_FIREBASE_*`（配置后笔记使用 Firestore 持久化）。
