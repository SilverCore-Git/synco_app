import { computed, ref } from 'vue';

/**
 * Bannissement du compte courant.
 *
 * L'état est alimenté par tout ce qui apprend le bannissement :
 * - `sfetch`, dès qu'une réponse de l'API porte le code `ACCOUNT_BANNED`
 *   (c'est le cas le plus fréquent : /api/users/me au lancement de l'app) ;
 * - le socket, sur l'événement `auth:banned` émis à l'instant du
 *   bannissement, pour basculer l'écran sans attendre la prochaine requête.
 *
 * Il n'est jamais remis à faux : lever un bannissement demande de relancer
 * l'app, ce qui est le bon comportement (l'état chiffré en mémoire et les
 * abonnements temps réel ont été coupés entre-temps).
 */
export type BanInfo = {
    reason: string | null;
    bannedAt: string | null;
};

const banned = ref<boolean>(false);
const banInfo = ref<BanInfo>({ reason: null, bannedAt: null });

const setBanned = (info?: Partial<BanInfo> | null) => {
    // Le premier signal reçu fait foi pour le motif : l'événement socket et la
    // réponse HTTP portent la même information, inutile de l'écraser par une
    // version potentiellement vide arrivée ensuite.
    if (!banned.value) {
        banInfo.value = {
            reason: info?.reason ?? null,
            bannedAt: info?.bannedAt ?? null,
        };
    }
    banned.value = true;
};

const isBanned = computed(() => banned.value);

export default function useBanStatus() {
    return { isBanned, banInfo, setBanned };
}

export { banned, banInfo, setBanned };
