import { describe, expect, test } from 'bun:test';
import { ArtifactUnreadableError, artifactMatches, parseMarkdown, readVerified, sanitizeArtifactName, type ArtifactMeta } from './artifactModel';

const enc = (s: string) => new TextEncoder().encode(s);
const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc(s)))].map(b => b.toString(16).padStart(2, '0')).join('');

describe('artefacts de l’agent', () => {
    test('nom assaini : chemin, contrôles, bidi et points de tête retirés', () => {
        expect(sanitizeArtifactName('../../etc/passwd')).toBe('passwd');
        expect(sanitizeArtifactName('C:\\x\\Planning‮gpj.md')).toBe('Planning gpj.md');
        expect(sanitizeArtifactName('..hidden')).toBe('hidden');
        expect(sanitizeArtifactName('')).toBe('fichier');
    });
    test('empreinte vérifiée : un contenu altéré est illisible', async () => {
        const meta: ArtifactMeta = { id: 'a', name: 'n.md', size: 3, mimeType: 'text/markdown', sha256: await sha('abc') };
        expect(await artifactMatches(enc('abc'), meta.sha256)).toBe(true);
        expect((await readVerified({ read: async () => enc('abc') }, meta)).length).toBe(3);
        await expect(readVerified({ read: async () => enc('abd') }, meta)).rejects.toBeInstanceOf(ArtifactUnreadableError);
        await expect(readVerified({ read: async () => { throw new Error('x'); } }, meta)).rejects.toBeInstanceOf(ArtifactUnreadableError);
    });
    test('Markdown : blocs de texte, le HTML reste du texte', () => {
        const b = parseMarkdown('# Titre\n\nUn <script>alert(1)</script> [lien](javascript:x)\n- a\n- b\n\n```\ncode <b>\n```');
        expect(b[0]).toEqual({ t: 'h', level: 1, text: 'Titre' });
        expect(b[1]).toEqual({ t: 'p', text: 'Un <script>alert(1)</script> [lien](javascript:x)' });
        expect(b[2]).toEqual({ t: 'ul', items: ['a', 'b'] });
        expect(b[3]).toEqual({ t: 'code', text: 'code <b>' });
    });
});
