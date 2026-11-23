/**
 * Banc d'essai du service runtime (tests unitaires seulement, jamais importé par l'app) : faux
 * runtime (vraies clés WebCrypto, vrai défi), fausse API enregistrant chaque requête, magasin en
 * mémoire, horloge manuelle.
 */
import {
    canonicalRuntimeEcJwk,
    respondChallenge,
    runtimeFingerprintHex,
    signRuntimeCertificate,
    toB64u,
    type ChallengeRequest,
    type RuntimeCertificate,
    type RuntimePublicKeys,
} from '@/assets/utils/runtimeCert';
import type { SignatureTrust } from '@/assets/utils/keyTrust';
import type { AiRuntimeDeps, HttpMethod, HttpResult, KeyRef } from './ports';

export const ORG = 'cm3orgexample0000000000001';
export const OTHER_ORG = 'cm3orgother00000000000002';
export const ADMIN = '11111111-2222-4333-8444-555555555555';
export const USER = '66666666-7777-4888-9999-aaaaaaaaaaaa';
export const URL_RT = 'https://runtime.example.com';

const ecdh = () => crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as Promise<CryptoKeyPair>;
const ecdsa = () => crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as Promise<CryptoKeyPair>;
export const pubJwk = async (k: CryptoKey) => canonicalRuntimeEcJwk(await crypto.subtle.exportKey('jwk', k));

export interface FakeRuntime {
    runtimeId: string;
    url: string;
    kex: CryptoKeyPair;
    csk: CryptoKeyPair;
    keys: RuntimePublicKeys;
    fprHex: string;
    /** Le runtime répond au défi avec d'autres clés (imposteur sans `kex_priv` / `csk_priv`). */
    impostor?: { kex: CryptoKeyPair; csk: CryptoKeyPair };
    orgId: string | null;
    challenges: number;
}

export async function makeRuntime(orgId: string | null = ORG): Promise<FakeRuntime> {
    const kex = await ecdh(), csk = await ecdsa();
    const runtimeId = crypto.randomUUID();
    const keys = { sig: toB64u(crypto.getRandomValues(new Uint8Array(32))), kex: await pubJwk(kex.publicKey), csk: await pubJwk(csk.publicKey) };
    return { runtimeId, url: URL_RT, kex, csk, keys, fprHex: await runtimeFingerprintHex(runtimeId, keys), orgId, challenges: 0 };
}

export interface Person {
    id: string;
    sign: CryptoKeyPair;
    signPub: string;
    rsa: CryptoKeyPair;
    rsaPub: string;
}

