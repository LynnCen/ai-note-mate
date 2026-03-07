/**
 * Firebase app and Firestore initialization for client-side use.
 * Uses NEXT_PUBLIC_* env vars only (safe for browser). Required for real-time
 * subscriptions (onSnapshot). Do not put secret keys in client config.
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
  if (typeof window === "undefined") return null;
  if (!app) {
    const hasConfig =
      firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId;
    if (!hasConfig) return null;
    app = initializeApp(firebaseConfig);
  }
  return app;
}

/**
 * Returns Firestore instance for client-side use. Returns null when run on
 * server or when Firebase env vars are missing.
 */
export function getFirestoreInstance(): ReturnType<typeof getFirestore> | null {
  if (typeof window === "undefined") return null;
  const firebaseApp = getApp();
  if (!firebaseApp) return null;
  if (!firestore) firestore = getFirestore(firebaseApp);
  return firestore;
}
