/** Kind `dm.edit` (12 §4.2) : `edit_dm`, appareil seulement (EX-13) ; seul un MP de l'utilisateur. */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { editAgentDm } from '../agentMessaging';
import { assertKindArgs, assertOrgOpen, need, quote, str } from '../messageKindShared';
import type { PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['dmMessageId', { type: 'string', required: true, id: true }],
    ['text', { type: 'string', required: true, min: 1, max: 8000 }],
]);

const toArgs = (a: JsonObject) => ({ dmMessageId: need(str(a.dmMessageId)), text: need(str(a.text)) });

const executor: PlanKindExecutor = {
    kind: 'dm.edit',
    tool: 'edit_dm',
    schema,
    exports: ['id'],
    label: a => `Modifier un de mes messages privés : « ${quote(str(a.text) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'messages privés modifiés' : 'message privé modifié'}`,
    icon: 'bi-pencil',
    title: "Modification d'un message privé",
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertKindArgs('dm.edit', args);
        return editAgentDm(toArgs(args), planHeader);
    },
    clientTools: [{
        name: 'edit_dm', label: "Modification d'un message privé", icon: 'bi-pencil',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            assertKindArgs('dm.edit', args as JsonObject);
            return editAgentDm(toArgs(args as JsonObject));
        },
    }],
};
export default executor;
