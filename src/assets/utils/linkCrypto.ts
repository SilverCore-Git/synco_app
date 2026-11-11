/**
 * Cryptographie des liens de téléchargement (synco_api
 * vibe/features/DOWNLOAD_LINKS_FEATURE.md §3). Aucune dépendance à l'app :
 * importé aussi par la page de share.synco.one.
 *
 *   S          secret du lien, 32 octets (fragment de l'URL, ou chiffré pour
 *              chaque destinataire d'un lien « utilisateurs »)
 *   P          PBKDF2-SHA256(mot de passe, sel, itérations), 32 octets ; vide sans mot de passe
 *   KEK_lien   HKDF(S ‖ P, "synco-link-kek-v1|" + linkId)    emballe les DEK, ne quitte jamais le navigateur
 *   AUTH_lien  HKDF(S ‖ P, "synco-link-auth-v1|" + linkId)   preuve d'accès ; le serveur n'en garde que le SHA-256
 *
 * Tout emballage est lié au lien, et au fichier pour une DEK : le serveur ne
 * peut ni transplanter une DEK sur un autre élément, ni un secret sur un
 * autre lien ou un autre destinataire.
 */

export const LINK_SECRET_LENGTH = 32;
export const LINK_PASSWORD_ITERATIONS = 600_000;
const HKDF_SALT = new TextEncoder().encode('synco-link-v1');

/** Octets sur un ArrayBuffer ordinaire, comme l'exige WebCrypto (TS ≥ 5.7). */
export type Bytes = Uint8Array<ArrayBuffer>;
/** Recopie sur un ArrayBuffer ordinaire. */
const bytes = (value: Uint8Array): Bytes => new Uint8Array(value);
const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------------------------------------------------------------------------
// Encodages
// ---------------------------------------------------------------------------

export const toB64 = (bytes: Uint8Array) => {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
};
export const fromB64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
export const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64Url = (value: string) => {
    const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
    return fromB64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

const random = (length: number) => crypto.getRandomValues(new Uint8Array(length));

/** Identifiant de lien : 16 octets aléatoires, base64url (22 caractères). */
export const newLinkId = () => toB64Url(random(16));
export const newLinkSecret = () => random(LINK_SECRET_LENGTH);
export const newPasswordSalt = () => toB64Url(random(16));

const LINK_ID = /^[A-Za-z0-9_-]{22}$/;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export const isLinkId = (value: string) => LINK_ID.test(value);

// ---------------------------------------------------------------------------
// Dérivation
// ---------------------------------------------------------------------------

export interface PasswordParams {
    salt: string;
    iterations: number;
}

/** P : dérivé du mot de passe, 32 octets. */
export async function derivePasswordKey(password: string, params: PasswordParams): Promise<Uint8Array> {
    if (!Number.isSafeInteger(params.iterations) || params.iterations < LINK_PASSWORD_ITERATIONS) {
        throw new Error('Paramètres de mot de passe trop faibles.');
    }
    const material = await crypto.subtle.importKey('raw', enc.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64Url(params.salt), iterations: params.iterations },
        material,
        256,
    ));
}

export interface LinkKeys {
    kek: CryptoKey;
    /** AUTH_lien en base64url (43 caractères). */
    auth: string;
}

/** KEK_lien et AUTH_lien à partir de S et, pour un lien protégé, de P. */
export async function deriveLinkKeys(linkId: string, secret: Uint8Array, passwordKey?: Uint8Array | null): Promise<LinkKeys> {
    if (secret.length !== LINK_SECRET_LENGTH) throw new Error('Secret de lien invalide.');
    const ikm = new Uint8Array(secret.length + (passwordKey?.length ?? 0));
    ikm.set(secret, 0);
    if (passwordKey) ikm.set(passwordKey, secret.length);
    const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey', 'deriveBits']);
    ikm.fill(0);

    const kek = await crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: enc.encode(`synco-link-kek-v1|${linkId}`) },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
    const auth = new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: enc.encode(`synco-link-auth-v1|${linkId}`) },
        base,
        256,
    ));
    return { kek, auth: toB64Url(auth) };
}

