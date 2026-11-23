/**
 * L10b : corps de `switch-to-runtime` (04 §5) d'une conversation existante, rejoué contre le banc de
 * L10 (vraie délégation, vraie `kex` du faux runtime) et les vecteurs `conversation-fields.json`
 * (synco_ai_runtime/crates/synco-e2ee/tests/vectors, 03 §6.3).
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { openDelegationEntry, openDelegationWrap, type DelegationContext } from '@/assets/utils/runtimeDelegation';
import { verifyKeyEnvelope } from '@/assets/utils/keyEnvelope';
import { decryptAiFieldStrict, encryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { AiRuntimeError } from './errors';
import { clearDelegationKeys, createDelegation, isKnownRuntimeConversation } from './delegation';
import { verifyRuntimeForDelegation } from './runtimeTrust';
import { ORG, USER, makeHarness, type Harness } from './testHarness';
import {
    SWITCH_MAX_MESSAGES,
    buildSwitchToRuntimeBody,
    createSwitchBodyBuilder,
    decryptConversationHistory,
    displayToStoredMessages,
    encryptConversationHistory,
    type PlainStoredMessage,
    type SwitchHistorySource,
    type SwitchToRuntimeBody,
} from './switchBody';
import { switchConversationToRuntime } from '../aiRuntimeUi';

// Vecteurs (conversation-fields.json) : CK = 0xdd × 32, AiSessionKey = 0x5c × 32.
const S = '0f0e0d0c-0b0a-4908-8706-050403020100';
const M = '3c2b1a09-8f7e-4d6c-9b5a-493827161504';
const CK_VEC = new Uint8Array(32).fill(0xdd);
const AK_VEC = new Uint8Array(32).fill(0x5c);
const V = {
    ck: {
        content: 'gcm1:ERERERERERERERERSe7orpnncXfmR2L782DWQHkFGxDbHbtDNUIeceugY58PtiPvx+NipiaE',
        thinking: 'gcm1:EhISEhISEhISEhIS02McDx2hh72COGsb0bGCkptK0mq+0okgBfoEeFTaBFh+NTyOfA==',
        toolResult: 'gcm1:ExMTExMTExMTExMT+4qWkJd/maR7mwzPqNXvRhde+GpVh6fRunZFn+/lkIRHxgEDNynn0MiK5Q==',
        args: 'gcm1:FBQUFBQUFBQUFBQU+OFCwqrqsQMy2c6LHEWe+4hS7hRoKTi3sNiHbnabSdmCQ9lVOIotU9IxGKTW',
        title: 'gcm1:FhYWFhYWFhYWFhYWWTkrEywa2SL3Qex4Zv9xVcxtD1EWUjCJVy5oJrtkIgUuP78DPA==',
    },
    ak: {
        content: 'gcm1:HR0dHR0dHR0dHR0dQW/wjlYF/MsjifHewZ26WiiuRUYD9A3IJWrEKJrCXSZUOG249z32q8VX',
        thinking: 'gcm1:Hh4eHh4eHh4eHh4eTVeNrG3BUH1iZOVmrc81iRnLZMHIk0ouj1WWxlgsSaEsHdyxbg==',
        toolResult: 'gcm1:Hx8fHx8fHx8fHx8fUD109Pt4NBrY6ouF26HfczQMFshfcLglK6f18FzeiZgaCM5hjcfGL9EfpA==',
        args: 'gcm1:ICAgICAgICAgICAg/4vbJ8btifRrKI7U9bKkhEUHARKSHOcWoREZlp+SUVMLgSUIbIttNgNmOyyi',
        title: 'gcm1:IiIiIiIiIiIiIiIi5mBbVmPCk9vCaSgh5XxeS4DrqTFzKihJmQZxdy2ofIp6rH5Vjg==',
    },
    plain: { content: 'Bonjour depuis le runtime.', thinking: 'Je réfléchis… ✓', toolResult: { ok: true, items: [1, 2, 3] }, args: { title: 'Créer une tâche' }, title: 'Préparer la réunion' },
};
/** Messages des vecteurs, champs chiffrés sous la clé donnée (tous liés à `M` par l'AAD). */
const vectorMessages = (k: typeof V.ck) => [
    { id: 'u1', role: 'user', content: null, createdAt: '2026-11-20T10:00:00.000Z' },
    {
        id: M, role: 'assistant', content: k.content, thinking: k.thinking, createdAt: '2026-11-20T10:00:01.000Z', usage: { totalTokens: 12 },
        toolCalls: [{ id: 'call_1', name: 'create_task', arguments: k.args, category: 'server', mutating: true, status: 'done' }], toolResult: k.toolResult,
    },
    { id: 't1', role: 'tool', content: null, toolCallId: 'call_1', createdAt: '2026-11-20T10:00:02.000Z' },
];
const vectorPlain: PlainStoredMessage[] = [
    { id: 'u1', role: 'user', content: null, createdAt: '2026-11-20T10:00:00.000Z' },
    {
        id: M, role: 'assistant', content: V.plain.content, thinking: V.plain.thinking, createdAt: '2026-11-20T10:00:01.000Z', usage: { totalTokens: 12 },
        toolCalls: [{ id: 'call_1', name: 'create_task', arguments: V.plain.args, category: 'server', mutating: true, status: 'done' }], toolResult: V.plain.toolResult,
    },
    { id: 't1', role: 'tool', content: null, toolCallId: 'call_1', createdAt: '2026-11-20T10:00:02.000Z' },
];

