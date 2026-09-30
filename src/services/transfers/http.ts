import { keycloak } from '@/assets/keycloak';
import { TransferCancelledError, TransferHttpError } from './transferManager';

/**
 * Requêtes de morceaux (hors sfetch : progression d'envoi via XHR, corps
 * binaires, pas de Content-Type JSON). Le jeton est rafraîchi avant chaque
 * requête : un gros transfert dure souvent plus longtemps que sa validité.
 */

const apiUrl = (path: string) => `${import.meta.env.VITE_API_URL}${path}`;

async function bearer(forceRefresh = false): Promise<string> {
    try {
        await keycloak.updateToken(forceRefresh ? -1 : 30);
    } catch (e) {
        console.warn('[transfers] Échec du rafraîchissement du jeton', e);
    }
    return `Bearer ${keycloak.token}`;
}

const errorMessage = (status: number, body: string): string => {
    try {
        const parsed = JSON.parse(body);
        if (parsed?.error) return String(parsed.error);
    } catch { /* corps non JSON */ }
    return status === 0 ? 'Erreur réseau' : `Erreur serveur (${status})`;
};

function xhrPut(url: string, body: Blob, auth: string, signal: AbortSignal, onProgress: (sent: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) return reject(new TransferCancelledError());

        const xhr = new XMLHttpRequest();
        const onAbort = () => xhr.abort();
        signal.addEventListener('abort', onAbort, { once: true });

        xhr.upload.onprogress = (event) => onProgress(event.loaded);
        xhr.onload = () => {
            signal.removeEventListener('abort', onAbort);
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new TransferHttpError(xhr.status, errorMessage(xhr.status, xhr.responseText)));
        };
        xhr.onerror = () => {
            signal.removeEventListener('abort', onAbort);
            reject(new TransferHttpError(0, 'Erreur réseau'));
        };
        xhr.onabort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(new TransferCancelledError());
        };

        xhr.open('PUT', url, true);
        xhr.setRequestHeader('Authorization', auth);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');
        xhr.send(body);
    });
}

/**
 * Envoie une part. Un 401/403 (jeton expiré entre deux parts) est rejoué
 * une fois après rafraîchissement forcé ; les autres erreurs remontent à
 * withRetry(), qui décide de réessayer.
 */
export async function putUploadPart(
    uploadId: string,
    index: number,
    body: Blob,
    signal: AbortSignal,
    onProgress: (sent: number) => void
): Promise<void> {
    const url = apiUrl(`/api/cdn/uploads/${uploadId}/parts/${index}`);
    try {
        await xhrPut(url, body, await bearer(), signal, onProgress);
    } catch (error) {
        if (error instanceof TransferHttpError && (error.status === 401 || error.status === 403)) {
            onProgress(0);
            await xhrPut(url, body, await bearer(true), signal, onProgress);
            return;
        }
        throw error;
    }
}

/** Octets [start, end) du fichier stocké `fileId` (requête Range). */
export async function fetchFileRange(fileId: string, start: number, end: number, signal: AbortSignal): Promise<ArrayBuffer> {
    const request = async (auth: string) => {
        let res: Response;
        try {
            res = await fetch(apiUrl(`/api/cdn/download/${fileId}`), {
                headers: { Authorization: auth, Range: `bytes=${start}-${end - 1}` },
                credentials: 'include',
                signal,
            });
        } catch (error) {
            if ((error as any)?.name === 'AbortError') throw new TransferCancelledError();
            throw new TransferHttpError(0, 'Erreur réseau');
        }
        if (res.status !== 206 && res.status !== 200) {
            throw new TransferHttpError(res.status, errorMessage(res.status, await res.text().catch(() => '')));
        }
        const data = await res.arrayBuffer();
        // 200 = plage ignorée par un intermédiaire (fichier complet renvoyé).
        const bytes = res.status === 200 ? data.slice(start, end) : data;
        if (bytes.byteLength !== end - start) {
            throw new TransferHttpError(0, 'Morceau incomplet');
        }
        return bytes;
    };

    try {
        return await request(await bearer());
    } catch (error) {
        if (error instanceof TransferHttpError && (error.status === 401 || error.status === 403)) {
            return request(await bearer(true));
        }
        throw error;
    }
}

/** GET du fichier complet avec progression de réception (fichiers v1). */
export async function fetchWholeFile(fileId: string, signal: AbortSignal, onProgress: (received: number) => void): Promise<ArrayBuffer> {
    let res: Response;
    try {
        res = await fetch(apiUrl(`/api/cdn/download/${fileId}`), {
            headers: { Authorization: await bearer() },
            credentials: 'include',
            signal,
        });
    } catch (error) {
        if ((error as any)?.name === 'AbortError') throw new TransferCancelledError();
        throw new TransferHttpError(0, 'Erreur réseau');
    }
    if (!res.ok) {
        throw new TransferHttpError(res.status, errorMessage(res.status, await res.text().catch(() => '')));
    }
    if (!res.body) return res.arrayBuffer();

    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress(received);
    }
    const out = new Uint8Array(total && total === received ? total : received);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out.buffer;
}
