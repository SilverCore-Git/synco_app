import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { fileURLToPath, URL } from 'node:url';
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
// Check if HTTPS should be used based on VITE_USE_HTTPS in .env file
// We read .env directly since we're in Node.js context (vite.config.ts)
function getEnvValue(key: string, defaultValue: string = 'false'): string {
  const envPath = path.resolve(process.cwd(), '.env');
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

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    useHttps ? basicSsl() : undefined,
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    proxy: {
      '/socket': {
        target: useHttps ? 'https://localhost:3467' : 'http://localhost:3467',
        ws: true,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
