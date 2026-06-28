import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { env } from '../assets/var';

// Configuration Firebase pour le web
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID
};

// Initialiser Firebase
let firebaseApp: any = null;
let messaging: Messaging | null = null;

/**
 * Initialiser Firebase et Messaging
 */
export function initializeFirebase() {
  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);
  }
  return { firebaseApp, messaging };
}

/**
 * Obtenir l'instance Messaging
 */
export function getFirebaseMessaging() {
  if (!messaging) {
    initializeFirebase();
  }
  return messaging;
}

/**
 * Vérifier si Firebase est configuré
 */
export function isFirebaseConfigured(): boolean {
  return !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID && env.VITE_FIREBASE_MESSAGING_SENDER_ID);
}

/**
 * Obtenir le VAPID Key
 */
export function getVapidKey(): string {
  return env.VITE_FIREBASE_VAPID_KEY || '';
}

export { getToken, onMessage };
