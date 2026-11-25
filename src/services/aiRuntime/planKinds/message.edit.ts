/** Kind `message.edit` (12 §4.2) : `edit_message`, exécuté par l'appareil ; seul un message de l'utilisateur. */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { editAgentThreadMessage } from '../agentMessaging';
import { assertKindArgs, assertOrgOpen, need, quote, str } from '../messageKindShared';
import type { PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['messageId', { type: 'string', required: true, id: true }],
    ['text', { type: 'string', required: true, min: 1, max: 8000 }],
]);

const toArgs = (a: JsonObject) => ({ messageId: need(str(a.messageId)), text: need(str(a.text)) });

const executor: PlanKindExecutor = {
    kind: 'message.edit',
    tool: 'edit_message',
    schema,
    exports: ['id', 'threadId'],
    label: a => `Modifier un de mes messages : « ${quote(str(a.text) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'messages modifiés' : 'message modifié'}`,
    icon: 'bi-pencil-square',
    title: "Modification d'un message",
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertKindArgs('message.edit', args);
        return editAgentThreadMessage(toArgs(args), planHeader);
    },
    clientTools: [{
        name: 'edit_message', label: "Modification d'un message", icon: 'bi-pencil-square',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            assertKindArgs('message.edit', args as JsonObject);
            return editAgentThreadMessage(toArgs(args as JsonObject));
        },
    }],
};
export default executor;
