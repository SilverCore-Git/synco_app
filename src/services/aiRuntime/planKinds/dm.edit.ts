/** Kind `dm.edit` (12 §4.2) : `edit_dm`, appareil seulement (EX-13) ; seul un MP de l'utilisateur. */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { MESSAGE_KIND_EXPORTS, checkMessageKindArgs } from '@/assets/utils/agentMessagePlan';
import { editAgentDm } from '../agentMessaging';
import type { PlanKindExecutor } from './registry';
import { need, quote, str } from '../messageKindShared';

export const kind = 'dm.edit';
export const schema = (action: JsonObject): boolean => checkMessageKindArgs({ ...action, kind });
export const exports = MESSAGE_KIND_EXPORTS['dm.edit'];
export const icon = 'bi-pencil';
export const risk = 'R2' as const;
export const label = (args: JsonObject): string => `Modifier un de mes messages privés : « ${quote(str(args.text) ?? '')} »`;

const toArgs = (a: JsonObject) => ({ dmMessageId: need(str(a.dmMessageId)), text: need(str(a.text)) });
export const clientTool = { name: 'edit_dm', run: (args: JsonObject) => editAgentDm(toArgs(args)) };

const executor: PlanKindExecutor = {
    kind,
    async execute(args, planHeader) {
        return editAgentDm(toArgs(args), planHeader);
    },
};
export default executor;
