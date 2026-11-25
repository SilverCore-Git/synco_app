/**
 * Déclarations du texte jointes à la décision (12 §10.7 étape 2, §12.1 ; PC94) : pour chaque `message.send` /
 * `message.edit` ACCEPTÉ d'exécutant agent, l'app calcule depuis le plan DÉCHIFFRÉ le texte final, le sel HKDF sous
 * `CK` et l'empreinte, et signe la déclaration avec la clé de signature d'identité de l'utilisateur. Sans clé de
 * signature (ni `CK` brute), l'action ne peut pas être acceptée comme action d'agent : refus avant tout envoi.
 */
import type { JsonObject, JsonValue } from '@/assets/utils/aiActionPlan';
import { buildTextDeclarationFor } from '@/assets/utils/agentMessagePlan';
import { AiRuntimeError } from '../errors';
import type { OpenedPlan } from '../actionPlan';

export interface TextDeclarationInput {
    ck: CryptoKey | Uint8Array;
    sessionId: string;
    orgId: string;
    userId: string | null | undefined;
    userSignKey: CryptoKey | null | undefined;
}

const isObj = (v: JsonValue | undefined): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function buildTextDeclarations(opened: OpenedPlan, accepted: readonly number[], input: TextDeclarationInput): Promise<{ n: number; value: string }[]> {
    const planId = typeof opened.plan.planId === 'string' ? opened.plan.planId : '';
    const actions = Array.isArray(opened.plan.actions) ? opened.plan.actions : [];
    const targets = accepted.filter(n => {
        const a = actions[n - 1];
        return isObj(a) && (a.kind === 'message.send' || a.kind === 'message.edit') && opened.graph.actions[n - 1]?.executor === 'agent';
    });
    if (targets.length === 0) return [];
    if (!(input.ck instanceof Uint8Array) || !input.userSignKey || !input.userId) throw new AiRuntimeError('plan_invalid');
    const out: { n: number; value: string }[] = [];
    for (const n of targets) {
        out.push({ n, value: await buildTextDeclarationFor(actions[n - 1] as JsonObject, {
            ck: input.ck, sessionId: input.sessionId, planId, orgId: input.orgId, userId: input.userId, userSignKey: input.userSignKey,
        }) });
    }
    return out;
}
