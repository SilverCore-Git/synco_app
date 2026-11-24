/** Kind `message.edit` (12 §4.2) : `edit_message`, exécuté par l'appareil ; seul un message de l'utilisateur. */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { MESSAGE_KIND_EXPORTS, checkMessageKindArgs } from '@/assets/utils/agentMessagePlan';
import { editAgentThreadMessage } from '../agentMessaging';
import type { PlanKindExecutor } from './registry';
import { need, quote, str } from '../messageKindShared';

export const kind = 'message.edit';
export const schema = (action: JsonObject): boolean => checkMessageKindArgs({ ...action, kind });
export const exports = MESSAGE_KIND_EXPORTS['message.edit'];
export const icon = 'bi-pencil-square';
export const risk = 'R2' as const;
export const label = (args: JsonObject): string => `Modifier un de mes messages : « ${quote(str(args.text) ?? '')} »`;

const toArgs = (a: JsonObject) => ({ messageId: need(str(a.messageId)), text: need(str(a.text)) });
export const clientTool = { name: 'edit_message', run: (args: JsonObject) => editAgentThreadMessage(toArgs(args)) };

const executor: PlanKindExecutor = {
    kind,
    async execute(args, planHeader) {
        return editAgentThreadMessage(toArgs(args), planHeader);
    },
};
export default executor;
