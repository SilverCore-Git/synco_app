/**
 * Vérification du runtime avant toute délégation (01 §6.3, §8 ; 03_securite.md §4) : chaque refus
 * est un code typé, et aucun dépôt de délégation n'a lieu.
 */
import { beforeEach, describe, expect, test } from 'bun:test';
import { formatRuntimeFingerprint } from '@/assets/utils/runtimeCert';
import { AiRuntimeError } from './errors';
import { acceptNewRuntimeKey, inspectRuntime, verifyRuntimeForDelegation } from './runtimeTrust';
import { createDelegation, clearDelegationKeys, onRuntimeUnpaired } from './delegation';
import { previewPairing, pairRuntime } from './pairing';
import { checkRuntimePin, runtimePinSlot } from './runtimePin';
import { formatPairingCode, fromB64u } from '@/assets/utils/runtimeCert';
import { ADMIN, ORG, USER, certify, makeHarness, makePerson, makeRuntime, type Harness } from './testHarness';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof AiRuntimeError ? e.code : `autre:${String(e)}`));
const deposits = (h: Harness) => h.requests.filter(r => r.method === 'POST' && r.path.endsWith('/ai/runtime/delegations'));
const pinOf = (h: Harness) => h.store.get(runtimePinSlot(USER, ORG)) as { runtimeId: string | null; fpr: string | null; previous: { fpr: string }[] } | undefined;

beforeEach(() => clearDelegationKeys());

describe('première vue et épinglage TOFU (01 §8)', () => {
    test('première vue sans confirmation : runtime_first_seen avec empreinte et signataire, rien épinglé ni déposé', async () => {
        const h = await makeHarness();
        const err = await verifyRuntimeForDelegation(h.deps, ORG).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AiRuntimeError);
        expect((err as AiRuntimeError).code).toBe('runtime_first_seen');
        expect((err as AiRuntimeError).details).toEqual({ fingerprint: formatRuntimeFingerprint(h.rt.fprHex), adminId: ADMIN, previouslyPinned: false });
        expect(pinOf(h)).toBeUndefined();
        expect(await code(createDelegation(h.deps, ORG, { mode: 'plan' }))).toBe('runtime_first_seen');
        expect(deposits(h)).toHaveLength(0);
    });

    test('première vue confirmée : défi puis épingle ; vue suivante identique sans confirmation', async () => {
        const h = await makeHarness();
        const v = await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
        expect(v.pinState).toBe('match');
        expect(h.rt.challenges).toBe(1);
        expect(pinOf(h)).toMatchObject({ runtimeId: h.rt.runtimeId, fpr: h.rt.fprHex });
        expect((await verifyRuntimeForDelegation(h.deps, ORG)).fingerprint).toBe(formatRuntimeFingerprint(h.rt.fprHex));
        expect(h.rt.challenges).toBe(2);
    });

    test('clé du runtime changée : runtime_key_changed, aucune délégation ; acceptation explicite → ancienne épingle archivée', async () => {
        const h = await makeHarness();
        await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
        const old = h.rt.fprHex;
        // Même runtimeId, nouvelles clés, recertifié par l'admin.
        const fresh = await makeRuntime();
        Object.assign(h.rt, { kex: fresh.kex, csk: fresh.csk, keys: fresh.keys });
        const { runtimeFingerprintHex } = await import('@/assets/utils/runtimeCert');
        h.rt.fprHex = await runtimeFingerprintHex(h.rt.runtimeId, h.rt.keys);
        h.registry.runtime!.certificate = await certify(h.rt, h.admin, ORG, 2);

        const err = (await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }).catch((e: unknown) => e)) as AiRuntimeError;
        expect(err.code).toBe('runtime_key_changed');
        expect(err.details.pinnedFingerprint).toBe(formatRuntimeFingerprint(old));
        expect(err.details.fingerprint).toBe(formatRuntimeFingerprint(h.rt.fprHex));
        expect(await code(createDelegation(h.deps, ORG, { mode: 'plan', confirmFirstSeen: true }))).toBe('runtime_key_changed');
        expect(deposits(h)).toHaveLength(0);

        expect(await code(acceptNewRuntimeKey(h.deps, ORG, formatRuntimeFingerprint(old)))).toBe('runtime_key_changed');
        await acceptNewRuntimeKey(h.deps, ORG, err.details.fingerprint!);
        expect(pinOf(h)).toMatchObject({ fpr: h.rt.fprHex, previous: [{ fpr: old }] });
    });

    test('acceptation : rien n\'est épinglé si la vérification finale échoue', async () => {
        const h = await makeHarness();
        await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
        const old = h.rt.fprHex;
        const fresh = await makeRuntime();
        Object.assign(h.rt, { kex: fresh.kex, csk: fresh.csk, keys: fresh.keys });
        const { runtimeFingerprintHex } = await import('@/assets/utils/runtimeCert');
        h.rt.fprHex = await runtimeFingerprintHex(h.rt.runtimeId, h.rt.keys);
        h.registry.runtime!.certificate = await certify(h.rt, h.admin, ORG, 2);
        let reads = 0;
        h.override = (method, path) => {
            if (method !== 'GET' || path !== `/api/orgs/${ORG}/ai/runtime` || ++reads < 3) return undefined;
            return { status: 200, body: { ...h.registry, runtime: { ...h.registry.runtime!, signer: { ...h.registry.runtime!.signer, isAdmin: false } } } };
        };
        expect(await code(acceptNewRuntimeKey(h.deps, ORG, formatRuntimeFingerprint(h.rt.fprHex)))).toBe('cert_signer_not_admin');
        expect(pinOf(h)?.fpr).toBe(old);
    });

    test('épingle illisible : traitée comme une clé changée (échec fermé)', async () => {
        const h = await makeHarness();
        h.store.set(runtimePinSlot(USER, ORG), { v: 9 });
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('runtime_key_changed');
    });

    test('désappairage confirmé : épingle archivée, le runtime suivant est une première vue avec alerte', async () => {
        const h = await makeHarness();
        await verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true });
        expect(await onRuntimeUnpaired(h.deps, ORG, h.rt.runtimeId)).toBe(false); // l'API annonce encore ce runtime
        expect(pinOf(h)?.runtimeId).toBe(h.rt.runtimeId);
        const registered = h.registry.runtime;
        h.registry.runtime = null;
        expect(await onRuntimeUnpaired(h.deps, ORG, h.rt.runtimeId)).toBe(true);
        expect(pinOf(h)).toMatchObject({ runtimeId: null, fpr: null, previous: [{ fpr: h.rt.fprHex }] });
        h.registry.runtime = registered;
        const err = (await verifyRuntimeForDelegation(h.deps, ORG).catch((e: unknown) => e)) as AiRuntimeError;
        expect(err.code).toBe('runtime_first_seen');
        expect(err.details.previouslyPinned).toBe(true);
        const pin = await checkRuntimePin(h.deps.store, USER, ORG, h.rt.runtimeId, h.rt.fprHex);
        expect(pin).toEqual({ state: 'first_seen_after_change', pinnedFpr: h.rt.fprHex });
    });
});

