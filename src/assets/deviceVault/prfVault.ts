import { DK_LENGTH, VaultError, fromB64, toB64, type DeviceVault, type KeyValueStore, type VaultContext } from './types';

/**
 * Coffre web adossé à une passkey WebAuthn (extension PRF) : DK est DÉRIVÉE d'un secret que
 * l'authentificateur (Touch ID, Windows Hello, Android, clé FIDO) ne restitue qu'après vérification
 * de l'utilisateur (biométrie ou code de l'authentificateur). Rien de secret n'est stocké sur
 * l'appareil : seul l'identifiant public de la passkey l'est. Les essais sont limités par le matériel.
 *
 * Disponibilité : Chrome / Edge, Safari récent ; Firefox inégal. Quand l'authentificateur ne fournit
 * pas PRF, create() lève 'unavailable' et l'appelant se replie sur le coffre PIN.
 */

const enc = new TextEncoder();
const recordKey = (deviceId: string) => `e4-prfvault:${deviceId}`;

export interface PrfDeps {
    credentials: Pick<CredentialsContainer, 'create' | 'get'>;
    store: KeyValueStore;
    rpName?: string;
    rpId?: string;
    /**
     * Signale au gestionnaire de passkeys qu'une passkey créée ici est inutilisable (Signal API,
     * PublicKeyCredential.signalUnknownCredential) : il peut la retirer au lieu de la garder.
     */
    signalUnknownCredential?: (credentialIdB64url: string) => Promise<void>;
}

const toB64url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

interface PrfRecord { v: 1; credentialId: string }

async function prfSalt(deviceId: string): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`synco-e4-prf|${deviceId}`)));
}

async function deriveDk(prfOutput: ArrayBuffer, deviceId: string): Promise<Uint8Array> {
    const ikm = await crypto.subtle.importKey('raw', prfOutput, 'HKDF', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt: enc.encode('synco-e4-dk-v1'), info: enc.encode(`synco-e4-dk|${deviceId}`) },
        ikm,
        DK_LENGTH * 8
    ));
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

/** Détection grossière (la prise en charge réelle de PRF ne se découvre qu'à la création). */
export function webAuthnAvailable(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).PublicKeyCredential !== 'undefined' && !!navigator.credentials;
}

export class PrfVault implements DeviceVault {
    readonly capabilities = { kind: 'webauthn-prf', hardwareBacked: true, biometric: true, needsPin: false, rateLimit: 'hardware' } as const;

    constructor(private readonly deps: PrfDeps) {}

    private async evaluate(credentialId: Uint8Array, deviceId: string): Promise<ArrayBuffer> {
        let assertion: Credential | null;
        try {
            assertion = await this.deps.credentials.get({
                publicKey: {
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
                    userVerification: 'required',
                    ...(this.deps.rpId ? { rpId: this.deps.rpId } : {}),
                    extensions: { prf: { eval: { first: await prfSalt(deviceId) } } } as AuthenticationExtensionsClientInputs,
                },
            });
        } catch (e) {
            if ((e as DOMException)?.name === 'NotAllowedError') throw new VaultError('cancelled');
            throw new VaultError('unavailable', (e as Error)?.message);
        }
        const out = (assertion as PublicKeyCredential | null)?.getClientExtensionResults() as PrfResults | undefined;
        const first = out?.prf?.results?.first;
        if (!first) throw new VaultError('unavailable', "L'authentificateur ne fournit pas l'extension PRF.");
        return first;
    }

    async create(deviceId: string): Promise<Uint8Array> {
        let credential: Credential | null;
        try {
            credential = await this.deps.credentials.create({
                publicKey: {
                    rp: { name: this.deps.rpName ?? 'Synco', ...(this.deps.rpId ? { id: this.deps.rpId } : {}) },
                    user: { id: crypto.getRandomValues(new Uint8Array(16)), name: `synco-device-${deviceId.slice(0, 8)}`, displayName: 'Synco' },
                    challenge: crypto.getRandomValues(new Uint8Array(32)),
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
                    authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
                    extensions: { prf: { eval: { first: await prfSalt(deviceId) } } } as AuthenticationExtensionsClientInputs,
                },
            });
        } catch (e) {
            if ((e as DOMException)?.name === 'NotAllowedError') throw new VaultError('cancelled');
            throw new VaultError('unavailable', (e as Error)?.message);
        }
        if (!credential) throw new VaultError('cancelled');

        const pkc = credential as PublicKeyCredential;
        const results = pkc.getClientExtensionResults() as PrfResults;
        const credentialId = new Uint8Array(pkc.rawId);

        // Beaucoup d'authentificateurs ne renvoient la valeur PRF qu'à une assertion, et certains
        // gestionnaires de passkeys (extensions de navigateur) n'annoncent même pas `prf.enabled` à
        // la création : seule l'assertion tranche. Une passkey sans PRF reste inutilisable ici
        // (elle ne fournit aucun secret pour protéger DK) : on la signale au gestionnaire.
        let output = results.prf?.results?.first;
        if (!output) {
            try {
                output = await this.evaluate(credentialId, deviceId);
            } catch (e) {
                if (e instanceof VaultError && e.code === 'unavailable') {
                    await this.deps.signalUnknownCredential?.(toB64url(credentialId)).catch(() => {});
                    throw new VaultError('unavailable', "Cette passkey (ou le gestionnaire qui l'enregistre) ne fournit pas l'extension PRF nécessaire au chiffrement.");
                }
                throw e;
            }
        }
        await this.deps.store.set(recordKey(deviceId), { v: 1, credentialId: toB64(credentialId) } satisfies PrfRecord);
        return deriveDk(output, deviceId);
    }

    async load(deviceId: string): Promise<Uint8Array> {
        const record = await this.deps.store.get<PrfRecord>(recordKey(deviceId));
        if (!record) throw new VaultError('missing');
        return deriveDk(await this.evaluate(fromB64(record.credentialId), deviceId), deviceId);
    }

    remove(deviceId: string): Promise<void> {
        return this.deps.store.del(recordKey(deviceId));
    }

    async has(deviceId: string): Promise<boolean> {
        return (await this.deps.store.get(recordKey(deviceId))) !== undefined;
    }
}
