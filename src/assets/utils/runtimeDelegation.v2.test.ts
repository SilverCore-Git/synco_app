/**
 * Vecteurs figés par la spécification (L00f) : scripts/e2ee-vectors/mandate-v2.json, copie conforme
 * de synco_ai_runtime/docs/plan/vectors/mandate-v2.json (03 §4.1, 12 §10.2), rejoués sans modification.
 * Signatures produites par la crate (ECDSA déterministe) : vérifiées, jamais recalculées à l'octet.
 */
import { describe, expect, test } from 'bun:test';
import raw from '../../../scripts/e2ee-vectors/mandate-v2.json';
import { importEcdsaPrivate } from '../../../scripts/e2ee-vectors/fixedRandom';
import {
    delegationWrapHash, mandateBytes, mandateBytesV2, ownerRsaSpkiHex, rt1Verdict, signMandateV2, verifyMandateOfflineFromWrapHash,
    verifyMandateVersioned, verifyMandateVersionedOfflineFromWrapHash, type DelegationContext, type ServedMandate, type VerifiedMandate,
} from './runtimeDelegation';

interface MandateCase extends ServedMandate {
    name: string; context: DelegationContext; fprHex: string; wrapHash: string; userSignKey: string; signature: string;
    expect: string; expectMode?: string;
}
interface Vectors {
    keys: {
        userSignScalarHex: string; userSignKey: string; v1UserSignKey: string;
        ownerRsaSpkiDerHex: string; ownerRsaSpkiHex: string; otherRsaSpkiDerHex: string; otherRsaSpkiHex: string;
    };
    context: DelegationContext; fprHex: string; wrap: string; wrapHash: string; userSignKey: string;
    mandateBytesPlan: string; signaturePlan: string; mandateBytesAuto: string; signatureAuto: string; mandateBytesV1: string; signatureV1: string;
    mandateCases: MandateCase[];
    rt1Policy: { name: string; mandateVersion: number; mode?: 'plan' | 'auto'; mandateUnusable?: boolean; envelopeValid: boolean; production?: boolean; expect: string }[];
}
const v = raw as unknown as Vectors;
const fromHex = (h: string) => Uint8Array.from(Buffer.from(h, 'hex'));

describe('mandate-v2.json (03 §4.1)', () => {
    test('octets v2 et v1 exacts, empreintes RSA, signatures de la crate vérifiées', async () => {
        const { context: ctx, fprHex, keys } = v;
        expect(await delegationWrapHash(v.wrap)).toBe(v.wrapHash);
        expect(await ownerRsaSpkiHex(fromHex(keys.ownerRsaSpkiDerHex))).toBe(keys.ownerRsaSpkiHex);
        expect(await ownerRsaSpkiHex(fromHex(keys.otherRsaSpkiDerHex))).toBe(keys.otherRsaSpkiHex);
        expect(mandateBytesV2(ctx, fprHex, v.wrapHash, keys.ownerRsaSpkiHex, 'plan')).toBe(v.mandateBytesPlan);
        expect(mandateBytesV2(ctx, fprHex, v.wrapHash, keys.ownerRsaSpkiHex, 'auto')).toBe(v.mandateBytesAuto);
        expect(mandateBytes(ctx, fprHex, v.wrapHash)).toBe(v.mandateBytesV1);
        expect(await verifyMandateOfflineFromWrapHash(keys.v1UserSignKey, ctx, fprHex, v.wrapHash, v.signatureV1)).toBe(true);
        const owner = keys.ownerRsaSpkiHex;
        expect(await verifyMandateVersioned(v.userSignKey, ctx, fprHex, v.wrap, v.signaturePlan, { mandateVersion: 2, mode: 'plan', ownerRsaSpkiHex: owner }))
            .toEqual({ version: 2, mode: 'plan', ownerRsaSpkiHex: owner });
        expect(await verifyMandateVersioned(v.userSignKey, ctx, fprHex, v.wrap, v.signatureAuto, { mandateVersion: 2, mode: 'auto', ownerRsaSpkiHex: owner }))
            .toEqual({ version: 2, mode: 'auto', ownerRsaSpkiHex: owner });
    });

    test('mandateCases', async () => {
        expect(v.mandateCases.length).toBe(21);
        for (const c of v.mandateCases) {
            const served: ServedMandate = { mandateVersion: c.mandateVersion, mode: c.mode, ownerRsaSpkiHex: c.ownerRsaSpkiHex };
            const r = verifyMandateVersionedOfflineFromWrapHash(c.userSignKey, c.context, c.fprHex, c.wrapHash, c.signature, served);
            if (c.expect === 'ok') {
                const m = await r;
                expect(`${c.name} : ${m.mode}`).toBe(`${c.name} : ${c.expectMode}`);
                expect(m.ownerRsaSpkiHex).toBe(m.version === 2 ? c.ownerRsaSpkiHex! : null);
            } else {
                await expect(r).rejects.toMatchObject({ code: c.expect });
            }
        }
    });

    test('rt1Policy (12 §10.2)', () => {
        expect(v.rt1Policy.length).toBe(8);
        for (const c of v.rt1Policy) {
            const mandate: VerifiedMandate | null = c.mandateUnusable
                ? null
                : c.mandateVersion === 1 ? { version: 1, mode: 'plan', ownerRsaSpkiHex: null } : { version: 2, mode: c.mode!, ownerRsaSpkiHex: v.keys.ownerRsaSpkiHex };
            // `production` absent : le défaut de la fonction (production).
            const verdict = c.production === undefined ? rt1Verdict(mandate, c.envelopeValid) : rt1Verdict(mandate, c.envelopeValid, c.production);
            expect(`${c.name} : ${verdict}`).toBe(`${c.name} : ${c.expect}`);
        }
    });

    test('signature v2 TS vérifiée ; mode échangé et empreinte mal formée refusés', async () => {
        const key = await importEcdsaPrivate(fromHex(v.keys.userSignScalarHex));
        const owner = v.keys.ownerRsaSpkiHex;
        const sig = await signMandateV2(key, v.context, v.fprHex, v.wrap, owner, 'auto');
        expect((await verifyMandateVersioned(v.userSignKey, v.context, v.fprHex, v.wrap, sig, { mandateVersion: 2, mode: 'auto', ownerRsaSpkiHex: owner })).mode).toBe('auto');
        await expect(verifyMandateVersioned(v.userSignKey, v.context, v.fprHex, v.wrap, sig, { mandateVersion: 2, mode: 'plan', ownerRsaSpkiHex: owner }))
            .rejects.toMatchObject({ code: 'delegation_unusable' });
        await expect(signMandateV2(key, v.context, v.fprHex, v.wrap, owner.toUpperCase(), 'auto')).rejects.toMatchObject({ code: 'invalid_input' });
    });
});
