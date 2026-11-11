import { p256_oprf } from '@noble/curves/nist.js';
import { E2eeV4Error } from '../utils/e2eeV4';
import {
    enrollWithAccountKey, proveAction, withAccountKey,
    type DeviceContext, type EnrollOptions, type IdentityKeys, type SealedIdentity, type ServedIdentity,
} from './session';
import type { VaultContext } from '../deviceVault/types';

/**
 * Récupération par PIN (E2EE v4, doc/securite/13-e2ee-v4-multi-appareil.md §6, §14) — le chemin de
 * secours, plus faible que la clé de récupération, présenté comme tel.
 *
 *   sortieA = OPRF(cléA, PIN)   synco_api       (acteur 1)
 *   sortieB = OPRF(cléB, PIN)   synco_keyguard  (acteur 2, service isolé)
 *   K       = HKDF(sortieA ‖ sortieB)  → clé d'enveloppe d'AK + jeton de réussite
 *
 * Le PIN est aveuglé avant d'être envoyé : aucun acteur ne le voit ni ne peut le tester seul. Il
 * faut les clés OPRF des deux acteurs pour forcer les 10 000 PIN hors ligne. Chaque évaluation
 * compte comme un essai chez chaque acteur ; la preuve de réussite (jeton dérivé de K) remet les
 * compteurs à zéro. Le PIN ne quitte jamais l'appareil, K et AK sont effacés après usage.
 */

const oprf = p256_oprf.oprf;
const enc = new TextEncoder();
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const PIN_RECOVERY_LENGTH = 4;

export interface PinRecoveryStatus {
    enabled: boolean;
    attemptsLeft: number;
    locked: boolean;
}

/** Un acteur OPRF (synco_api ou synco_keyguard). */
export interface OprfActor {
    status(): Promise<PinRecoveryStatus>;
    begin(blinded: string): Promise<{ setupId: string; evaluated: string }>;
    evaluate(blinded: string): Promise<{ evaluated: string; attemptsLeft: number; envelope?: string }>;
    verify(token: string): Promise<void>;
    disable(): Promise<void>;
}

export interface PinRecoveryActors {
    /** synco_api : détient aussi l'enveloppe d'AK ; validation et désactivation exigent une preuve d'identité. */
    server: Omit<OprfActor, 'disable'> & {
        commit(setupId: string, verifyHash: string, envelope: string, proof: string): Promise<void>;
        disable(proof: string): Promise<void>;
    };
    /** synco_keyguard. */
    guard: OprfActor & { commit(setupId: string, verifyHash: string): Promise<void> };
}

/** Erreur de récupération par PIN avec le nombre d'essais restants (le plus bas des deux acteurs). */
export class PinRecoveryFailure extends Error {
    readonly reason: 'wrong-pin' | 'locked' | 'disabled';
    readonly attemptsLeft: number;
    constructor(reason: 'wrong-pin' | 'locked' | 'disabled', attemptsLeft: number) {
        super(reason === 'wrong-pin' ? 'Code PIN incorrect.' : reason === 'locked' ? 'Récupération par PIN bloquée.' : 'Récupération par PIN non activée.');
        this.name = 'PinRecoveryFailure';
        this.reason = reason;
        this.attemptsLeft = attemptsLeft;
    }
}

const input = (userId: string, pin: string) => enc.encode(`synco-e4-pinrec|${userId}|${pin}`);

function checkPin(pin: string) {
    if (!new RegExp(`^\\d{${PIN_RECOVERY_LENGTH}}$`).test(pin)) throw new E2eeV4Error('Invalid recovery PIN');
}

/** Les deux sorties OPRF → clé d'enveloppe (non extractable) et jeton de réussite. */
async function deriveKeys(userId: string, outA: Uint8Array, outB: Uint8Array) {
    const ikmBytes = new Uint8Array(outA.length + outB.length);
    ikmBytes.set(outA, 0);
    ikmBytes.set(outB, outA.length);
    try {
        const ikm = await crypto.subtle.importKey('raw', ikmBytes, 'HKDF', false, ['deriveBits', 'deriveKey']);
        const salt = enc.encode(`synco-e4-pinrec|${userId}`);
        const wrapKey = await crypto.subtle.deriveKey(
            { name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('synco-e4-pinrec-wrap') },
            ikm, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
        );
        const token = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode('synco-e4-pinrec-verify') }, ikm, 256));
        const verifyHash = toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', token)));
        return { wrapKey, token, verifyHash };
    } finally {
        ikmBytes.fill(0);
        outA.fill(0);
        outB.fill(0);
    }
}

const envelopeAad = (userId: string) => enc.encode(`synco-e4-pinrec-envelope|${userId}`);

async function sealAk(wrapKey: CryptoKey, userId: string, akBytes: Uint8Array): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: envelopeAad(userId) }, wrapKey, akBytes as BufferSource));
    const out = new Uint8Array(12 + ct.length);
    out.set(iv, 0);
    out.set(ct, 12);
    return toB64(out);
}

async function openAk(wrapKey: CryptoKey, userId: string, envelope: string): Promise<Uint8Array | null> {
    const blob = fromB64(envelope);
    if (blob.length < 12 + 16) return null;
    try {
        const ak = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: blob.slice(0, 12), additionalData: envelopeAad(userId) }, wrapKey, blob.slice(12)));
        return ak.length === 32 ? ak : null;
    } catch {
        return null;
    }
}

/** Un tour OPRF auprès d'un acteur : aveugle, fait évaluer, désaveugle. */
async function oprfRound<T extends { evaluated: string }>(userId: string, pin: string, call: (blinded: string) => Promise<T>) {
    const x = input(userId, pin);
    const { blind, blinded } = oprf.blind(x);
    try {
        const result = await call(toB64(blinded));
        return { result, output: oprf.finalize(x, blind, fromB64(result.evaluated)) };
    } finally {
        blind.fill(0);
        x.fill(0);
    }
}

