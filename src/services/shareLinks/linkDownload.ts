import { openItemMeta, unwrapDekForLink, type LinkItemMeta } from '@/assets/utils/linkCrypto';
import { FileSubstitutedError, openManifestV3 } from '@/assets/utils/fileKeyV3';
import { FILE_UID_LENGTH, parseFileIv, plainSizeForEncrypted } from '@/assets/utils/chunkedCryptoCore';
import { RangeDownload, type DownloadTicket } from '@/services/transfers/cdnHttp';
import { downloadChunks, type DownloadSink } from '@/services/transfers/chunkedDownloadCore';

/**
 * Ouverture et téléchargement d'un élément de lien, à partir de KEK_lien.
 * Aucune dépendance à l'authentification de l'app : partagé par
 * « Partagés avec moi » (app.synco.one) et la page de share.synco.one, qui
 * ne diffèrent que par la façon de demander un ticket.
 */

/** Élément tel que renvoyé par synco_api (POST …/open). */
export interface LinkItemPayload {
    id: string;
    /** fileUid (v3, base64) ou "file:<id>" : identité de la DEK dans les AAD. */
    fileRef: string;
    /** Manifeste v3 scellé par la DEK, ou null pour un fichier ancien. */
    manifest: string | null;
    iv: string;
    /** Taille stockée (chiffrée). */
    size: number;
    wrappedDek: string;
    sealedMeta: string;
}

export interface OpenedLinkItem {
    payload: LinkItemPayload;
    meta: LinkItemMeta;
}

/** Métadonnées déchiffrées ; un élément illisible (altéré) est écarté plutôt que d'interrompre la liste. */
export async function openLinkItems(items: LinkItemPayload[], kek: CryptoKey, linkId: string): Promise<{ opened: OpenedLinkItem[]; unreadable: number }> {
    const opened: OpenedLinkItem[] = [];
    let unreadable = 0;
    for (const payload of items) {
        try {
            const meta = await openItemMeta(payload.sealedMeta, kek, linkId, payload.fileRef);
            opened.push({ payload, meta });
        } catch {
            unreadable++;
        }
    }
    opened.sort((a, b) => (a.meta.path + '/' + a.meta.name).localeCompare(b.meta.path + '/' + b.meta.name, 'fr'));
    return { opened, unreadable };
}

const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

export type TicketRequest = () => Promise<{ blobId: string; download: DownloadTicket }>;

/**
 * Télécharge un élément : DEK rouverte sous KEK_lien, manifeste authentifié
 * comparé aux métadonnées du lien (le serveur ne peut pas substituer un
 * fichier à un autre), puis morceaux déchiffrés dans `sink`.
 */
export async function downloadLinkItem(input: {
    linkId: string;
    kek: CryptoKey;
    item: OpenedLinkItem;
    requestTicket: TicketRequest;
    sink: DownloadSink;
    signal: AbortSignal;
    onProgress?: (loaded: number) => void;
}): Promise<void> {
    const { linkId, kek, item, requestTicket, sink, signal, onProgress } = input;
    const { payload, meta } = item;

    const format = parseFileIv(payload.iv);
    if (!format) throw new Error('Format de fichier non pris en charge.');
    const encryptedSize = Number(payload.size);
    if (plainSizeForEncrypted(encryptedSize, format.chunkSize) !== meta.size) throw new FileSubstitutedError(meta.name, meta.name);

    const fileKey = await unwrapDekForLink(payload.wrappedDek, kek, linkId, payload.fileRef);

    let fileUid: Uint8Array | undefined;
    if (payload.manifest) {
        fileUid = fromB64(payload.fileRef);
        if (fileUid.length !== FILE_UID_LENGTH) throw new Error('Identifiant de fichier invalide.');
        // Même contrôle que FC11 : le contenu servi est bien celui que le créateur a partagé.
        const manifest = await openManifestV3(`v3:${payload.fileRef}:AA==:${payload.manifest}`, fileKey);
        if (manifest.name !== meta.name || manifest.size !== meta.size) throw new FileSubstitutedError(meta.name, manifest.name);
    }

    const first = await requestTicket();
    const cdn = new RangeDownload(first.download, first.blobId, () => requestTicket());
    await downloadChunks({ cdn, fileKey, fileUid, format, encryptedSize, sink, signal, onProgress });
}
