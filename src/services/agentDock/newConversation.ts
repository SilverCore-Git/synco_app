/**
 * Nouvelle conversation depuis le dock, en un seul geste (complément de l'orchestrateur après L12) :
 * l'API refuse de créer une conversation directement en régime runtime ; on la crée donc en local
 * puis on la bascule aussitôt. Si la bascule échoue, elle reste locale et l'erreur est expliquée.
 * Tout est injecté : testable sans réseau.
 */

export interface NewConversationIo {
    /** Crée la conversation (vide, locale) et rend son id. */
    createSession(orgId: string, title: string): Promise<string>;
    /** Le runtime est-il proposé à cette org ? */
    runtimeAvailable(orgId: string): Promise<boolean>;
    /** Bascule sur le runtime ; lève en cas de refus. */
    switchToRuntime(orgId: string, sessionId: string): Promise<void>;
    /** Explication en français d'une erreur de bascule. */
    explain(error: unknown, orgId: string): Promise<string>;
}

export type NewConversationResult =
    | { ok: true; sessionId: string }
    /** `sessionId` est rempli quand la conversation locale existe : elle reste utilisable depuis la page complète. */
    | { ok: false; sessionId: string | null; reason: 'runtime_unavailable' | 'create_failed' | 'switch_failed'; message: string };

export async function startRuntimeConversation(io: NewConversationIo, orgId: string, title = 'Nouvelle conversation'): Promise<NewConversationResult> {
    try {
        if (!(await io.runtimeAvailable(orgId))) {
            return { ok: false, sessionId: null, reason: 'runtime_unavailable', message: "Synco AI sur le runtime n'est pas disponible pour votre organisation. Continuez dans la page complète." };
        }
    } catch {
        return { ok: false, sessionId: null, reason: 'runtime_unavailable', message: "Impossible de vérifier la disponibilité du runtime. Continuez dans la page complète." };
    }
    let sessionId: string;
    try {
        sessionId = await io.createSession(orgId, title);
    } catch {
        return { ok: false, sessionId: null, reason: 'create_failed', message: "La conversation n'a pas pu être créée. Réessayez dans un instant." };
    }
    try {
        await io.switchToRuntime(orgId, sessionId);
    } catch (e) {
        const detail = await io.explain(e, orgId).catch(() => 'erreur inconnue');
        return { ok: false, sessionId, reason: 'switch_failed', message: `La conversation reste sur cet appareil : ${detail}` };
    }
    return { ok: true, sessionId };
}
