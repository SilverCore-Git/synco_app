import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath, URL } from 'node:url';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
// Check if HTTPS should be used based on VITE_USE_HTTPS in .env file
// We read .env directly since we're in Node.js context (vite.config.ts).
// process.env is checked first so a container/CI can set these without a
// physical .env file on disk (e.g. Docker Compose environment vars).
function getEnvValue(key: string, defaultValue: string = 'false', envFile: string = '.env'): string {
  if (process.env[key] !== undefined) {
    return process.env[key] as string;
  }
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
    if (match) {
      return match[1].replace(/^['"]|['"]$/g, ''); // Remove quotes
    }
  }
  return defaultValue;
}

const useHttps = getEnvValue('VITE_USE_HTTPS') !== 'false';

// index.html embarque sa propre CSP (utilisée par Capacitor et le web) avec le même
// placeholder __DEV_LAN_ORIGIN__ que src-tauri/tauri.conf.json (patché par scripts/tauri-run.js).
// On le résout ici pour que index.html reste cohérent avec le build Tauri.
function devLanCspPlugin(): Plugin {
  let mode = 'development';
  return {
    name: 'dev-lan-csp',
    configResolved(config) {
      mode = config.mode;
    },
    transformIndexHtml(html) {
      const isProd = mode === 'production';
      const envFile = isProd ? '.env.production' : '.env';
      const devLanIp = getEnvValue('VITE_TAURI_DEV_IP', '', envFile);
      let out = devLanIp
        ? html.split('__DEV_LAN_ORIGIN__').join(`https://${devLanIp}:*`)
        : html.split(' __DEV_LAN_ORIGIN__').join('');

      // localhost:* ne doit jamais atteindre le build de production : avant
      // ce correctif ces origines étaient écrites en dur dans la CSP,
      // présentes même en prod (audit FX5). Un build de dev reste permissif
      // (localhost, tous ports) pour que le hot-reload/les outils locaux
      // continuent de fonctionner.
      const devHosts = isProd ? '' : ' http://localhost:* https://localhost:*';
      const devConnect = isProd ? '' : ' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*';
      out = out
        .split('__CSP_DEV_SCRIPT__').join(devHosts)
        .split('__CSP_DEV_CONNECT__').join(devConnect)
        .split('__CSP_DEV_IMG__').join(devHosts)
        .split('__CSP_DEV_FRAME__').join(devHosts);

      return out;
    },
  };
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    useHttps ? basicSsl() : undefined,
    devLanCspPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    // HSTS is deliberately omitted here (unlike docker/nginx.conf): it's
    // cached per-host by the browser for a year, and dev is sometimes
    // accessed over plain HTTP (VITE_TAURI_DEV_IP / LAN testing) — forcing
    // it would break that. frame-ancestors here only restricts iframe
    // embedding, so it's safe to mirror prod for that one.
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
      'Content-Security-Policy': "frame-ancestors 'self';",
    },
    proxy: {
      '/socket': {
        target: useHttps ? 'https://127.0.0.1:3467' : 'http://127.0.0.1:3467',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 1500, // Augmente la limite pour éviter les faux positifs (utile pour les app IA)
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Séparation des grosses bibliothèques dans leurs propres chunks
            if (id.includes('onnxruntime-web')) return 'vendor-ai';
            if (id.includes('livekit')) return 'vendor-livekit';
            if (id.includes('peerjs')) return 'vendor-rtc';
            if (id.includes('vue') || id.includes('@vue')) return 'vendor-vue';
            
            // Tout le reste des bibliothèques externes dans un gros chunk "vendor"
            return 'vendor';
          }
        }
      }
    }
  }
})
