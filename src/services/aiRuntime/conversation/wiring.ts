/**
 * Câblage réel de la liaison runtime : `sfetch` pour le ticket et le dépôt (API), `WebSocket` du
 * navigateur direct vers le runtime. Non couvert par les tests unitaires (tout passe par
 * `ConnectionDeps`) : à vérifier en recette.
 */
import sfetch from '@/assets/utils/sfetch';
import { wsUrl, type ConnectionDeps, type InboxItem, type SocketLike } from './connection';

const sessionPath = (orgId: string, sessionId: string) => `/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}`;

/** `https` obligatoire ; `http` seulement vers la boucle locale (build de développement). */
export function checkRuntimeUrl(raw: string, allowDevHttp: boolean): string {
    let u: URL;
    try { u = new URL(raw); } catch { throw new Error('runtime_url_invalid'); }
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(allowDevHttp && local && u.protocol === 'http:')) throw new Error('runtime_url_invalid');
    return u.toString();
}

export function createConnectionDeps(orgId: string, sessionId: string, ck: CryptoKey, allowDevHttp: boolean, expectedOrigin: string | null = null): ConnectionDeps {
    return {
        sessionId,
        ck,
        async fetchTicket() {
            const res = await sfetch(`${sessionPath(orgId, sessionId)}/runtime-ticket`, { method: 'POST' });
            if (!res.ok) throw new Error(`ticket_${res.status}`);
            const body = await res.json() as { ticket?: unknown; url?: unknown };
            if (typeof body.ticket !== 'string' || typeof body.url !== 'string') throw new Error('ticket_invalid');
            const checked = checkRuntimeUrl(body.url, allowDevHttp);
            // Le ticket n'est présenté qu'au runtime enregistré pour l'org, jamais à une autre origine.
            if (expectedOrigin && new URL(checked).origin !== expectedOrigin) throw new Error('runtime_origin_mismatch');
            return { ticket: body.ticket, url: wsUrl(checked, sessionId) };
        },
        openSocket(url: string): SocketLike {
            const ws = new WebSocket(url);
            const sock: SocketLike = {
                send: d => ws.send(d),
                close: (code, reason) => ws.close(code, reason),
                onopen: null, onmessage: null, onclose: null, onerror: null,
            };
            ws.onopen = () => sock.onopen?.();
            ws.onmessage = ev => sock.onmessage?.({ data: ev.data });
            ws.onclose = ev => sock.onclose?.({ code: ev.code, reason: ev.reason });
            ws.onerror = () => sock.onerror?.();
            return sock;
        },
        async deposit(item: InboxItem) {
            const res = await sfetch(`${sessionPath(orgId, sessionId)}/inbox`, { method: 'POST', body: JSON.stringify(item) });
            return res.status;
        },
        setTimeout: (fn, ms) => setTimeout(fn, ms),
        clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>),
        random: () => Math.random(),
        uuid: () => crypto.randomUUID(),
        nowIso: () => new Date().toISOString(),
    };
}

/** `pendingToolCall` de la conversation (plan à valider), lu par l'API ; `null` s'il n'y en a pas. */
export async function fetchPendingToolCall(orgId: string, sessionId: string): Promise<unknown> {
    const res = await sfetch(sessionPath(orgId, sessionId));
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as { pendingToolCall?: unknown } | null;
    return body?.pendingToolCall ?? null;
}
