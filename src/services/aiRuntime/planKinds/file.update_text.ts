/**
 * Kind `file.update_text` (12 §4.2) : remplace le contenu d'un fichier texte d'espace, depuis l'appareil (le
 * contenu est chiffré de bout en bout, le serveur ne le voit jamais). Refus si le fichier a changé depuis la
 * lecture (`baseVersion` ≠ version courante) : `failed`, rien n'est écrit. Déclare aussi les outils client
 * `read_file` et `update_text_file` (hors plan). `fileActions` est chargé à la demande : ce module reste
 * importable sans navigateur (tests, validateur de plan).
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { TextFileError } from '@/services/fileTextCodec';
import { DeviceNotSentError } from '../plan/deviceErrors';
import type { PlanKindExecutor } from './registry';

const str = (v: JsonObject[string] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);
const files = () => import('@/services/fileActions');

const schema: ArgsSchema = new Map([
    ['fileId', { type: 'string', required: true, id: true }],
    ['content', { type: 'string', required: true, max: 262144 }],
    ['baseVersion', { type: 'string', required: true, min: 1, max: 100 }],
]);

const executor: PlanKindExecutor = {
    kind: 'file.update_text',
    schema,
    exports: ['id', 'spaceId'],
    label: a => `Modifier le contenu du fichier ${typeof a.fileId === 'string' ? a.fileId.slice(0, 40) : ''}`.trim(),
    chip: n => `${n} ${n > 1 ? 'fichiers modifiés' : 'fichier modifié'}`,
    icon: 'bi-file-earmark-diff',
    title: "Modification d'un fichier texte",
    async execute(args) {
        const fileId = str(args.fileId);
        const content = str(args.content);
        const baseVersion = str(args.baseVersion);
        if (!fileId || content === undefined || !baseVersion) throw new DeviceNotSentError('invalid_args');
        try {
            return await (await files()).updateTextFile(fileId, content, baseVersion);
        } catch (e) {
            // Refus local avant tout envoi : l'action est `failed` avec le code (12 §4.2), jamais `unknown_outcome`.
            if (e instanceof TextFileError) throw new DeviceNotSentError(e.code);
            throw e;
        }
    },
    clientTools: [
        {
            name: 'read_file', label: "Lecture d'un fichier", icon: 'bi-file-earmark-text',
            async run(args) {
                const max = typeof args.maxBytes === 'number' ? args.maxBytes : undefined;
                if (typeof args.fileId !== 'string') throw new Error('fileId manquant');
                const r = await (await files()).readTextFile(args.fileId, max);
                return { id: r.id, name: r.name, spaceId: r.spaceId, version: r.version, content: r.content, truncated: r.truncated };
            },
        },
        {
            name: 'update_text_file', label: "Modification d'un fichier texte", icon: 'bi-file-earmark-diff',
            async run(args) {
                const { fileId, content, baseVersion } = args;
                if (typeof fileId !== 'string' || typeof content !== 'string' || typeof baseVersion !== 'string') throw new Error('Arguments invalides');
                try {
                    return await (await files()).updateTextFile(fileId, content, baseVersion);
                } catch (e) {
                    // Le modèle doit pouvoir relire le fichier : `file_changed` est un résultat d'outil, pas un plantage.
                    if (e instanceof TextFileError) return { error: e.code, note: e.code === 'file_changed' ? 'Le fichier a changé depuis ta lecture : relis-le avec read_file puis recommence.' : undefined };
                    throw e;
                }
            },
        },
    ],
};

export default executor;
