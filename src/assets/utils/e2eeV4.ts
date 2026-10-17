/**
 * Noyau cryptographique de l'E2EE v4 (multi-appareil) — cf. doc/securite/13-e2ee-v4-multi-appareil.md.
 *
 * Module pur : aucune dépendance Vue, réseau ni stockage. Il fournit :
 * - la clé de compte AK (256 bits) qui enveloppe les clés privées d'identité ;
 * - l'enveloppe d'AK par appareil (clé d'appareil DK, coffre matériel de l'appareil) ;
 * - la clé de récupération RK (saisie par l'utilisateur) et son enveloppe ;
 * - la liaison d'un nouvel appareil (ECDH éphémère + code de vérification).
 *
 * Aucune de ces valeurs n'est jamais connue du serveur. Chaque enveloppe porte une AAD qui la lie à
 * son usage, à l'utilisateur et, pour un appareil, à son identifiant : le serveur ne peut ni
 * l'attribuer à un autre compte ni l'échanger contre l'enveloppe d'un autre usage.
 *
 * Les octets d'AK ne sont manipulés en clair que le temps d'une opération (création, liaison,
 * enveloppe) ; la clé utilisée au quotidien est un CryptoKey non extractable (importAccountKey).
 */

const enc = new TextEncoder();

export const E2EE_V4_VERSION = 'v4';
export const KEY_LENGTH = 32;

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string): Uint8Array => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const randomBytes = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));

export class E2eeV4Error extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'E2eeV4Error';
    }
}

// ---------------------------------------------------------------------------
// Enveloppe AES-GCM générique : "iv ‖ ciphertext", AAD = étiquette + contexte
// ---------------------------------------------------------------------------

async function aesKey(raw: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
    if (raw.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid key length');
    return crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM', length: 256 }, false, usages);
}

async function seal(key: CryptoKey, aad: string, plain: BufferSource): Promise<Uint8Array> {
    const iv = randomBytes(12);
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, plain));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return out;
}

async function open(key: CryptoKey, aad: string, blob: Uint8Array): Promise<ArrayBuffer> {
    if (blob.length < 12 + 16) throw new E2eeV4Error('Envelope too short');
    try {
        return await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: enc.encode(aad) }, key, blob.slice(12));
    } catch {
        throw new E2eeV4Error('Envelope cannot be opened');
    }
}

// ---------------------------------------------------------------------------
// Clé de compte (AK) et enveloppe des clés privées d'identité
// ---------------------------------------------------------------------------

/** 32 octets aléatoires. À ne garder en clair que le temps de l'enveloppe ou de la liaison. */
export const generateAccountKeyBytes = (): Uint8Array => randomBytes(KEY_LENGTH);

/** Clé AES-GCM non extractable pour le quotidien : envelopper / ouvrir les clés d'identité. */
export const importAccountKey = (akBytes: Uint8Array): Promise<CryptoKey> => aesKey(akBytes, ['encrypt', 'decrypt']);

export type IdentityPurpose = 'rsa' | 'sign';

const identityAad = (purpose: IdentityPurpose, userId: string) => `synco-e4-identity|${purpose}|${userId}`;

/**
 * Enveloppe une clé privée d'identité (PKCS#8 : exactement les mêmes octets que sous le PIN en v3,
 * ce qui rend la migration sans perte). Résultat au format des colonnes existantes (ciphertext, iv).
 */
export async function sealIdentityKey(ak: CryptoKey, purpose: IdentityPurpose, userId: string, pkcs8: BufferSource) {
    const blob = await seal(ak, identityAad(purpose, userId), pkcs8);
    return { ciphertext: toB64(blob.slice(12)), iv: toB64(blob.slice(0, 12)) };
}

export async function openIdentityKey(
    ak: CryptoKey,
    purpose: IdentityPurpose,
    userId: string,
    sealed: { ciphertext: string; iv: string }
): Promise<ArrayBuffer> {
    const iv = fromB64(sealed.iv);
    const ct = fromB64(sealed.ciphertext);
    const blob = new Uint8Array(iv.length + ct.length);
    blob.set(iv, 0);
    blob.set(ct, iv.length);
    return open(ak, identityAad(purpose, userId), blob);
}

// ---------------------------------------------------------------------------
// Enveloppe d'appareil : AES-GCM(DK, AK)
// ---------------------------------------------------------------------------

export const generateDeviceKeyBytes = (): Uint8Array => randomBytes(KEY_LENGTH);
export const generateDeviceId = (): string => crypto.randomUUID();