const importAes = (raw: Uint8Array) => crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof AiRuntimeError ? e.code : `autre:${String(e)}`));
const sessionPath = `/api/orgs/${ORG}/ai/sessions/${S}`;

interface Bench {
    h: Harness;
    delegationId: string;
    dk: Uint8Array;
    ctx: DelegationContext;
    session: Record<string, unknown>;
    served: Record<string, unknown> | null;
    /** Ce que `openClientBlob` rend ; `Error` = enveloppe illisible. */
    blobOpens: unknown;
    source: SwitchHistorySource;
}

async function bench(): Promise<Bench> {
    const h = await makeHarness();
    await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
    const summary = await createDelegation(h.deps, ORG, { mode: 'plan' });
    const dep = h.requests.find(r => r.method === 'POST' && r.path === `/api/orgs/${ORG}/ai/runtime/delegations`)!.body as Record<string, unknown>;
    const ctx: DelegationContext = { userId: USER, orgId: ORG, runtimeId: h.rt.runtimeId, delegationId: summary.delegationId, scope: 'org', iat: Number(dep.iat), exp: Number(dep.exp) };
    const dk = await openDelegationWrap(ctx, h.rt.kex.privateKey, h.rt.keys.kex, String(dep.wrap));
    const b: Bench = {
        h, delegationId: summary.delegationId, dk, ctx,
        session: { id: S, rev: 3, encryptionScheme: null, regime: 'server', title: 'Titre en clair', messages: [] },
        served: null,
        blobOpens: new Error('illisible'),
        source: {
            gatewayKey: async () => importAes(AK_VEC),
            openClientBlob: async () => { if (b.blobOpens instanceof Error) throw b.blobOpens; return b.blobOpens; },
        },
    };
    h.override = (method, path) => {
        if (method === 'GET' && path === sessionPath) return { status: 200, body: b.session };
        if (method === 'GET' && path === `${sessionPath}/key`) return b.served ? { status: 200, body: b.served } : { status: 404, body: { error: 'not_found' } };
        return undefined;
    };
    return b;
}

const build = (b: Bench) => buildSwitchToRuntimeBody(b.h.deps, b.source, { orgId: ORG, sessionId: S, runtimeId: b.h.rt.runtimeId, delegationId: b.delegationId });

/** Ce que fait le runtime : DK (kex) → entrée `conv` → CK. */
const runtimeOpensCk = (b: Bench, body: SwitchToRuntimeBody) => openDelegationEntry(b.dk, b.ctx, body.convEntry);

async function rsaUnwrap(b: Bench, encryptedKey: string): Promise<Uint8Array> {
    const bytes = Uint8Array.from(atob(encryptedKey), c => c.charCodeAt(0));
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, b.h.user.rsa.privateKey, bytes as BufferSource));
}

beforeEach(() => clearDelegationKeys());
afterEach(() => clearDelegationKeys());

