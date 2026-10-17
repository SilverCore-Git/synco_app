import { describe, expect, test } from "bun:test";
import { createFrameTransform } from "./frameCrypto";

const key = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

async function run(side: 'send' | 'receive', getKey: () => CryptoKey | null, data: Uint8Array): Promise<Uint8Array | null> {
    const t = createFrameTransform(side, getKey);
    const w = t.writable.getWriter();
    const r = t.readable.getReader();
    w.write({ data: data.buffer.slice(0) as ArrayBuffer });
    w.close();
    const { value } = await r.read();
    return value ? new Uint8Array(value.data) : null;
}

describe("frameCrypto", () => {
    test("aller-retour send → receive", async () => {
        const k = await key();
        const plain = new TextEncoder().encode("trame");
        const enc = await run('send', () => k, plain);
        expect(enc!.length).toBe(12 + plain.length + 16);
        expect(new TextDecoder().decode((await run('receive', () => k, enc!))!)).toBe("trame");
    });

    test("format historique : IV ‖ AES-GCM sans AAD (compatible avec les anciens clients)", async () => {
        const k = await key();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, k, new TextEncoder().encode("ancien")));
        const frame = new Uint8Array(12 + ct.length);
        frame.set(iv); frame.set(ct, 12);
        expect(new TextDecoder().decode((await run('receive', () => k, frame))!)).toBe("ancien");
    });

    test("sans clé ou avec une mauvaise clé : trame abandonnée, jamais en clair", async () => {
        const k = await key();
        const enc = await run('send', () => k, new Uint8Array([1, 2, 3]));
        expect(await run('send', () => null, new Uint8Array([1, 2, 3]))).toBeNull();
        expect(await run('receive', () => null, enc!)).toBeNull();
        expect(await run('receive', () => k, enc!.slice(0, 12))).toBeNull();
        const other = await key();
        expect(await run('receive', () => other, enc!)).toBeNull();
    });
});
