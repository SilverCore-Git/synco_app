/**
 * Outils client de LECTURE du domaine Messages (L15f), exécutés par l'appareil hors plan (R0, `auto`). Déclarés par
 * `clientTools` des modules `planKinds/message.send.ts` (salons) et `planKinds/dm.send.ts` (MP, appareil seulement,
 * EX-13) : le dispatcher des outils client (L15g) les trouve par leur nom. Le résultat est du texte de tiers
 * (enveloppe `<untrusted>` côté registre). `orgId` est celui de la conversation (recoupé avec l'org ouverte).
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { getThreadMessage, readDm, readThreadMessages } from './agentMessaging';
import { assertOrgOpen, need, str } from './messageKindShared';
import type { PlanClientTool } from './planKinds/registry';

const limit = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

export const threadReadTools: readonly PlanClientTool[] = [
    {
        name: 'read_thread_messages', label: "Lecture d'un salon", icon: 'bi-chat-left-dots',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            const a = args as JsonObject;
            return readThreadMessages({ orgId, threadId: need(str(a.threadId)), before: str(a.before), after: str(a.after), limit: limit(a.limit) });
        },
    },
    {
        name: 'get_message', label: "Lecture d'un message", icon: 'bi-chat-left-quote',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            return getThreadMessage({ orgId, messageId: need(str((args as JsonObject).messageId)) });
        },
    },
];

export const dmReadTools: readonly PlanClientTool[] = [
    {
        name: 'read_dm', label: "Lecture d'une conversation privée", icon: 'bi-envelope-open',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            const a = args as JsonObject;
            return readDm({ orgId, peerId: need(str(a.peerId)), before: str(a.before), limit: limit(a.limit) });
        },
    },
];