describe('aller-retour avec le banc de L10', () => {
    test('CK neuve : corps exact, CK scellée pour soi (RSA + FC4 aiconv:), ouverte par le runtime, historique identique', async () => {
        const b = await bench();
        b.session.messages = [
            { id: 'u1', role: 'user', content: 'Bonjour', createdAt: '2026-11-20T10:00:00.000Z' },
            { id: 'a1', role: 'assistant', content: 'Salut', thinking: 'hmm', createdAt: '2026-11-20T10:00:01.000Z', toolCalls: [{ id: 'c1', name: 'list_tasks', arguments: { q: 'x' }, category: 'server', mutating: false, status: 'done' }], usage: { totalTokens: 4, junk: 1 } },
            { id: 't1', role: 'tool', content: null, toolCallId: 'c1', toolResult: { items: [] }, createdAt: '2026-11-20T10:00:02.000Z' },
        ];
        const body = await build(b);
        expect(Object.keys(body).sort()).toEqual(['baseRev', 'convEntry', 'convKey', 'delegationId', 'messages', 'runtimeId', 'title']);
        expect(body).toMatchObject({ runtimeId: b.h.rt.runtimeId, delegationId: b.delegationId, baseRev: 3, convEntry: { kind: 'conv', ref: S, version: 1 } });
        expect(await isKnownRuntimeConversation(b.h.deps, ORG, S)).toBe(true);

        const ck = await runtimeOpensCk(b, body);
        expect(ck).toEqual(await rsaUnwrap(b, body.convKey!.encryptedKey));
        await verifyKeyEnvelope(ck.slice().buffer, { ctx: `aiconv:${S}`, version: 1, commitment: body.convKey!.commitment!, signature: body.convKey!.signature! }, b.h.user.signPub);

        const back = await decryptConversationHistory(ck, S, body.messages, true);
        expect(back).toEqual([
            { id: 'u1', role: 'user', content: 'Bonjour', createdAt: '2026-11-20T10:00:00.000Z' },
            { id: 'a1', role: 'assistant', content: 'Salut', thinking: 'hmm', createdAt: '2026-11-20T10:00:01.000Z', toolCalls: [{ id: 'c1', name: 'list_tasks', arguments: { q: 'x' }, category: 'server', mutating: false, status: 'done' }], usage: { totalTokens: 4 } },
            { id: 't1', role: 'tool', content: null, toolCallId: 'c1', toolResult: { items: [] }, createdAt: '2026-11-20T10:00:02.000Z' },
        ]);
        expect(await decryptAiFieldStrict(ck, S, '__session_title__', 'title', body.title)).toBe('Titre en clair');
    });

    test('ancien format gateway (vecteurs AiSessionKey) : rechiffré sous CK, déchiffré = original', async () => {
        const b = await bench();
        b.session.messages = vectorMessages(V.ak);
        b.session.title = V.ak.title;
        const body = await build(b);
        const ck = await runtimeOpensCk(b, body);
        expect(await decryptConversationHistory(ck, S, body.messages, true)).toEqual(vectorPlain);
        expect(await decryptAiFieldStrict(ck, S, '__session_title__', 'title', body.title)).toBe(V.plain.title);
        // Rechiffré : plus aucune valeur sous AiSessionKey.
        const wire = JSON.stringify(body);
        for (const v of Object.values(V.ak)) expect(wire).not.toContain(v.slice(5));
    });

    test('bouton « Faire tourner sur le runtime » : constructeur réel derrière switchConversationToRuntime', async () => {
        const b = await bench();
        b.session.messages = vectorMessages(V.ak);
        const prev = b.h.override;
        let posted: SwitchToRuntimeBody | null = null;
        b.h.override = (method, path, body) => {
            if (method === 'POST' && path === `${sessionPath}/switch-to-runtime`) {
                posted = body as SwitchToRuntimeBody;
                return { status: 200, body: { regime: 'runtime' } };
            }
            return prev(method, path, body);
        };
        await switchConversationToRuntime(b.h.deps, ORG, S, { builder: createSwitchBodyBuilder(b.h.deps, b.source) });
        expect(posted).not.toBeNull();
        const ck = await runtimeOpensCk(b, posted!);
        expect(await decryptConversationHistory(ck, S, posted!.messages, true)).toEqual(vectorPlain);
        expect(await isKnownRuntimeConversation(b.h.deps, ORG, S)).toBe(true);
    });

    test('bascule refusée par l\'API : la conversation nouvellement enregistrée est retirée du registre', async () => {
        const b = await bench();
        const prev = b.h.override;
        b.h.override = (method, path, body) => (method === 'POST' && path === `${sessionPath}/switch-to-runtime` ? { status: 409, body: { error: 'rev_conflict' } } : prev(method, path, body));
        await switchConversationToRuntime(b.h.deps, ORG, S, { builder: createSwitchBodyBuilder(b.h.deps, b.source) }).catch(() => undefined);
        expect(await isKnownRuntimeConversation(b.h.deps, ORG, S)).toBe(false);
    });
});

