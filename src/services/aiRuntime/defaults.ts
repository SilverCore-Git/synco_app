/**
 * Câblage réel du service runtime : `sfetch` pour l'API, `fetch` direct vers le runtime, IndexedDB
 * (`idb-keyval`) pour les épingles, identité déverrouillée de `crypto.ts`, annuaire de l'org ouverte.
 * Non couvert par les tests unitaires (tout passe par les ports) : à vérifier en recette.
 */
import { get, set } from 'idb-keyval';
import sfetch from '@/assets/utils/sfetch';
import { openedOrg, user } from '@/assets/var';
import { assertOwnPublicKeyMatches, privateKey, privateSignKey, unwrapAiSessionKey } from '@/assets/utils/crypto';
import { lookupCreatorSignKey, verifyWithSignKeys } from '@/assets/utils/keyTrust';
import { verifyKeyEnvelopeIfPresent } from '@/assets/utils/keyEnvelope';
import { pinOrCheckKey, type KeyContext } from '@/assets/utils/keyPinning';
import useWSocket from '@/composables/useWSocket';
import type { Org, Thread } from '@/types/types';
import type { AiRuntimeDeps, HttpMethod, HttpResult, KeyRef } from './ports';

const DIRECT_TIMEOUT_MS = 10_000;
const THREAD_KEY_TIMEOUT_MS = 15_000;

async function readJson(res: Response): Promise<unknown> {
    try {
        return await res.json();
    } catch {
        return null;
    }
}

async function directFetch(url: string, init: RequestInit): Promise<HttpResult> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), DIRECT_TIMEOUT_MS);
    try {
        // Requête directe au runtime : sans cookie ni jeton de l'API (01 §4, §5).
        const res = await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: ctrl.signal });
        return { status: res.status, body: await readJson(res) };
    } finally {
        clearTimeout(timer);
    }
}

function orgThreadIds(org: Org): Set<string> {
    const ids = new Set<string>();
    const add = (threads: Thread[] | undefined) => threads?.forEach(t => ids.add(t.id));
    add(org.home?.threads);
    org.home?.categories?.forEach(c => add(c.threads));
    org.spaces?.forEach(s => {
        add(s.threads);
        s.categories?.forEach(c => add(c.threads));
    });
    return ids;
}

const toBytes = (buf: ArrayBuffer): Uint8Array => new Uint8Array(buf);

interface ServedKey {
    encryptedKey?: unknown;
    version?: unknown;
    creatorId?: string | null;
    commitment?: string | null;
    signature?: string | null;
    error?: string;
}

/** Scellé RSA → octets ; enveloppe FC4 vérifiée si présente ; épinglage FC4 ; sinon `null`. */
async function openSealed(data: ServedKey, ctx: KeyContext, version: number): Promise<Uint8Array | null> {
    if (typeof data.encryptedKey !== 'string' || !privateKey.value) return null;
    const raw = await unwrapAiSessionKey(data.encryptedKey, privateKey.value);
    const bytes = toBytes(raw);
    try {
        if (bytes.length !== 32) throw new Error('longueur');
        await verifyKeyEnvelopeIfPresent(raw, ctx, version, data);
        await pinOrCheckKey(raw, ctx, version);
        return bytes;
    } catch (e) {
        bytes.fill(0);
        throw e;
    }
}

async function openThreadKey(threadId: string): Promise<Uint8Array | null> {
    const socket = (await useWSocket()).value;
    if (!socket) return null;
    const response: ServedKey = await new Promise(resolve => {
        socket.timeout(THREAD_KEY_TIMEOUT_MS).emit('get-thread-access', { threadId }, (err: Error | null, res: ServedKey) => {
            resolve(err || !res ? { error: 'timeout' } : res);
        });
    });
    return openSealed(response, `thread:${threadId}`, 1);
}

async function openSpaceKey(spaceId: string, version: number): Promise<Uint8Array | null> {
    const res = await sfetch(`/api/spaces/${encodeURIComponent(spaceId)}/key`, { method: 'GET' });
    if (!res.ok) return null;
    const data = (await readJson(res)) as ServedKey | null;
    // Seule la version la plus récente détenue est servie : une version antérieure n'est pas ouvrable ici.
    if (!data || data.version !== version) return null;
    return openSealed(data, `space:${spaceId}`, version);
}

async function openConversationKeyBytes(orgId: string, sessionId: string, version: number): Promise<Uint8Array | null> {
    const res = await sfetch(`/api/orgs/${encodeURIComponent(orgId)}/ai/sessions/${encodeURIComponent(sessionId)}/key`, { method: 'GET' });
    if (!res.ok) return null;
    const data = (await readJson(res)) as ServedKey | null;
    if (!data || data.version !== version) return null;
    return openSealed(data, `aiconv:${sessionId}`, version);
}

export function createDefaultAiRuntimeDeps(): AiRuntimeDeps {
    return {
        api: {
            async request(method: HttpMethod, path: string, body?: unknown): Promise<HttpResult> {
                const res = await sfetch(path, body === undefined ? { method } : { method, body: JSON.stringify(body) });
                return { status: res.status, body: await readJson(res) };
            },
        },
        runtime: {
            identity: url => directFetch(`${url}/v1/identity`, { method: 'GET' }),
            challenge: (url, body) => directFetch(`${url}/v1/challenge`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        },
        store: {
            get: key => get(key),
            set: (key, value) => set(key, value),
        },
        identity: {
            userId: () => user.value?.id ?? null,
            signKey: () => privateSignKey.value,
            publicSignKey: () => user.value?.publicSignKey ?? null,
            async verifiedRsaPublicKey() {
                const pub = user.value?.publicKey ?? null;
                if (!pub || !privateKey.value) return null;
                try {
                    await assertOwnPublicKeyMatches(pub, privateKey.value);
                    return pub;
                } catch {
                    return null;
                }
            },
        },
        signTrust: { verify: (userId, served, verify) => verifyWithSignKeys(userId, served, verify) },
        directory: {
            signKeyOf: (orgId, userId) => (openedOrg.value?.id === orgId ? lookupCreatorSignKey(userId) : null),
            hasThread: (orgId, threadId) => openedOrg.value?.id === orgId && orgThreadIds(openedOrg.value).has(threadId),
            hasSpace: (orgId, spaceId) => openedOrg.value?.id === orgId && !!openedOrg.value.spaces?.some(s => s.id === spaceId),
        },
        keys: {
            open(orgId: string, key: KeyRef) {
                if (key.kind === 'thread') return openThreadKey(key.ref);
                if (key.kind === 'space') return openSpaceKey(key.ref, key.version);
                return openConversationKeyBytes(orgId, key.ref, key.version);
            },
        },
        clock: {
            now: () => Math.floor(Date.now() / 1000),
            setTimeout: (fn, ms) => setTimeout(fn, ms),
            clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
        },
        allowDevHttp: import.meta.env.DEV === true,
    };
}
