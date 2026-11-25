/**
 * Kind `message.send` (12 §4.2) : `send_message` et `forward_message`, exécutés par l'appareil (`m3` d'auteur `ai`).
 * Déclare aussi les outils client hors plan `send_message`, `forward_message`, `read_thread_messages`, `get_message`.
 * `mentionUserIds` : 10 au plus (borne de l'outil `send_message`, le kind en admet 50 pour le worker).
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { sendAgentThreadMessage } from '../agentMessaging';
import { threadReadTools } from '../messageReadTools';
import { assertKindArgs, assertOrgOpen, ids, need, quote, str } from '../messageKindShared';
import type { PlanClientTool, PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['threadId', { type: 'string', required: true, id: true }],
    // 0 : un transfert peut n'avoir aucun commentaire ; le minimum de 1 hors transfert est revérifié avant l'envoi.
    ['text', { type: 'string', required: true, min: 0, max: 8000 }],
    ['replyTo', { type: 'string', required: false, id: true }],
    ['forwardOf', { type: 'string', required: false, id: true }],
    ['mentionUserIds', { type: 'ids', required: false, max: 10 }],
    ['fileIds', { type: 'ids', required: false, max: 10 }],
]);

const toArgs = (a: JsonObject, orgId: string) => ({
    orgId,
    threadId: need(str(a.threadId)),
    text: str(a.text) ?? '',
    replyTo: str(a.replyTo),
    mentionUserIds: ids(a.mentionUserIds),
    fileIds: ids(a.fileIds),
    forwardOf: str(a.forwardOf),
});

const clientTools: readonly PlanClientTool[] = [
    {
        name: 'send_message', label: "Envoi d'un message", icon: 'bi-chat-left-text',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            assertKindArgs('message.send', args as JsonObject);
            return sendAgentThreadMessage(toArgs(args as JsonObject, orgId));
        },
    },
    {
        name: 'forward_message', label: "Transfert d'un message", icon: 'bi-forward',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            const a = args as JsonObject;
            const forward = { threadId: need(str(a.toThreadId)), text: str(a.comment) ?? '', forwardOf: need(str(a.messageId)) };
            assertKindArgs('message.send', forward);
            return sendAgentThreadMessage({ orgId, ...forward });
        },
    },
    ...threadReadTools,
];

const executor: PlanKindExecutor = {
    kind: 'message.send',
    // Un transfert passe par `forward_message`, le reste par `send_message` : le kind n'est admis que si l'outil voulu l'est.
    tool: (args, argsRefs) => ('forwardOf' in args || 'forwardOf' in argsRefs ? 'forward_message' : 'send_message'),
    schema,
    exports: ['id', 'threadId'],
    label: a => str(a.forwardOf) ? 'Transférer un message dans un salon' : `Écrire dans un salon : « ${quote(str(a.text) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'messages' : 'message'}`,
    icon: 'bi-chat-left-text',
    title: "Envoi d'un message",
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertKindArgs('message.send', args);
        return sendAgentThreadMessage(toArgs(args, orgId), planHeader);
    },
    clientTools,
};
export default executor;