/** Empreinte stockée par le serveur : SHA-256 de AUTH_lien, en hexadécimal. */
export async function authHashOf(auth: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fromB64Url(auth)));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// AES-GCM lié à un contexte
// ---------------------------------------------------------------------------

async function seal(key: CryptoKey, aad: string, plain: Bytes): Promise<Uint8Array> {
    const iv = random(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain));
    const out = new Uint8Array(iv.length + ct.length);
    out.set(iv, 0);
    out.set(ct, iv.length);
    return out;
}

async function open(key: CryptoKey, aad: string, sealed: Uint8Array): Promise<Bytes> {
    if (sealed.length < 12 + 16) throw new Error('Chiffré tronqué.');
    return new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: sealed.slice(0, 12), additionalData: enc.encode(aad) },
        key,
        sealed.slice(12),
    ));
}

const DEK_PREFIX = 'l1:';

/**
 * Référence de la DEK d'un fichier pour l'AAD : son fileUid (format v3, tel
 * qu'écrit dans encryptedFileKey), sinon son identifiant. Calculée de la même
 * façon par synco_api (fileKeyParts).
 */
export function fileRefOf(file: { id: string; encryptedFileKey: string }): string {
    if (file.encryptedFileKey.startsWith('v3:')) {
        const uid = file.encryptedFileKey.slice(3).split(':')[0];
        if (uid) return uid;
    }
    return `file:${file.id}`;
}

/** DEK brute → "l1:" + b64(iv ‖ AES-GCM(KEK_lien, DEK)), liée au lien et au fichier. */
export async function wrapDekForLink(rawDek: ArrayBuffer | Uint8Array, kek: CryptoKey, linkId: string, fileRef: string): Promise<string> {
    const raw = rawDek instanceof Uint8Array ? bytes(rawDek) : new Uint8Array(rawDek);
    if (raw.length !== 32) throw new Error('DEK invalide.');
    return DEK_PREFIX + toB64(await seal(kek, `synco-link-dek-v1|${linkId}|${fileRef}`, raw));
}

/** DEK du fichier (déchiffrement seul). Échoue si l'emballage vient d'un autre lien ou d'un autre fichier. */
export async function unwrapDekForLink(wrapped: string, kek: CryptoKey, linkId: string, fileRef: string): Promise<CryptoKey> {
    if (!wrapped.startsWith(DEK_PREFIX)) throw new Error('Format de clé de lien inconnu.');
    const raw = await open(kek, `synco-link-dek-v1|${linkId}|${fileRef}`, fromB64(wrapped.slice(DEK_PREFIX.length)));
    try {
        return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    } finally {
        raw.fill(0);
    }
}

/** Métadonnées d'un élément, lisibles seulement avec KEK_lien. */
export interface LinkItemMeta {
    name: string;
    mime: string;
    /** Taille du clair, en octets. */
    size: number;
    /** Chemin relatif dans le dossier partagé ("" à sa racine). */
    path: string;
}

export async function sealItemMeta(meta: LinkItemMeta, kek: CryptoKey, linkId: string, fileRef: string): Promise<string> {
    return toB64(await seal(kek, `synco-link-meta-v1|${linkId}|${fileRef}`, enc.encode(JSON.stringify(meta))));
}

export async function openItemMeta(sealed: string, kek: CryptoKey, linkId: string, fileRef: string): Promise<LinkItemMeta> {
    const parsed = JSON.parse(dec.decode(await open(kek, `synco-link-meta-v1|${linkId}|${fileRef}`, fromB64(sealed))));
    if (typeof parsed?.name !== 'string' || typeof parsed.mime !== 'string' || typeof parsed.path !== 'string'
        || !Number.isSafeInteger(parsed.size) || parsed.size < 0) {
        throw new Error('Métadonnées de lien invalides.');
    }
    return parsed as LinkItemMeta;
}

// ---------------------------------------------------------------------------
// Secret du lien pour les membres de l'espace et les destinataires
// ---------------------------------------------------------------------------

const SPACE_SECRET_PREFIX = 'ls1:';

