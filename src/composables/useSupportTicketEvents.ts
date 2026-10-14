import { getCurrentScope, onScopeDispose, ref, shallowRef, toValue, watch, type MaybeRefOrGetter } from 'vue';
import type { Socket } from 'socket.io-client';
import { user } from '@/assets/var';
import {
    isStaffTicket,
    type SupportStaffTicketFilters,
    type SupportTicketClientDTO,
    type SupportTicketDTO,
    type SupportTicketEventDTO,
    type SupportTicketStaffDTO,
} from '@/types/support';
import { supportApi } from '@/services/support/api';
import { emitWithAck, getSupportSocket } from '@/services/support/socket';
import { resolveTicketTitle } from '@/services/support/tickets';

/**
 * Temps réel des tickets (SUPPORT_FEATURE.md §6) : `support:ticket-updated`,
 * `support:ticket-created` (équipe) et `support:event`. Pour l'équipe, le
 * socket rejoint la room `support-staff` (`support:subscribe-staff`), et la
 * rejoint de nouveau après une reconnexion.
 *
 * `scope` choisit la projection : un membre de l'équipe qui a lui-même
 * ouvert un ticket reçoit les deux (client sur `user:<id>`, équipe sur
 * `support-staff`) ; seule celle demandée est transmise.
 */

export interface SupportTicketEventsOptions {
    scope: 'client' | 'staff';
    /** Ne transmettre que ce ticket (vue d'un ticket) ; absent : tous. */
    ticketId?: MaybeRefOrGetter<string | null | undefined>;
    onTicketUpdated?: (ticket: SupportTicketDTO) => void;
    /** Équipe seulement. */
    onTicketCreated?: (ticket: SupportTicketStaffDTO) => void;
    onEvent?: (event: SupportTicketEventDTO) => void;
}

// L'API émet `{ scope, ticket }` (et non le DTO seul comme l'écrit la spec) :
// on accepte les deux formes.
type TicketUpdatedPayload = { scope?: 'client' | 'staff'; ticket?: SupportTicketDTO } | SupportTicketDTO;

const unwrapUpdated = (payload: TicketUpdatedPayload): { scope: 'client' | 'staff'; ticket: SupportTicketDTO } | null => {
    if (!payload || typeof payload !== 'object') return null;
    if ('ticket' in payload && payload.ticket) {
        return { scope: payload.scope ?? (isStaffTicket(payload.ticket) ? 'staff' : 'client'), ticket: payload.ticket };
    }
    const t = payload as SupportTicketDTO;
    if (!t.id) return null;
    return { scope: isStaffTicket(t) ? 'staff' : 'client', ticket: t };
};

// Un événement STATUS_CHANGED émis à l'envoi d'un message est la ligne brute
// (actorId, sans `actor`) : normalisé en DTO.
const normalizeEvent = (raw: SupportTicketEventDTO & { actorId?: string | null }): SupportTicketEventDTO => ({
    id: raw.id,
    ticketId: raw.ticketId,
    type: raw.type,
    actor: raw.actor ?? null,
    data: raw.data ?? null,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(raw.createdAt).toISOString(),
});

/**
 * S'abonne aux événements de ticket. Désabonnement automatique à la
 * destruction du scope appelant (composant), ou via la fonction renvoyée.
 */
export function useSupportTicketEvents(options: SupportTicketEventsOptions): () => void {
    let socket: Socket | null = null;
    let disposed = false;

    const matches = (ticketId: string) => {
        const only = toValue(options.ticketId);
        return !only || only === ticketId;
    };

    const onUpdated = (payload: TicketUpdatedPayload) => {
        const u = unwrapUpdated(payload);
        if (!u || u.scope !== options.scope || !matches(u.ticket.id)) return;
        options.onTicketUpdated?.(u.ticket);
    };
    const onCreated = (ticket: SupportTicketStaffDTO) => {
        if (options.scope !== 'staff' || !ticket?.id || !matches(ticket.id)) return;
        options.onTicketCreated?.(ticket);
    };
    const onEvent = (raw: SupportTicketEventDTO) => {
        if (!raw?.ticketId || !matches(raw.ticketId)) return;
        options.onEvent?.(normalizeEvent(raw));
    };
    const subscribeStaff = () => {
        if (options.scope !== 'staff' || !socket) return;
        emitWithAck(socket, 'support:subscribe-staff', {})
            .catch((e) => console.warn('[Support] Abonnement équipe refusé :', (e as Error).message));
    };

    void getSupportSocket().then((s) => {
        if (disposed) return;
        socket = s;
        s.on('support:ticket-updated', onUpdated);
        s.on('support:ticket-created', onCreated);
        s.on('support:event', onEvent);
        // Les rooms sont perdues à la reconnexion : on rejoint de nouveau.
        s.on('connect', subscribeStaff);
        subscribeStaff();
    }).catch((e) => console.warn('[Support] Socket indisponible :', (e as Error).message));

    const stop = () => {
        disposed = true;
        if (!socket) return;
        socket.off('support:ticket-updated', onUpdated);
        socket.off('support:ticket-created', onCreated);
        socket.off('support:event', onEvent);
        socket.off('connect', subscribeStaff);
        socket = null;
    };
    if (getCurrentScope()) onScopeDispose(stop);
    return stop;
}


