import { TransferCancelledError, TransferHttpError } from './transferManager';

/**
 * Requêtes vers synco_cdn sans dépendance à l'authentification de l'app :
 * partagées par l'app et par la page de share.synco.one. Le ticket voyage
 * dans Authorization, jamais de cookie (credentials: 'omit').
 */

/** Renouvelé quand il lui reste moins que ça. */
export const RENEW_MARGIN_MS = 5 * 60 * 1000;

export const readError = (status: number, body: string): TransferHttpError => {
    try {
        const parsed = JSON.parse(body);
        if (parsed?.error) return new TransferHttpError(status, String(parsed.message || parsed.error), String(parsed.error));
    } catch { /* corps non JSON */ }
    return new TransferHttpError(status, status === 0 ? 'Erreur réseau' : `Erreur serveur (${status})`);
};

export async function cdnFetch(url: string, init: RequestInit): Promise<Response> {
    try {
        return await fetch(url, { ...init, credentials: 'omit' });
    } catch (error) {
        if ((error as any)?.name === 'AbortError') throw new TransferCancelledError();
        throw new TransferHttpError(0, 'Erreur réseau');
    }
}

/** Renouvelle `refresh` au plus une fois à la fois (parts en parallèle). */
export class SingleFlight<T> {
    private inflight: Promise<T> | null = null;
    run(task: () => Promise<T>): Promise<T> {
        this.inflight ??= task().finally(() => { this.inflight = null; });
        return this.inflight;
    }
}

/** Ticket de téléchargement signé par synco_api. */
export interface DownloadTicket {
    url: string;
    ticket: string;
    expiresAt: number;
}

/** Contenu du fichier modifié pendant le téléchargement : à recommencer. */
export class FileChangedError extends TransferHttpError {
    constructor() {
        super(409, 'Le fichier a été modifié pendant le téléchargement.', 'file_changed');
    }
}

/** Nouveau ticket, et le contenu (blobId) auquel il donne accès. */
export type TicketRenewer = () => Promise<{ download?: DownloadTicket | null; blobId?: string } | null>;

/**
 * Lecture par plages d'un blob chiffré. `renew` redemande un ticket (fin de
 * validité, 401) ; s'il désigne un autre contenu, le fichier a été remplacé.
 */
export class RangeDownload {
    private current: DownloadTicket;
    private readonly version: string;
    private readonly renewer: TicketRenewer;
    private readonly renewal = new SingleFlight<void>();

    constructor(ticket: DownloadTicket, version: string, renew: TicketRenewer) {
        this.current = ticket;
        this.version = version;
        this.renewer = renew;
    }

    private renew(): Promise<void> {
        return this.renewal.run(async () => {
            const next = await this.renewer();
            if (!next?.download || next.blobId !== this.version) throw new FileChangedError();
            this.current = next.download;
        });
    }

    private async ticket(): Promise<string> {
        if (this.current.expiresAt - Date.now() < RENEW_MARGIN_MS / 5) await this.renew();
        return `Bearer ${this.current.ticket}`;
    }

    /** Octets chiffrés [start, end). */
    async fetchRange(start: number, end: number, signal: AbortSignal): Promise<ArrayBuffer> {
        const send = async () => cdnFetch(this.current.url, {
            headers: { Authorization: await this.ticket(), Range: `bytes=${start}-${end - 1}` },
            signal,
        });
        let res = await send();
        if (res.status === 401) {
            await this.renew();
            res = await send();
        }
        if (res.status === 409) throw new FileChangedError();
        if (res.status !== 206 && res.status !== 200) throw readError(res.status, await res.text().catch(() => ''));

        const data = await res.arrayBuffer();
        // 200 = plage ignorée par un intermédiaire (fichier complet renvoyé).
        const bytes = res.status === 200 ? data.slice(start, end) : data;
        if (bytes.byteLength !== end - start) throw new TransferHttpError(0, 'Morceau incomplet');
        return bytes;
    }
}
