import sfetch from '@/assets/utils/sfetch';
import type {
    CreateSupportTicketPayload,
    SupportMissingShare,
    SupportRequesterDTO,
    SupportRole,
    SupportStaffKeyIn,
    SupportStaffKeyInfo,
    SupportStaffKeyShareDTO,
    SupportStaffMember,
    SupportStaffTicketFilters,
    SupportTag,
    SupportTicketClientDTO,
    SupportTicketDTO,
    SupportTicketEventDTO,
    SupportTicketPriority,
    SupportTicketStaffDTO,
    SupportTicketStatus,
} from '@/types/support';

/**
 * Client REST typé du SAV (SUPPORT_FEATURE.md §5). Aucune logique de
 * chiffrement ici : les charges utiles sont déjà chiffrées par l'appelant
 * (services/support/keys.ts, tickets.ts). Toute réponse non 2xx lève une
 * SupportApiError portant le message de l'API (affichable en toast).
 */

export class SupportApiError extends Error {
    readonly status: number;
    /** Corps JSON de l'erreur (ex. `missing` d'un POST /staff-key incomplet). */
    readonly body: Record<string, unknown> | null;
    constructor(status: number, message: string, body: Record<string, unknown> | null) {
        super(message);
        this.name = 'SupportApiError';
        this.status = status;
        this.body = body;
    }
}

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
    const res = await sfetch(path, {
        method: init?.method ?? 'GET',
        ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
        const body = json && typeof json === 'object' ? json as Record<string, unknown> : null;
        const message = typeof body?.error === 'string' ? body.error : `Erreur serveur (${res.status})`;
        throw new SupportApiError(res.status, message, body);
    }
    return json as T;
}

const BASE = '/api/support';
const enc = encodeURIComponent;

