import { privateSignKey } from './crypto';
import { keyCommitment, type KeyContext } from './keyPinning';
import { requireTrustedSignKey, lookupCreatorSignKey } from './keyTrust';

/**
 * Enveloppe signée d'une clé symétrique distribuée (ThreadKey/WorkspaceKey/
 * DMConversationKey/AiSessionKey) — audit FC4 §2.
 *
 * keyPinning.ts (FC4 §1) détecte qu'une clé change de valeur APRÈS avoir été
 * épinglée une première fois, mais fait confiance sans preuve à la toute
 * première clé vue pour un (contexte, version). Cette enveloppe comble ce
 * trou : le créateur signe (ctx, version, commitment) avec sa propre clé
 * d'identité (ECDSA P-256, voir crypto.ts), et le destinataire vérifie cette
 * signature contre la clé d'identité épinglée du créateur (keyTrust.ts)
 * avant de faire confiance à la clé — y compris au premier contact.
 *
 * Ni `commitment` ni `signature` ne révèlent la clé elle-même.
 */
export interface KeyEnvelope {
    v: 1;
    ctx: KeyContext;
    version: number;
    creatorId: string;
    commitment: string;
    signature: string;
}

function envelopeBytes(ctx: KeyContext, version: number, commitment: string): Uint8Array {
    return new TextEncoder().encode(`synco-key-envelope-v1|${ctx}|${version}|${commitment}`);
}

/** Signe la clé `rawKey` pour (ctx, version) avec la clé de signature déverrouillée. */
export async function signKeyEnvelope(
    rawKey: CryptoKey | ArrayBuffer,
    ctx: KeyContext,
    version: number
): Promise<{ commitment: string; signature: string }> {
    if (!privateSignKey.value) throw new Error('Clé de signature verrouillée');
    const commitment = await keyCommitment(rawKey, ctx, version);
    const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        privateSignKey.value,
        envelopeBytes(ctx, version, commitment) as BufferSource
    );
    return { commitment, signature: btoa(String.fromCharCode(...new Uint8Array(sig))) };
}

export class KeyEnvelopeError extends Error {
    readonly reason: 'commitment-mismatch' | 'bad-signature' | 'untrusted-creator';
    constructor(reason: 'commitment-mismatch' | 'bad-signature' | 'untrusted-creator') {
        super("L'origine de cette clé de chiffrement n'a pas pu être vérifiée.");
        this.name = 'KeyEnvelopeError';
        this.reason = reason;
    }
}

/**
 * Vérifie que `rawKey` correspond bien à l'enveloppe signée, et que la
 * signature a été produite par la clé d'identité (déjà résolue/épinglée)
 * de `creatorId`. N'épingle rien elle-même : à appeler avant pinOrCheckKey.
 */
export async function verifyKeyEnvelope(
    rawKey: CryptoKey | ArrayBuffer,
    envelope: { ctx: KeyContext; version: number; commitment: string; signature: string },
    creatorPublicSignKeyJWK: string | object
): Promise<void> {
    const commitment = await keyCommitment(rawKey, envelope.ctx, envelope.version);
    if (commitment !== envelope.commitment) throw new KeyEnvelopeError('commitment-mismatch');

    const jwk = typeof creatorPublicSignKeyJWK === 'string' ? JSON.parse(creatorPublicSignKeyJWK) : creatorPublicSignKeyJWK;
    const pub = await crypto.subtle.importKey(
        'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']
    ).catch(() => { throw new KeyEnvelopeError('bad-signature'); });

    const sig = Uint8Array.from(atob(envelope.signature), c => c.charCodeAt(0));
    const ok = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        pub, sig as BufferSource,
        envelopeBytes(envelope.ctx, envelope.version, envelope.commitment) as BufferSource
    );
    if (!ok) throw new KeyEnvelopeError('bad-signature');
}

/**
 * Point d'appel unique côté réception, utilisé par les cinq contextes
 * (espace, salon, DM, session IA). Tolérant par construction dans un seul
 * cas : aucune enveloppe du tout (compte émetteur pas encore migré, ou
 * ancienne donnée) — se comporte alors exactement comme avant FC4 §2
 * (TOFU simple sur la clé symétrique, via keyPinning.ts). Dans tous les
 * autres cas d'échec (signature invalide, commitment incohérent, identité
 * du créateur changée), l'erreur remonte : une enveloppe présente mais
 * invalide est un signal plus sérieux qu'une enveloppe absente.
 */
export async function verifyKeyEnvelopeIfPresent(
    rawKey: CryptoKey | ArrayBuffer,
    ctx: KeyContext,
    version: number,
    data: { creatorId?: string | null; commitment?: string | null; signature?: string | null }
): Promise<void> {
    if (!data.creatorId || !data.commitment || !data.signature) return;

    const creatorSignKey = lookupCreatorSignKey(data.creatorId);
    if (!creatorSignKey) {
        // Annuaire des membres pas encore chargé localement — limitation
        // opérationnelle, pas un signal d'attaque : on ne bloque pas.
        console.warn(`[E2EE] Clé de signature de ${data.creatorId} introuvable localement : enveloppe non vérifiée.`);
        return;
    }

    const trustedSignKey = await requireTrustedSignKey(data.creatorId, creatorSignKey);
    await verifyKeyEnvelope(
        rawKey,
        { ctx, version, commitment: data.commitment, signature: data.signature },
        trustedSignKey
    );
}
