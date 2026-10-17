import { FILE_UID_LENGTH } from './chunkedCryptoCore';

/**
 * Emballage de la DEK d'un fichier, format v3 (audit FC11). Le champ
 * `encryptedFileKey` (opaque pour le serveur) devient :
 *
 *   "v3:" + b64(fileUid) + ":" + b64(wrapIv ‖ AES-GCM(KEK, DEK; aad = "synco-dek-v3|" + fileUid))
 *                        + ":" + b64(manifestIv ‖ AES-GCM(DEK, manifeste JSON; aad = "synco-manifest-v3|" + fileUid))
 *
 * - `fileUid` est tiré par le client ; il entre dans l'AAD de la DEK, du manifeste et de chaque
 *   morceau : un triplet (clé, iv, blob) de fichier A ne se déchiffre pas sous l'identité de B.
 * - Le manifeste (nom, type, taille) est authentifié par la DEK. Le serveur peut encore échanger
 *   des fichiers entiers, mais le nom du contenu reçu ne correspond plus à celui de
 *   l'enregistrement : le téléchargement le refuse (FileSubstitutedError).
 *
 * Les fichiers antérieurs (DEK emballée sans AAD) restent lisibles : voir crypto.ts.
 */

export const FILE_KEY_V3_PREFIX = 'v3:';

export interface FileManifest {
    v: 3;
    name: string;
    mime: string;
    /** Taille du clair, en octets. */
    size: number;
}

export class FileSubstitutedError extends Error {
    constructor(expected: string, actual: string) {
        super(`Le contenu de ce fichier ne correspond pas à son nom (« ${actual} » au lieu de « ${expected} »). Il a peut-être été substitué par le serveur.`);
        this.name = 'FileSubstitutedError';
    }
}

const enc = new TextEncoder();
const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const aad = (label: string, fileUid: Uint8Array) => enc.encode(`${label}|${toB64(fileUid)}`);

export const isFileKeyV3 = (encryptedFileKey: string) => encryptedFileKey.startsWith(FILE_KEY_V3_PREFIX);

async function seal(key: CryptoKey, additionalData: Uint8Array, plain: BufferSource): Promise<Uint8Array> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plain));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return out;
}

const open = (key: CryptoKey, additionalData: Uint8Array, blob: Uint8Array): Promise<ArrayBuffer> =>
    crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12), additionalData }, key, blob.slice(12));

/** Emballe la DEK brute sous `kek`, liée à `fileUid`, et y joint le manifeste chiffré par la DEK. */
export async function wrapFileKeyV3(raw: ArrayBuffer, kek: CryptoKey, fileUid: Uint8Array, manifest: FileManifest): Promise<string> {
    const dek = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const wrapped = await seal(kek, aad('synco-dek-v3', fileUid), raw);
    const sealedManifest = await seal(dek, aad('synco-manifest-v3', fileUid), enc.encode(JSON.stringify(manifest)));
    return `${FILE_KEY_V3_PREFIX}${toB64(fileUid)}:${toB64(wrapped)}:${toB64(sealedManifest)}`;
}

export interface ParsedFileKeyV3 {
    fileUid: Uint8Array;
    wrapped: Uint8Array;
    manifest: Uint8Array;
}

export function parseFileKeyV3(encryptedFileKey: string): ParsedFileKeyV3 {
    const parts = encryptedFileKey.slice(FILE_KEY_V3_PREFIX.length).split(':');
    if (parts.length !== 3) throw new Error('Invalid v3 file key');
    const [fileUid, wrapped, manifest] = parts.map(fromB64) as [Uint8Array, Uint8Array, Uint8Array];
    if (fileUid.length !== FILE_UID_LENGTH) throw new Error('Invalid v3 file uid');
    return { fileUid, wrapped, manifest };
}

/** DEK brute d'un `encryptedFileKey` v3. Échoue si `fileUid` a été altéré. */
export async function unwrapFileKeyV3(encryptedFileKey: string, kek: CryptoKey): Promise<{ raw: ArrayBuffer; fileUid: Uint8Array }> {
    const { fileUid, wrapped } = parseFileKeyV3(encryptedFileKey);
    return { raw: await open(kek, aad('synco-dek-v3', fileUid), wrapped), fileUid };
}

/** Manifeste authentifié par la DEK. Échoue s'il a été altéré ou rattaché à un autre fichier. */
export async function openManifestV3(encryptedFileKey: string, dek: CryptoKey): Promise<FileManifest> {
    const { fileUid, manifest } = parseFileKeyV3(encryptedFileKey);
    const parsed = JSON.parse(new TextDecoder().decode(await open(dek, aad('synco-manifest-v3', fileUid), manifest)));
    if (parsed?.v !== 3 || typeof parsed.name !== 'string') throw new Error('Invalid file manifest');
    return parsed as FileManifest;
}
