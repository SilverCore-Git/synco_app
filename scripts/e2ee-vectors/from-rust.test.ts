/**
 * Sens Rust → TS : le code TS de l'app ouvre ou vérifie ce que produit la crate `synco-e2ee`
 * (synco_ai_runtime/crates/synco-e2ee/examples/emit_ts_vectors.rs → from-rust.json).
 */
import { describe, expect, test } from 'bun:test';
import vectors from './from-rust.json';
import { importEcdhPrivate } from './fixedRandom';
import { decryptAiField } from '@/assets/utils/crypto';
import { identityChainPath, openDeviceEnvelope, openIdentityKey, importAccountKey, verifyDeviceCertificate } from '@/assets/utils/e2eeV4';
import { verifyKeyEnvelope } from '@/assets/utils/keyEnvelope';
import {
    canonicalRuntimeUrl, formatPairingCode, formatRuntimeFingerprint, runtimeCertBytes, runtimeFingerprint,
    toHex, verifyChallengeResponse, verifyRuntimeCertificate, type ChallengeRequest, type RuntimeCertificate,
} from '@/assets/utils/runtimeCert';
import {
    delegationWrapHash, openDelegationEntry, openDelegationWrap, verifyMandate, verifyRt1Envelope,
    type DelegationContext, type Rt1KeyContext,
} from '@/assets/utils/runtimeDelegation';

const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));
const { runtime, certificate, challenge, delegation, fields, rt1, v4 } = vectors;

describe('Rust → TS : identité et certificat du runtime', () => {
    test('empreinte, affichage et code identiques', async () => {
        const fpr = await runtimeFingerprint(runtime.runtimeId, runtime.keys);
        expect(toHex(fpr)).toBe(runtime.fprHex);
        expect(formatRuntimeFingerprint(runtime.fprHex)).toBe(runtime.display);
        expect(await formatPairingCode(fpr)).toBe(runtime.code);
    });

    test('certificat signé par la crate vérifié par le TS', async () => {
        const cert = certificate.certificate as RuntimeCertificate;
        expect(canonicalRuntimeUrl(cert.url)).toBe(cert.url);
        expect(runtimeCertBytes(cert)).toBe(certificate.certBytes);
        expect(await verifyRuntimeCertificate(certificate.adminSignKey, cert, certificate.signature)).toBe(true);
        expect(await verifyRuntimeCertificate(certificate.adminSignKey, { ...cert, serial: cert.serial + 1 }, certificate.signature)).toBe(false);
    });

    test('réponse au défi calculée par la crate vérifiée par le client TS', async () => {
        const eph = await importEcdhPrivate(fromHex(challenge.clientEphScalarHex));
        const request = challenge.request as ChallengeRequest;
        const resp = { mac: challenge.mac, sig: challenge.sig };
        expect(await verifyChallengeResponse(request, runtime.runtimeId, runtime.fprHex, eph, runtime.keys, resp)).toBe(true);
        expect(await verifyChallengeResponse({ ...request, purpose: 'delegate' }, runtime.runtimeId, runtime.fprHex, eph, runtime.keys, resp)).toBe(false);
    });
});

describe('Rust → TS : délégation', () => {
    const ctx = delegation.context as DelegationContext;

    test('enveloppe de tête ouverte par le TS avec kex_priv', async () => {
        const kex = await importEcdhPrivate(fromHex(runtime.kexScalarHex));
        const dk = await openDelegationWrap(ctx, kex, runtime.keys.kex, delegation.wrap);
        expect(toHex(dk)).toBe(delegation.dkHex);
        await expect(openDelegationWrap({ ...ctx, exp: ctx.exp + 1 }, kex, runtime.keys.kex, delegation.wrap)).rejects.toMatchObject({ code: 'delegation_unusable' });
    });

    test('mandat signé par la crate vérifié par le TS', async () => {
        expect(await delegationWrapHash(delegation.wrap)).toBe(delegation.wrapHash);
        expect(await verifyMandate(delegation.userSignKey, ctx, runtime.fprHex, delegation.wrap, delegation.mandateSignature)).toBe(true);
        expect(await verifyMandate(certificate.adminSignKey, ctx, runtime.fprHex, delegation.wrap, delegation.mandateSignature)).toBe(false);
    });

    test('entrées ouvertes par le TS', async () => {
        const dk = fromHex(delegation.dkHex);
        for (const e of delegation.entries) {
            expect(toHex(await openDelegationEntry(dk, ctx, e))).toBe(e.keyHex);
            await expect(openDelegationEntry(dk, ctx, { ...e, version: e.version + 1 })).rejects.toMatchObject({ code: 'entry_unusable' });
        }
    });

    test('enveloppe rt1 signée par la csk de la crate vérifiée par le TS', async () => {
        const raw = fromHex(rt1.keyHex);
        const env = { ctx: rt1.ctx as Rt1KeyContext, version: rt1.version, commitment: rt1.commitment, signature: rt1.signature };
        await verifyRt1Envelope(runtime.keys.csk, raw.slice().buffer, env, rt1.delegationId);
        await expect(verifyRt1Envelope(runtime.keys.kex, raw.slice().buffer, env, rt1.delegationId)).rejects.toMatchObject({ code: 'key_bad_signature' });
    });
});

describe('Rust → TS : champs gcm1', () => {
    test('decryptAiField ouvre les champs chiffrés par la crate', async () => {
        const ck = await crypto.subtle.importKey('raw', fromHex(fields.ckHex), 'AES-GCM', false, ['decrypt']);
        for (const c of fields.cases) {
            expect(await decryptAiField(ck, fields.sessionId, c.messageId, c.fieldName, c.value)).toBe(c.plaintext);
            await expect(decryptAiField(ck, fields.sessionId, c.messageId, `${c.fieldName}x`, c.value)).rejects.toThrow();
        }
    });
});

describe('Rust → TS : formats E2EE v4 existants', () => {
    test('enveloppe d’appareil et clé d’identité scellée', async () => {
        const device = await importEcdhPrivate(fromHex(v4.deviceScalarHex));
        const ak = await openDeviceEnvelope(device, JSON.parse(v4.devicePublic), v4.deviceEnvelope, v4.userId, v4.deviceId);
        expect(toHex(ak)).toBe(v4.akHex);
        const payload = await openIdentityKey(await importAccountKey(ak), 'rsa', v4.userId, v4.identity);
        expect(toHex(new Uint8Array(payload))).toBe(v4.identity.payloadHex);
    });

    test('certificat d’appareil, enveloppe FC4 et transition d’identité signés par la crate', async () => {
        const signKey = JSON.parse(v4.identitySignKey);
        expect(await verifyDeviceCertificate(signKey, v4.deviceCertificate.certificate, v4.userId, v4.deviceId, v4.deviceCertificate.platform, JSON.parse(v4.devicePublic))).toBe(true);
        const k = v4.keyEnvelope;
        await verifyKeyEnvelope(fromHex(k.keyHex).buffer, { ctx: k.ctx as `space:${string}`, version: k.version, commitment: k.commitment, signature: k.signature }, signKey);
        const path = await identityChainPath(v4.userId, v4.identitySignKey, [v4.transition]);
        expect(path).toEqual([{ publicKey: v4.transition.newPublicKey, publicSignKey: v4.transition.newPublicSignKey }]);
    });
});
