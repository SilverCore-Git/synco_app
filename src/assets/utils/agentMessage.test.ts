/**
 * Vecteurs figés par la spécification (L00i, L00j) : scripts/e2ee-vectors/message-v3.json,
 * text-declaration.json et plan-kinds.json, copies conformes de synco_ai_runtime/docs/plan/vectors/.
 * Les signatures ECDSA ne sont pas déterministes : celles des vecteurs sont VÉRIFIÉES, et les nôtres
 * (même déclaration, même clé) doivent l'être par la même fonction.
 */
import { describe, expect, test } from 'bun:test';
import v3 from '../../../scripts/e2ee-vectors/message-v3.json';
import td from '../../../scripts/e2ee-vectors/text-declaration.json';
import pk from '../../../scripts/e2ee-vectors/plan-kinds.json';
import { importEcdsaPrivate, p256Jwk } from '../../../scripts/e2ee-vectors/fixedRandom';
import { jcs, type JsonValue } from './aiActionPlan';
import {
    agentMessageText, classifyThreadIv, declarationSignedBytes, dmAadV3, dmSignedV3, encodeTextEnvelope, findReplayedDeclarations,
    formatM3Iv, parseD3Nonce, parseM3Iv, parseTd, parseTextEnvelope, readDeclaration, signTextDeclaration, targetDigest,
    targetDigestInput, textCommit, textSalt, textSaltInfo, threadAadV3, threadSignedV3, userSocketIvAllowed, verifyTextDeclaration,
    type DeclarationSignerTrust, type ReaderDeps, type TextDeclaration,
} from './agentMessage';

const fromHex = (h: string) => Uint8Array.from(h.match(/../g) ?? [], b => parseInt(b, 16));
const toHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const enc = new TextEncoder();

const userPub = p256Jwk(fromHex(td.keys.userSignKey.privateScalarHex)).publicJwk;
const otherPub = p256Jwk(fromHex(td.keys.otherMemberSignKey.privateScalarHex)).publicJwk;
const KEYS: Record<string, JsonWebKey> = { [td.ids.userId]: userPub, [td.ids.otherUserId]: otherPub };

const deps: ReaderDeps = {
    async verifySigner(senderId, bytes, signature): Promise<DeclarationSignerTrust> {
        const jwk = KEYS[senderId];
        if (!jwk) return 'unavailable';
        const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
        return (await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature as BufferSource, bytes as BufferSource)) ? 'trusted' : 'none';
    },
};

describe('message-v3.json : analyse de iv / nonce (12 §4.3)', () => {
    for (const c of v3.parseCases) {
        test(c.name, () => {
            if (c.expect === 'ok_m2') return expect(classifyThreadIv(c.iv)).toBe('m2');
            if (c.expect === 'ok_legacy') return expect(classifyThreadIv(c.iv)).toBe('legacy');
            if (c.expect === 'invalid_format') return expect(() => parseM3Iv(c.iv)).toThrow();
            const p = parseM3Iv(c.iv);
            if (c.expect === 'invalid') return expect(p.signature).toBe('');
            expect({ iv: p.iv, clientMsgId: p.clientMsgId, author: p.author, signature: p.signature, rev: p.rev }).toEqual(c.parsed!);
            expect(formatM3Iv(p)).toBe(c.iv);
        });
    }
    for (const c of v3.dmParseCases) {
        test(c.name, () => {
            if (c.expect === 'ok') expect(() => parseD3Nonce(c.nonce)).not.toThrow();
            else expect(() => parseD3Nonce(c.nonce)).toThrow();
        });
    }
    test('apiCases côté socket de l\'utilisateur : auteur rt1: refusé, ai et m2 admis', () => {
        for (const c of v3.apiCases.filter(x => x.channel === 'user')) expect(userSocketIvAllowed(c.iv)).toBe(c.expect === 'ok');
    });
});

