/** Kind `message.send` (12 §4.2) : `send_message` et `forward_message`, exécutés par l'appareil (`m3` d'auteur `ai`). */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { MESSAGE_KIND_EXPORTS, checkMessageKindArgs } from '@/assets/utils/agentMessagePlan';
import { sendAgentThreadMessage } from '../agentMessaging';
import type { PlanKindExecutor } from './registry';
import { ids, need, quote, str, type Resolve } from '../messageKindShared';

export const kind = 'message.send';
/** Validation stricte des `args` de l'action (champs, bornes, doublons, `argsRefs`). */
export const schema = (action: JsonObject): boolean => checkMessageKindArgs({ ...action, kind });
export const exports = MESSAGE_KIND_EXPORTS['message.send'];
export const icon = 'bi-chat-left-text';
export const risk = 'R1' as const;
export function label(args: JsonObject, resolve: Resolve): string {
    const t = str(args.threadId);
    const where = t ? `#${resolve('thread', t) ?? 'salon'}` : 'un salon';
    if (str(args.forwardOf)) return `Transférer un message dans ${where}`;
    return `Écrire dans ${where} : « ${quote(str(args.text) ?? '')} »`;
}

const toArgs = (a: JsonObject) => ({
    threadId: need(str(a.threadId)),
    text: str(a.text) ?? '',
    replyTo: str(a.replyTo),
    mentionUserIds: ids(a.mentionUserIds),
    fileIds: ids(a.fileIds),
    forwardOf: str(a.forwardOf),
});

/** Outils client exécutés hors plan (fournisseur piloté par le serveur ou le navigateur). */
export const clientTools = [
    { name: 'send_message', run: (args: JsonObject) => sendAgentThreadMessage(toArgs(args)) },
    {
        name: 'forward_message',
        run: (args: JsonObject) => sendAgentThreadMessage({ threadId: need(str(args.toThreadId)), text: str(args.comment) ?? '', forwardOf: need(str(args.messageId)) }),
    },
];
export const clientTool = clientTools[0];

const executor: PlanKindExecutor = {
    kind,
    async execute(args, planHeader) {
        return sendAgentThreadMessage(toArgs(args), planHeader);
    },
};
export default executor;
