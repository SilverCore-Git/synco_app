/** Kind `dm.send` (12 §4.2) : `send_dm`, appareil seulement (EX-13), nonce `d3` d'auteur `ai`. */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { MESSAGE_KIND_EXPORTS, checkMessageKindArgs } from '@/assets/utils/agentMessagePlan';
import { sendAgentDm } from '../agentMessaging';
import type { PlanKindExecutor } from './registry';
import { ids, need, quote, str, type Resolve } from '../messageKindShared';

export const kind = 'dm.send';
export const schema = (action: JsonObject): boolean => checkMessageKindArgs({ ...action, kind });
export const exports = MESSAGE_KIND_EXPORTS['dm.send'];
export const icon = 'bi-envelope';
export const risk = 'R1' as const;
export function label(args: JsonObject, resolve: Resolve): string {
    const p = str(args.peerId);
    return `Message privé à ${(p && resolve('user', p)) ?? 'un membre'} : « ${quote(str(args.text) ?? '')} »`;
}

const toArgs = (a: JsonObject) => ({ peerId: need(str(a.peerId)), text: need(str(a.text)), fileIds: ids(a.fileIds) });
export const clientTool = { name: 'send_dm', run: (args: JsonObject) => sendAgentDm(toArgs(args)) };

const executor: PlanKindExecutor = {
    kind,
    async execute(args, planHeader) {
        return sendAgentDm(toArgs(args), planHeader);
    },
};
export default executor;
