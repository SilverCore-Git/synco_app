import { afterEach, describe, expect, test } from 'bun:test';
import { PlanInvalidError, validatePlan, ToolManifest, type JsonObject, type PlanContext } from '@/assets/utils/aiActionPlan';
import { assertReadableByAgent, assertWritableByAgent, decodeUtf8Clipped, fileVersion, TextFileError } from '@/services/fileTextCodec';
import { forgetFileNames, rememberFileNames } from '@/components/ai/summaries/fileNames';
import { summaries } from '@/components/ai/summaries/filesSummaries';
import { noSummaryContext } from '@/components/ai/summaries/summaryRegistry';
import { actionLabel, KIND_ICON, kindChip } from '../plan/planLabels';
import { creationFailureState, DeviceNotSentError } from '../plan/deviceErrors';
import { planClientTool, planKindDescription, setPlanKindModules } from './index';
import updateText from './file.update_text';

const inject = () => setPlanKindModules({ './file.update_text.ts': { default: updateText } });
afterEach(() => setPlanKindModules(undefined));

const ctx = (patch: Partial<PlanContext> = {}): PlanContext => ({
    sessionId: 's1', maxLifetimeSecs: 3600, manifest: new ToolManifest(), mode: 'ask', createThreadAsk: true,
    availableTools: new Set(['update_text_file']), ...patch,
});
const plan = (action: JsonObject): JsonObject => ({
    v: 1, planId: 'p1', sessionId: 's1', toolCallId: 't1', createdAt: 1000, expiresAt: 2000, summary: 'x', actions: [{ n: 1, ...action }],
});
const updateAction = (args: JsonObject = { fileId: 'f1', content: 'bonjour', baseVersion: 'blob-1' }): JsonObject => ({ kind: 'file.update_text', args });

describe('file.update_text dans le plan', () => {
    test('accepté quand le module est déclaré', () => {
        inject();
        expect(validatePlan(plan(updateAction()), ctx())).toBeDefined();
    });

    test('kind lié à son outil : outil absent ou refusé pour l’org = plan_kind', () => {
        inject();
        expect(updateText.tool).toBe('update_text_file');
        expect(() => validatePlan(plan(updateAction()), ctx({ availableTools: new Set(['create_task']) }))).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan(updateAction()), ctx({ availableTools: undefined }))).toThrow(PlanInvalidError);
    });

    test('non déclaré : refusé (plan_kind)', () => {
        expect(() => validatePlan(plan(updateAction()), ctx())).toThrow(PlanInvalidError);
    });

    test('arguments hors schéma ou baseVersion absent : refusés', () => {
        inject();
        expect(() => validatePlan(plan(updateAction({ fileId: 'f1', content: 'x' })), ctx())).toThrow(PlanInvalidError);
        expect(() => validatePlan(plan(updateAction({ fileId: 'f1', content: 'x', baseVersion: 'v', extra: 'y' })), ctx())).toThrow(PlanInvalidError);
    });

    test('un exécutant sans schéma ne rend pas un kind admissible', () => {
        setPlanKindModules({ './x.ts': { default: { kind: 'file.other', execute: async () => ({ id: 'x' }) } } });
        expect(planKindDescription('file.other')).toBeUndefined();
        expect(() => validatePlan(plan({ kind: 'file.other', args: {} }), ctx())).toThrow(PlanInvalidError);
    });

    test('libellé, icône, puce et outils client viennent du registre', () => {
        inject();
        expect(actionLabel('file.update_text', undefined, { fileId: 'f1' })).toBe('Modifier le contenu du fichier f1');
        expect(KIND_ICON['file.update_text']).toBe('bi-file-earmark-diff');
        expect(kindChip('file.update_text', undefined, 2)).toBe('2 fichiers modifiés');
        expect(planClientTool('read_file')?.name).toBe('read_file');
        expect(planClientTool('update_text_file')?.name).toBe('update_text_file');
        expect(planClientTool('inconnu')).toBeUndefined();
    });

    test('update_text_file hors plan : arguments invalides refusés avant tout accès', async () => {
        inject();
        await expect(planClientTool('update_text_file')!.run({ fileId: 'f1' }, { orgId: 'o' })).rejects.toThrow('Arguments invalides');
        await expect(planClientTool('read_file')!.run({}, { orgId: 'o' })).rejects.toThrow('fileId');
    });

    test('exécuteur : arguments manquants = échec franc', async () => {
        await expect(updateText.execute({ fileId: 'f1' }, 'p/1', 'o')).rejects.toBeInstanceOf(DeviceNotSentError);
    });
});