describe('certificat (01 §6.3) : refus avant toute délégation', () => {
    test('signature par une clé non épinglée de l\'admin (history, none, inconnue) : cert_bad_signature', async () => {
        for (const forced of ['history', 'none', 'unknown'] as const) {
            const h = await makeHarness();
            h.trust = id => (id === ADMIN ? forced : null);
            expect(await code(createDelegation(h.deps, ORG, { mode: 'plan', confirmFirstSeen: true }))).toBe('cert_bad_signature');
            expect(deposits(h)).toHaveLength(0);
            expect(h.rt.challenges).toBe(0);
        }
    });

    test('certificat signé par un autre que l\'admin épinglé : cert_bad_signature', async () => {
        const h = await makeHarness();
        h.registry.runtime!.certificate = await certify(h.rt, await makePerson(ADMIN));
        expect(await code(createDelegation(h.deps, ORG, { mode: 'plan', confirmFirstSeen: true }))).toBe('cert_bad_signature');
        expect(deposits(h)).toHaveLength(0);
    });

    test('signataire qui n\'est plus admin : cert_signer_not_admin', async () => {
        const h = await makeHarness();
        h.registry.runtime!.signer = { adminId: ADMIN, isAdmin: false };
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_signer_not_admin');
    });

    test('autre org, autre runtime annoncé, forme invalide : cert_invalid', async () => {
        const h = await makeHarness();
        h.registry.runtime!.certificate = await certify(h.rt, h.admin, 'cm3orgother00000000000002');
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_invalid');
        h.registry.runtime!.certificate = await certify(h.rt, h.admin);
        h.registry.runtime!.runtimeId = crypto.randomUUID();
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_invalid');
        h.registry.runtime!.certificate = { v: 1 };
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_invalid');
    });

    test('fiche publique d\'un autre runtime que le certificat : cert_runtime_mismatch', async () => {
        const h = await makeHarness();
        const other = await makeRuntime();
        h.deps.runtime.identity = async () => ({ status: 200, body: { v: 1, runtimeId: h.rt.runtimeId, url: h.rt.url, keys: { sig: other.keys.sig, kex: JSON.parse(other.keys.kex), csk: JSON.parse(other.keys.csk) }, orgId: ORG } });
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_runtime_mismatch');
    });

    test('fiche publique liée à une autre org, ou à aucune : cert_runtime_mismatch', async () => {
        for (const orgId of ['cm3orgother00000000000002', null]) {
            const h = await makeHarness();
            h.rt.orgId = orgId;
            expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('cert_runtime_mismatch');
        }
    });

    test('défi échoué (imposteur sans les clés privées) : challenge_failed, ni épingle ni dépôt', async () => {
        const h = await makeHarness();
        const fake = await makeRuntime();
        h.rt.impostor = { kex: fake.kex, csk: fake.csk };
        expect(await code(createDelegation(h.deps, ORG, { mode: 'plan', confirmFirstSeen: true }))).toBe('challenge_failed');
        expect(pinOf(h)).toBeUndefined();
        expect(deposits(h)).toHaveLength(0);
        // Seule la clé csk usurpée suffit à échouer (mac correct, sig fausse).
        h.rt.impostor = { kex: h.rt.kex, csk: fake.csk };
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG, { confirmFirstSeen: true }))).toBe('challenge_failed');
    });

    test('pas de runtime, politique qui exclut : codes dédiés ; inspectRuntime ne lève pas', async () => {
        const h = await makeHarness();
        expect(await inspectRuntime(h.deps, ORG)).toMatchObject({ state: 'ok', runtime: { pinState: 'first_seen' } });
        h.registry.allowedForMe = false;
        expect(await inspectRuntime(h.deps, ORG)).toEqual({ state: 'not_allowed' });
        h.registry.runtime = null;
        expect(await inspectRuntime(h.deps, ORG)).toEqual({ state: 'none' });
        expect(await code(verifyRuntimeForDelegation(h.deps, ORG))).toBe('no_runtime');
    });
});