describe('CK existante', () => {
    test('réutilisée (pas de convKey) : l\'historique local est chiffré sous CETTE clé', async () => {
        const b = await bench();
        b.h.held.set(`conv|${S}|1`, CK_VEC.slice());
        b.served = { encryptedKey: 'scellé', version: 1, creatorId: USER, commitment: null, signature: null };
        b.session.messages = vectorMessages(V.ak);
        const body = await build(b);
        expect(body.convKey).toBeUndefined();
        expect(await runtimeOpensCk(b, body)).toEqual(CK_VEC);
        expect(await decryptConversationHistory(CK_VEC, S, body.messages, true)).toEqual(vectorPlain);
    });

    test('conv-gcm1-v1 (retour au runtime) : vecteurs CK relus en strict puis renvoyés tels quels', async () => {
        const b = await bench();
        b.h.held.set(`conv|${S}|1`, CK_VEC.slice());
        b.served = { encryptedKey: 'scellé', version: 1, creatorId: USER, commitment: null, signature: null };
        b.session = { ...b.session, encryptionScheme: 'conv-gcm1-v1', regime: 'client', messages: vectorMessages(V.ck), title: V.ck.title };
        const body = await build(b);
        expect(body.convKey).toBeUndefined();
        expect(body.messages).toEqual(vectorMessages(V.ck) as SwitchToRuntimeBody['messages']);
        expect(await decryptAiFieldStrict(CK_VEC, S, '__session_title__', 'title', body.title)).toBe(V.plain.title);
    });

    test('clé servie mais impossible à ouvrir ici : refus, jamais de CK neuve', async () => {
        const b = await bench();
        b.served = { encryptedKey: 'scellé', version: 1, creatorId: USER, commitment: null, signature: null };
        b.session.messages = vectorMessages(V.ak);
        expect(await code(build(b))).toBe('conversation_key_unavailable');
    });

    test('conv-gcm1-v1 sans clé servie, ou valeur altérée : échec fermé', async () => {
        const b = await bench();
        b.session = { ...b.session, encryptionScheme: 'conv-gcm1-v1', messages: vectorMessages(V.ck) };
        expect(await code(build(b))).toBe('conversation_key_unavailable');

        b.h.held.set(`conv|${S}|1`, CK_VEC.slice());
        b.served = { encryptedKey: 'scellé', version: 1 };
        b.session.messages = vectorMessages(V.ak); // chiffré sous une autre clé
        expect(await code(build(b))).toBe('history_unreadable');
    });
});