const deviceAad = (userId: string, deviceId: string) => `synco-e4-device|${userId}|${deviceId}`;

/** Enveloppe AK pour un appareil. `dk` ne quitte jamais le coffre de l'appareil. */
export async function createDeviceEnvelope(dk: Uint8Array, akBytes: Uint8Array, userId: string, deviceId: string): Promise<string> {
    if (akBytes.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid account key length');
    return toB64(await seal(await aesKey(dk, ['encrypt']), deviceAad(userId, deviceId), akBytes as BufferSource));
}

/** Ouvre l'enveloppe d'un appareil et renvoie les octets d'AK (à effacer après usage). */
export async function openDeviceEnvelope(dk: Uint8Array, envelope: string, userId: string, deviceId: string): Promise<Uint8Array> {
    const ak = new Uint8Array(await open(await aesKey(dk, ['decrypt']), deviceAad(userId, deviceId), fromB64(envelope)));
    if (ak.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid account key length');
    return ak;
}

// ---------------------------------------------------------------------------
// Clé de récupération (RK) : 256 bits, saisie par l'utilisateur
// ---------------------------------------------------------------------------

// Alphabet Crockford (sans I, L, O, U) : lisible à la main, tolérant aux confusions courantes.
const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function base32Encode(bytes: Uint8Array): string {
    let bits = 0;
    let value = 0;
    let out = '';
    for (const b of bytes) {
        value = (value << 8) | b;
        bits += 8;
        while (bits >= 5) {
            out += B32[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) out += B32[(value << (5 - bits)) & 31];
    return out;
}

function base32Decode(text: string): Uint8Array {
    let bits = 0;
    let value = 0;
    const out: number[] = [];
    for (const ch of text) {
        const idx = B32.indexOf(ch);
        if (idx < 0) throw new E2eeV4Error('Invalid recovery key character');
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Uint8Array.from(out);
}

const CHECKSUM_CHARS = 4;

async function checksum(bytes: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource));
    return base32Encode(digest.slice(0, 3)).slice(0, CHECKSUM_CHARS);
}

export const generateRecoveryKeyBytes = (): Uint8Array => randomBytes(KEY_LENGTH);

/** « XXXX-XXXX-… » : 52 caractères + 4 de contrôle, par groupes de 4. */
export async function formatRecoveryKey(bytes: Uint8Array): Promise<string> {
    if (bytes.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid recovery key length');
    const text = base32Encode(bytes).slice(0, 52) + await checksum(bytes);
    return text.match(/.{1,4}/g)!.join('-');
}

/**
 * Lit une clé saisie à la main : insensible à la casse, aux espaces et aux tirets, et corrige les
 * confusions O→0, I/L→1. Vérifie la somme de contrôle (faute de frappe détectée avant tout essai).
 */
export async function parseRecoveryKey(input: string): Promise<Uint8Array> {
    const text = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (text.length !== 52 + CHECKSUM_CHARS) throw new E2eeV4Error('Invalid recovery key length');
    const bytes = base32Decode(text.slice(0, 52)).slice(0, KEY_LENGTH);
    if (bytes.length !== KEY_LENGTH || await checksum(bytes) !== text.slice(52)) throw new E2eeV4Error('Invalid recovery key checksum');
    return bytes;
}

async function recoveryWrapKey(rk: Uint8Array, userId: string): Promise<CryptoKey> {
    const ikm = await crypto.subtle.importKey('raw', rk as BufferSource, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(`synco-e4-recovery|${userId}`), info: enc.encode('synco-e4-recovery-key') },
        ikm,
        256
    );
    return aesKey(new Uint8Array(bits), ['encrypt', 'decrypt']);
}

const recoveryAad = (userId: string) => `synco-e4-recovery-envelope|${userId}`;

export async function createRecoveryEnvelope(rk: Uint8Array, akBytes: Uint8Array, userId: string): Promise<string> {
    return toB64(await seal(await recoveryWrapKey(rk, userId), recoveryAad(userId), akBytes as BufferSource));
}

export async function openRecoveryEnvelope(rk: Uint8Array, envelope: string, userId: string): Promise<Uint8Array> {
    const ak = new Uint8Array(await open(await recoveryWrapKey(rk, userId), recoveryAad(userId), fromB64(envelope)));
    if (ak.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid account key length');
    return ak;
}

// ---------------------------------------------------------------------------
// Liaison d'un nouvel appareil : ECDH P-256 éphémère
// ---------------------------------------------------------------------------
//
// Nouvel appareil : createLinkRequest() → publicKey (QR code) + requestId.
// Appareil connecté : answerLinkRequest() → clé publique éphémère + enveloppe d'AK, déposées sur le serveur.
// Nouvel appareil : completeLink() → AK. Les deux côtés affichent le même code de vérification.
//
// Le QR code transporte la clé publique du nouvel appareil hors du serveur : le serveur ne peut pas
// la substituer. Sur le chemin sans QR (code saisi), la clé transite par le serveur : le code de
// vérification, comparé par l'utilisateur sur les deux écrans, révèle alors une substitution.

type EcJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };

const canonicalJwk = (jwk: JsonWebKey): EcJwk => {
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
        throw new E2eeV4Error('Invalid link public key');
    }
    return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
};

const ecdhKeyPair = () => crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);

async function importPeer(jwk: JsonWebKey): Promise<CryptoKey> {
    return crypto.subtle.importKey('jwk', canonicalJwk(jwk), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
}

export interface LinkRequest {
    requestId: string;
    publicKey: JsonWebKey;
    privateKey: CryptoKey;
}

/** Côté nouvel appareil. `privateKey` reste en mémoire jusqu'à completeLink(). */
export async function createLinkRequest(): Promise<LinkRequest> {
    const pair = await ecdhKeyPair();
    return {
        requestId: crypto.randomUUID(),
        publicKey: canonicalJwk(await crypto.subtle.exportKey('jwk', pair.publicKey)),
        privateKey: pair.privateKey,
    };
}

async function deriveLinkSecrets(
    privateKey: CryptoKey,
    peerPublicKey: JsonWebKey,
    ctx: { userId: string; requestId: string; newDevicePublicKey: JsonWebKey; responderPublicKey: JsonWebKey }
) {
    const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: await importPeer(peerPublicKey) }, privateKey, 256);
    const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    // Le transcript (les deux clés publiques) est lié à la dérivation : toute substitution change la clé ET le code.
    const info = enc.encode(`synco-e4-link|${ctx.userId}|${ctx.requestId}|${JSON.stringify(canonicalJwk(ctx.newDevicePublicKey))}|${JSON.stringify(canonicalJwk(ctx.responderPublicKey))}`);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('synco-e4-link-v1'), info }, ikm, 256 + 32));
    const sasNumber = new DataView(bits.buffer, 32, 4).getUint32(0) % 1_000_000;
    const sas = String(sasNumber).padStart(6, '0');
    return { wrapKey: await aesKey(bits.slice(0, 32), ['encrypt', 'decrypt']), sas: `${sas.slice(0, 3)} ${sas.slice(3)}` };
}

