import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

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
let patchedCsp = devLanIp
  ? baseCsp.split(DEV_LAN_ORIGIN_PLACEHOLDER).join(`https://${devLanIp}:*`)
  : baseCsp.split(` ${DEV_LAN_ORIGIN_PLACEHOLDER}`).join('');

// localhost:* ne doit jamais atteindre un binaire `tauri build` : avant ce
// correctif ces origines étaient écrites en dur dans tauri.conf.json, donc
// présentes même dans une release (audit FX5). `mode` ('dev'/'build') vient
// de l'argument CLI passé à ce script, pas de NODE_ENV.
const isProd = mode === 'build';
const devHosts = isProd ? '' : ' http://localhost:* https://localhost:*';
const devConnect = isProd ? '' : ' http://localhost:* https://localhost:* ws://localhost:* wss://localhost:*';
patchedCsp = patchedCsp
  .split('__CSP_DEV_SCRIPT__').join(devHosts)
  .split('__CSP_DEV_CONNECT__').join(devConnect)
  .split('__CSP_DEV_IMG__').join(devHosts)
  .split('__CSP_DEV_FRAME__').join(devHosts);

// On résout et on lance le binaire du CLI Tauri directement (plutôt que via npx) pour ne pas
// dépendre de la façon dont le gestionnaire de paquets (npm/bun) a posé les shims dans .bin.
const tauriCliEntry = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');

const result = spawnSync(process.execPath, [tauriCliEntry, mode, ...forwardedArgs], {
  stdio: 'inherit',
  cwd: ROOT_DIR,
  env: {
    ...process.env,
    TAURI_CONFIG: JSON.stringify({ app: { security: { csp: patchedCsp } } }),
  },
});

process.exit(result.status ?? 1);
