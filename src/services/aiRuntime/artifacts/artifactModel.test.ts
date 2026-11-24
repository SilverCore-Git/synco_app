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

describe('visionneuse, téléchargement, enregistrement (13 §7.2, §8)', () => {
    const mk = async (name: string, text: string) => ({ meta: { id: 'a', name, size: enc(text).length, mimeType: 'text/html', sha256: await sha(text) } satisfies ArtifactMeta, source: { read: async () => enc(text) } });

    test('html actif : texte brut côté visionneuse (jamais du Markdown), source du fichier inchangée', async () => {
        const { isMarkdownName } = await import('./artifactModel');
        expect(isMarkdownName('page.html')).toBe(false);
        expect(isMarkdownName('x.js') || isMarkdownName('x.sh') || isMarkdownName('x.php')).toBe(false);
        expect(isMarkdownName('Notes.MD')).toBe(true);
    });
    test('téléchargement : octet-stream, nom assaini, contenu vérifié', async () => {
        const { prepareDownload } = await import('./artifactModel');
        const { meta, source } = await mk('../../etc/évil‮.html', '<script>alert(1)</script>');
        const d = await prepareDownload(source, meta);
        expect(d.blob.type).toBe('application/octet-stream');
        expect(d.fileName).not.toMatch(/[\\/‮]/);
        expect(await d.blob.text()).toBe('<script>alert(1)</script>');
        await expect(prepareDownload({ read: async () => enc('<script>alert(2)</script>') }, meta)).rejects.toBeInstanceOf(ArtifactUnreadableError);
    });
    test('enregistrement : file.create_text avec le clair vérifié et le nom assaini ; contrôle en échec = rien écrit', async () => {
        const { saveVerified } = await import('./artifactModel');
        const { meta, source } = await mk('../rapport.md', '# Titre');
        const calls: [unknown, string, string][] = [];
        await saveVerified(source, meta, { spaceId: 's1', folderId: null }, async (t, n, c) => { calls.push([t, n, c]); });
        expect(calls).toEqual([[{ spaceId: 's1', folderId: null }, 'rapport.md', '# Titre']]);
        await expect(saveVerified({ read: async () => enc('# Autre') }, meta, { spaceId: 's1', folderId: null }, async () => { calls.push([null, '', '']); })).rejects.toBeInstanceOf(ArtifactUnreadableError);
        expect(calls).toHaveLength(1);
    });
});