describe('lecture bornée d’un fichier texte', () => {
    test('sous la borne : tout le texte', () => {
        expect(decodeUtf8Clipped(new TextEncoder().encode('héllo'), 100)).toEqual({ text: 'héllo', truncated: false });
    });

    test('coupe sur une frontière de caractère, jamais au milieu', () => {
        const bytes = new TextEncoder().encode('aé€');
        expect(decodeUtf8Clipped(bytes, 2)).toEqual({ text: 'a', truncated: true });
        expect(decodeUtf8Clipped(bytes, 3)).toEqual({ text: 'aé', truncated: true });
        expect(decodeUtf8Clipped(bytes, 5)).toEqual({ text: 'aé', truncated: true });
    });

    test('file_changed est un échec franc (rien écrit), pas une issue inconnue', () => {
        expect(creationFailureState(new DeviceNotSentError(new TextFileError('file_changed').code))).toBe('failed');
    });
});

const code = (fn: () => void): string | null => { try { fn(); return null; } catch (e) { return e instanceof TextFileError ? e.code : 'autre'; } };

describe('gardes d’org et de portée des outils read_file / update_text_file', () => {
    const space = { orgId: 'o1', workspaceId: 's1' };

    test('lecture : org de la conversation exigée ; MP et support refusés', () => {
        expect(code(() => assertReadableByAgent(space, 'o1'))).toBeNull();
        expect(code(() => assertReadableByAgent(space, 'autre-org'))).toBe('not_in_org');
        expect(code(() => assertReadableByAgent({ workspaceId: 's1' }, 'o1'))).toBe('not_in_org');
        expect(code(() => assertReadableByAgent({ ...space, dmMessageId: 'd' }, 'o1'))).toBe('not_readable');
        expect(code(() => assertReadableByAgent({ ...space, supportTicketId: 't' }, 'o1'))).toBe('not_readable');
        expect(code(() => assertReadableByAgent({ ...space, supportMessageId: 'm' }, 'o1'))).toBe('not_readable');
        // Une pièce jointe de salon ou de tâche reste lisible.
        expect(code(() => assertReadableByAgent({ ...space, messageId: 'm' }, 'o1'))).toBeNull();
    });

    test('écriture : seulement un fichier d’espace, sans aucune pièce jointe', () => {
        expect(code(() => assertWritableByAgent(space, 'o1'))).toBeNull();
        expect(code(() => assertWritableByAgent(space, 'autre-org'))).toBe('not_in_org');
        for (const extra of [{ messageId: 'm' }, { taskId: 't' }, { dmMessageId: 'd' }]) {
            expect(code(() => assertWritableByAgent({ ...space, ...extra }, 'o1'))).toBe(extra.dmMessageId ? 'not_readable' : 'not_space_file');
        }
        expect(code(() => assertWritableByAgent({ orgId: 'o1' }, 'o1'))).toBe('not_space_file');
    });

    test('version opaque : empreinte de (fichier, blob), jamais le blobId', async () => {
        const v = await fileVersion('f1', 'blob-secret-1');
        expect(v).toMatch(/^[0-9a-f]{24}$/);
        expect(v).not.toContain('blob');
        expect(await fileVersion('f1', 'blob-secret-1')).toBe(v);
        expect(await fileVersion('f1', 'blob-secret-2')).not.toBe(v);
        expect(await fileVersion('f2', 'blob-secret-1')).not.toBe(v);
    });

    test('erreurs de métadonnées avant envoi : échec franc, pas issue inconnue', () => {
        expect(creationFailureState(new DeviceNotSentError(new TextFileError('metadata_unavailable').code))).toBe('failed');
    });
});

describe('cartes de confirmation : le nom d’abord, l’identifiant en repli', () => {
    test('noms vus dans les résultats ; repli sur l’identifiant sinon', () => {
        forgetFileNames();
        const sum = (tool: string, args: Record<string, unknown>) => summaries[tool]!(args, noSummaryContext);
        expect(sum('delete_file', { fileId: 'f1' })).toContain('(identifiant f1)');
        rememberFileNames('list_files', { files: [{ id: 'f1', name: 'budget.csv' }, { id: 'f2', name: 'notes.md' }] });
        rememberFileNames('list_folders', { folders: [{ id: 'd1', name: 'Archives' }] });
        expect(sum('delete_file', { fileId: 'f1' })).toContain('« budget.csv »');
        expect(sum('move_files', { fileIds: ['f1', 'f2'], toFolderId: 'd1' })).toBe('Déplacer 2 fichiers (« budget.csv », « notes.md ») vers le dossier « Archives »');
        expect(sum('move_files', { fileIds: ['f1'], toFolderId: null })).toContain('la racine de l’espace');
        expect(sum('delete_folder', { folderId: 'd1' })).toContain('« Archives »');
        expect(sum('update_text_file', { fileId: 'f2', content: 'abc' })).toContain('« notes.md »');
        expect(sum('move_folders', { folderIds: ['d9'], toFolderId: 'd1' })).toContain('(identifiant d9)');
    });
});
