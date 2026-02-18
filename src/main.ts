import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router';
import { clerkPlugin } from '@clerk/vue';
import { frFR } from '@clerk/localizations'
import 'bootstrap-icons/font/bootstrap-icons.css';

const app = createApp(App);

app.use(router);

app.use(clerkPlugin, { 
  publishableKey: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  localization: frFR,
  //appearance: clerkAppearanceSettings, // to do
  afterSignOutUrl: '/sauth/sign-in',
  routerPush: router.push,
  routerReplace: router.replace
});

app.mount('#app')
