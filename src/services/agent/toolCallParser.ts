// Extraction des appels d'outils dans le texte streamé d'un modèle piloté par le navigateur (local,
// serveur custom). Ces modèles n'ont pas de function-calling natif fiable : le prompt leur demande
// d'écrire `<tool_call>{"name": ..., "arguments": {...}}</tool_call>`, mais certains émettent le JSON
// seul. Les regex précédentes s'arrêtaient à la première accolade fermante imbriquée (`}}`) et
// perdaient les appels aux arguments structurés (ex: create_thread) — d'où un balayage équilibré.

export type ParsedEvent =
    | { type: 'text'; text: string }
    | { type: 'tool_call'; name: string; arguments: Record<string, any> };

const XML_OPEN = '<tool_call>';
const XML_CLOSE = '</tool_call>';
const JSON_START = /\{\s*"name"\s*:/;

/** Index (exclu) de l'accolade fermante qui équilibre celle de `start`, ou null si le JSON est incomplet. */
export const scanBalanced = (s: string, start: number): number | null => {
    let depth = 0;
    let inString = false;
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inString) {
            if (c === '\\') i++;
            else if (c === '"') inString = false;
        } else if (c === '"') inString = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return i + 1;
    }
    return null;
};

const normalizeArguments = (raw: unknown): Record<string, any> => {
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { return {}; }
    }
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, any> : {};
};

/** Transforme un JSON `{name, arguments}` en appel d'outil, ou null s'il n'en a pas la forme. */
export const toToolCall = (json: string): Extract<ParsedEvent, { type: 'tool_call' }> | null => {
    try {
        const cleaned = json.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(cleaned);
        if (!parsed || typeof parsed.name !== 'string' || !parsed.name) return null;
        return { type: 'tool_call', name: parsed.name, arguments: normalizeArguments(parsed.arguments ?? parsed.parameters) };
    } catch {
        return null;
    }
};

/** Longueur du suffixe de `s` à garder en réserve : il pourrait être le début d'un appel d'outil. */
const heldTail = (s: string): number => {
    const lt = s.lastIndexOf('<');
    if (lt !== -1 && XML_OPEN.startsWith(s.slice(lt))) return s.length - lt;
    const brace = s.lastIndexOf('{');
    if (brace !== -1 && s.length - brace < 16 && !s.includes('}', brace)) return s.length - brace;
    return 0;
};

/**
 * Parseur incrémental : `push()` chaque chunk, `flush()` en fin de flux. Le texte est restitué dès qu'il
 * ne peut plus appartenir à un appel d'outil ; un appel n'est émis qu'une fois complet.
 */
export class ToolCallStreamParser {
    private buf = '';

    push(chunk: string): ParsedEvent[] {
        this.buf += chunk;
        return this.drain(false);
    }

    flush(): ParsedEvent[] {
        return this.drain(true);
    }

    private drain(final: boolean): ParsedEvent[] {
        const out: ParsedEvent[] = [];
        const text = (t: string) => { if (t) out.push({ type: 'text', text: t }); };

        for (;;) {
            const xml = this.buf.indexOf(XML_OPEN);
            const json = this.buf.search(JSON_START);
            const candidates = [xml, json].filter(i => i !== -1);

            if (candidates.length === 0) {
                const hold = final ? 0 : heldTail(this.buf);
                text(this.buf.slice(0, this.buf.length - hold));
                this.buf = this.buf.slice(this.buf.length - hold);
                return out;
            }

            const start = Math.min(...candidates);
            text(this.buf.slice(0, start));
            this.buf = this.buf.slice(start);

            if (this.buf.startsWith(XML_OPEN)) {
                const close = this.buf.indexOf(XML_CLOSE);
                if (close === -1) {
                    if (!final) return out;
                    // Balise jamais refermée : on tente quand même d'en lire le contenu.
                    const call = toToolCall(this.buf.slice(XML_OPEN.length));
                    if (call) out.push(call);
                    this.buf = '';
                    return out;
                }
                const call = toToolCall(this.buf.slice(XML_OPEN.length, close));
                if (call) out.push(call);
                this.buf = this.buf.slice(close + XML_CLOSE.length);
                continue;
            }

            const end = scanBalanced(this.buf, 0);
            if (end === null) {
                if (!final) return out;
                text(this.buf);
                this.buf = '';
                return out;
            }
            const call = toToolCall(this.buf.slice(0, end));
            if (call) out.push(call);
            else text(this.buf.slice(0, end));
            this.buf = this.buf.slice(end);
        }
    }
}