// ---------------------------------------------------------------------------
// Listes prêtes à l'emploi
// ---------------------------------------------------------------------------

const byLastMessageDesc = (a: { lastMessageAt: string }, b: { lastMessageAt: string }) =>
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();

/** Titres déchiffrés, par id de ticket (null : pas de titre). */
function useTitles() {
    const titles = ref<Record<string, string | null>>({});
    const decryptTitles = async (list: SupportTicketDTO[]) => {
        await Promise.all(list.map(async (t) => {
            titles.value[t.id] = await resolveTicketTitle(t);
        }));
    };
    return { titles, decryptTitles };
}

/**
 * Tickets de l'utilisateur (vue client), triés par dernier message, tenus à
 * jour en temps réel, titres déchiffrés.
 */
export function useClientSupportTickets() {
    const tickets = shallowRef<SupportTicketClientDTO[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const { titles, decryptTitles } = useTitles();

    const reload = async () => {
        loading.value = true;
        error.value = null;
        try {
            const list = await supportApi.listMyTickets();
            tickets.value = list.sort(byLastMessageDesc);
            void decryptTitles(list);
        } catch (e) {
            error.value = (e as Error).message;
        } finally {
            loading.value = false;
        }
    };

    const upsert = (t: SupportTicketClientDTO) => {
        const rest = tickets.value.filter(x => x.id !== t.id);
        tickets.value = [...rest, t].sort(byLastMessageDesc);
        void decryptTitles([t]);
    };

    useSupportTicketEvents({
        scope: 'client',
        onTicketUpdated: (t) => { if (!isStaffTicket(t)) upsert(t); },
    });

    void reload();
    return { tickets, titles, loading, error, reload, upsert };
}

/** Le ticket correspond-il aux filtres de la liste équipe (mêmes règles que GET /staff/tickets) ? */
export function matchesStaffFilters(t: SupportTicketStaffDTO, f: SupportStaffTicketFilters): boolean {
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.assignee === 'me' && t.assignee?.id !== user.value?.id) return false;
    if (f.assignee === 'none' && t.assignee) return false;
    if (f.assignee && f.assignee !== 'me' && f.assignee !== 'none' && t.assignee?.id !== f.assignee) return false;
    if (f.tag && !t.tags.some(tag => tag.id === f.tag)) return false;
    if (f.orgId && t.organization?.id !== f.orgId) return false;
    return true;
}

/**
 * Liste filtrable de l'équipe (pages de 50, `loadMore`), tenue à jour en
 * temps réel : un ticket modifié qui ne correspond plus aux filtres sort de
 * la liste, un ticket créé ou modifié qui y correspond y entre.
 */
export function useStaffSupportTickets(filters: MaybeRefOrGetter<Omit<SupportStaffTicketFilters, 'cursor'>>) {
    const tickets = shallowRef<SupportTicketStaffDTO[]>([]);
    const loading = ref(false);
    const hasMore = ref(true);
    const error = ref<string | null>(null);
    const { titles, decryptTitles } = useTitles();
    let generation = 0;

    const PAGE = 50;

    const reload = async () => {
        const gen = ++generation;
        loading.value = true;
        error.value = null;
        try {
            const list = await supportApi.listStaffTickets({ ...toValue(filters) });
            if (gen !== generation) return;
            tickets.value = list;
            hasMore.value = list.length >= PAGE;
            void decryptTitles(list);
        } catch (e) {
            if (gen === generation) error.value = (e as Error).message;
        } finally {
            if (gen === generation) loading.value = false;
        }
    };

    const loadMore = async () => {
        const last = tickets.value[tickets.value.length - 1];
        if (!last || loading.value || !hasMore.value) return;
        const gen = generation;
        loading.value = true;
        try {
            const list = await supportApi.listStaffTickets({ ...toValue(filters), cursor: last.id });
            if (gen !== generation) return;
            const known = new Set(tickets.value.map(t => t.id));
            tickets.value = [...tickets.value, ...list.filter(t => !known.has(t.id))];
            hasMore.value = list.length >= PAGE;
            void decryptTitles(list);
        } catch (e) {
            error.value = (e as Error).message;
        } finally {
            if (gen === generation) loading.value = false;
        }
    };

    const apply = (t: SupportTicketStaffDTO) => {
        const rest = tickets.value.filter(x => x.id !== t.id);
        tickets.value = matchesStaffFilters(t, toValue(filters))
            ? [...rest, t].sort(byLastMessageDesc)
            : rest;
        void decryptTitles([t]);
    };

    useSupportTicketEvents({
        scope: 'staff',
        onTicketUpdated: (t) => { if (isStaffTicket(t)) apply(t); },
        onTicketCreated: apply,
    });

    watch(() => JSON.stringify(toValue(filters)), () => { void reload(); }, { immediate: true });
    return { tickets, titles, loading, hasMore, error, reload, loadMore, apply };
}
