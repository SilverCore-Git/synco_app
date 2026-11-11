import type { DownloadTicket } from '@/services/transfers/cdnHttp';
import type { LinkItemPayload } from '@/services/shareLinks/linkDownload';

/**
 * Routes publiques de synco_api (/api/public/links), sans compte : la preuve
 * d'accès AUTH_lien voyage dans l'en-tête X-Link-Auth, jamais dans l'URL.
 * Ni cookie, ni Referer.
 */

const API_URL = String(import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export type LinkMode = 'PUBLIC' | 'PASSWORD' | 'USERS';

/** Lien inconnu, expiré, révoqué, mauvais mot de passe : le serveur ne distingue pas. */
export class LinkUnavailableError extends Error {
    constructor() {
        super('Ce lien est invalide ou a expiré.');
        this.name = 'LinkUnavailableError';
    }
}

export class TooManyAttemptsError extends Error {
    constructor() {
        super('Trop de tentatives. Réessayez dans quelques minutes.');
        this.name = 'TooManyAttemptsError';
    }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
        res = await fetch(`${API_URL}/api/public/links/${path}`, {
            ...init,
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            cache: 'no-store',
        });
    } catch {
        throw new Error('Serveur injoignable. Vérifiez votre connexion.');
    }
    if (res.status === 404) throw new LinkUnavailableError();
    if (res.status === 429) throw new TooManyAttemptsError();
    if (!res.ok) throw new Error(`Erreur du serveur (${res.status}).`);
    return res.json() as Promise<T>;
}

const withAuth = (auth: string): RequestInit => ({ method: 'POST', headers: { 'X-Link-Auth': auth } });

export const publicApi = {
    info: (linkId: string) =>
        call<{ mode: LinkMode; kdf: { alg: 'pbkdf2-sha256'; salt: string; iterations: number } | null }>(encodeURIComponent(linkId)),
    open: (linkId: string, auth: string) =>
        call<{ kind: 'file' | 'folder'; expiresAt: string; items: LinkItemPayload[] }>(`${encodeURIComponent(linkId)}/open`, withAuth(auth)),
    download: (linkId: string, itemId: string, auth: string) =>
        call<{ blobId: string; download: DownloadTicket }>(`${encodeURIComponent(linkId)}/items/${encodeURIComponent(itemId)}/download`, withAuth(auth)),
};
