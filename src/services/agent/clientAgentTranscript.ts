// Reconstruit, pour un moteur piloté par le navigateur, l'historique à lui envoyer à partir des
// messages affichés. Ces derniers sont la seule source de vérité : un tour d'assistant y est une liste
// de `parts` (texte, raisonnement, outils avec leur résultat) qu'on rejoue ici sous forme de messages
// `assistant` (texte + bloc <tool_call>) puis `user` (résultat de l'outil).

export interface EngineMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

const MAX_RESULT_CHARS = 4000;

const asObject = (v: unknown): any => {
    if (typeof v === 'string') {
        try { return JSON.parse(v); } catch { return {}; }
    }
    return v ?? {};
};

export const formatToolResult = (name: string, status: string, result: unknown): string => {
    let body: string;
    if (status === 'rejected') body = JSON.stringify({ error: "Action refusée par l'utilisateur." });
    else {
        body = typeof result === 'string' ? result : JSON.stringify(result ?? {});
        if (body.length > MAX_RESULT_CHARS) body = body.slice(0, MAX_RESULT_CHARS) + '…[tronqué]';
    }
    return `[Résultat de l'outil ${name}]\n${body}\nUtilise ce résultat pour répondre à l'utilisateur, ou appelle un autre outil si nécessaire.`;
};

const stripReasoning = (text: string) => text
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
    .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '');

export const buildTranscript = (messages: any[]): EngineMessage[] => {
    const out: EngineMessage[] = [];
    // Deux messages consécutifs de même rôle sont fusionnés : plusieurs gabarits de chat l'exigent.
    const push = (role: 'user' | 'assistant', content: string | null | undefined) => {
        if (!content || !content.trim()) return;
        const last = out[out.length - 1];
        if (last && last.role === role) last.content += '\n\n' + content;
        else out.push({ role, content });
    };

    for (const m of messages) {
        if (m.role === 'user') {
            push('user', m.content);
        } else if (m.role === 'assistant') {
            if (!m.viaAgentLoop) {
                push('assistant', stripReasoning(m.content || ''));
                continue;
            }
            let text = '';
            for (const part of m.parts ?? []) {
                if (part.type === 'text') {
                    text += part.text;
                } else if (part.type === 'tool') {
                    const t = part.tool;
                    push('assistant', `${text}${text ? '\n' : ''}<tool_call>\n${JSON.stringify({ name: t.name, arguments: asObject(t.args) })}\n</tool_call>`);
                    text = '';
                    // Un outil encore en attente n'a pas de résultat à rejouer.
                    if (t.status === 'done' || t.status === 'error' || t.status === 'rejected') {
                        push('user', formatToolResult(t.name, t.status, t.result));
                    }
                }
            }
            push('assistant', text);
        }
    }
    return out;
};