describe('bornes de l\'API', () => {
    test('plus de 20 000 messages : history_too_large', async () => {
        const b = await bench();
        b.session.messages = Array.from({ length: SWITCH_MAX_MESSAGES + 1 }, (_, i) => ({ id: `m${i}`, role: 'user', content: 'x', createdAt: 'c' }));
        expect(await code(build(b))).toBe('history_too_large');
    });

    test('historique sérialisé > 8 Mio : history_too_large', async () => {
        const b = await bench();
        b.session.messages = [{ id: 'm1', role: 'user', content: 'x'.repeat(6 * 1024 * 1024 + 1), createdAt: 'c' }];
        expect(await code(build(b))).toBe('history_too_large');
    });

    test('65 appels d\'outil, nom d\'outil > 64 : refus', async () => {
        const b = await bench();
        const calls = Array.from({ length: 65 }, (_, i) => ({ id: `c${i}`, name: 'n', arguments: {}, category: 'server', mutating: false, status: 'done' }));
        b.session.messages = [{ id: 'a', role: 'assistant', content: 'x', createdAt: 'c', toolCalls: calls }];
        expect(await code(build(b))).toBe('history_too_large');
        b.session.messages = [{ id: 'a', role: 'assistant', content: 'x', createdAt: 'c', toolCalls: [{ id: 'c', name: 'n'.repeat(65), arguments: {}, category: 'server', mutating: false, status: 'done' }] }];
        expect(await code(build(b))).toBe('history_unreadable');
    });

    test('identifiants non conformes réécrits (toolCallId suit), createdAt trop long remplacé, titre ≤ 60', async () => {
        const b = await bench();
        b.session.title = 'é'.repeat(80);
        b.session.messages = [
            { id: 'id:avec|séparateurs', role: 'assistant', content: 'x', createdAt: 'x'.repeat(41), toolCalls: [{ id: 'call:1', name: 'n', arguments: {}, category: 'client', mutating: true, status: 'pending' }] },
            { id: 'id:avec|séparateurs', role: 'tool', content: null, toolCallId: 'call:1', toolResult: 'ok', createdAt: 'c' },
        ];
        const body = await build(b);
        const ck = await runtimeOpensCk(b, body);
        const back = await decryptConversationHistory(ck, S, body.messages, true);
        expect(back[0]!.id).not.toBe(back[1]!.id);
        expect(back[1]!.toolCallId).toBe(back[0]!.toolCalls![0]!.id);
        expect(back[0]!.createdAt).toBe(new Date(b.h.now.t * 1000).toISOString());
        expect(await decryptAiFieldStrict(ck, S, '__session_title__', 'title', body.title)).toBe('é'.repeat(60));
    });
});

describe('aucun clair hors du corps chiffré', () => {
    test('aucun contenu, raisonnement, argument, résultat ni titre en clair dans le corps', async () => {
        const b = await bench();
        b.session.title = 'TITRE-SECRET';
        b.session.messages = [
            { id: 'u1', role: 'user', content: 'CONTENU-SECRET', createdAt: 'c' },
            { id: 'a1', role: 'assistant', content: null, thinking: 'PENSEE-SECRETE', createdAt: 'c', toolCalls: [{ id: 'c1', name: 'outil', arguments: { k: 'ARGUMENT-SECRET' }, category: 'server', mutating: false, status: 'done' }] },
            { id: 't1', role: 'tool', content: null, toolCallId: 'c1', toolResult: { r: 'RESULTAT-SECRET' }, createdAt: 'c' },
        ];
        const wire = JSON.stringify(await build(b));
        for (const s of ['TITRE-SECRET', 'CONTENU-SECRET', 'PENSEE-SECRETE', 'ARGUMENT-SECRET', 'RESULTAT-SECRET']) expect(wire).not.toContain(s);
        // Ni la CK ni la DK n'apparaissent ailleurs que scellées.
        const ck = await runtimeOpensCk(b, JSON.parse(wire) as SwitchToRuntimeBody);
        expect(wire).not.toContain(btoa(String.fromCharCode(...ck)));
        expect(JSON.stringify([...b.h.store.values()])).not.toContain('SECRET');
    });

    test('les erreurs ne portent que des codes', async () => {
        const b = await bench();
        b.session.messages = [{ id: 'a', role: 'assistant', content: 'gcm1:' + 'A'.repeat(40) + 'SECRET', createdAt: 'c' }];
        const err = await build(b).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AiRuntimeError);
        expect(`${(err as Error).message}${JSON.stringify(err)}`).not.toContain('SECRET');
    });
});

describe('échec fermé si la délégation n\'est pas prête', () => {
    test('DK absente de la mémoire : delegation_unusable, rien lu ni enregistré', async () => {
        const b = await bench();
        clearDelegationKeys();
        const before = b.h.requests.length;
        expect(await code(build(b))).toBe('delegation_unusable');
        expect(b.h.requests.length).toBe(before);
        expect(await isKnownRuntimeConversation(b.h.deps, ORG, S)).toBe(false);
    });

    test('autre délégation que celle en mémoire : delegation_unusable', async () => {
        const b = await bench();
        expect(await code(buildSwitchToRuntimeBody(b.h.deps, b.source, { orgId: ORG, sessionId: S, runtimeId: b.h.rt.runtimeId, delegationId: crypto.randomUUID() }))).toBe('delegation_unusable');
    });

    test('chiffrement verrouillé (CK neuve à sceller) : e2ee_locked', async () => {
        const b = await bench();
        b.h.deps.identity.verifiedRsaPublicKey = async () => null;
        expect(await code(build(b))).toBe('e2ee_locked');
    });
});

