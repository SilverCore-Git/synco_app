import { installTauriXHRPatch } from '@/assets/utils/tauriXHR';

function isTauriPlatform(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

if (isTauriPlatform()) {
  // patch fetch (pour keycloak-js)
  const originalFetch = window.fetch;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const shouldIntercept = url.includes('auth.silvercore.fr') || url.includes('api-synco.silvercore.fr') || url.includes('livekit.silvercore.fr');
    if (shouldIntercept) {
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');
      return tauriFetch(input as any, init as any);
    }
    return originalFetch(input, init);
  };

  // patch XHR (pour socket.io)
  installTauriXHRPatch(['api-synco.silvercore.fr', 'auth.silvercore.fr']);
}

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
import App from './App.vue'
import router from './router';
import StarportPlugin from 'vue-starport'
import FloatingVue from 'floating-vue'

import 'bootstrap-icons/font/bootstrap-icons.css';
import 'floating-vue/dist/style.css'

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js');
}

const app = createApp(App);

app.use(router);

app.use(StarportPlugin());
app.use(FloatingVue)

app.mount('#app');
