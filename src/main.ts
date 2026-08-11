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