export const supportApi = {

    // ── Rôle ────────────────────────────────────────────────────────────
    me: () => call<{ userId: string; role: SupportRole }>(`${BASE}/me`),

    // ── Clé d'équipe ────────────────────────────────────────────────────
    getStaffKey: () => call<SupportStaffKeyInfo | null>(`${BASE}/staff-key`),
    getStaffKeyVersions: () => call<SupportStaffKeyInfo[]>(`${BASE}/staff-key/versions`),
    getMyStaffKeyShares: () => call<SupportStaffKeyShareDTO[]>(`${BASE}/staff-key/shares`),
    createStaffKey: (body: { version: number; publicKey: string; signature: string; shares: { userId: string; encryptedPrivateKey: string }[] }) =>
        call<{ success: true; version: number }>(`${BASE}/staff-key`, { method: 'POST', body }),
    getMissingShares: () => call<SupportMissingShare[]>(`${BASE}/staff-key/missing-shares`),
    createShares: (shares: { version: number; userId: string; encryptedPrivateKey: string }[]) =>
        call<{ success: true; created: number }>(`${BASE}/staff-key/shares`, { method: 'POST', body: { shares } }),
    /**
     * Clés publiques des membres de l'équipe — route absente de l'API au
     * moment de l'écriture (§5 la dit « inutile »), mais indispensable à la
     * mise en place et à la rotation (POST /staff-key exige une copie pour
     * chaque membre ayant une publicKey). Voir keys.ts pour le repli.
     */
    getStaffPublicKeys: () => call<{ userId?: string; id?: string; publicKey: string | null }[]>(`${BASE}/staff/public-keys`),

    // ── Client ──────────────────────────────────────────────────────────
    createTicket: (payload: CreateSupportTicketPayload) =>
        call<SupportTicketClientDTO>(`${BASE}/tickets`, { method: 'POST', body: payload }),
    listMyTickets: () => call<SupportTicketClientDTO[]>(`${BASE}/tickets`),
    /** Client : SupportTicketClientDTO (créateur) ; équipe : SupportTicketStaffDTO. */
    getTicket: (id: string) => call<SupportTicketDTO>(`${BASE}/tickets/${enc(id)}`),
    getTicketEvents: (id: string) => call<SupportTicketEventDTO[]>(`${BASE}/tickets/${enc(id)}/events`),
    closeTicket: (id: string) => call<SupportTicketClientDTO>(`${BASE}/tickets/${enc(id)}/close`, { method: 'POST' }),
    reopenTicket: (id: string) => call<SupportTicketClientDTO>(`${BASE}/tickets/${enc(id)}/reopen`, { method: 'POST' }),

    // ── Équipe ──────────────────────────────────────────────────────────
    listStaffTickets: (filters: SupportStaffTicketFilters = {}) => {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(filters)) if (v) params.set(k, String(v));
        const qs = params.toString();
        return call<SupportTicketStaffDTO[]>(`${BASE}/staff/tickets${qs ? `?${qs}` : ''}`);
    },
    claimTicket: (id: string, body: { priority: SupportTicketPriority; internalKey?: SupportStaffKeyIn }) =>
        call<SupportTicketStaffDTO>(`${BASE}/tickets/${enc(id)}/claim`, { method: 'POST', body }),
    createInternalKey: (id: string, key: SupportStaffKeyIn) =>
        call<{ success: true; created: boolean }>(`${BASE}/tickets/${enc(id)}/internal-key`, { method: 'POST', body: key }),
    transferTicket: (id: string, toUserId: string) =>
        call<SupportTicketStaffDTO>(`${BASE}/tickets/${enc(id)}/transfer`, { method: 'POST', body: { toUserId } }),
    releaseTicket: (id: string) =>
        call<SupportTicketStaffDTO>(`${BASE}/tickets/${enc(id)}/release`, { method: 'POST' }),
    patchTicket: (id: string, body: { priority?: SupportTicketPriority; status?: SupportTicketStatus }) =>
        call<SupportTicketStaffDTO>(`${BASE}/tickets/${enc(id)}`, { method: 'PATCH', body }),
    setTicketTags: (id: string, tagIds: string[]) =>
        call<SupportTicketStaffDTO>(`${BASE}/tickets/${enc(id)}/tags`, { method: 'PUT', body: { tagIds } }),
    getRequester: (id: string) => call<SupportRequesterDTO>(`${BASE}/tickets/${enc(id)}/requester`),
    listStaffMembers: () => call<SupportStaffMember[]>(`${BASE}/staff/members`),

    // ── Tags ────────────────────────────────────────────────────────────
    listTags: () => call<SupportTag[]>(`${BASE}/tags`),
    createTag: (body: { name: string; color: string }) => call<SupportTag>(`${BASE}/tags`, { method: 'POST', body }),
    updateTag: (id: string, body: { name?: string; color?: string }) =>
        call<SupportTag>(`${BASE}/tags/${enc(id)}`, { method: 'PATCH', body }),
    deleteTag: (id: string) => call<{ success: true }>(`${BASE}/tags/${enc(id)}`, { method: 'DELETE' }),
};

/** Rôles d'équipe côté panel admin (§5 « Admin »). */
export const supportAdminApi = {
    listModerators: () => call<string[]>('/api/admin/moderators'),
    addModerator: (userId: string, staffKeyShares?: { version: number; encryptedPrivateKey: string }[]) =>
        call<{ success: true; moderators: string[] }>(`/api/admin/moderators/${enc(userId)}`, { method: 'POST', body: { staffKeyShares } }),
    removeModerator: (userId: string) =>
        call<{ success: true; moderators: string[] }>(`/api/admin/moderators/${enc(userId)}`, { method: 'DELETE' }),
    addAdmin: (userId: string, staffKeyShares?: { version: number; encryptedPrivateKey: string }[]) =>
        call<{ success: true; admins: string[] }>(`/api/admin/admins/${enc(userId)}`, { method: 'POST', body: { staffKeyShares } }),
    removeAdmin: (userId: string) =>
        call<{ success: true; admins: string[] }>(`/api/admin/admins/${enc(userId)}`, { method: 'DELETE' }),
};
