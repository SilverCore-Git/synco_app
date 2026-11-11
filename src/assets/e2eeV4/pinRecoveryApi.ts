import sfetch from '../utils/sfetch';
import { keycloak } from '../keycloak';
import type { PinRecoveryActors, PinRecoveryStatus } from './pinRecovery';

/**
 * Les deux acteurs OPRF de la récupération par PIN :
 * - synco_api : /api/e2ee/v4/pin-recovery ;
 * - synco_keyguard : service isolé (VITE_KEYGUARD_URL), appelé directement avec le jeton Keycloak,
 *   jamais à travers synco_api.
 */

const KEYGUARD_URL = (import.meta.env.VITE_KEYGUARD_URL as string | undefined)?.replace(/\/$/, '');

/** La récupération par PIN n'est proposée que si le keyguard est configuré pour ce déploiement. */
export const pinRecoveryConfigured = !!KEYGUARD_URL;

const httpError = (status: number, body: Record<string, unknown>) =>
    Object.assign(new Error((body.error as string) || `Erreur ${status}`), { status, body });

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await sfetch(`/api/e2ee/v4/pin-recovery${path}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data);
    return data as T;
}

async function guard<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!KEYGUARD_URL) throw httpError(503, { error: 'Service de récupération non configuré.' });
    await keycloak.updateToken(30).catch(() => {});
    const res = await fetch(`${KEYGUARD_URL}/v1${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${keycloak.token ?? ''}` },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw httpError(res.status, data);
    return data as T;
}

export const pinRecoveryActors: PinRecoveryActors = {
    server: {
        status: () => api<PinRecoveryStatus>('GET', ''),
        begin: (blinded) => api('POST', '/begin', { blinded }),
        commit: (setupId, verifyHash, envelope, proof) => api('POST', '/commit', { setupId, verifyHash, envelope, proof }),
        evaluate: (blinded) => api('POST', '/evaluate', { blinded }),
        verify: (token) => api('POST', '/verify', { token }),
        disable: (proof) => api('DELETE', '', { proof }),
    },
    guard: {
        status: () => guard<PinRecoveryStatus>('GET', '/status'),
        begin: (blinded) => guard('POST', '/setup/begin', { blinded }),
        commit: (setupId, verifyHash) => guard('POST', '/setup/commit', { setupId, verifyHash }),
        evaluate: (blinded) => guard('POST', '/evaluate', { blinded }),
        verify: (token) => guard('POST', '/verify', { token }),
        disable: () => guard('DELETE', '/setup'),
    },
};
