import { computed, ref } from 'vue';
import { isOlderThan, parseVersion } from '@/assets/utils/semver';
import { debugWarn } from '@/assets/utils/debugLog';

/**
 * Version minimale de l'app publiée par l'API (PC107, GET /api/app/min-version, publique).
 * Une app plus ancienne affiche un bandeau « mettez à jour » (MinVersionBanner.vue), non bloquant
 * et refermable pour la session. Toute erreur (hors ligne, API ancienne sans la route, valeur
 * illisible) laisse le bandeau caché : on ne gêne jamais l'utilisateur sur une incertitude.
 */

const DISMISS_KEY = 'synco.minVersionBannerDismissed';

const minVersion = ref<string | null>(null);
const dismissed = ref(readDismissed());
let requested = false;

function readDismissed(): boolean {
    try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
}

export function minVersionFromBody(body: unknown): string | null {
    const v = (body as { minVersion?: unknown } | null)?.minVersion;
    return parseVersion(v) ? (v as string) : null;
}

async function load(): Promise<void> {
    if (requested) return;
    requested = true;
    try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/app/min-version`, { credentials: 'omit' });
        if (!res.ok) return;
        minVersion.value = minVersionFromBody(await res.json());
    } catch (e) {
        requested = false;
        debugWarn('[min-version] lecture impossible', e);
    }
}

export default function useMinAppVersion() {
    const outdated = computed(() => isOlderThan(__APP_BUILD__.version, minVersion.value));
    const visible = computed(() => outdated.value && !dismissed.value);
    function dismiss() {
        dismissed.value = true;
        try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* stockage indisponible : fermé jusqu'au rechargement */ }
    }
    return { visible, minVersion, currentVersion: __APP_BUILD__.version, load, dismiss };
}
