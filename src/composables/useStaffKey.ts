import { computed, ref, shallowRef } from 'vue';
import { E2EEUnloked } from '@/assets/utils/crypto';
import { staffKeyAlert } from '@/assets/utils/supportCrypto';
import type { SupportStaffKeyInfo } from '@/types/support';
import {
    StaffKeySetupError,
    createStaffKeyVersion,
    fetchCurrentStaffKey,
    fillMissingStaffKeyShares,
    unlockStaffKeys,
} from '@/services/support/keys';
import { loadSupportRole } from '@/services/support/role';

/**
 * État de la clé d'équipe du support, partagé par tous les écrans (panel
 * support, panel admin). Pour un membre de l'équipe, `refresh()` :
 *  1. lit et vérifie la version courante (signature du super-admin,
 *     signataire épinglé) ;
 *  2. déverrouille ses copies (toutes versions) ;
 *  3. en arrière-plan, comble les copies manquantes des autres membres
 *     (missing-shares, création seulement).
 *
 * Statuts :
 *  - 'idle'       : rien chargé ;
 *  - 'loading'    : en cours ;
 *  - 'locked'     : E2EE verrouillé (PIN) ;
 *  - 'missing'    : aucune clé d'équipe n'existe (le super-admin la crée
 *                   depuis le panel admin) ;
 *  - 'not-shared' : la clé existe, mais aucune copie ne nous a été transmise ;
 *  - 'ready'      : clé courante vérifiée et déverrouillée ;
 *  - 'error'      : signature invalide, signataire changé… (`error`).
 */

export type StaffKeyStatus = 'idle' | 'loading' | 'locked' | 'missing' | 'not-shared' | 'ready' | 'error';

const status = ref<StaffKeyStatus>('idle');
const current = shallowRef<SupportStaffKeyInfo | null>(null);
const unlockedVersions = ref<number[]>([]);
const error = ref<string | null>(null);
/** Dernier comblement de copies : nombre créé (null : pas encore tenté / échec). */
const lastFilled = ref<number | null>(null);
let inflight: Promise<StaffKeyStatus> | null = null;

async function doRefresh(): Promise<StaffKeyStatus> {
    if (!E2EEUnloked.value) return (status.value = 'locked');
    status.value = 'loading';
    error.value = null;
    try {
        const role = await loadSupportRole();
        current.value = await fetchCurrentStaffKey();
        if (!current.value) return (status.value = 'missing');
        if (!role) return (status.value = 'ready');

        unlockedVersions.value = await unlockStaffKeys(true);
        if (!unlockedVersions.value.includes(current.value.version)) return (status.value = 'not-shared');

        // Arrière-plan : n'affecte pas le statut, un échec est journalisé.
        void fillMissingStaffKeyShares()
            .then((n) => { lastFilled.value = n; })
            .catch((e) => console.warn('[Support] Comblement des copies impossible :', (e as Error).message));
        return (status.value = 'ready');
    } catch (e) {
        error.value = (e as Error).message;
        return (status.value = 'error');
    }
}

function refresh(): Promise<StaffKeyStatus> {
    inflight ??= doRefresh().finally(() => { inflight = null; });
    return inflight;
}

/**
 * Crée la version suivante (super-admin) : mise en place si `missing`,
 * rotation sinon. Lève StaffKeySetupError (message affichable) en cas de
 * membre impossible à couvrir.
 */
async function createNextVersion(): Promise<SupportStaffKeyInfo> {
    const info = await createStaffKeyVersion();
    current.value = info;
    await refresh();
    return info;
}

export function useStaffKey() {
    return {
        status: computed(() => status.value),
        current: computed(() => current.value),
        unlockedVersions: computed(() => unlockedVersions.value),
        error: computed(() => error.value),
        lastFilled: computed(() => lastFilled.value),
        /** Alerte de sécurité (signataire ou clé de signature changés) à afficher en bandeau. */
        alert: staffKeyAlert,
        dismissAlert: () => { staffKeyAlert.value = null; },
        refresh,
        createNextVersion,
        /** Comble immédiatement les copies manquantes (ignore l'intervalle). */
        fillMissingShares: () => fillMissingStaffKeyShares(true),
    };
}

export { StaffKeySetupError };
