// Politique de confiance pour la Synco AI Gateway auto-hébergée
// (activeModules.aiConfig.gatewayUrl, provider 'gateway') — audit FC5.
//
// Chaque message envoyé à l'assistant part, avec le jeton d'accès Keycloak
// complet de l'utilisateur et la clé de session IA en clair de
// l'organisation, vers cette URL — lue depuis la réponse de l'API, donc
// modifiable soit par un détenteur de ORG_AI dans les réglages, soit par
// l'opérateur/un intrus côté synco_api sans toucher la base. Sans contrôle
// côté client, un gatewayUrl pointant vers un serveur arbitraire exfiltre
// ces deux secrets au premier message envoyé par n'importe quel membre.
//
// Deux niveaux : une liste blanche fixée au build (la passerelle officielle
// Synco, si elle existe) et, pour les organisations qui hébergent la leur,
// un accord explicite par utilisateur et par origine (TOFU), redemandé à
// chaque changement d'URL. Ni l'un ni l'autre ne remplace le filtrage côté
// synco_api : c'est une défense côté client contre un adversaire qui
// contrôle déjà la réponse de l'API.
import { ref } from 'vue';

export class GatewayNotAllowedError extends Error {}

const BUILD_ALLOWED_ORIGINS: string[] = (import.meta.env.VITE_AI_GATEWAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);

const CONSENT_PREFIX = 'ai-gateway-consent:';

function consentKey(userId: string, orgId: string): string {
    return `${CONSENT_PREFIX}${userId}:${orgId}`;
}

function getPinnedOrigin(userId: string, orgId: string): string | null {
    try {
        return localStorage.getItem(consentKey(userId, orgId));
    } catch {
        return null;
    }
}

function setPinnedOrigin(userId: string, orgId: string, origin: string): void {
    try {
        localStorage.setItem(consentKey(userId, orgId), origin);
    } catch { /* localStorage indisponible */ }
}

/**
 * Valide la forme de l'URL (https, pas d'identifiants/query/fragment — rien
 * qui puisse cacher une redirection ou un paramètre parasite) et renvoie son
 * origine normalisée. Ne dit rien sur la CONFIANCE accordée à cette origine
 * — voir `isGatewayOriginTrusted` / `requestGatewayConsent` pour ça.
 */
export function parseGatewayUrl(raw: string | undefined): URL {
    let u: URL;
    try {
        u = new URL(raw ?? '');
    } catch {
        throw new GatewayNotAllowedError('URL de passerelle invalide.');
    }
    if (u.protocol !== 'https:') {
        throw new GatewayNotAllowedError('La passerelle doit être en HTTPS.');
    }
    if (u.username || u.password || u.search || u.hash) {
        throw new GatewayNotAllowedError('URL de passerelle non canonique (identifiants, paramètres ou fragment interdits).');
    }
    return u;
}

export function isGatewayOriginTrusted(origin: string, userId: string, orgId: string): boolean {
    if (BUILD_ALLOWED_ORIGINS.includes(origin)) return true;
    return getPinnedOrigin(userId, orgId) === origin;
}

// État du panneau de consentement, affiché une fois dans App.vue (même
// principe que ConfirmDelete.vue, jamais de confirm()/alert() natif —
// convention du projet).
export interface GatewayConsentRequest {
    origin: string;
    resolve: (allowed: boolean) => void;
}
export const pendingGatewayConsent = ref<GatewayConsentRequest | null>(null);

/**
 * Demande l'accord de l'utilisateur pour cette origine, via le panneau
 * global. Résout à `true` seulement si l'utilisateur clique "Autoriser" —
 * l'accord est alors épinglé pour cet utilisateur et cette organisation,
 * et redemandé si l'origine change à nouveau plus tard.
 */
export function requestGatewayConsent(origin: string, userId: string, orgId: string): Promise<boolean> {
    return new Promise((resolve) => {
        pendingGatewayConsent.value = {
            origin,
            resolve: (allowed: boolean) => {
                if (allowed) setPinnedOrigin(userId, orgId, origin);
                pendingGatewayConsent.value = null;
                resolve(allowed);
            },
        };
    });
}

/**
 * Point d'entrée unique pour les appelants (AIService.ts, AISettings.vue) :
 * valide la forme de l'URL, puis — si l'origine n'est pas déjà fiable —
 * ouvre le panneau de consentement et attend la décision de l'utilisateur.
 * Lève si l'URL est malformée ou si l'utilisateur refuse.
 */
export async function assertAllowedGateway(raw: string | undefined, userId: string, orgId: string): Promise<string> {
    const u = parseGatewayUrl(raw);
    if (!isGatewayOriginTrusted(u.origin, userId, orgId)) {
        const allowed = await requestGatewayConsent(u.origin, userId, orgId);
        if (!allowed) {
            throw new GatewayNotAllowedError(`Passerelle non autorisée : ${u.origin}`);
        }
    }
    return u.origin + u.pathname.replace(/\/$/, '');
}
