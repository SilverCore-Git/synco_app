/**
 * Kind `support.create` (12 §4.2, R4) : `create_support_ticket`, exécuté par l'APPAREIL en mode plan comme en mode
 * autonome. La clé du ticket (`support:<id>`) est créée et scellée ici, jamais déléguée au runtime (03 §2). Le support
 * est hors de l'org : sensible, non précoché, jamais « Toujours accepter ». Exporte `id` (le ticket).
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { assertSupportArgs, createAgentSupportTicket } from '../agentSupport';
import { assertOrgOpen, need, quote, str } from '../messageKindShared';
import type { PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['subject', { type: 'string', required: true, min: 1, max: 200 }],
    ['text', { type: 'string', required: true, min: 1, max: 8000 }],
]);

const toArgs = (a: JsonObject) => ({ subject: need(str(a.subject)), text: need(str(a.text)) });

const executor: PlanKindExecutor = {
    kind: 'support.create',
    tool: 'create_support_ticket',
    schema,
    exports: ['id'],
    label: a => `Écrire à l’équipe Synco (hors de l’organisation) : « ${quote(str(a.subject) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'demandes au support' : 'demande au support'}`,
    icon: 'bi-life-preserver',
    title: 'Demande au support de Synco',
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertSupportArgs('support.create', args);
        return createAgentSupportTicket(toArgs(args), planHeader);
    },
    clientTools: [
        {
            name: 'create_support_ticket', label: 'Demande au support', icon: 'bi-life-preserver',
            async run(args, { orgId }) {
                assertOrgOpen(orgId);
                assertSupportArgs('support.create', args as JsonObject);
                return createAgentSupportTicket(toArgs(args as JsonObject));
            },
        },
    ],
};
export default executor;