describe('message-v3.json : octets exacts (AAD, signature)', () => {
    for (const c of v3.bytesCases) {
        test(c.name, () => {
            if ('threadId' in c && c.threadId) {
                expect(threadAadV3(c.threadId, c.senderId, c.clientMsgId, c.author!, c.rev)).toBe(c.aad);
                expect(threadSignedV3(c.threadId, c.senderId, c.clientMsgId, c.author!, c.ivB64, c.ciphertextB64!, c.rev)).toBe(c.signed);
            } else {
                const d = c as unknown as { senderId: string; recipientId: string; clientMsgId: string; ivB64: string; ciphertext: string; encryptedAesKey: string; selfEncryptedAesKey: string; rev: number; aad: string; signed: string };
                expect(dmAadV3(d.senderId, d.recipientId, d.clientMsgId, d.rev)).toBe(d.aad);
                expect(dmSignedV3(d.senderId, d.recipientId, d.clientMsgId, d.ivB64, d.ciphertext, d.encryptedAesKey, d.selfEncryptedAesKey, d.rev)).toBe(d.signed);
            }
        });
    }
    for (const c of td.cskBytesCases) {
        test(c.name, () => {
            expect(threadSignedV3(c.threadId, c.senderId, c.clientMsgId, c.author, c.ivB64, c.ciphertextB64, c.rev, c.td)).toBe(c.signed);
            expect(threadAadV3(c.threadId, c.senderId, c.clientMsgId, c.author, c.rev)).toBe(c.aad);
            expect(parseM3Iv(c.iv).td).toBe(c.td);
        });
    }
});

describe('text-declaration.json : sel, empreinte, enveloppe (12 §10.7)', () => {
    for (const c of td.saltCases) {
        test(c.name, async () => {
            expect(textSaltInfo(c.sessionId, c.planId, c.n)).toBe(c.info);
            expect(toHex(await textSalt(fromHex(c.ckHex), c.sessionId, c.planId, c.n))).toBe(c.saltHex);
        });
    }
    for (const c of td.commitCases) {
        test(c.name, async () => {
            expect(toHex(enc.encode(c.text))).toBe(c.textUtf8Hex);
            expect(await textCommit(fromHex(c.saltHex), c.text)).toBe(c.textCommitHex);
        });
    }
    for (const c of td.plaintextCases) {
        test(c.name, () => {
            const p = parseTextEnvelope(c.plaintext);
            if (c.expect === 'ok') {
                expect(p).toEqual({ saltHex: c.saltHex!, text: c.text! });
                expect(encodeTextEnvelope(c.saltHex!, c.text!)).toBe(c.plaintext);
            } else {
                expect(p).toBeNull();
            }
        });
    }
    test('texte UTF-16 mal formé refusé (comme JCS)', async () => {
        await expect(textCommit(new Uint8Array(32), 'a\ud800')).rejects.toThrow();
        expect(() => agentMessageText({ text: '\udc00' })).toThrow();
    });
    test('CK de mauvaise longueur refusée', async () => {
        await expect(textSalt(new Uint8Array(31), td.ids.sessionId, td.ids.planId, 1)).rejects.toThrow();
    });
});

describe('text-declaration.json : déclaration signée', () => {
    for (const c of td.declarationCases) {
        test(c.name, async () => {
            const d = readDeclaration(c.declaration as JsonValue) as TextDeclaration;
            expect(d).not.toBeNull();
            expect(jcs(c.declaration as JsonValue)).toBe(c.canonical);
            expect(declarationSignedBytes(d)).toBe(c.signed);
            const tIn = targetDigestInput(d.kind, d.target, d.argsRefs);
            expect(jcs(tIn)).toBe(c.targetCanonical);
            expect(await targetDigest(d.kind, d.target, d.argsRefs)).toBe(c.targetDigestHex);
            // Signature du vecteur vérifiée ; la nôtre, sur les mêmes octets, aussi.
            const parsed = parseTd(c.segment)!;
            expect(parsed.canonical).toBe(c.canonical);
            expect(await deps.verifySigner(td.ids.userId, enc.encode(c.signed), parsed.signature)).toBe('trusted');
            const mine = await signTextDeclaration(await importEcdsaPrivate(fromHex(td.keys.userSignKey.privateScalarHex)), d);
            expect(mine.split(':')[1]).toBe(c.segment.split(':')[1]);
            expect(await deps.verifySigner(td.ids.userId, enc.encode(c.signed), parseTd(mine)!.signature)).toBe('trusted');
        });
    }
    for (const c of td.parseCases) {
        test(`iv : ${c.name}`, () => {
            if (c.expect === 'invalid_format') return expect(() => parseM3Iv(c.iv)).toThrow();
            expect(parseM3Iv(c.iv).td).toBe(c.td);
        });
    }
    test('champ inconnu, kind hors liste, cible hors liste : refusés', () => {
        const base = td.declarationCases[0]!.declaration as Record<string, JsonValue>;
        expect(readDeclaration({ ...base, x: 1 })).toBeNull();
        expect(readDeclaration({ ...base, kind: 'dm.send' })).toBeNull();
        expect(readDeclaration({ ...base, target: { messageId: 'm1' } })).toBeNull();
        expect(readDeclaration({ ...base, textCommit: 'A'.repeat(64) })).toBeNull();
    });
});

