/**
 * Appairage par un admin (01 §7) : fiche publique lue en direct, code d'appairage comparé à
 * l'empreinte recalculée, défi `pair`, certificat signé avec la clé de signature d'identité, dépôt,
 * puis épinglage (l'admin est le premier témoin).
 */
import {
    checkPairingCode,
    formatRuntimeFingerprint,
    signRuntimeCertificate,
    type RuntimeCertificate,
} from '@/assets/utils/runtimeCert';
import { AiRuntimeError, apiError, fromFormatError } from './errors';
import type { AiRuntimeDeps } from './ports';
import { pinRuntime } from './runtimePin';
import { canonicalUrlOrThrow, fetchRuntimeIdentity, fetchRuntimeRegistry, requireUserId, runChallenge, type RuntimeIdentity } from './runtimeTrust';

export interface PairingPreview {
    identity: RuntimeIdentity;
    /** Empreinte formatée, à afficher à l'admin. */
    fingerprint: string;
}

/** Étapes 3 et 4 de 01 §7 : URL canonique, fiche en direct, code, org, défi `pair`. */
export async function previewPairing(deps: AiRuntimeDeps, orgId: string, urlInput: string, pairingCode: string): Promise<PairingPreview> {
    const url = canonicalUrlOrThrow(deps, urlInput);
    const identity = await fetchRuntimeIdentity(deps, url);
    try {
        await checkPairingCode(pairingCode, identity.fpr);
    } catch (e) {
        throw fromFormatError(e, 'pair_code_mismatch');
    }
    if (identity.orgId !== null && identity.orgId !== orgId) throw new AiRuntimeError('runtime_already_paired');
    await runChallenge(deps, 'pair', orgId, identity);
    return { identity, fingerprint: formatRuntimeFingerprint(identity.fprHex) };
}

export interface PairingResult {
    runtimeId: string;
    fingerprint: string;
    recertified: boolean;
}

/**
 * Appairage complet (étapes 3 à 6). Une recertification (même runtime, mêmes clés, nouvelle URL)
 * prend `serial` = certificat courant + 1 ; sinon `serial` = 1. `expectedFingerprint` : empreinte affichée à
 * l'admin dans l'aperçu ; différente de celle présentée maintenant, rien n'est signé ni déposé.
 */
export async function pairRuntime(deps: AiRuntimeDeps, orgId: string, urlInput: string, pairingCode: string, expectedFingerprint?: string): Promise<PairingResult> {
    const adminId = requireUserId(deps);
    const signKey = deps.identity.signKey();
    if (!signKey) throw new AiRuntimeError('e2ee_locked');
    const { identity, fingerprint } = await previewPairing(deps, orgId, urlInput, pairingCode);
    // L'admin certifie l'empreinte qu'il a COMPARÉE à l'aperçu : si le runtime en présente une autre, refus.
    if (expectedFingerprint !== undefined && expectedFingerprint !== fingerprint) throw new AiRuntimeError('pair_code_mismatch');

    const registry = await fetchRuntimeRegistry(deps, orgId);
    const current = registry.runtime;
    const serial = current && current.runtimeId === identity.runtimeId ? current.certSerial + 1 : 1;
    const cert: RuntimeCertificate = {
        orgId,
        runtimeId: identity.runtimeId,
        url: identity.url,
        keys: identity.keys,
        adminId,
        issuedAt: deps.clock.now(),
        serial,
    };
    let signature: string;
    try {
        signature = await signRuntimeCertificate(signKey, cert, { allowDevHttp: deps.allowDevHttp });
    } catch (e) {
        throw fromFormatError(e, 'cert_invalid');
    }
    const certificate = {
        v: 1,
        orgId: cert.orgId,
        runtimeId: cert.runtimeId,
        url: cert.url,
        keys: { sig: cert.keys.sig, kex: JSON.parse(cert.keys.kex) as object, csk: JSON.parse(cert.keys.csk) as object },
        adminId: cert.adminId,
        issuedAt: cert.issuedAt,
        serial: cert.serial,
        signature,
    };
    const res = await deps.api.request('POST', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`, { certificate });
    if (res.status !== 200 && res.status !== 201) throw apiError(res.status, res.body);
    await pinRuntime(deps.store, adminId, orgId, identity.runtimeId, identity.fprHex, deps.clock.now());
    const body = res.body && typeof res.body === 'object' ? (res.body as { recertified?: unknown }) : {};
    return { runtimeId: identity.runtimeId, fingerprint, recertified: body.recertified === true };
}

/** Désappairage par un admin (01 §9) ; l'épingle locale est archivée par `onRuntimeUnpaired`. */
export async function unpairRuntime(deps: AiRuntimeDeps, orgId: string): Promise<{ sessions: number }> {
    const res = await deps.api.request('DELETE', `/api/orgs/${encodeURIComponent(orgId)}/ai/runtime`);
    if (res.status !== 200) throw apiError(res.status, res.body);
    const b = res.body && typeof res.body === 'object' ? (res.body as { sessions?: unknown }) : {};
    return { sessions: typeof b.sessions === 'number' ? b.sessions : 0 };
}
