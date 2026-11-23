/**
 * Délégation v2 (03 §3 à §7, §4.1) : charges réellement envoyées inspectées, cloisonnement par org et
 * par type, erreurs typées (`delegation_expired`, `feature_not_allowed`).
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { sha256, toB64, toB64u, toHex } from '@/assets/utils/runtimeCert';
import { openDelegationEntry, openDelegationWrap, verifyMandateVersioned, type DelegationContext } from '@/assets/utils/runtimeDelegation';
import { AiRuntimeError } from './errors';
import {
    addMissingEntries,
    clearDelegationKeys,
    createDelegation,
    disableAutonomousMode,
    enableAutonomousMode,
    getDelegationSummary,
    readVerifiedMandate,
    registerRuntimeConversation,
    revokeMyDelegation,
} from './delegation';
import { verifyRuntimeForDelegation } from './runtimeTrust';
import { ORG, OTHER_ORG, USER, makeHarness, type Harness } from './testHarness';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof AiRuntimeError ? e.code : `autre:${String(e)}`));
const rand = () => crypto.getRandomValues(new Uint8Array(32));

const T_IN = 'cm3threadorg000000000001';
const T_SPACE = 'cm3threadspace0000000001';
const T_OTHER = 'cm3threadother0000000001';
const S_IN = 'cm3spaceorg0000000000001';
const S_OTHER = 'cm3spaceother00000000001';
const CONV = '0f0e0d0c-0b0a-4908-8706-050403020100';
const CONV_FOREIGN = '1a1b1c1d-2a2b-4c2d-8e2f-303132333435';
const AK_LIKE = 'cm3akorg0000000000000001';

async function prepared(): Promise<Harness> {
    const h = await makeHarness();
    await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
    h.threads.add(T_IN).add(T_SPACE);
    h.spaces.add(S_IN);
    await registerRuntimeConversation(h.deps, ORG, CONV);
    for (const k of [`thread|${T_IN}|1`, `thread|${T_SPACE}|1`, `thread|${T_OTHER}|1`, `space|${S_IN}|1`, `space|${S_IN}|2`, `space|${S_OTHER}|1`, `conv|${CONV}|1`, `conv|${CONV_FOREIGN}|1`,
        `dm|${USER}|1`, `support|${T_IN}|1`, `org|${ORG}|1`, `ai|${ORG}|1`, `ai|${AK_LIKE}|1`]) h.held.set(k, rand());
    h.missing = [
        { kind: 'thread', ref: T_IN, version: 1 }, { kind: 'thread', ref: T_SPACE, version: 1 }, { kind: 'thread', ref: T_OTHER, version: 1 },
        { kind: 'space', ref: S_IN, version: 1 }, { kind: 'space', ref: S_IN, version: 2 }, { kind: 'space', ref: S_OTHER, version: 1 },
        { kind: 'conv', ref: CONV, version: 1 }, { kind: 'conv', ref: CONV_FOREIGN, version: 1 }, { kind: 'dm', ref: USER, version: 1 }, { kind: 'support', ref: T_IN, version: 1 },
        { kind: 'org', ref: ORG, version: 1 }, { kind: 'ai', ref: ORG, version: 1 }, { kind: 'ai', ref: AK_LIKE, version: 1 },
        { kind: 'thread', ref: 'bad id!', version: 1 }, { kind: 'thread', ref: T_IN, version: 2 },
    ];
    return h;
}

beforeEach(() => clearDelegationKeys());

describe('création (03 §7.1) et contenu des charges', () => {
    test('dépôt v2 : champs exacts, enveloppe ouvrable par la seule kex, mandat v2 vérifiable, empreinte RSA du propriétaire', async () => {
        const h = await prepared();
        const summary = await createDelegation(h.deps, ORG, { mode: 'plan' });
        const dep = h.requests.find(r => r.method === 'POST' && r.path === `/api/orgs/${ORG}/ai/runtime/delegations`)!;
        const b = dep.body as Record<string, unknown>;
        expect(Object.keys(b).sort()).toEqual(['delegationId', 'entries', 'exp', 'iat', 'mandateSignature', 'mandateVersion', 'mode', 'ownerRsaSpkiHex', 'runtimeId', 'scope', 'wrap']);
        expect(b).toMatchObject({ mandateVersion: 2, mode: 'plan', runtimeId: h.rt.runtimeId, scope: 'org', iat: h.now.t, exp: h.now.t + 7 * 86_400, entries: [] });
        const spki = new Uint8Array(await crypto.subtle.exportKey('spki', h.user.rsa.publicKey));
        expect(b.ownerRsaSpkiHex).toBe(toHex(await sha256(spki)));

        const ctx: DelegationContext = { userId: USER, orgId: ORG, runtimeId: h.rt.runtimeId, delegationId: String(b.delegationId), scope: 'org', iat: Number(b.iat), exp: Number(b.exp) };
        const dk = await openDelegationWrap(ctx, h.rt.kex.privateKey, h.rt.keys.kex, String(b.wrap));
        const verified = await verifyMandateVersioned(h.user.signPub, ctx, h.rt.fprHex, String(b.wrap), String(b.mandateSignature), { mandateVersion: 2, mode: 'plan', ownerRsaSpkiHex: String(b.ownerRsaSpkiHex) });
        expect(verified).toEqual({ version: 2, mode: 'plan', ownerRsaSpkiHex: String(b.ownerRsaSpkiHex) });

        // Entrées : seulement salons et espaces de l'org, et la CK ; chacune s'ouvre sous DK vers la bonne clé.
        const posted = h.requests.filter(r => r.path.endsWith('/entries')).flatMap(r => (r.body as { entries: { kind: string; ref: string; version: number; ciphertext: string }[] }).entries);
        expect(posted.map(e => `${e.kind}|${e.ref}|${e.version}`).sort()).toEqual([`conv|${CONV}|1`, `space|${S_IN}|1`, `space|${S_IN}|2`, `thread|${T_IN}|1`, `thread|${T_SPACE}|1`].sort());
        for (const e of posted) {
            expect(Object.keys(e).sort()).toEqual(['ciphertext', 'kind', 'ref', 'version']);
            expect(await openDelegationEntry(dk, ctx, e)).toEqual(h.held.get(`${e.kind}|${e.ref}|${e.version}`)!);
        }
        expect(summary).toMatchObject({ mode: 'plan', autonomous: false, renewOnOpen: true, entryCount: 5, threadCount: 2, spaceCount: 1, conversationCount: 1, keysInMemory: true });
        dk.fill(0);
    });

    test('DM, ticket, org, ai et autres orgs : jamais ouvertes ni déléguées', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const opened = h.opened.map(k => `${k.kind}|${k.ref}`);
        for (const forbidden of [`thread|${T_OTHER}`, `space|${S_OTHER}`, `dm|${USER}`, `support|${T_IN}`, `org|${ORG}`, `ai|${ORG}`, `ai|${AK_LIKE}`]) {
            expect(opened).not.toContain(forbidden);
        }
        expect(h.opened.some(k => k.kind === 'thread' && k.version !== 1)).toBe(false);
    });

    test('aucune charge envoyée ne contient une clé privée d\'identité, la DK ni une clé en clair', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const sent = JSON.stringify(h.requests.map(r => r.body)) + JSON.stringify([...h.store.values()]);
        const signPriv = (await crypto.subtle.exportKey('jwk', h.user.sign.privateKey)) as JsonWebKey;
        const rsaPriv = (await crypto.subtle.exportKey('jwk', h.user.rsa.privateKey)) as JsonWebKey;
        for (const secret of [signPriv.d!, rsaPriv.d!, rsaPriv.p!, rsaPriv.q!]) expect(sent).not.toContain(secret);
        for (const raw of h.held.values()) {
            for (const enc of [toB64(raw), toB64u(raw), toHex(raw)]) expect(sent).not.toContain(enc);
        }
    });

    test('mode auto : feature_not_allowed typé si l\'org le refuse ; activation puis retrait (12 §11.3)', async () => {
        const h = await prepared();
        h.override = (method, path, body) =>
            method === 'POST' && path.endsWith('/ai/runtime/delegations') && (body as { mode?: string }).mode === 'auto' ? { status: 403, body: { error: 'feature_not_allowed' } } : undefined;
        expect(await code(enableAutonomousMode(h.deps, ORG, 1))).toBe('feature_not_allowed');
        h.override = () => undefined;
        const on = await enableAutonomousMode(h.deps, ORG, 1);
        expect(on.autonomous).toBe(true);
        const optIn = h.requests.find(r => r.method === 'PUT' && r.path.endsWith('/feature-policies/me/autonomous_mode/opt-in'))!;
        expect(optIn.body).toEqual({ warningVersion: 1 });
        const runtime = await verifyRuntimeForDelegation(h.deps, ORG);
        expect((await readVerifiedMandate(h.deps, ORG, on.delegationId, runtime)).mode).toBe('auto');
        const off = await disableAutonomousMode(h.deps, ORG);
        expect(off.mode).toBe('plan');
        expect(off.delegationId).not.toBe(on.delegationId);
        const calls = h.requests.map(r => `${r.method} ${r.path.split('/').slice(-2).join('/')}`);
        expect(calls.lastIndexOf('DELETE autonomous_mode/opt-in')).toBeGreaterThan(calls.lastIndexOf('POST runtime/delegations'));
    });

    test('mandat servi avec un mode falsifié : la signature échoue, delegation_unusable', async () => {
        const h = await prepared();
        const s = await createDelegation(h.deps, ORG, { mode: 'plan' });
        h.mandates.get(s.delegationId)!.mode = 'auto';
        const runtime = await verifyRuntimeForDelegation(h.deps, ORG);
        expect(await code(readVerifiedMandate(h.deps, ORG, s.delegationId, runtime))).toBe('delegation_unusable');
    });
});

describe('durée', () => {
    test('plafond de l\'org sous une heure : delegation_duration_too_short, rien déposé', async () => {
        const h = await prepared();
        (h.registry.policy as { maxDelegationDays: number }).maxDelegationDays = 0.01;
        expect(await code(createDelegation(h.deps, ORG, { mode: 'plan' }))).toBe('delegation_duration_too_short');
        expect(h.requests.some(r => r.method === 'POST' && r.path === `/api/orgs/${ORG}/ai/runtime/delegations`)).toBe(false);
    });
});

describe('mode du résumé', () => {
    test('DK en mémoire : le mode servi par l\'API est ignoré, le mandat fait foi', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        h.current!.mode = 'auto';
        const s = await getDelegationSummary(h.deps, ORG);
        expect(s).toMatchObject({ mode: 'plan', autonomous: false });
    });

    test('sans DK : mode relu dans le mandat vérifié, dans les deux sens', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        clearDelegationKeys();
        h.current!.mode = 'auto';
        expect(await getDelegationSummary(h.deps, ORG)).toMatchObject({ mode: 'plan', autonomous: false, keysInMemory: false });
        await enableAutonomousMode(h.deps, ORG, 1);
        clearDelegationKeys();
        h.current!.mode = 'plan';
        expect(await getDelegationSummary(h.deps, ORG)).toMatchObject({ mode: 'auto', autonomous: true });
    });
});

describe('cloisonnement des CK', () => {
    test('une conv servie par /missing mais inconnue localement n\'est ni ouverte ni déléguée', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const posted = h.requests.filter(r => r.path.endsWith('/entries')).flatMap(r => (r.body as { entries: { ref: string }[] }).entries);
        expect(posted.some(e => e.ref === CONV_FOREIGN)).toBe(false);
        expect(posted.some(e => e.ref === CONV)).toBe(true);
        expect(h.opened.some(k => k.ref === CONV_FOREIGN)).toBe(false);
    });

    test('le registre est propre à l\'org : une conv enregistrée dans une autre org n\'est pas déléguée ici', async () => {
        const h = await prepared();
        await registerRuntimeConversation(h.deps, OTHER_ORG, CONV_FOREIGN);
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        expect(h.opened.some(k => k.ref === CONV_FOREIGN)).toBe(false);
    });
});

describe('ajout d\'entrées et révocation', () => {
    test('délégation expirée côté API : delegation_expired typé, DK oubliée', async () => {
        const h = await prepared();
        h.missing = [];
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        h.missing = [{ kind: 'thread', ref: T_IN, version: 1 }];
        h.override = (method, path) => (method === 'POST' && path.endsWith('/entries') ? { status: 403, body: { error: 'delegation_expired' } } : undefined);
        expect(await code(addMissingEntries(h.deps, ORG))).toBe('delegation_expired');
        expect(await code(addMissingEntries(h.deps, ORG))).toBe('delegation_unusable');
    });

    test('clé non ouvrable sur cet appareil : ignorée, pas redemandée pendant la session', async () => {
        const h = await prepared();
        h.held.delete(`space|${S_IN}|1`);
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        const before = h.opened.filter(k => k.kind === 'space' && k.version === 1).length;
        await addMissingEntries(h.deps, ORG);
        expect(h.opened.filter(k => k.kind === 'space' && k.version === 1).length).toBe(before);
    });

    test('révocation par l\'utilisateur : DK effacée, résumé sans clé en mémoire', async () => {
        const h = await prepared();
        await createDelegation(h.deps, ORG, { mode: 'plan' });
        expect(await revokeMyDelegation(h.deps, ORG)).toHaveLength(1);
        expect(await getDelegationSummary(h.deps, ORG)).toBeNull();
        expect(await code(addMissingEntries(h.deps, ORG))).toBe('delegation_unusable');
    });

    test('une autre org n\'est jamais servie par l\'annuaire local', async () => {
        const h = await prepared();
        expect(h.deps.directory.hasThread(OTHER_ORG, T_IN)).toBe(false);
    });
});