describe('text-declaration.json : lecteur (raisons ordonnées)', () => {
    for (const c of td.readerCases) {
        test(c.name, async () => {
            const r = await verifyTextDeclaration(c.message, c.td, c.plaintext, deps);
            expect(r.state).toBe(c.expect as 'text_verified' | 'text_unverified');
            expect(r.reason).toBe((c as { reason?: string }).reason as never);
            expect(r.display).toBe(c.display);
        });
    }
    test('rejeu : même (planId, n) sur un autre clientMsgId → le plus récent', () => {
        const a = { planId: td.ids.planId, n: 1 };
        const out = findReplayedDeclarations([
            { id: 'b', clientMsgId: 'c2', createdAt: '2026-11-24T10:01:00Z', action: a },
            { id: 'a', clientMsgId: 'c1', createdAt: '2026-11-24T10:00:00Z', action: a },
            { id: 'c', clientMsgId: 'c1', createdAt: '2026-11-24T10:02:00Z', action: a },
        ]);
        expect([...out]).toEqual(['b']);
    });
    test('clé ancienne sans preuve : vérifié mais au mieux unsigned', async () => {
        const c = td.readerCases[0]!;
        const weak: ReaderDeps = { verifySigner: async (...a) => ((await deps.verifySigner(...a)) === 'trusted' ? 'history' : 'none') };
        const r = await verifyTextDeclaration(c.message, c.td, c.plaintext, weak);
        expect(r.state).toBe('text_verified');
        expect(r.weakKey).toBe(true);
    });
});

describe('plan-kinds.json : condensats de cible des kinds de message', () => {
    const cases = (pk as unknown as { targetDigests: Array<{ name: string; input: { kind: string; target: Record<string, string | string[]>; argsRefs?: Record<string, string> }; canonical: string; sha256Hex: string }> }).targetDigests;
    for (const c of cases.filter(x => x.input.kind.startsWith('message.'))) {
        test(c.name, async () => {
            expect(jcs(targetDigestInput(c.input.kind, c.input.target, c.input.argsRefs))).toBe(c.canonical);
            expect(await targetDigest(c.input.kind, c.input.target, c.input.argsRefs)).toBe(c.sha256Hex);
        });
    }
});

describe('agentMessageText (texte final engagé, L15f)', () => {
    // Valeurs à rejouer par le worker (L15-rt) : la fonction est fixée par L15f (12 §10.7).
    const CASES: Array<{ args: { text: string; mentionUserIds?: string[] }; out: string }> = [
        { args: { text: 'Bonjour' }, out: 'Bonjour' },
        { args: { text: 'Bonjour', mentionUserIds: [] }, out: 'Bonjour' },
        { args: { text: 'Bonjour', mentionUserIds: ['u1', 'u2'] }, out: 'Bonjour <@:u1> <@:u2>' },
        { args: { text: 'Merci <@:u1> !', mentionUserIds: ['u1', 'u2'] }, out: 'Merci <@:u1> ! <@:u2>' },
        { args: { text: 'x', mentionUserIds: ['u2', 'u2', 'u1'] }, out: 'x <@:u2> <@:u1>' },
        { args: { text: 'é\r\n ', mentionUserIds: ['u1'] }, out: 'é\r\n  <@:u1>' },
    ];
    for (const c of CASES) test(JSON.stringify(c.args), () => expect(agentMessageText(c.args)).toBe(c.out));
    test('identifiant de mention non conforme refusé', () => {
        expect(() => agentMessageText({ text: 'x', mentionUserIds: ['a|b'] })).toThrow();
    });
});
