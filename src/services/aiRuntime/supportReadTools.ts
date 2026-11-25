/**
 * Outil client de LECTURE du domaine Support (L15j), exécuté par l'appareil hors plan (R0, `auto`) : `read_support_ticket`.
 * Déclaré par `clientTools` de `planKinds/support.reply.ts` ; le dispatcher des outils client le trouve par son nom.
 * Le résultat contient le texte de l'équipe de Synco : texte de tiers (enveloppe `<untrusted>` côté registre).
 */
import type { JsonObject } from '@/assets/utils/aiActionPlan';
import { readSupportTicket } from './agentSupport';
import { assertOrgOpen, need, str } from './messageKindShared';
import type { PlanClientTool } from './planKinds/registry';

export const supportReadTools: readonly PlanClientTool[] = [
    {
        name: 'read_support_ticket', label: "Lecture d'une demande au support", icon: 'bi-life-preserver',
        async run(args, { orgId }) {
            assertOrgOpen(orgId);
            const a = args as JsonObject;
            return readSupportTicket({ ticketId: need(str(a.ticketId)), before: str(a.before) });
        },
    },
];
