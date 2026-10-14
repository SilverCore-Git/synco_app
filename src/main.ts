if (typeof (Promise as any).withResolvers !== 'function') {
  (Promise as any).withResolvers = function <T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

import { createApp } from 'vue'
import './style.css'
import 'drag-drop-touch';
import App from './App.vue'
import router from './router';
import StarportPlugin from 'vue-starport'
import FloatingVue from 'floating-vue'

import 'bootstrap-icons/font/bootstrap-icons.css';
import 'floating-vue/dist/style.css'
import { isFirebaseConfigured } from './config/firebase';

// Le SW est enregistré uniquement si Firebase est réellement configuré : le
// fichier statique public/firebase-messaging-sw.js ne peut pas lire
// import.meta.env (il n'est pas passé par Vite), donc sa config lui est
// transmise en query string au lieu d'un hack importScripts cassé qui
// laissait auparavant le SW toujours actif mais toujours non fonctionnel
// pour tout le monde (audit FX10).
if ('serviceWorker' in navigator && isFirebaseConfigured()) {
  const swConfig = new URLSearchParams({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '',
  });
  navigator.serviceWorker.register(`/firebase-messaging-sw.js?${swConfig.toString()}`);
}

const app = createApp(App);

// Un message malformé (ex. un embed webhook au type inattendu, cf. audit
// FX6) ne doit jamais faire planter tout le rendu du salon où il apparaît —
// sans ce filet, une erreur de rendu Vue remonte et peut casser l'arbre de
// composants parent.
app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue] Erreur de rendu non interceptée:', err, info);
};

import useSettingsItem from './composables/useSettingsItem';
const { Item: privacyMode } = useSettingsItem('privacyMode', false);
app.config.globalProperties.$p = ((name: any) => {
    if (!name || typeof name !== 'string') return name;
    if (privacyMode.value) return name.charAt(0).toUpperCase();
    return name;
}) as any;

app.use(router);

app.use(StarportPlugin());
app.use(FloatingVue)

app.mount('#app');
