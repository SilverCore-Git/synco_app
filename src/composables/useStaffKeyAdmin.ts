import { computed, ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { E2EEUnloked } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { useToast } from '@/composables/useToast';
import { useStaffKey } from '@/composables/useStaffKey';
import { buildStaffKeySharesFor, fillMissingStaffKeyShares, StaffKeySetupError } from '@/services/support/keys';
import { loadSupportRole } from '@/services/support/role';

/**
 * Gestion de la clé d'équipe du support depuis le panel admin (super-admin
 * seulement, SUPPORT_FEATURE.md §2.1) : mise en place de la v1 à
 * l'ouverture du panel, copies pour une personne nommée, rotation après un
 * retrait. État partagé entre AdminPanel.vue (bandeau) et UsersQuota.vue
 * (bascules de rôle).
 *
 * Toute opération exige l'E2EE déverrouillé : sinon l'état passe à
 * 'locked' et un toast l'explique (pas de dialogue natif).
 */

export type StaffKeySetupState = 'idle' | 'checking' | 'creating' | 'ready' | 'rotating' | 'locked' | 'error';

const state = ref<StaffKeySetupState>('idle');
const error = ref<string | null>(null);
/** Une rotation a échoué (ou n'a pas pu être faite) : à relancer depuis le bandeau. */
const rotationPending = ref(false);
const isSuperAdmin = ref(false);

const describe = (e: unknown) =>
    e instanceof StaffKeySetupError || e instanceof Error ? e.message : "Erreur inattendue.";

export function useStaffKeyAdmin() {
    const toast = useToast();
    const staffKey = useStaffKey();

    const lockedGuard = (): boolean => {
        if (E2EEUnloked.value) return false;
        state.value = 'locked';
        toast.show("Déverrouillez votre session (code PIN) pour gérer la clé du support.", 'warning', 5000);
        return true;
    };

    /**
     * À l'ouverture du panel : pour le super-admin seulement, crée la clé
     * d'équipe (v1) si elle n'existe pas, puis comble les copies manquantes.
     */
    const ensureSetup = async () => {
        if (state.value === 'checking' || state.value === 'creating') return;
        try {
            isSuperAdmin.value = (await loadSupportRole()) === 'superadmin';
        } catch {
            isSuperAdmin.value = false;
        }
        if (!isSuperAdmin.value) return;
        if (lockedGuard()) return;

        state.value = 'checking';
        error.value = null;
        try {
            const status = await staffKey.refresh();
            if (status === 'missing') {
                state.value = 'creating';
                await staffKey.createNextVersion();
                toast.show("Clé de chiffrement du support créée et partagée à l'équipe.", 'success');
            } else if (status === 'error' || status === 'not-shared') {
                throw new Error(staffKey.error.value ?? "Votre copie de la clé du support est introuvable.");
            }
            state.value = 'ready';
        } catch (e) {
            state.value = 'error';
            error.value = describe(e);
            toast.show(`Clé du support : ${error.value}`, 'error', 6000);
        }
    };

    /**
     * Copies (toutes versions détenues) pour une personne nommée, si sa clé
     * publique est connue (profil partagé) ; sinon `undefined` : la
     * nomination part sans copie et afterNomination() la comble via
     * missing-shares, qui fournit la clé publique.
     */
    const nominationShares = async (userId: string): Promise<{ version: number; encryptedPrivateKey: string }[] | undefined> => {
        if (!E2EEUnloked.value) return undefined;
        try {
            const res = await sfetch(`/api/users/${encodeURIComponent(userId)}`);
            if (!res.ok) return undefined;
            const data: { publicKey?: string } = await res.json();
            if (!data.publicKey) return undefined;
            const pk = await resolveRecipientKey(userId, data.publicKey);
            const shares = await buildStaffKeySharesFor(pk);
            return shares.length ? shares : undefined;
        } catch (e) {
            console.warn('[Support] Copies de nomination non préparées :', describe(e));
            return undefined;
        }
    };

    /** Après une nomination : comble immédiatement les copies manquantes (toutes versions). */
    const afterNomination = async () => {
        if (!E2EEUnloked.value) return;
        try {
            await fillMissingStaffKeyShares(true);
        } catch (e) {
            console.warn('[Support] Comblement après nomination impossible :', describe(e));
        }
    };

    /**
     * Rotation : nouvelle version partagée aux membres restants. À appeler
     * après le retrait d'une personne qui n'est plus membre de l'équipe.
     */
    const rotate = async (): Promise<boolean> => {
        if (lockedGuard()) {
            rotationPending.value = true;
            return false;
        }
        state.value = 'rotating';
        error.value = null;
        try {
            await staffKey.createNextVersion();
            rotationPending.value = false;
            state.value = 'ready';
            toast.show('Clé du support renouvelée.', 'success');
            return true;
        } catch (e) {
            rotationPending.value = true;
            state.value = 'error';
            error.value = describe(e);
            toast.show(`Renouvellement de la clé du support impossible : ${error.value}`, 'error', 6000);
            return false;
        }
    };

    return {
        state: computed(() => state.value),
        error: computed(() => error.value),
        rotationPending: computed(() => rotationPending.value),
        isSuperAdmin: computed(() => isSuperAdmin.value),
        busy: computed(() => state.value === 'checking' || state.value === 'creating' || state.value === 'rotating'),
        current: staffKey.current,
        ensureSetup,
        nominationShares,
        afterNomination,
        rotate,
    };
}
