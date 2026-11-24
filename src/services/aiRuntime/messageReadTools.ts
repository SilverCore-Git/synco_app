/**
 * Outils client de LECTURE du domaine Messages (L15f), exécutés par l'appareil hors plan (R0, `auto`) : même forme
 * que `clientTool` des modules `planKinds/<kind>.ts`, à brancher par le dispatcher des outils client (L15g). Le
 * résultat est du texte de tiers (enveloppe `<untrusted>` côté registre) ; `read_dm` est appareil seulement (EX-13).
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { getThreadMessage, readDm, readThreadMessages } from './agentMessaging';
import { need, str } from './messageKindShared';

const limit = (v: JsonObject[string] | undefined): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined);

export const clientTools = [
    {
        name: 'read_thread_messages',
        run: (a: JsonObject) => readThreadMessages({ threadId: need(str(a.threadId)), before: str(a.before), after: str(a.after), limit: limit(a.limit) }),
    },
    { name: 'get_message', run: (a: JsonObject) => getThreadMessage({ messageId: need(str(a.messageId)) }) },
    { name: 'read_dm', run: (a: JsonObject) => readDm({ peerId: need(str(a.peerId)), before: str(a.before), limit: limit(a.limit) }) },
];
