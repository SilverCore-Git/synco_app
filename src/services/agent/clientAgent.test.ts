import { describe, expect, mock, test } from "bun:test";

// executeServerTool passe par sfetch (Keycloak, import.meta.env) : on le remplace pour tester la boucle seule.
mock.module('@/assets/utils/sfetch', () => ({
    default: async (url: string) => {
        if (url.endsWith('/ai/tools')) return new Response(JSON.stringify([
            { name: 'read_tasks', description: 'Lire', category: 'server', mutating: false, interactive: false, parameters: { type: 'object', properties: {} } },
            { name: 'create_task', description: 'Créer', category: 'server', mutating: true, interactive: false, parameters: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] } },
            { name: 'search_messages', description: 'Chercher', category: 'client', mutating: false, interactive: false, parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        ]));
        return new Response(JSON.stringify({ data: { tasks: ['t1'] } }));
    },
}));

const { startClientAgentTurn, resumeClientAgentTurn } = await import('./clientAgent');

const scripted = (...replies: any[][]) => {
    let i = 0;
    const seen: any[] = [];
    return {
        seen,
        chat: async function* (messages: any[]) {
            seen.push(messages);
            for (const r of replies[i++] ?? []) yield r;
        },
    };
};

const collect = async (gen: AsyncGenerator<any>) => { const out: any[] = []; for await (const e of gen) out.push(e); return out; };

const deps = (engine: ReturnType<typeof scripted>, messages: any[]) => ({
    orgId: 'o1', getMessages: () => messages, chat: engine.chat, interrupt: () => {},
});

describe("client agent loop", () => {
    test("réponse simple avec raisonnement séparé", async () => {
        const engine = scripted([ '<think>hmm</think>Salut', { type: 'usage', totalTokens: 12 } ]);
        const evs = await collect(startClientAgentTurn(deps(engine, [{ role: 'user', content: 'yo' }, { role: 'assistant', content: '', viaAgentLoop: true, parts: [] }])));
        expect(evs.map(e => e.type)).toEqual(['thinking', 'text', 'usage', 'done']);
        expect(engine.seen[0][0].role).toBe('system');
        expect(engine.seen[0][1]).toEqual({ role: 'user', content: 'yo' });
    });

    test("tool serveur non mutant : exécuté puis la boucle continue", async () => {
        const engine = scripted([{ type: 'tool_call', name: 'read_tasks', arguments: {} }], ['Vous avez une tâche.']);
        const evs = await collect(startClientAgentTurn(deps(engine, [{ role: 'user', content: 'mes tâches ?' }])));
        expect(evs.map(e => e.type)).toEqual(['tool_call_result', 'text', 'done']);
        expect(evs[0].result).toEqual({ tasks: ['t1'] });
    });

    test("tool mutant : pause en attente de confirmation, puis reprise", async () => {
        const msg = { role: 'assistant', viaAgentLoop: true, parts: [] as any[] };
        const messages = [{ role: 'user', content: 'crée une tâche' }, msg];
        const engine = scripted([{ type: 'tool_call', name: 'create_task', arguments: { title: 'X' } }], ['Fait.']);
        const first = await collect(startClientAgentTurn(deps(engine, messages)));
        expect(first.map(e => e.type)).toEqual(['tool_call_pending']);

        msg.parts.push({ type: 'tool', tool: { toolCallId: first[0].toolCallId, name: 'create_task', args: { title: 'X' }, status: 'executing', category: 'server' } });
        const resumed = resumeClientAgentTurn(deps(engine, messages), { toolCallId: first[0].toolCallId, name: 'create_task', args: { title: 'X' }, category: 'server' }, { accepted: true });
        const evs: any[] = [];
        for await (const e of resumed) {
            evs.push(e);
            // Comme consumeAgentStream : le résultat est appliqué à la part avant la relance du modèle.
            if (e.type === 'tool_call_result') Object.assign(msg.parts[0].tool, { status: 'done', result: e.result });
        }
        expect(evs.map(e => e.type)).toEqual(['tool_call_result', 'text', 'done']);
        const replay = engine.seen[1].map((m: any) => m.role);
        expect(replay).toEqual(['system', 'user', 'assistant', 'user']);
        expect(engine.seen[1][3].content).toContain("Résultat de l'outil create_task");
    });

    test("tool client : en attente du navigateur", async () => {
        const engine = scripted([{ type: 'tool_call', name: 'search_messages', arguments: { query: 'wifi' } }]);
        const evs = await collect(startClientAgentTurn(deps(engine, [{ role: 'user', content: 'cherche' }])));
        expect(evs[0]).toMatchObject({ type: 'tool_call_client_required', mutating: false });
    });

    test("outil inconnu : erreur renvoyée au modèle, pas de blocage", async () => {
        const engine = scripted([{ type: 'tool_call', name: 'inconnu', arguments: {} }], ['Désolé.']);
        const evs = await collect(startClientAgentTurn(deps(engine, [{ role: 'user', content: 'x' }])));
        expect(evs.map(e => e.type)).toEqual(['tool_call_result', 'text', 'done']);
        expect(evs[0].result.error).toContain('inconnu');
    });

    test("trop d'appels enchaînés", async () => {
        const call = [{ type: 'tool_call', name: 'read_tasks', arguments: {} }];
        const engine = scripted(call, call, call, call, call, call, call, call, call);
        const evs = await collect(startClientAgentTurn(deps(engine, [{ role: 'user', content: 'x' }])));
        expect(evs[evs.length - 1].type).toBe('error');
    });
});
