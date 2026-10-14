import { describe, expect, test } from "bun:test";
import { buildTranscript } from "./clientAgentTranscript";
import { describeTool } from "./clientAgentPrompt";

describe("buildTranscript", () => {
    test("rejoue un tour avec outil : assistant (tool_call) puis user (résultat)", () => {
        const out = buildTranscript([
            { role: 'user', content: 'mes tâches ?' },
            { role: 'assistant', viaAgentLoop: true, parts: [
                { type: 'thinking', text: 'je réfléchis' },
                { type: 'text', text: 'Je regarde.' },
                { type: 'tool', tool: { name: 'read_tasks', args: {}, status: 'done', result: { tasks: [1] } } },
                { type: 'text', text: 'Une tâche.' },
            ] },
        ]);
        expect(out.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
        expect(out[1]!.content).toContain('Je regarde.');
        expect(out[1]!.content).toContain('<tool_call>');
        expect(out[1]!.content).not.toContain('réfléchis');
        expect(out[2]!.content).toContain('"tasks":[1]');
    });

    test("ignore le tour d'assistant vide en cours et fusionne les rôles identiques", () => {
        const out = buildTranscript([
            { role: 'user', content: 'a' }, { role: 'user', content: 'b' },
            { role: 'assistant', viaAgentLoop: true, parts: [] },
        ]);
        expect(out).toEqual([{ role: 'user', content: 'a\n\nb' }]);
    });

    test("messages hérités (sans parts) : balises de raisonnement et d'outil retirées", () => {
        const out = buildTranscript([{ role: 'assistant', content: '<think>x</think>Réponse <tool_call>{}</tool_call>' }]);
        expect(out[0]!.content.trim()).toBe('Réponse');
    });

    test("outil refusé", () => {
        const out = buildTranscript([
            { role: 'assistant', viaAgentLoop: true, parts: [{ type: 'tool', tool: { name: 'delete_task', args: { taskId: '1' }, status: 'rejected' } }] },
        ]);
        expect(out[1]!.content).toContain('refusée');
    });
});

describe("describeTool", () => {
    test("signature compacte avec optionnels et tableaux imbriqués", () => {
        const line = describeTool({
            name: 'create_thread', description: 'Créer des salons', category: 'client', mutating: true, interactive: false,
            parameters: { type: 'object', required: ['threads'], properties: {
                threads: { type: 'array', items: { type: 'object', required: ['name', 'type'], properties: { name: { type: 'string' }, type: { enum: ['text', 'voice'] }, spaceId: { type: 'string' } } } },
            } },
        });
        expect(line).toBe('- create_thread({threads: {name: string, type: "text"|"voice", spaceId?: string}[]}): Créer des salons');
    });
});