/** Traduit les refus des acteurs (404 / 423) en PinRecoveryFailure. */
function actorFailure(e: unknown): PinRecoveryFailure | null {
    const status = (e as { status?: number })?.status;
    if (status === 423) return new PinRecoveryFailure('locked', 0);
    if (status === 404) return new PinRecoveryFailure('disabled', 0);
    return null;
}

/** Évalue le PIN auprès des deux acteurs (deux essais comptés) et dérive K. */
async function evaluateBoth(actors: PinRecoveryActors, userId: string, pin: string) {
    checkPin(pin);
    try {
        const [a, b] = await Promise.all([
            oprfRound(userId, pin, (bl) => actors.server.evaluate(bl)),
            oprfRound(userId, pin, (bl) => actors.guard.evaluate(bl)),
        ]);
        if (!a.result.envelope) throw new PinRecoveryFailure('disabled', 0);
        const attemptsLeft = Math.min(a.result.attemptsLeft, b.result.attemptsLeft);
        return { ...(await deriveKeys(userId, a.output, b.output)), envelope: a.result.envelope, attemptsLeft };
    } catch (e) {
        throw actorFailure(e) ?? e;
    }
}

/** Ouvre AK avec le PIN ; en cas de réussite, remet les compteurs des deux acteurs à zéro. */
async function openWithPin(actors: PinRecoveryActors, userId: string, pin: string) {
    const { wrapKey, token, envelope, attemptsLeft } = await evaluateBoth(actors, userId, pin);
    try {
        const akBytes = await openAk(wrapKey, userId, envelope);
        if (!akBytes) throw new PinRecoveryFailure('wrong-pin', attemptsLeft);
        await Promise.all([actors.server.verify(toB64(token)), actors.guard.verify(toB64(token))]).catch(() => {});
        return { akBytes, wrapKey };
    } finally {
        token.fill(0);
    }
}

/**
 * Active (ou réactive) la récupération par PIN depuis un appareil connecté : clés OPRF neuves chez
 * les deux acteurs, AK scellée sous K. L'acteur isolé est validé avant synco_api ; en cas d'échec
 * entre les deux, une nouvelle activation remet tout d'aplomb.
 */
export async function enablePinRecovery(dev: DeviceContext, actors: PinRecoveryActors, pin: string, ctx?: VaultContext): Promise<void> {
    checkPin(pin);
    await withAccountKey(dev, ctx, async (akBytes) => {
        const [a, b] = await Promise.all([
            oprfRound(dev.userId, pin, (bl) => actors.server.begin(bl)),
            oprfRound(dev.userId, pin, (bl) => actors.guard.begin(bl)),
        ]);
        const { wrapKey, token, verifyHash } = await deriveKeys(dev.userId, a.output, b.output);
        token.fill(0);
        const envelope = await sealAk(wrapKey, dev.userId, akBytes);
        const proof = await proveAction(dev, akBytes, 'pin-commit', { setupId: a.result.setupId, verifyHash, envelope });
        await actors.guard.commit(b.result.setupId, verifyHash);
        await actors.server.commit(a.result.setupId, verifyHash, envelope, proof);
    });
}

/** Désactivation : redemande le coffre (preuve d'identité exigée par synco_api). */
export async function disablePinRecovery(dev: DeviceContext, actors: PinRecoveryActors, ctx?: VaultContext): Promise<void> {
    await withAccountKey(dev, ctx, async (akBytes) => {
        await actors.server.disable(await proveAction(dev, akBytes, 'pin-delete', {}));
    });
    await actors.guard.disable().catch(() => {});
}

/** Connexion d'un appareil neuf avec le PIN de récupération (aucun appareil ni clé de récupération). */
export async function recoverWithPin(
    dev: DeviceContext,
    actors: PinRecoveryActors,
    pin: string,
    sealed: SealedIdentity,
    served: ServedIdentity,
    opts: EnrollOptions,
): Promise<IdentityKeys> {
    const { akBytes } = await openWithPin(actors, dev.userId, pin);
    try {
        return await enrollWithAccountKey(dev, akBytes, sealed, served, opts);
    } finally {
        akBytes.fill(0);
    }
}

/**
 * Rotation d'AK (retrait d'appareil) : vérifie le PIN contre l'enveloppe actuelle (elle doit contenir
 * l'AK actuelle) et renvoie de quoi sceller la nouvelle AK sous la même K. À passer à removeDevices.
 */
export function keepPinRecovery(actors: PinRecoveryActors, userId: string, pin: string) {
    return async (currentAk: Uint8Array) => {
        const { akBytes, wrapKey } = await openWithPin(actors, userId, pin);
        try {
            if (akBytes.length !== currentAk.length || !akBytes.every((b, i) => b === currentAk[i])) {
                throw new E2eeV4Error('PIN recovery envelope does not hold the current account key');
            }
        } finally {
            akBytes.fill(0);
        }
        return (newAk: Uint8Array) => sealAk(wrapKey, userId, newAk);
    };
}

/** État combiné : active seulement si les deux acteurs le sont ; essais restants = le plus bas. */
export async function pinRecoveryStatus(actors: PinRecoveryActors): Promise<PinRecoveryStatus & { guardReachable: boolean }> {
    const server = await actors.server.status();
    const guard = await actors.guard.status().catch(() => null);
    if (!guard) return { ...server, enabled: false, guardReachable: false };
    return {
        enabled: server.enabled && guard.enabled,
        attemptsLeft: Math.min(server.attemptsLeft, guard.attemptsLeft),
        locked: server.locked || guard.locked,
        guardReachable: true,
    };
}
