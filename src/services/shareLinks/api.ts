import sfetch from '@/assets/utils/sfetch';
import type { DownloadTicket } from '@/services/transfers/cdnHttp';
import type { LinkItemPayload } from './linkDownload';

/**
 * Appels authentifiés de synco_api pour les liens de téléchargement
 * (routes /api/orgs/:orgId/links et /api/links). La page publique de
 * share.synco.one a son propre client, sans jeton (share/src/api.ts).
 */

export type ShareLinkMode = 'PUBLIC' | 'PASSWORD' | 'USERS';

export class ShareLinkApiError extends Error {
    readonly status: number;
    constructor(status: number, message: string) {
        super(message);
        this.status = status;
        this.name = 'ShareLinkApiError';
    }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await sfetch(path, {
        ...init,
        headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { /* corps non JSON */ }
    if (!res.ok) throw new ShareLinkApiError(res.status, body?.error || `Erreur serveur (${res.status})`);
    return body as T;
}

export interface LinkCandidate {
    id: string;
    originalName: string;
    mimeType: string;
    /** Taille stockée (chiffrée). */
    size: number;
    iv: string;
    encryptedFileKey: string;
    keyVersion: number;
    path: string;
}

export interface LinkCandidates {
    workspaceId: string;
    files: LinkCandidate[];
    /** Fichiers du dossier que l'utilisateur ne peut pas partager. */
    excluded: number;
    truncated: boolean;
}

export interface RecipientCandidate {
    userId: string;
    name: string;
    avatarUrl: string | null;
    publicKey: string;
    fingerprint: string;
}

export interface ShareLinkSummary {
    id: string;
    mode: ShareLinkMode;
    orgId: string;
    createdById: string;
    fileId: string | null;
    folderId: string | null;
    workspaceId: string;
    keyVersion: number;
    /** Null si l'on n'est pas membre de l'espace (secret illisible de toute façon). */
    wrappedSecret: string | null;
    kdf: { salt: string; iterations: number } | null;
    expiresAt: string;
    maxDownloads: number | null;
    downloadCount: number;
    revokedAt: string | null;
    suspendedAt: string | null;
    lastAccessAt: string | null;
    createdAt: string;
    createdBy: { id: string; name: string; avatarUrl: string | null };
    recipients: { userId: string; name: string; avatarUrl: string | null }[];
    itemCount: number;
    staleCount: number;
    live: boolean;
}

export interface ShareLinkEvent {
    type: 'OPEN' | 'DOWNLOAD' | 'AUTH_FAILED' | 'SUSPENDED' | 'REVOKED';
    itemId: string | null;
    userId: string | null;
    createdAt: string;
}

export interface ShareLinkDetail extends ShareLinkSummary {
    items: { id: string; fileId: string; stale: boolean; sealedMeta: string; updatedAt: string }[];
    events: ShareLinkEvent[];
}

export interface CreateLinkBody {
    id: string;
    mode: ShareLinkMode;
    fileId?: string;
    folderId?: string;
    keyVersion: number;
    wrappedSecret: string;
    authHash?: string;
    kdf?: { salt: string; iterations: number };
    expiresAt: string;
    maxDownloads?: number | null;
    items: { fileId: string; wrappedDek: string; sealedMeta: string }[];
    recipients?: { userId: string; wrappedSecret: string; keyFingerprint: string }[];
}

export interface UpdateLinkBody {
    expiresAt?: string;
    maxDownloads?: number | null;
    items?: { upsert?: CreateLinkBody['items']; remove?: string[] };
    recipients?: { add?: NonNullable<CreateLinkBody['recipients']>; remove?: string[] };
}

export interface ReceivedLink {
    id: string;
    kind: 'file' | 'folder';
    expiresAt: string;
    sharedAt: string;
    sharedBy: { id: string; name: string; avatarUrl: string | null };
    organization: { id: string; name: string; logo: string | null };
}

export interface RecipientOpenedLink {
    id: string;
    kind: 'file' | 'folder';
    expiresAt: string;
    wrappedSecret: string;
    items: LinkItemPayload[];
}

const base = (orgId: string) => `/api/orgs/${encodeURIComponent(orgId)}/links`;

const targetQuery = (target: { fileId?: string; folderId?: string }) =>
    target.fileId ? `fileId=${encodeURIComponent(target.fileId)}` : `folderId=${encodeURIComponent(target.folderId!)}`;

export const shareLinksApi = {
    canShare: (orgId: string, target: { fileId?: string; folderId?: string }) =>
        call<{ canShare: boolean }>(`${base(orgId)}/can-share?${targetQuery(target)}`),
    candidates: (orgId: string, target: { fileId?: string; folderId?: string }) =>
        call<LinkCandidates>(`${base(orgId)}/candidates?${targetQuery(target)}`),
    lookupRecipient: (orgId: string, email: string) =>
        call<RecipientCandidate>(`${base(orgId)}/recipients/lookup`, { method: 'POST', body: JSON.stringify({ email }) }),
    create: (orgId: string, body: CreateLinkBody) =>
        call<{ id: string }>(base(orgId), { method: 'POST', body: JSON.stringify(body) }),
    list: (orgId: string, query: { fileId?: string; folderId?: string; scope?: 'mine' | 'all' } = {}) => {
        const params = new URLSearchParams();
        if (query.fileId) params.set('fileId', query.fileId);
        if (query.folderId) params.set('folderId', query.folderId);
        params.set('scope', query.scope ?? 'mine');
        return call<ShareLinkSummary[]>(`${base(orgId)}?${params}`);
    },
    get: (orgId: string, id: string) => call<ShareLinkDetail>(`${base(orgId)}/${encodeURIComponent(id)}`),
    update: (orgId: string, id: string, body: UpdateLinkBody) =>
        call<{ id: string }>(`${base(orgId)}/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),
    revoke: (orgId: string, id: string) =>
        call<{ id: string }>(`${base(orgId)}/${encodeURIComponent(id)}`, { method: 'DELETE' }),

    received: () => call<ReceivedLink[]>('/api/links/received'),
    openReceived: (id: string) => call<RecipientOpenedLink>(`/api/links/${encodeURIComponent(id)}/open`, { method: 'POST' }),
    downloadReceived: (id: string, itemId: string) =>
        call<{ blobId: string; download: DownloadTicket }>(`/api/links/${encodeURIComponent(id)}/items/${encodeURIComponent(itemId)}/download`, { method: 'POST' }),
};
