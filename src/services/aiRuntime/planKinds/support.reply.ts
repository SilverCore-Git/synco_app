/**
 * Kind `support.reply` (12 §4.2, R4) : `reply_support_ticket`, exécuté par l'APPAREIL en mode plan comme en mode
 * autonome, dans le canal PUBLIC d'un ticket DU demandeur (jamais celui d'un autre, jamais le canal interne). Un
 * message envoyé ne se modifie ni ne se supprime par l'agent (EX-17). Déclare aussi l'outil client de lecture
 * `read_support_ticket`. `ticketId` peut venir d'`argsRefs` (ticket créé plus haut dans le plan). Exporte `id` (le message).
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { assertSupportArgs, replyAgentSupportTicket } from '../agentSupport';
import { assertOrgOpen, need, quote, str } from '../messageKindShared';
import { supportReadTools } from '../supportReadTools';
import type { PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['ticketId', { type: 'string', required: true, id: true }],
    ['text', { type: 'string', required: true, min: 1, max: 8000 }],
]);

const toArgs = (a: JsonObject) => ({ ticketId: need(str(a.ticketId)), text: need(str(a.text)) });

const executor: PlanKindExecutor = {
    kind: 'support.reply',
    tool: 'reply_support_ticket',
    schema,
    exports: ['id'],
    label: a => `Répondre à l’équipe Synco (hors de l’organisation) : « ${quote(str(a.text) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'réponses au support' : 'réponse au support'}`,
    icon: 'bi-reply',
    title: 'Réponse au support de Synco',
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertSupportArgs('support.reply', args);
        return replyAgentSupportTicket(toArgs(args), planHeader);
    },
    clientTools: [
        {
            name: 'reply_support_ticket', label: 'Réponse au support', icon: 'bi-reply',
            async run(args, { orgId }) {
                assertOrgOpen(orgId);
                assertSupportArgs('support.reply', args as JsonObject);
                return replyAgentSupportTicket(toArgs(args as JsonObject));
            },
        },
        ...supportReadTools,
    ],
};
export default executor;
