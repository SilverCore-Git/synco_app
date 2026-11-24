/** Contrôles de l'app sur les artefacts (13 §7.1) : rejoue les vecteurs figés `artifacts.json` (encryptionCases, verifyCases). */
import { describe, expect, test } from 'bun:test';
import raw from '../../../../scripts/e2ee-vectors/artifacts.json';
import { decryptAiFieldStrict, encryptAiFieldStrict } from '@/assets/utils/aiActionPlan';
import { ArtifactUnreadableError, artifactMatches } from './artifactModel';
import { createArtifactSource, openArtifact, type ArtifactRef } from './artifactSource';

const hexBytes = (h: string) => Uint8Array.from(h.match(/../g)!.map(b => parseInt(b, 16)));
const ck = hexBytes(raw.keys.ckHex);
const otherCk = hexBytes(raw.keys.otherCkHex);

describe('vecteurs artifacts.json : encryptionCases', () => {
    for (const c of raw.encryptionCases as { name: string; sessionId: string; messageId: string; fieldName: string; value: string; expect: string; expectClear?: string; ck?: string }[]) {
        test(c.name, async () => {
            const key = c.name === 'autre CK' ? otherCk : ck;
            const run = () => decryptAiFieldStrict(key, c.sessionId, c.messageId, c.fieldName, c.value);
            if (c.expect === 'ok') expect(await run()).toBe(c.expectClear!);
            else await expect(run()).rejects.toMatchObject({ message: c.expect });
        });
    }
});

describe('vecteurs artifacts.json : verifyCases', () => {
    for (const c of raw.verifyCases as { name: string; ref: ArtifactRef; meta: string; value: string; expect: string; expectMeta?: Record<string, unknown> }[]) {
        test(c.name, async () => {
            if (c.expect === 'ok') {
                const { meta, bytes } = await openArtifact(ck, c.ref, c);
                expect(meta).toEqual(c.expectMeta as never);
                expect(new TextDecoder().decode(bytes)).toBe(raw.content);
            } else {
                await expect(openArtifact(ck, c.ref, c)).rejects.toBeInstanceOf(ArtifactUnreadableError);
            }
        });
    }
});

describe('ArtifactSource', () => {
    const ref: ArtifactRef = { sessionId: raw.sessionId, messageId: raw.messageId, toolCallId: raw.toolCallId, artifactId: raw.artifactId };
    const good = { id: raw.artifactId, meta: raw.metaValue, value: raw.contentValue };

    test('charge les métadonnées puis lit le clair vérifié', async () => {
        const src = createArtifactSource({ ck, fetchArtifact: async () => good });
        const meta = await src.load(ref);
        expect(meta.name).toBe('budget-lancement.csv');
        expect(new TextDecoder().decode(await src.read(raw.artifactId))).toBe(raw.content);
    });
    test('lecture d’un artefact non déclaré, réponse d’un autre id, échec réseau : illisible', async () => {
        const src = createArtifactSource({ ck, fetchArtifact: async () => good });
        await expect(src.read(raw.artifactId)).rejects.toBeInstanceOf(ArtifactUnreadableError);
        await expect(createArtifactSource({ ck, fetchArtifact: async () => ({ ...good, id: 'x' }) }).load(ref)).rejects.toBeInstanceOf(ArtifactUnreadableError);
        await expect(createArtifactSource({ ck, fetchArtifact: async () => { throw new Error('404'); } }).load(ref)).rejects.toBeInstanceOf(ArtifactUnreadableError);
    });
    test('contenu de même taille mais d’empreinte différente, bien chiffré sous CK : illisible', async () => {
        // Le runtime détient CK : il peut chiffrer un autre contenu de même longueur. Seule l'empreinte le trahit.
        const forged = raw.content.slice(0, -1) + (raw.content.endsWith('x') ? 'y' : 'x');
        expect(new TextEncoder().encode(forged).length).toBe(new TextEncoder().encode(raw.content).length);
        const value = await encryptAiFieldStrict(ck, raw.sessionId, raw.artifactId, 'artifact', forged);
        await expect(openArtifact(ck, ref, { meta: raw.metaValue, value })).rejects.toBeInstanceOf(ArtifactUnreadableError);
    });
    test('contenu altéré après le chargement : lecture illisible', async () => {
        const bad = (raw.verifyCases as { name: string; value: string }[]).find(c => c.name.startsWith('empreinte différente'))!;
        let served = good;
        const src = createArtifactSource({ ck, fetchArtifact: async () => served });
        await src.load(ref);
        served = { ...good, value: bad.value };
        await expect(src.read(raw.artifactId)).rejects.toBeInstanceOf(ArtifactUnreadableError);
    });
    test('empreinte en majuscules refusée par artifactMatches', async () => {
        expect(await artifactMatches(new TextEncoder().encode(raw.content), raw.sha256)).toBe(true);
        expect(await artifactMatches(new TextEncoder().encode(raw.content), raw.sha256.toUpperCase())).toBe(false);
    });
});