describe('vecteurs conversation-fields.json (03 §6.3)', () => {
    test('lecture stricte des valeurs CK', async () => {
        expect(await decryptConversationHistory(CK_VEC, S, vectorMessages(V.ck), true)).toEqual(vectorPlain);
        expect(await decryptAiFieldStrict(CK_VEC, S, '__session_title__', 'title', V.ck.title)).toBe(V.plain.title);
    });

    test('écriture à IV figé : octet pour octet', async () => {
        const fill = (byte: number) => spyOn(crypto, 'getRandomValues').mockImplementation(<T extends ArrayBufferView | null>(a: T): T => {
            if (a) new Uint8Array(a.buffer, a.byteOffset, a.byteLength).fill(byte);
            return a;
        });
        let spy = fill(0x11);
        try {
            const [e] = await encryptConversationHistory(CK_VEC, S, [{ id: M, role: 'assistant', content: V.plain.content, createdAt: 'c' }]);
            expect(e!.content).toBe(V.ck.content);
        } finally {
            spy.mockRestore();
        }
        spy = fill(0x16);
        try {
            expect(await encryptAiFieldStrict(CK_VEC, S, '__session_title__', 'title', V.plain.title)).toBe(V.ck.title);
        } finally {
            spy.mockRestore();
        }
    });
});

describe('format d\'affichage (régime client) → StoredMessage[]', () => {
    test('tour à parts : raisonnement, texte, appel, résultat, texte ; avis system écartés', () => {
        const out = displayToStoredMessages([
            { role: 'system', content: '[🔒 avis local]' },
            { role: 'user', content: 'Q' },
            {
                role: 'assistant', content: '', viaAgentLoop: true, usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3, reasoningTokens: 0 },
                parts: [
                    { type: 'thinking', text: 'pense' }, { type: 'text', text: 'avant' },
                    { type: 'tool', tool: { toolCallId: 'c1', name: 'outil', args: { a: 1 }, status: 'done', category: 'server', mutating: false, result: { ok: 1 } } },
                    { type: 'text', text: 'après' },
                ],
            },
        ], '2026-11-23T00:00:00.000Z');
        expect(out.map(m => [m.role, m.content, m.thinking ?? null, m.toolCalls?.map(c => c.name) ?? null, m.toolResult ?? null])).toEqual([
            ['user', 'Q', null, null, null],
            ['assistant', 'avant', 'pense', ['outil'], null],
            ['tool', null, null, null, { ok: 1 }],
            ['assistant', 'après', null, null, null],
        ]);
        expect(out[2]!.toolCallId).toBe('c1');
        expect(out[3]!.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3, reasoningTokens: 0 });
    });

    test('blob isE2EE rendu par l\'API : ouvert avec la clé privée, historique repris', async () => {
        const b = await bench();
        b.session.messages = { isE2EE: true, ciphertext: 'c', encryptedAesKey: 'k', iv: 'i' };
        b.blobOpens = [{ role: 'user', content: 'Q-affichée' }, { role: 'assistant', content: 'R-affichée' }];
        const body = await build(b);
        const back = await decryptConversationHistory(await runtimeOpensCk(b, body), S, body.messages, true);
        expect(back.map(m => m.content)).toEqual(['Q-affichée', 'R-affichée']);
    });

    test('blob isE2EE illisible, autre objet inconnu ou contenu non tableau : history_unreadable, jamais un historique vide', async () => {
        for (const messages of [{ isE2EE: true, ciphertext: 'c', encryptedAesKey: 'k', iv: 'i' }, { autre: 1 }]) {
            const b = await bench();
            b.session.messages = messages; // blobOpens = Error
            expect(await code(build(b))).toBe('history_unreadable');
        }
        const b = await bench();
        b.session.messages = { isE2EE: true, ciphertext: 'c', encryptedAesKey: 'k', iv: 'i' };
        b.blobOpens = { pas: 'un tableau' };
        expect(await code(build(b))).toBe('history_unreadable');
    });
});