export async function makePerson(id: string): Promise<Person> {
    const sign = await ecdsa();
    const rsa = (await crypto.subtle.generateKey(
        { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['encrypt', 'decrypt'],
    )) as CryptoKeyPair;
    return { id, sign, signPub: await pubJwk(sign.publicKey), rsa, rsaPub: JSON.stringify(await crypto.subtle.exportKey('jwk', rsa.publicKey)) };
}

export async function certify(rt: FakeRuntime, admin: Person, orgId = ORG, serial = 1): Promise<Record<string, unknown>> {
    const cert: RuntimeCertificate = { orgId, runtimeId: rt.runtimeId, url: rt.url, keys: rt.keys, adminId: admin.id, issuedAt: 1_795_000_000, serial };
    const signature = await signRuntimeCertificate(admin.sign.privateKey, cert);
    return { v: 1, ...cert, keys: { sig: rt.keys.sig, kex: JSON.parse(rt.keys.kex), csk: JSON.parse(rt.keys.csk) }, signature };
}

export interface Recorded {
    method: HttpMethod;
    path: string;
    body: unknown;
}

export interface Timer {
    at: number;
    fn: () => void;
    id: number;
}

export interface Harness {
    deps: AiRuntimeDeps;
    requests: Recorded[];
    store: Map<string, unknown>;
    rt: FakeRuntime;
    admin: Person;
    user: Person;
    /** Vue du registre servie par `GET …/ai/runtime`. */
    registry: { runtime: Record<string, unknown> | null; allowedForMe: boolean; policy: Record<string, unknown> };
    /** Réponses programmables de l'API : rend `undefined` pour la réponse par défaut. */
    override: (method: HttpMethod, path: string, body: unknown) => HttpResult | undefined;
    /** Clés « ouvrables » localement : `kind|ref|version` → octets. */
    held: Map<string, Uint8Array>;
    opened: KeyRef[];
    /** Clés manquantes servies par `GET …/current/missing`. */
    missing: unknown[];
    threads: Set<string>;
    spaces: Set<string>;
    trust: (userId: string) => SignatureTrust | null;
    signKeys: Map<string, string>;
    now: { t: number; ms: number };
    timers: Timer[];
    current: Record<string, unknown> | null;
    mandates: Map<string, Record<string, unknown>>;
    advance(ms: number): Promise<void>;
}

const flush = async () => {
    for (let i = 0; i < 50; i++) await Promise.resolve();
};

export async function makeHarness(options: { rt?: FakeRuntime; admin?: Person; user?: Person } = {}): Promise<Harness> {
    const rt = options.rt ?? (await makeRuntime());
    const admin = options.admin ?? (await makePerson(ADMIN));
    const user = options.user ?? (await makePerson(USER));
    const h = {
        requests: [] as Recorded[],
        store: new Map<string, unknown>(),
        rt,
        admin,
        user,
        registry: {
            runtime: { runtimeId: rt.runtimeId, url: rt.url, certificate: await certify(rt, admin), certSerial: 1, online: true, signer: { adminId: admin.id, isAdmin: true } },
            allowedForMe: true,
            policy: { enabled: true, maxDelegationDays: 7 },
        } as Harness['registry'],
        override: (() => undefined) as Harness['override'],
        held: new Map<string, Uint8Array>(),
        opened: [] as KeyRef[],
        missing: [] as unknown[],
        threads: new Set<string>(),
        spaces: new Set<string>(),
        trust: (() => null) as Harness['trust'],
        signKeys: new Map<string, string>([[admin.id, admin.signPub], [user.id, user.signPub]]),
        now: { t: 1_795_000_000, ms: 0 },
        timers: [] as Timer[],
        current: null as Record<string, unknown> | null,
        mandates: new Map<string, Record<string, unknown>>(),
    } as Omit<Harness, 'deps' | 'advance'> as Harness;
    let timerId = 0;

    const api = async (method: HttpMethod, path: string, body?: unknown): Promise<HttpResult> => {
        h.requests.push({ method, path, body: body === undefined ? undefined : JSON.parse(JSON.stringify(body)) });
        const o = h.override(method, path, body);
        if (o) return o;
        const d = `/api/orgs/${ORG}/ai/runtime/delegations`;
        if (method === 'GET' && path === `/api/orgs/${ORG}/ai/runtime`) return { status: 200, body: h.registry };
        if (method === 'POST' && path === `/api/orgs/${ORG}/ai/runtime`) return { status: 201, body: { runtime: {}, recertified: false } };
        if (method === 'POST' && path === d) {
            const b = body as Record<string, unknown>;
            h.current = { delegationId: b.delegationId, runtimeId: b.runtimeId, scope: 'org', iat: b.iat, exp: b.exp, status: 'active', runtimeStatus: 'online', entryCount: 0, mandateVersion: b.mandateVersion, mode: b.mode };
            const { sha256, toB64u: b64u } = await import('@/assets/utils/runtimeCert');
            h.mandates.set(String(b.delegationId), {
                delegationId: b.delegationId, userId: USER, orgId: ORG, runtimeId: b.runtimeId, scope: 'org', iat: b.iat, exp: b.exp,
                wrapHash: b64u(await sha256(new TextEncoder().encode(String(b.wrap)))), signature: b.mandateSignature,
                version: b.mandateVersion, mode: b.mode, ownerRsaSpkiHex: b.ownerRsaSpkiHex, certificate: null,
            });
            return { status: 201, body: h.current };
        }
        if (method === 'GET' && path === `${d}/current`) return { status: 200, body: { delegation: h.current } };
        if (method === 'GET' && path === `${d}/current/missing`) return h.current ? { status: 200, body: h.missing } : { status: 404, body: { error: 'not_found' } };
        if (method === 'DELETE' && path === `${d}/current`) {
            const id = h.current?.delegationId;
            h.current = null;
            return { status: 200, body: { revoked: id ? [id] : [] } };
        }
        const entries = /^\/api\/orgs\/[^/]+\/ai\/runtime\/delegations\/([^/]+)\/entries$/.exec(path);
        if (method === 'POST' && entries) {
            const list = (body as { entries: unknown[] }).entries;
            if (h.current) h.current.entryCount = Number(h.current.entryCount) + list.length;
            return { status: 201, body: { added: list.length } };
        }
        const mandate = /^\/api\/orgs\/[^/]+\/ai\/runtime\/delegations\/([^/]+)\/mandate$/.exec(path);
        if (method === 'GET' && mandate) {
            const m = h.mandates.get(decodeURIComponent(mandate[1]!));
            return m ? { status: 200, body: m } : { status: 404, body: { error: 'not_found' } };
        }
        if (path.endsWith('/autonomous_mode/opt-in')) return { status: 200, body: { feature: 'autonomous_mode', enabled: method === 'PUT' } };
        return { status: 404, body: { error: 'not_found' } };
    };

    const deps: AiRuntimeDeps = {
        api: { request: api },
        runtime: {
            async identity(url) {
                if (url !== rt.url) return { status: 404, body: null };
                return { status: 200, body: { v: 1, runtimeId: rt.runtimeId, url: rt.url, keys: { sig: rt.keys.sig, kex: JSON.parse(rt.keys.kex), csk: JSON.parse(rt.keys.csk) }, fingerprint: rt.fprHex, orgId: rt.orgId } };
            },
            async challenge(_url, body) {
                rt.challenges++;
                const b = body as ChallengeRequest & { clientEph: object };
                const req: ChallengeRequest = { purpose: b.purpose, orgId: b.orgId, userId: b.userId, nonce: b.nonce, clientEph: canonicalRuntimeEcJwk(b.clientEph) };
                const k = rt.impostor ?? { kex: rt.kex, csk: rt.csk };
                const r = await respondChallenge(req, rt.runtimeId, rt.fprHex, k.kex.privateKey, k.csk.privateKey);
                return { status: 200, body: { v: 1, runtimeId: rt.runtimeId, ...r } };
            },
        },
        store: {
            get: async key => h.store.get(key),
            set: async (key, value) => void h.store.set(key, JSON.parse(JSON.stringify(value))),
        },
        identity: {
            userId: () => user.id,
            signKey: () => user.sign.privateKey,
            publicSignKey: () => user.signPub,
            verifiedRsaPublicKey: async () => user.rsaPub,
        },
        signTrust: {
            async verify(userId, _served, verify) {
                const forced = h.trust(userId);
                if (forced) return forced;
                const k = h.signKeys.get(userId);
                if (!k) return 'unknown';
                return (await verify(k)) ? 'trusted' : 'none';
            },
        },
        directory: {
            signKeyOf: (_org, userId) => h.signKeys.get(userId) ?? null,
            hasThread: (orgId, id) => orgId === ORG && h.threads.has(id),
            hasSpace: (orgId, id) => orgId === ORG && h.spaces.has(id),
        },
        keys: {
            async open(_orgId, key) {
                h.opened.push(key);
                const raw = h.held.get(`${key.kind}|${key.ref}|${key.version}`);
                return raw ? raw.slice() : null;
            },
        },
        clock: {
            now: () => h.now.t,
            setTimeout: (fn, ms) => {
                const t = { at: h.now.ms + ms, fn, id: ++timerId };
                h.timers.push(t);
                return t.id;
            },
            clearTimeout: id => {
                h.timers = h.timers.filter(t => t.id !== id);
            },
        },
        allowDevHttp: false,
    };
    h.deps = deps;
    h.advance = async (ms: number) => {
        const target = h.now.ms + ms;
        for (;;) {
            await flush();
            h.timers.sort((a, b) => a.at - b.at);
            const next = h.timers[0];
            if (!next || next.at > target) break;
            h.timers.shift();
            h.now.t += Math.floor((next.at - h.now.ms) / 1000);
            h.now.ms = next.at;
            next.fn();
        }
        h.now.t += Math.floor((target - h.now.ms) / 1000);
        h.now.ms = target;
        await flush();
    };
    return h;
}
