import { encryptChunk, decryptChunk } from '@/assets/utils/chunkedCryptoCore';

/**
 * Chiffrement / déchiffrement des morceaux E2EE v2 hors du thread principal
 * (cf. assets/utils/cryptoPool.ts). Pour un envoi, le worker lit lui-même la
 * tranche du fichier (Blob) : le thread principal ne touche jamais aux
 * octets. Les résultats sont transférés (pas copiés).
 */

export type CryptoJob =
    | { op: 'encrypt'; key: CryptoKey; noncePrefix: Uint8Array; index: number; isLast: boolean; blob: Blob }
    | { op: 'decrypt'; key: CryptoKey; noncePrefix: Uint8Array; index: number; isLast: boolean; data: ArrayBuffer };

export type CryptoWorkerRequest = CryptoJob & { id: number };

export type CryptoWorkerResponse =
    | { id: number; ok: true; data: ArrayBuffer }
    | { id: number; ok: false; error: string };

self.onmessage = async (event: MessageEvent<CryptoWorkerRequest>) => {
    const req = event.data;
    try {
        const data = req.op === 'encrypt'
            ? await encryptChunk(req.key, req.noncePrefix, req.index, req.isLast, await req.blob.arrayBuffer())
            : await decryptChunk(req.key, req.noncePrefix, req.index, req.isLast, req.data);
        (self as unknown as Worker).postMessage({ id: req.id, ok: true, data } satisfies CryptoWorkerResponse, [data]);
    } catch (error) {
        (self as unknown as Worker).postMessage({
            id: req.id,
            ok: false,
            error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        } satisfies CryptoWorkerResponse);
    }
};
