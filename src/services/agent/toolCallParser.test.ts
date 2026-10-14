import { describe, expect, test } from "bun:test";
import { ToolCallStreamParser, type ParsedEvent } from "./toolCallParser";

const run = (chunks: string[]): ParsedEvent[] => {
    const p = new ToolCallStreamParser();
    const out = chunks.flatMap(c => p.push(c));
    return [...out, ...p.flush()];
};
const joinText = (evs: ParsedEvent[]) => evs.filter(e => e.type === 'text').map(e => (e as any).text).join('');
const calls = (evs: ParsedEvent[]) => evs.filter(e => e.type === 'tool_call') as Extract<ParsedEvent, { type: 'tool_call' }>[];

describe("ToolCallStreamParser", () => {
    test("texte simple", () => {
        expect(joinText(run(["Bonjour ", "le monde"]))).toBe("Bonjour le monde");
    });

    test("bloc XML découpé en chunks", () => {
        const evs = run(['Je cherche. <tool_', 'call>{"name":"search_messages",', '"arguments":{"query":"wifi"}}</tool_call>']);
        expect(joinText(evs).trim()).toBe("Je cherche.");
        expect(calls(evs)).toEqual([{ type: 'tool_call', name: 'search_messages', arguments: { query: 'wifi' } }]);
    });

    test("JSON seul avec arguments imbriqués (régression regex)", () => {
        const json = '{"name":"create_thread","arguments":{"threads":[{"name":"a","type":"text"},{"name":"b","type":"voice"}]}}';
        const evs = run([json.slice(0, 30), json.slice(30)]);
        expect(calls(evs)[0]!.arguments.threads).toHaveLength(2);
        expect(joinText(evs)).toBe("");
    });

    test("accolades dans les chaînes", () => {
        const evs = run(['<tool_call>{"name":"create_file","arguments":{"content":"function() { return \\"}\\"; }"}}</tool_call>']);
        expect(calls(evs)[0]!.arguments.content).toContain('return');
    });

    test("arguments sous forme de chaîne JSON", () => {
        const evs = run(['{"name":"x","arguments":"{\\"a\\":1}"}']);
        expect(calls(evs)[0]!.arguments).toEqual({ a: 1 });
    });

    test("balise XML jamais refermée, JSON valide", () => {
        const evs = run(['<tool_call>{"name":"read_tasks","arguments":{}}']);
        expect(calls(evs)[0]!.name).toBe("read_tasks");
    });

    test("du JSON ordinaire dans la réponse reste du texte", () => {
        expect(joinText(run(['Voici {"a": 1} et c\'est tout']))).toBe('Voici {"a": 1} et c\'est tout');
    });

    test("un '<' isolé n'est pas avalé", () => {
        expect(joinText(run(["1 < 2 et 3 > 2"]))).toBe("1 < 2 et 3 > 2");
    });

    test("plusieurs appels", () => {
        const evs = run(['<tool_call>{"name":"a","arguments":{}}</tool_call><tool_call>{"name":"b","arguments":{}}</tool_call>']);
        expect(calls(evs).map(c => c.name)).toEqual(["a", "b"]);
    });
});
