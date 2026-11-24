/**
 * Exécutant du kind `file.update_text` (12 §4.2) : remplace le contenu d'un fichier texte d'espace, depuis
 * l'appareil (le contenu est chiffré de bout en bout, le serveur ne le voit jamais). Refus si le fichier a
 * changé depuis la lecture (`baseVersion` ≠ version courante) : `failed`, rien n'est écrit.
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { updateTextFile } from '@/services/fileActions';
import { TextFileError } from '@/services/fileTextCodec';
import { DeviceNotSentError } from '../plan/deviceErrors';
import type { PlanKindExecutor } from './registry';

const str = (v: JsonObject[string] | undefined): string | undefined => (typeof v === 'string' ? v : undefined);

const executor: PlanKindExecutor = {
    kind: 'file.update_text',
    async execute(args) {
        const fileId = str(args.fileId);
        const content = str(args.content);
        const baseVersion = str(args.baseVersion);
        if (!fileId || content === undefined || !baseVersion) throw new DeviceNotSentError('invalid_args');
        try {
            return await updateTextFile(fileId, content, baseVersion);
        } catch (e) {
            // Refus local avant tout envoi : l'action est `failed` avec le code (12 §4.2), jamais `unknown_outcome`.
            if (e instanceof TextFileError) throw new DeviceNotSentError(e.code);
            throw e;
        }
    },
};

export default executor;
