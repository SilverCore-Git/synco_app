import sfetch from '@/assets/utils/sfetch';
import { TransferCancelledError, TransferHttpError } from './transferManager';
import { RENEW_MARGIN_MS, RangeDownload, SingleFlight, cdnFetch, readError, type DownloadTicket } from './cdnHttp';

export { FileChangedError, type DownloadTicket } from './cdnHttp';

/**
 * Requêtes vers synco_cdn. Le CDN ne connaît pas les jetons Keycloak : chaque
 * requête porte un ticket signé par synco_api, propre à un transfert (envoi)
 * ou à un fichier (téléchargement), valable 1 h ou 15 min.
 *
 *   POST   {cdn}/v1/uploads                 ouverture de la session d'envoi
 *   PUT    {cdn}/v1/uploads/{tid}/part      une part (en-tête X-Part-Index)
 *   POST   {cdn}/v1/uploads/{tid}/complete  finalisation → métadonnées du fichier
 *   GET    {cdn}/v1/files/{blobId}          contenu chiffré (Range)
 *
 * Erreurs du CDN : { error: code, message }. Un 401 (ticket expiré ou
 * révoqué) déclenche un renouvellement puis une seule nouvelle tentative.
 */

async function apiJson(path: string, init: RequestInit = {}): Promise<any> {
    const res = await sfetch(path, init);
    const text = await res.text();
    if (!res.ok) throw readError(res.status, text);
    return text ? JSON.parse(text) : null;
}

// ---------------------------------------------------------------------------
// Envoi
// ---------------------------------------------------------------------------

/** Réponse de POST /api/cdn/transfers/uploads (et de …/renew). */
export interface UploadTicket {
    tid: string;
    fileId: string;
    cdnUrl: string;
    ticket: string;
    expiresAt: number;
    size: number;
    partSize: number;
    partCount: number;
}

export interface UploadRequest {
    /** Nouveau fichier : destination ; remplacement : null. */
    create?: {
        // Absent pour une pièce jointe de support (sans organisation).
        orgId?: string;
        workspaceId?: string;
        messageId?: string;
        dmMessageId?: string;
        folderId?: string;
        taskId?: string;
        supportTicketId?: string;
        supportChannel?: 'PUBLIC' | 'INTERNAL';
        supportMessageId?: string;
        fileName: string;
    };
    /** Remplacement du contenu d'un fichier existant. */
    replaceFileId?: string;
    size: number;
    partSize: number;
    mimeType: string;
    encryptedFileKey: string;
    keyVersion: number;
    iv: string;
}

export class CdnUpload {
    private current: UploadTicket;
    private readonly renewal = new SingleFlight<void>();

    private constructor(ticket: UploadTicket) {
        this.current = ticket;
    }

    /** Ouvre le transfert auprès de l'API (droits, quota) puis la session côté CDN. */
    static async open(request: UploadRequest, signal: AbortSignal): Promise<CdnUpload> {
        const { create, replaceFileId, ...content } = request;
        const ticket: UploadTicket = replaceFileId
            ? await apiJson(`/api/cdn/transfers/uploads/replace/${replaceFileId}`, { method: 'POST', body: JSON.stringify(content), signal })
            : await apiJson('/api/cdn/transfers/uploads', { method: 'POST', body: JSON.stringify({ ...create, ...content }), signal });
        const upload = new CdnUpload(ticket);
        try {
            await upload.request('POST', '/v1/uploads', signal);
        } catch (error) {
            upload.cancel();
            throw error;
        }
        return upload;
    }

    get tid() { return this.current.tid; }
    get fileId() { return this.current.fileId; }
    get partCount() { return this.current.partCount; }

    private url(path: string) { return `${this.current.cdnUrl}${path}`; }

    private renew(): Promise<void> {
        return this.renewal.run(async () => {
            this.current = await apiJson(`/api/cdn/transfers/uploads/${this.current.tid}/renew`, { method: 'POST' });
        });
    }

    /** Ticket valable encore au moins RENEW_MARGIN_MS. */
    private async ticket(): Promise<string> {
        if (this.current.expiresAt - Date.now() < RENEW_MARGIN_MS) await this.renew();
        return `Bearer ${this.current.ticket}`;
    }

    /** Requête au CDN ; sur 401, ticket renouvelé et une seule nouvelle tentative. */
    private async request(method: string, path: string, signal: AbortSignal): Promise<Response> {
        const send = async () => cdnFetch(this.url(path), { method, headers: { Authorization: await this.ticket() }, signal });
        let res = await send();
        if (res.status === 401) {
            await this.renew();
            res = await send();
        }
        if (!res.ok) throw readError(res.status, await res.text().catch(() => ''));
        return res;
    }

    /** Envoie une part, avec progression (XHR : fetch n'expose pas la progression d'envoi). */
    async putPart(index: number, body: Blob, signal: AbortSignal, onProgress: (sent: number) => void): Promise<void> {
        try {
            await this.xhrPut(index, body, await this.ticket(), signal, onProgress);
        } catch (error) {
            if (!(error instanceof TransferHttpError) || error.status !== 401) throw error;
            onProgress(0);
            await this.renew();
            await this.xhrPut(index, body, await this.ticket(), signal, onProgress);
        }
    }

    private xhrPut(index: number, body: Blob, auth: string, signal: AbortSignal, onProgress: (sent: number) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) return reject(new TransferCancelledError());

            const xhr = new XMLHttpRequest();
            const onAbort = () => xhr.abort();
            signal.addEventListener('abort', onAbort, { once: true });
            const done = () => signal.removeEventListener('abort', onAbort);

            xhr.upload.onprogress = (event) => onProgress(event.loaded);
            xhr.onload = () => {
                done();
                if (xhr.status >= 200 && xhr.status < 300) resolve();
                else reject(readError(xhr.status, xhr.responseText));
            };
            xhr.onerror = () => { done(); reject(new TransferHttpError(0, 'Erreur réseau')); };
            xhr.onabort = () => { done(); reject(new TransferCancelledError()); };

            xhr.open('PUT', this.url(`/v1/uploads/${this.current.tid}/part`), true);
            xhr.setRequestHeader('Authorization', auth);
            xhr.setRequestHeader('X-Part-Index', String(index));
            xhr.setRequestHeader('Content-Type', 'application/octet-stream');
            xhr.send(body);
        });
    }

    /**
     * Finalisation : le CDN vérifie que toutes les parts sont là, puis fait
     * enregistrer le fichier par l'API. Renvoie ses métadonnées.
     */
    async complete(signal: AbortSignal): Promise<any> {
        const res = await this.request('POST', `/v1/uploads/${this.current.tid}/complete`, signal);
        return res.json();
    }

    /** Abandon : transfert annulé côté API (quota libéré) et côté CDN. Au mieux. */
    cancel(): void {
        sfetch(`/api/cdn/transfers/uploads/${this.current.tid}`, { method: 'DELETE' }).catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Téléchargement
// ---------------------------------------------------------------------------

/** Téléchargement d'un fichier de l'app : ticket renouvelé par GET /api/cdn/meta/:id. */
export class CdnDownload extends RangeDownload {
    /**
     * `version` identifie le contenu (blobId) : un ticket renouvelé pour un
     * autre contenu signifie que le fichier a été remplacé entre-temps.
     */
    constructor(fileId: string, ticket: DownloadTicket, version: string) {
        super(ticket, version, () => apiJson(`/api/cdn/meta/${fileId}`));
    }
}
