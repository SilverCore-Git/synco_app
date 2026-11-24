import { describe, expect, test } from 'bun:test';
import { buildFilesView, formatFileSize } from './filesResultModel';
import { buildResultRegistry } from './resultRegistry';
import { buildSummaryRegistry, summarizeTool, noSummaryContext } from '../summaries/summaryRegistry';
import * as filesSummaries from '../summaries/filesSummaries';

describe('rendu du domaine Fichiers', () => {
    test('FilesResult.vue s’enregistre sous le domaine files', () => {
        expect(Object.keys(buildResultRegistry({ './FilesResult.vue': async () => ({ default: {} }) }))).toEqual(['files']);
    });

    test('list_files : lignes, taille lisible, restriction, troncature', () => {
        const v = buildFilesView('list_files', {
            files: [{ id: 'f1', name: 'a.txt', mimeType: 'text/plain', size: 2048, restricted: true }, { name: 'sans id' }],
            total: 120, truncated: true,
        });
        expect(v.kind).toBe('files');
        if (v.kind !== 'files') return;
        expect(v.rows).toHaveLength(1);
        expect(v.rows[0]).toMatchObject({ id: 'f1', detail: '2,0 Kio · accès restreint', icon: 'bi-file-earmark-text' });
        expect(v.total).toBe(120);
        expect(v.truncated).toBe(true);
    });

    test('list_org_files : le nom d’un message privé est absent, jamais inventé', () => {
        const v = buildFilesView('list_org_files', { files: [{ id: 'x', name: null, size: 10 }] });
        expect(v.kind === 'files' && v.rows[0]!.name).toBe('Fichier privé');
    });

    test('read_file : extrait borné, un nom HTML reste du texte', () => {
        const v = buildFilesView('read_file', { name: '<b>x</b>', content: 'a'.repeat(1000), truncated: false });
        expect(v.kind).toBe('content');
        if (v.kind !== 'content') return;
        expect(v.excerpt.length).toBe(401);
        expect(v.length).toBe(1000);
        expect(v.name).toBe('<b>x</b>');
    });

    test('déplacements et suppressions : messages courts', () => {
        expect(buildFilesView('move_files', { moved: 3 })).toEqual({ kind: 'message', text: '3 fichiers déplacés.' });
        expect(buildFilesView('move_folders', { moved: 1 })).toEqual({ kind: 'message', text: '1 dossier déplacé.' });
        expect(buildFilesView('delete_file', {})).toEqual({ kind: 'message', text: 'Fichier supprimé.' });
    });

    test('formatFileSize', () => {
        expect(formatFileSize(512)).toBe('512 o');
        expect(formatFileSize(1536)).toBe('1,5 Kio');
        expect(formatFileSize(-1)).toBe('');
    });

    test('résumés de confirmation des outils sensibles', () => {
        const mods = { './filesSummaries.ts': filesSummaries };
        expect(Object.keys(buildSummaryRegistry(mods)).sort()).toEqual(['delete_file', 'delete_folder', 'move_files', 'move_folders', 'rename_folder', 'update_text_file']);
        expect(summarizeTool('move_files', { fileIds: ['a', 'b'], toFolderId: null }, noSummaryContext, mods)).toBe('Déplacer 2 fichiers vers la racine de l’espace');
        expect(summarizeTool('delete_folder', { folderId: 'd1' }, noSummaryContext, mods)).toContain('tous les fichiers');
    });
});