describe('appairage par un admin (01 §7)', () => {
    test('code juste : défi pair, certificat signé déposé, épingle de l\'admin', async () => {
        const rt = await makeRuntime(null);
        const admin = await makePerson(ADMIN);
        const h = await makeHarness({ rt, admin, user: admin });
        h.registry.runtime = null;
        const pairing = await formatPairingCode(fromB64u(Buffer.from(rt.fprHex, 'hex').toString('base64url')));
        const r = await pairRuntime(h.deps, ORG, 'HTTPS://Runtime.Example.com:443/', pairing);
        expect(r.fingerprint).toBe(formatRuntimeFingerprint(rt.fprHex));
        const post = h.requests.find(q => q.method === 'POST' && q.path === `/api/orgs/${ORG}/ai/runtime`)!;
        const cert = (post.body as { certificate: Record<string, unknown> }).certificate;
        expect(Object.keys(cert).sort()).toEqual(['adminId', 'issuedAt', 'keys', 'orgId', 'runtimeId', 'serial', 'signature', 'url', 'v']);
        expect(cert).toMatchObject({ v: 1, orgId: ORG, runtimeId: rt.runtimeId, url: 'https://runtime.example.com', adminId: ADMIN, serial: 1 });
        expect(h.store.get(runtimePinSlot(ADMIN, ORG))).toMatchObject({ fpr: rt.fprHex });
    });

    test('mauvais code, runtime d\'une autre org : refus avant tout dépôt', async () => {
        const rt = await makeRuntime('cm3orgother00000000000002');
        const h = await makeHarness({ rt });
        const other = await makeRuntime(null);
        const wrong = await formatPairingCode(Buffer.from(other.fprHex, 'hex'));
        expect(await code(previewPairing(h.deps, ORG, rt.url, wrong))).toBe('pair_code_mismatch');
        const good = await formatPairingCode(Buffer.from(rt.fprHex, 'hex'));
        expect(await code(previewPairing(h.deps, ORG, rt.url, good))).toBe('runtime_already_paired');
        expect(await code(previewPairing(h.deps, ORG, 'http://runtime.example.com', good))).toBe('url_invalid');
        expect(h.requests.filter(q => q.method === 'POST')).toHaveLength(0);
    });
});
