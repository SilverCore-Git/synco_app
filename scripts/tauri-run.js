import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const TAURI_CONF_PATH = path.resolve(ROOT_DIR, 'src-tauri/tauri.conf.json');
const DEV_LAN_ORIGIN_PLACEHOLDER = '__DEV_LAN_ORIGIN__';

const [mode, ...forwardedArgs] = process.argv.slice(2);

if (mode !== 'dev' && mode !== 'build') {
  console.error('Usage: node scripts/tauri-run.js <dev|build> [...tauri args]');
  process.exit(1);
}

function readEnvValue(envFile, key) {
  const envPath = path.resolve(ROOT_DIR, envFile);
  if (!fs.existsSync(envPath)) return undefined;
  const content = fs.readFileSync(envPath, 'utf-8');
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!match) return undefined;
  const value = match[1].trim().replace(/^['"]|['"]$/g, '');
  return value || undefined;
}

// En dev on lit .env (poste local), en build on lit .env.production (config qui part dans le binaire livré).
const envFile = mode === 'build' ? '.env.production' : '.env';
const devLanIp = readEnvValue(envFile, 'VITE_TAURI_DEV_IP');

const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, 'utf-8'));
const baseCsp = tauriConf.app.security.csp;

// __DEV_LAN_ORIGIN__ est toujours précédé d'un espace dans le CSP de base, donc en son
// absence on retire aussi cet espace pour ne pas laisser de séparateur vide dans la CSP finale.
const patchedCsp = devLanIp
  ? baseCsp.split(DEV_LAN_ORIGIN_PLACEHOLDER).join(`https://${devLanIp}:*`)
  : baseCsp.split(` ${DEV_LAN_ORIGIN_PLACEHOLDER}`).join('');

const result = spawnSync('npx', ['tauri', mode, ...forwardedArgs], {
  stdio: 'inherit',
  shell: true,
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    TAURI_CONFIG: JSON.stringify({ app: { security: { csp: patchedCsp } } }),
  },
});

process.exit(result.status ?? 1);
