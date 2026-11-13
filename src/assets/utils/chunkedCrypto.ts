import { E2EE_V2_CHUNK_SIZE, FILE_UID_LENGTH, NONCE_PREFIX_LENGTH, type ChunkedFormat, formatFileIv } from './chunkedCryptoCore';
import { FileSubstitutedError, isFileKeyV3, openManifestV3, unwrapFileKeyV3, wrapFileKeyV3, type FileManifest } from './fileKeyV3';
import { unwrapFileKey } from './crypto';

/**
 * Gestion des clés du format E2EE v2 (cf. chunkedCryptoCore.ts). Le
 * contenu est (dé)chiffré morceau par morceau par les transferts
 * (services/transfers/), dans le pool de workers. Les fichiers écrits
 * aujourd'hui lient DEK, manifeste et morceaux à un `fileUid` (cf. fileKeyV3.ts).
 */

export interface ChunkedFileKey extends ChunkedFormat {
    /** DEK non extractible, utilisable pour chiffrer et déchiffrer. */
    fileKey: CryptoKey;
    /** DEK emballée par la clé d'espace / de DM (champ encryptedFileKey). */
    encryptedFileKey: string;
    /** Champ `iv` des métadonnées, décrivant le format v2. */
    iv: string;
    /** Identifiant du fichier lié à l'AAD des morceaux. */
    fileUid: Uint8Array;
}

/** Nouvelle DEK pour un fichier, emballée par `kek` avec son manifeste (nom, type, taille du clair). */
export async function createChunkedFileKey(
    kek: CryptoKey,
    manifest: Omit<FileManifest, 'v'>,
    chunkSize = E2EE_V2_CHUNK_SIZE
): Promise<ChunkedFileKey> {
    const extractable = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const raw = await crypto.subtle.exportKey('raw', extractable);
    const fileUid = crypto.getRandomValues(new Uint8Array(FILE_UID_LENGTH));
    const encryptedFileKey = await wrapFileKeyV3(raw, kek, fileUid, { v: 3, ...manifest });
    const fileKey = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    new Uint8Array(raw).fill(0);

    const format: ChunkedFormat = { chunkSize, noncePrefix: crypto.getRandomValues(new Uint8Array(NONCE_PREFIX_LENGTH)) };
    return { ...format, fileKey, encryptedFileKey, iv: formatFileIv(format), fileUid };
}

export interface OpenedFileKey {
    fileKey: CryptoKey;
    /** Absent pour un fichier antérieur à FC11 (lu sans liaison ni manifeste). */
    fileUid?: Uint8Array;
    manifest?: FileManifest;
}

/**
 * Désemballe la DEK d'un fichier. Pour un fichier v3, `expectedName` (nom de l'enregistrement) est
 * obligatoire : un nom absent ou différent de celui du manifeste authentifié lève FileSubstitutedError,
 * pour qu'un serveur ne puisse pas désactiver le contrôle en omettant le champ. Les fichiers anciens
 * (sans manifeste) restent lisibles sans ce contrôle.
 */
export async function openChunkedFileKey(encryptedFileKey: string, kek: CryptoKey, expectedName?: string): Promise<OpenedFileKey> {
    if (!isFileKeyV3(encryptedFileKey)) {
        const raw = await unwrapFileKey(encryptedFileKey, kek);
        const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        new Uint8Array(raw).fill(0);
        return { fileKey: key };
    }
    const { raw, fileUid } = await unwrapFileKeyV3(encryptedFileKey, kek);
    const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    new Uint8Array(raw).fill(0);
    const manifest = await openManifestV3(encryptedFileKey, key);
    if (typeof expectedName !== 'string' || manifest.name !== expectedName) throw new FileSubstitutedError(expectedName, manifest.name);
    return { fileKey: key, fileUid, manifest };
}
