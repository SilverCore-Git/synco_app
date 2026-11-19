/**
 * Aléa figé pour produire des vecteurs exacts avec le code TS RÉEL, sans le modifier :
 * `crypto.getRandomValues` (IV, nonces) et `crypto.subtle.generateKey` ECDH (clés éphémères) sont
 * remplacés, le temps du générateur ou d'un test, par des files de valeurs choisies.
 *
 * Réservé aux vecteurs et aux tests (docs/plan/vectors/README.md §1) : jamais importé par l'app.
 * Une demande d'aléa sans valeur en file lève une erreur, pour ne jamais produire en silence un
 * vecteur non reproductible.
 */
import { createECDH } from 'node:crypto';

const randomQueue: Uint8Array[] = [];
const ecdhQueue: Uint8Array[] = [];

const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');

/** JWK privée et publique d'un scalaire P-256 fixe. */
export function p256Jwk(scalar: Uint8Array): { publicJwk: JsonWebKey; privateJwk: JsonWebKey; canonical: string; legacy: string } {
    // node:crypto plutôt que noble : noble tire de l'aléa (masquage) que la file figée refuserait.
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(scalar);
    const pub = new Uint8Array(ecdh.getPublicKey());
    const x = b64u(pub.slice(1, 33));
    const y = b64u(pub.slice(33, 65));
    return {
        publicJwk: { kty: 'EC', crv: 'P-256', x, y },
        privateJwk: { kty: 'EC', crv: 'P-256', x, y, d: b64u(scalar) },
        canonical: JSON.stringify({ crv: 'P-256', kty: 'EC', x, y }),
        legacy: JSON.stringify({ kty: 'EC', crv: 'P-256', x, y }),
    };
}

export const importEcdhPrivate = (scalar: Uint8Array, extractable = false): Promise<CryptoKey> =>
    crypto.subtle.importKey('jwk', p256Jwk(scalar).privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, extractable, ['deriveBits']);

export const importEcdsaPrivate = (scalar: Uint8Array, extractable = false): Promise<CryptoKey> =>
    crypto.subtle.importKey('jwk', p256Jwk(scalar).privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, extractable, ['sign']);

/** Valeurs rendues, dans l'ordre, par les prochains `crypto.getRandomValues` (longueurs exactes). */
export function queueRandom(...chunks: Uint8Array[]): void {
    randomQueue.push(...chunks);
}

/** Scalaires des prochaines paires ECDH générées. */
export function queueEcdhKey(...scalars: Uint8Array[]): void {
    ecdhQueue.push(...scalars);
}

export function assertQueuesDrained(label: string): void {
    if (randomQueue.length || ecdhQueue.length) {
        throw new Error(`${label} : ${randomQueue.length} valeur(s) d'aléa et ${ecdhQueue.length} clé(s) non consommées`);
    }
}

let installed = false;

export function installFixedRandom(): void {
    if (installed) return;
    installed = true;
    const originalGenerateKey = crypto.subtle.generateKey.bind(crypto.subtle);
    Object.defineProperty(crypto, 'getRandomValues', {
        configurable: true,
        value: <T extends ArrayBufferView | null>(array: T): T => {
            const next = randomQueue.shift();
            if (!array || !next || next.length !== array.byteLength) {
                throw new Error(`aléa inattendu (${array?.byteLength ?? 0} octets demandés)`);
            }
            new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(next);
            return array;
        },
    });
    Object.defineProperty(crypto.subtle, 'generateKey', {
        configurable: true,
        value: async (algorithm: AlgorithmIdentifier | EcKeyGenParams, extractable: boolean, usages: KeyUsage[]) => {
            const name = typeof algorithm === 'string' ? algorithm : algorithm.name;
            if (name !== 'ECDH') return originalGenerateKey(algorithm as EcKeyGenParams, extractable, usages);
            const scalar = ecdhQueue.shift();
            if (!scalar) throw new Error('clé ECDH éphémère inattendue');
            const { publicJwk, privateJwk } = p256Jwk(scalar);
            return {
                publicKey: await crypto.subtle.importKey('jwk', publicJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
                privateKey: await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDH', namedCurve: 'P-256' }, extractable, usages),
            };
        },
    });
}
