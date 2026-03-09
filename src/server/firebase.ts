/**
 * Firebase app and Firestore initialization.
 * Uses NEXT_PUBLIC_* env vars (safe for client; available at runtime on server in Vercel).
 * When env is set, works in both browser and API routes so notes API can use Firestore on Vercel.
 */
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let app: ReturnType<typeof initializeApp> | null = null;
let firestore: ReturnType<typeof getFirestore> | null = null;

function getApp() {
  if (app) return app;
  const hasConfig =
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.storageBucket &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId;
  if (!hasConfig) return null;
  app = initializeApp(firebaseConfig);
  return app;
}

/**
 * Returns Firestore instance when Firebase env vars are set.
 * Works in both browser (client components, real-time sync) and server (API routes on Vercel).
 */
export function getFirestoreInstance(): ReturnType<typeof getFirestore> | null {
  const firebaseApp = getApp();
  if (!firebaseApp) return null;
  if (!firestore) firestore = getFirestore(firebaseApp);
  return firestore;
}
