import { ref } from 'vue';
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater';
import isDesktopApp from '@/assets/isDesktopApp';
import { debugWarn } from '@/assets/utils/debugLog';

/**
 * Auto-update de l'app desktop (tauri-plugin-updater). Le plugin lit le latest.json de la dernière
 * release GitHub (publié par release_main.yml une fois MSI, AppImage et archive macOS signés), vérifie la signature
 * de l'installeur avec la clé publique de tauri.conf.json, puis l'installe : MSI en mode passif sous
 * Windows (l'app se ferme), remplacement du fichier AppImage sous Linux et du .app sous macOS. On relance ensuite l'app.
 *
 * Rien ne s'installe sans l'accord de l'utilisateur (UpdateAvailable.vue). « Plus tard » masque
 * cette version jusqu'au prochain lancement ; une version plus récente est proposée à nouveau.
 * Hors Tauri (web, Capacitor) tout est inerte.
 */

export type AppUpdaterState = 'idle' | 'available' | 'downloading' | 'installing' | 'error';

/** Laisse l'app démarrer avant d'aller sur le réseau. */
const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

const state = ref<AppUpdaterState>('idle');
const version = ref('');
const currentVersion = ref('');
/** Avancement du téléchargement entre 0 et 1, null tant que la taille est inconnue. */
const progress = ref<number | null>(null);

let pending: Update | null = null;
let snoozedVersion: string | null = null;
let started = false;

function forget() {
    void pending?.close().catch(() => {});
    pending = null;
}

async function checkNow(): Promise<void> {
    if (!isDesktopApp() || state.value === 'downloading' || state.value === 'installing') return;
    try {
        const { check } = await import('@tauri-apps/plugin-updater');
        const update = await check();
        if (!update || update.version === snoozedVersion || update.version === version.value) {
            void update?.close().catch(() => {});
            return;
        }
        forget();
        pending = update;
        version.value = update.version;
        currentVersion.value = update.currentVersion;
        state.value = 'available';
    } catch (e) {
        // Hors ligne, GitHub indisponible, release en cours de publication : on réessaiera plus tard.
        debugWarn('[updater] vérification impossible', e);
    }
}

async function install(): Promise<void> {
    if (!pending || state.value === 'downloading' || state.value === 'installing') return;
    let total = 0;
    let received = 0;
    progress.value = null;
    state.value = 'downloading';
    try {
        await pending.downloadAndInstall((event: DownloadEvent) => {
            if (event.event === 'Started') {
                total = event.data.contentLength ?? 0;
            } else if (event.event === 'Progress') {
                received += event.data.chunkLength;
                if (total > 0) progress.value = Math.min(1, received / total);
            } else {
                state.value = 'installing';
            }
        });
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
    } catch (e) {
        debugWarn('[updater] échec de la mise à jour', e);
        state.value = 'error';
    }
}

function later(): void {
    snoozedVersion = version.value;
    version.value = '';
    state.value = 'idle';
    forget();
}

/** Lance la vérification au démarrage puis périodiquement. Idempotent. */
function start(): void {
    if (started || !isDesktopApp()) return;
    started = true;
    setTimeout(() => {
        void checkNow();
        setInterval(() => void checkNow(), CHECK_INTERVAL_MS);
    }, FIRST_CHECK_DELAY_MS);
}

export default function useAppUpdater() {
    return { state, version, currentVersion, progress, start, checkNow, install, later };
}
