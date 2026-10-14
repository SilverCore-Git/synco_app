/**
 * Sépare le texte normal du raisonnement entouré de `<think>...</think>`, émis inline par les modèles
 * qui n'exposent pas leur raisonnement dans un champ dédié. Miroir de
 * synco_api/src/services/ai/providerAdapters/thinkTagSplitter.ts (même comportement côté navigateur
 * pour les modèles pilotés par le client), avec `flush()` en plus pour vider la réserve en fin de flux.
 */
export class ThinkTagSplitter {
    private carry = '';
    private inThinking = false;

    push(chunk: string): { text: string; thinking: string } {
        let buf = this.carry + chunk;
        this.carry = '';
        let text = '';
        let thinking = '';

        for (;;) {
            const tag = this.inThinking ? '</think>' : '<think>';
            const at = buf.indexOf(tag);

            if (at === -1) {
                const keep = tailPrefixLength(buf, tag);
                const safe = buf.slice(0, buf.length - keep);
                if (this.inThinking) thinking += safe;
                else text += safe;
                this.carry = buf.slice(buf.length - keep);
                return { text, thinking };
            }

            const before = buf.slice(0, at);
            if (this.inThinking) thinking += before;
            else text += before;

            buf = buf.slice(at + tag.length);
            this.inThinking = !this.inThinking;
        }
    }

    flush(): { text: string; thinking: string } {
        const rest = this.carry;
        this.carry = '';
        return this.inThinking ? { text: '', thinking: rest } : { text: rest, thinking: '' };
    }
}

function tailPrefixLength(s: string, tag: string): number {
    const max = Math.min(s.length, tag.length - 1);
    for (let len = max; len > 0; len--) {
        if (tag.startsWith(s.slice(s.length - len))) return len;
    }
    return 0;
}
