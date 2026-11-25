/** Vecteurs plan-kinds.json et text-declaration.json (copies conformes de synco_ai_runtime/docs/plan/vectors/). */
import { describe, expect, test } from 'bun:test';
import pk from '../../../scripts/e2ee-vectors/plan-kinds.json';
import td from '../../../scripts/e2ee-vectors/text-declaration.json';
import { importEcdsaPrivate, p256Jwk } from '../../../scripts/e2ee-vectors/fixedRandom';
import type { JsonObject } from './aiActionPlan';
import { parseTd, parseTextEnvelope, encodeTextEnvelope, verifyTextDeclaration, type ReaderDeps } from './agentMessage';
import {
    MESSAGE_KIND_RISK, buildTextDeclarationFor, checkMessageKindArgs, isMessageKind, messageKindExecutor, messageTarget, saltHexFor,
    type MessageExecutorContext,
} from './agentMessagePlan';

const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], b => parseInt(b, 16));

type Exec = { name: string; mode: 'plan' | 'auto'; action: JsonObject; expect: string; targetAuthorSameUserRuntime?: boolean; refExecutors?: Record<string, 'device' | 'agent'>; refKinds?: Record<string, string> };

describe('plan-kinds.json : validationCases (kinds de message)', () => {
    for (const c of pk.validationCases as unknown as Array<{ name: string; expect: string; plan: { actions: JsonObject[] } }>) {
        const mine = c.plan.actions.filter(a => isMessageKind(a.kind));
        // Cas qui ne portent que sur d'autres kinds : hors de ce module.
        if (!/^(message|dm)\./.test(c.name) && !c.name.startsWith('plan de référence')) continue;
        test(c.name, () => {
            expect(mine.every(checkMessageKindArgs)).toBe(c.expect === 'ok');
        });
    }
});

describe('plan-kinds.json : risque fixe', () => {
    for (const r of pk.kindRisk.filter(k => isMessageKind(k.kind))) {
        test(r.kind, () => expect(MESSAGE_KIND_RISK[r.kind as keyof typeof MESSAGE_KIND_RISK]).toBe(r.risk as 'R1' | 'R2'));
    }
});

describe('executorCases (plan-kinds.json, text-declaration.json)', () => {
    const all = [...(pk.executorCases as unknown as Exec[]), ...(td.executorCases as unknown as Exec[])].filter(c => isMessageKind(c.action.kind));
    for (const c of all) {
        test(c.name, () => {
            const ctx: MessageExecutorContext = { mode: c.mode, targetAuthorSameUserRuntime: c.targetAuthorSameUserRuntime, refExecutors: c.refExecutors, refKinds: c.refKinds };
            expect(messageKindExecutor(c.action, ctx)).toBe(c.expect as 'device' | 'agent');
        });
    }
});

describe('déclaration de la décision (12 §10.7, étape 2) avec le code réel', () => {
    const keys = { [td.ids.userId]: p256Jwk(fromHex(td.keys.userSignKey.privateScalarHex)).publicJwk };
    const deps: ReaderDeps = {
        async verifySigner(senderId, bytes, sig) {
            const jwk = keys[senderId];
            if (!jwk) return 'unavailable';
            const k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
            return (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig as BufferSource, bytes as BufferSource)) ? 'trusted' : 'none';
        },
    };
    const declCase = (name: string) => td.declarationCases.find(c => c.name === name)!;

    test('message.send, salon fixé : même déclaration que le vecteur, lue text_verified', async () => {
        const action: JsonObject = { n: 1, kind: 'message.send', args: { threadId: td.ids.threadId, text: td.texts.T1 } };
        const input = { ck: fromHex(td.keys.ckHex), sessionId: td.ids.sessionId, planId: td.ids.planId, orgId: td.ids.orgId, userId: td.ids.userId, userSignKey: await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)) };
        const seg = await buildTextDeclarationFor(action, input);
        const v = declCase('message.send, salon fixé');
        expect(parseTd(seg)!.canonical).toBe(v.canonical);
        const plaintext = encodeTextEnvelope(await saltHexFor(input.ck, input.sessionId, input.planId, 1), td.texts.T1);
        expect(parseTextEnvelope(plaintext)!.text).toBe(td.texts.T1);
        const r = await verifyTextDeclaration({ orgId: td.ids.orgId, threadId: td.ids.threadId, senderId: td.ids.userId, messageId: 'm9', replyToId: null, rev: 0 }, seg, plaintext, deps);
        expect(r.state).toBe('text_verified');
    });

    test('message.edit par argsRefs : cible vide, argsRefs dans la déclaration', async () => {
        const action: JsonObject = { n: 2, kind: 'message.edit', args: { text: td.texts.T2 }, argsRefs: { messageId: '$1.id' } };
        expect(messageTarget(action)).toEqual({ kind: 'message.edit', target: {}, argsRefs: { messageId: '$1.id' } });
        const input = { ck: fromHex(td.keys.ckHex), sessionId: td.ids.sessionId, planId: td.ids.planId, orgId: td.ids.orgId, userId: td.ids.userId, userSignKey: await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)) };
        expect(parseTd(await buildTextDeclarationFor(action, input))!.canonical).toBe(declCase('message.edit, message venu par argsRefs').canonical);
    });

    test('mentions : le texte engagé est le texte final (jetons ajoutés)', async () => {
        const input = { ck: fromHex(td.keys.ckHex), sessionId: td.ids.sessionId, planId: td.ids.planId, orgId: td.ids.orgId, userId: td.ids.userId, userSignKey: await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)) };
        const seg = await buildTextDeclarationFor({ n: 1, kind: 'message.send', args: { threadId: td.ids.threadId, text: 'Salut', mentionUserIds: ['u2'] } }, input);
        const salt = await saltHexFor(input.ck, input.sessionId, input.planId, 1);
        const msg = { orgId: td.ids.orgId, threadId: td.ids.threadId, senderId: td.ids.userId, messageId: 'm9', replyToId: null, rev: 0 };
        expect((await verifyTextDeclaration(msg, seg, encodeTextEnvelope(salt, 'Salut <@:u2>'), deps)).state).toBe('text_verified');
        expect((await verifyTextDeclaration(msg, seg, encodeTextEnvelope(salt, 'Salut'), deps)).reason).toBe('text_mismatch');
    });

    test('action sans texte dans args (texte par argsRefs) : aucune déclaration possible', async () => {
        const input = { ck: fromHex(td.keys.ckHex), sessionId: td.ids.sessionId, planId: td.ids.planId, orgId: td.ids.orgId, userId: td.ids.userId, userSignKey: await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)) };
        await expect(buildTextDeclarationFor({ n: 2, kind: 'message.send', args: { threadId: 't' }, argsRefs: { text: '$1.id' } }, input)).rejects.toThrow();
    });
});