const linkAad = (userId: string, requestId: string) => `synco-e4-link-envelope|${userId}|${requestId}`;

export interface LinkAnswer {
    responderPublicKey: JsonWebKey;
    envelope: string;
    /** Code à comparer avec celui du nouvel appareil. */
    sas: string;
}

/** Côté appareil connecté : `newDevicePublicKey` vient du QR code (ou du serveur si saisie manuelle). */
export async function answerLinkRequest(
    newDevicePublicKey: JsonWebKey,
    akBytes: Uint8Array,
    userId: string,
    requestId: string
): Promise<LinkAnswer> {
    if (akBytes.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid account key length');
    const pair = await ecdhKeyPair();
    const responderPublicKey = canonicalJwk(await crypto.subtle.exportKey('jwk', pair.publicKey));
    const { wrapKey, sas } = await deriveLinkSecrets(pair.privateKey, newDevicePublicKey, { userId, requestId, newDevicePublicKey, responderPublicKey });
    const envelope = toB64(await seal(wrapKey, linkAad(userId, requestId), akBytes as BufferSource));
    return { responderPublicKey, envelope, sas };
}

/** Côté nouvel appareil : ouvre l'enveloppe et renvoie AK avec le code de vérification. */
export async function completeLink(
    request: LinkRequest,
    answer: { responderPublicKey: JsonWebKey; envelope: string },
    userId: string
): Promise<{ akBytes: Uint8Array; sas: string }> {
    const { wrapKey, sas } = await deriveLinkSecrets(request.privateKey, answer.responderPublicKey, {
        userId,
        requestId: request.requestId,
        newDevicePublicKey: request.publicKey,
        responderPublicKey: answer.responderPublicKey,
    });
    const akBytes = new Uint8Array(await open(wrapKey, linkAad(userId, request.requestId), fromB64(answer.envelope)));
    if (akBytes.length !== KEY_LENGTH) throw new E2eeV4Error('Invalid account key length');
    return { akBytes, sas };
}
