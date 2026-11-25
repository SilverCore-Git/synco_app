/**
 * Kind `dm.send` (12 §4.2) : `send_dm`, appareil seulement (EX-13), nonce `d3` d'auteur `ai`. Déclare aussi l'outil
 * client `read_dm`. Même écart de schéma que `message.send` pour `fileIds` (pas de type liste dans `ArgsSchema`).
 */
import type { ArgsSchema, JsonObject } from '@/assets/utils/aiActionPlan';
import { sendAgentDm } from '../agentMessaging';
import { dmReadTools } from '../messageReadTools';
import { assertKindArgs, assertOrgOpen, ids, need, quote, str } from '../messageKindShared';
import type { PlanKindExecutor } from './registry';

const schema: ArgsSchema = new Map([
    ['peerId', { type: 'string', required: true, id: true }],
    ['text', { type: 'string', required: true, min: 1, max: 8000 }],
]);

const toArgs = (a: JsonObject) => ({ peerId: need(str(a.peerId)), text: need(str(a.text)), fileIds: ids(a.fileIds) });

const executor: PlanKindExecutor = {
    kind: 'dm.send',
    tool: 'send_dm',
    schema,
    exports: ['id', 'peerId'],
    label: a => `Message privé : « ${quote(str(a.text) ?? '')} »`,
    chip: n => `${n} ${n > 1 ? 'messages privés' : 'message privé'}`,
    icon: 'bi-envelope',
    title: "Envoi d'un message privé",
    async execute(args, planHeader, orgId) {
        assertOrgOpen(orgId);
        assertKindArgs('dm.send', args);
        return sendAgentDm(toArgs(args), planHeader);
    },
    clientTools: [
        {
            name: 'send_dm', label: 'Message privé', icon: 'bi-envelope',
            async run(args, { orgId }) {
                assertOrgOpen(orgId);
                assertKindArgs('dm.send', args as JsonObject);
                return sendAgentDm(toArgs(args as JsonObject));
            },
        },
        ...dmReadTools,
    ],
};
export default executor;