/** S ‖ P emballés par la clé d'espace : réafficher et maintenir le lien. */
export async function wrapSecretForSpace(spaceKey: CryptoKey, linkId: string, secret: Uint8Array, passwordKey?: Uint8Array | null): Promise<string> {
    const plain = new Uint8Array(secret.length + (passwordKey?.length ?? 0));
    plain.set(secret, 0);
    if (passwordKey) plain.set(passwordKey, secret.length);
    try {
        return SPACE_SECRET_PREFIX + toB64(await seal(spaceKey, `synco-link-secret-v1|${linkId}`, plain));
    } finally {
        plain.fill(0);
    }
}

export async function unwrapSecretFromSpace(wrapped: string, spaceKey: CryptoKey, linkId: string): Promise<{ secret: Uint8Array; passwordKey: Uint8Array | null }> {
    if (!wrapped.startsWith(SPACE_SECRET_PREFIX)) throw new Error('Format de secret de lien inconnu.');
    const plain = await open(spaceKey, `synco-link-secret-v1|${linkId}`, fromB64(wrapped.slice(SPACE_SECRET_PREFIX.length)));
    if (plain.length !== LINK_SECRET_LENGTH && plain.length !== LINK_SECRET_LENGTH * 2) throw new Error('Secret de lien invalide.');
    return {
        secret: plain.slice(0, LINK_SECRET_LENGTH),
        passwordKey: plain.length > LINK_SECRET_LENGTH ? plain.slice(LINK_SECRET_LENGTH) : null,
    };
}

const recipientLabel = (linkId: string, userId: string) => enc.encode(`synco-link-recipient-v1|${linkId}|${userId}`);

/** S chiffré pour la clé publique RSA-OAEP d'un destinataire, lié au lien et à son compte. */
export async function wrapSecretForRecipient(secret: Uint8Array, publicKeyJwk: string, linkId: string, userId: string): Promise<string> {
    const key = await crypto.subtle.importKey('jwk', JSON.parse(publicKeyJwk), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    return toB64(new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP', label: recipientLabel(linkId, userId) }, key, bytes(secret))));
}

export async function unwrapSecretForRecipient(wrapped: string, privateKey: CryptoKey, linkId: string, userId: string): Promise<Uint8Array> {
    const secret = new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP', label: recipientLabel(linkId, userId) }, privateKey, fromB64(wrapped)));
    if (secret.length !== LINK_SECRET_LENGTH) throw new Error('Secret de lien invalide.');
    return secret;
}

/** Empreinte d'une clé publique telle que stockée par synco_api (SHA-256 du JWK sérialisé). */
export async function publicKeyFingerprint(publicKeyJwk: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(publicKeyJwk)));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

/** URL d'un lien. Le secret va dans le fragment : jamais envoyé au serveur. */
export function buildLinkUrl(baseUrl: string, linkId: string, secret?: Uint8Array | null): string {
    const base = baseUrl.replace(/\/+$/, '');
    return secret ? `${base}/l/${linkId}#${toB64Url(secret)}` : `${base}/l/${linkId}`;
}

/** Identifiant et secret d'une URL de lien (chemin /l/<id>, fragment #<S>). */
export function parseLinkLocation(pathname: string, hash: string): { linkId: string; secret: Uint8Array | null } | null {
    const match = /^\/l\/([A-Za-z0-9_-]{22})\/?$/.exec(pathname);
    if (!match) return null;
    const fragment = hash.replace(/^#/, '');
    return { linkId: match[1]!, secret: SECRET.test(fragment) ? fromB64Url(fragment) : null };
}

/** Nom de fichier sûr pour l'enregistrement (séparateurs, caractères de contrôle, noms réservés). */
export function safeFileName(name: string): string {
    const cleaned = name
        .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
        // Contrôles bidirectionnels : « facture_gpj.exe » affiché « facture_exe.jpg ».
        .replace(/[\u202a-\u202e\u2066-\u2069\u200e\u200f]/g, '')
        .replace(/^[.\s]+|[.\s]+$/g, '')
        .slice(0, 200);
    return /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned) || cleaned === '' ? `fichier_${cleaned || 'partage'}` : cleaned;
}
