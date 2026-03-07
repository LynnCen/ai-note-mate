This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Setup

After cloning the repo:

1. Copy the example env file and fill in your values:
   ```bash
   cp .env.local.example .env.local
   ```
2. Edit `.env.local`:
   - **LLM (required for AI features):** Set `LLM_PROVIDER` to `openai`, `deepseek`, or `groq`, and set the matching API key:
     - `OPENAI_API_KEY` (OpenAI)
     - `DEEPSEEK_API_KEY` (DeepSeek)
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

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
