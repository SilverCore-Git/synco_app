import { afterEach, describe, expect, test } from 'bun:test';
import { PlanInvalidError, validatePlan, ToolManifest, type JsonObject, type PlanContext } from '@/assets/utils/aiActionPlan';
import { decodeUtf8Clipped, TextFileError } from '@/services/fileTextCodec';
import { actionLabel, KIND_ICON, kindChip } from '../plan/planLabels';
import { creationFailureState, DeviceNotSentError } from '../plan/deviceErrors';
import { planClientTool, planKindDescription, setPlanKindModules } from './index';
import updateText from './file.update_text';

const inject = () => setPlanKindModules({ './file.update_text.ts': { default: updateText } });
afterEach(() => setPlanKindModules(undefined));

const ctx = (): PlanContext => ({ sessionId: 's1', maxLifetimeSecs: 3600, manifest: new ToolManifest(), mode: 'ask', createThreadAsk: true });
const plan = (action: JsonObject): JsonObject => ({
    v: 1, planId: 'p1', sessionId: 's1', toolCallId: 't1', createdAt: 1000, expiresAt: 2000, summary: 'x', actions: [{ n: 1, ...action }],
});
const updateAction = (args: JsonObject = { fileId: 'f1', content: 'bonjour', baseVersion: 'blob-1' }): JsonObject => ({ kind: 'file.update_text', args });

describe('file.update_text dans le plan', () => {
    test('accepté quand le module est déclaré', () => {
        inject();
        expect(validatePlan(plan(updateAction()), ctx())).toBeDefined();
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
        await expect(planClientTool('update_text_file')!.run({ fileId: 'f1' })).rejects.toThrow('Arguments invalides');
        await expect(planClientTool('read_file')!.run({})).rejects.toThrow('fileId');
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
