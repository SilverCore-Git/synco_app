import { describe, expect, test } from "bun:test";
import {
    GCM_TAG_LENGTH,
    NONCE_PREFIX_LENGTH,
    chunkCountForEncrypted,
    chunkCountForPlain,
    decryptChunk,
    encryptChunk,
    encryptedChunkRange,
    encryptedSizeForPlain,
    formatFileIv,
    isChunkedIv,
    parseFileIv,
    plainChunkRange,
    plainSizeForEncrypted,
} from "./chunkedCryptoCore";

const CHUNK = 1024;

const newKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
const newPrefix = () => crypto.getRandomValues(new Uint8Array(NONCE_PREFIX_LENGTH));
const randomBytes = (n: number) => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
    return out;
};

// Chiffre `plain` au format v2 comme le fait l'envoi (transfers.ts).
async function encryptAll(key: CryptoKey, prefix: Uint8Array, plain: Uint8Array): Promise<Uint8Array> {
    const count = chunkCountForPlain(plain.length, CHUNK);
    const out = new Uint8Array(encryptedSizeForPlain(plain.length, CHUNK));
    for (let i = 0; i < count; i++) {
        const { start, end } = plainChunkRange(i, plain.length, CHUNK);
        const c = new Uint8Array(await encryptChunk(key, prefix, i, i === count - 1, plain.slice(start, end)));
        out.set(c, encryptedChunkRange(i, out.length, CHUNK).start);
    }
    return out;
}

// Déchiffre comme le téléchargement : géométrie déduite de la seule taille chiffrée.
async function decryptAll(key: CryptoKey, prefix: Uint8Array, enc: Uint8Array): Promise<Uint8Array> {
    const count = chunkCountForEncrypted(enc.length, CHUNK);
    const plainSize = plainSizeForEncrypted(enc.length, CHUNK);
    const out = new Uint8Array(plainSize);
    for (let i = 0; i < count; i++) {
        const { start, end } = encryptedChunkRange(i, enc.length, CHUNK);
        const p = new Uint8Array(await decryptChunk(key, prefix, i, i === count - 1, enc.slice(start, end)));
        out.set(p, plainChunkRange(i, plainSize, CHUNK).start);
    }
    return out;
}

describe("en-tête iv v2", () => {
    test("aller-retour et distinction v1/v2", () => {
        const prefix = newPrefix();
        const iv = formatFileIv({ chunkSize: 4 * 1024 * 1024, noncePrefix: prefix });
        expect(iv.startsWith("v2:4194304:")).toBe(true);
        expect(isChunkedIv(iv)).toBe(true);
        const parsed = parseFileIv(iv)!;
        expect(parsed.chunkSize).toBe(4 * 1024 * 1024);
        expect(Array.from(parsed.noncePrefix)).toEqual(Array.from(prefix));

        // Un iv v1 est du base64 de 12 octets : jamais de préfixe "v2:".
        expect(parseFileIv(btoa("abcdefghijkl"))).toBeNull();
        expect(parseFileIv(null)).toBeNull();
        expect(() => parseFileIv("v2:0:AAAAAAAAAAA=")).toThrow();
        expect(() => parseFileIv("v2:1024:AAAA")).toThrow();
    });
});

describe("géométrie", () => {
    test("tailles chiffrées et nombre de morceaux cohérents dans les deux sens", () => {
        for (const size of [0, 1, CHUNK - 1, CHUNK, CHUNK + 1, CHUNK * 5, CHUNK * 5 + 7]) {
            const enc = encryptedSizeForPlain(size, CHUNK);
            expect(chunkCountForEncrypted(enc, CHUNK)).toBe(chunkCountForPlain(size, CHUNK));
            expect(plainSizeForEncrypted(enc, CHUNK)).toBe(size);
        }
        expect(encryptedSizeForPlain(0, CHUNK)).toBe(GCM_TAG_LENGTH);
        expect(() => chunkCountForEncrypted(5, CHUNK)).toThrow();
    });
});

describe("chiffrement par morceaux", () => {
    for (const size of [0, 10, CHUNK, CHUNK * 3 + 100]) {
        test(`aller-retour ${size} octets`, async () => {
            const key = await newKey();
            const prefix = newPrefix();
            const plain = randomBytes(size);
            const enc = await encryptAll(key, prefix, plain);
            expect(enc.length).toBe(encryptedSizeForPlain(size, CHUNK));
            expect(Array.from(await decryptAll(key, prefix, enc))).toEqual(Array.from(plain));
        });
    }

    test("troncature à une frontière de morceau détectée", async () => {
        const key = await newKey();
        const prefix = newPrefix();
        const enc = await encryptAll(key, prefix, randomBytes(CHUNK * 3));
        const truncated = enc.slice(0, (CHUNK + GCM_TAG_LENGTH) * 2);
        await expect(decryptAll(key, prefix, truncated)).rejects.toThrow();
    });

    test("morceaux permutés détectés", async () => {
        const key = await newKey();
        const prefix = newPrefix();
        const enc = await encryptAll(key, prefix, randomBytes(CHUNK * 3));
        const size = CHUNK + GCM_TAG_LENGTH;
        const swapped = new Uint8Array(enc);
        swapped.set(enc.slice(size, size * 2), 0);
        swapped.set(enc.slice(0, size), size);
        await expect(decryptAll(key, prefix, swapped)).rejects.toThrow();
    });

    test("octet altéré détecté", async () => {
        const key = await newKey();
        const prefix = newPrefix();
        const enc = await encryptAll(key, prefix, randomBytes(CHUNK * 2 + 5));
        enc[CHUNK + 20] ^= 1;
        await expect(decryptAll(key, prefix, enc)).rejects.toThrow();
    });

    test("mauvais préfixe de nonce refusé", async () => {
        const key = await newKey();
        const enc = await encryptAll(key, newPrefix(), randomBytes(100));
        await expect(decryptAll(key, newPrefix(), enc)).rejects.toThrow();
    });
});
