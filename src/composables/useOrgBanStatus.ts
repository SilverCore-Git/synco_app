import { reactive } from 'vue';

/**
 * Bannissement des organisations, par organisation — pendant d'useBanStatus.ts
 * mais côté organisation : un même compte peut appartenir à plusieurs
 * organisations, dont une seule bannie, donc pas de simple booléen global ici.
 *
 * Alimenté par tout ce qui apprend le bannissement d'une organisation :
 * - `sfetch`, dès qu'une réponse de l'API porte le code `ORG_BANNED`
 *   (le cas le plus fréquent : GET /api/orgs/:orgId à l'ouverture) ;
 * - le socket, sur l'événement `org:banned` émis à l'instant du
 *   bannissement, pour basculer l'écran sans attendre la prochaine requête.
 */
export type OrgBanInfo = {
    reason: string | null;
    bannedAt: string | null;
};

const bannedOrgs = reactive<Record<string, OrgBanInfo>>({});

const setOrgBanned = (orgId: string, info?: Partial<OrgBanInfo> | null) => {
    if (!orgId) return;
    // Le premier signal reçu fait foi pour le motif, même raison qu'useBanStatus.
    if (!bannedOrgs[orgId]) {
        bannedOrgs[orgId] = {
            reason: info?.reason ?? null,
            bannedAt: info?.bannedAt ?? null,
        };
    }
};

const setOrgUnbanned = (orgId: string) => {
    if (!orgId) return;
    delete bannedOrgs[orgId];
};

const isOrgBanned = (orgId: string | undefined | null): boolean => {
    return !!orgId && !!bannedOrgs[orgId];
};

const getOrgBanInfo = (orgId: string | undefined | null): OrgBanInfo | null => {
    return orgId ? bannedOrgs[orgId] ?? null : null;
};

export default function useOrgBanStatus() {
    return { bannedOrgs, setOrgBanned, setOrgUnbanned, isOrgBanned, getOrgBanInfo };
}

export { bannedOrgs, setOrgBanned, setOrgUnbanned, isOrgBanned, getOrgBanInfo };
