import { PinVault } from "../deviceVault/pinVault";
import { type DeviceVault, type KeyValueStore, type VaultError } from "../deviceVault/types";
import { followIdentityChain, verifyDeviceCertificate, type IdentityTransition } from "../utils/e2eeV4";
import {
    IdentityMismatchError, V4ApiError,
    type DeviceContext, type InitBody, type OwnIdentityTrust, type PendingLink, type RemoteDevice, type SealedIdentity, type V4Api,
} from "./session";

/** Utilitaires de test de l'E2EE v4 (importés uniquement par les *.test.ts). */

export const U = "user-1";

export const memory = (): KeyValueStore => {
    const m = new Map<string, unknown>();
    return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
};

/** Serveur simulé : mêmes règles de couverture et d'usage unique que synco_api. */
export function fakeServer() {
    const state = {
        user: null as null | (SealedIdentity & { publicKey: string; publicSignKey: string }),
        devices: new Map<string, RemoteDevice & { envelope: string }>(),
        recovery: null as string | null,
        /** Enveloppe de la récupération par PIN (tenue par l'acteur synco_api). */
        pinRecovery: null as string | null,
        identityArchive: null as string | null,
        transitions: [] as IdentityTransition[],
        links: new Map<string, PendingLink & { responderPublicKey?: string; envelope?: string }>(),
        calls: [] as Array<{ route: string; body: unknown }>,
    };
    const addDev = (d: InitBody["device"]) => state.devices.set(d.id, { id: d.id, name: d.name, platform: d.platform, publicKey: d.publicKey, certificate: d.certificate, envelope: d.envelope, createdAt: new Date().toISOString(), lastUsedAt: null });
    const api: V4Api = {
        async init(body) { state.calls.push({ route: "init", body }); state.user = body.identity; addDev(body.device); state.recovery = body.recoveryEnvelope ?? null; },
        async reset(body) { state.calls.push({ route: "reset", body }); state.devices.clear(); state.user = body.identity; addDev(body.device); state.recovery = body.recoveryEnvelope ?? null; },
        async listDevices() { return [...state.devices.values()].map(({ envelope: _e, ...d }) => d); },
        async getEnvelope(id) { const d = state.devices.get(id); if (!d) throw new V4ApiError(404, "absent"); return { envelope: d.envelope, publicKey: d.publicKey, certificate: d.certificate }; },
        async renameDevice(id, name) { state.devices.get(id)!.name = name; },
        async addDevice(body) {
            state.calls.push({ route: "addDevice", body });
            if (body.linkRequestId) { const l = state.links.get(body.linkRequestId); if (!l?.envelope) throw new V4ApiError(409, "pas de liaison"); state.links.delete(body.linkRequestId); }
            addDev(body.device);
        },
        async rotate(body) {
            state.calls.push({ route: "rotate", body });
            const remaining = [...state.devices.keys()].filter(id => !body.removeDeviceIds.includes(id)).sort();
            const provided = body.envelopes.map(e => e.deviceId).sort();
            if (JSON.stringify(remaining) !== JSON.stringify(provided)) throw new V4ApiError(409, "couverture");
            if (state.recovery && !body.recoveryEnvelope) throw new V4ApiError(400, "récupération requise");
            if (state.identityArchive && !body.identityArchive) throw new V4ApiError(400, "archive requise");
            if (body.identityArchive) state.identityArchive = body.identityArchive;
            Object.assign(state.user!, body.identity);
            for (const e of body.envelopes) state.devices.get(e.deviceId)!.envelope = e.envelope;
            if (body.recoveryEnvelope && state.recovery) state.recovery = body.recoveryEnvelope;
            let pinRecoveryDisabled = false;
            if (state.pinRecovery) {
                if (body.pinRecoveryEnvelope) state.pinRecovery = body.pinRecoveryEnvelope;
                else { state.pinRecovery = null; pinRecoveryDisabled = true; }
            }
            for (const id of body.removeDeviceIds) state.devices.delete(id);
            state.links.clear();
            return { pinRecoveryDisabled };
        },
        async rotateIdentity(body) {
            state.calls.push({ route: "rotateIdentity", body });
            const t = body.transition;
            if (t.seq !== state.transitions.length) throw new V4ApiError(409, "rang");
            const signed = { seq: t.seq, oldPublicSignKey: state.user!.publicSignKey, newPublicKey: t.publicKey, newPublicSignKey: t.publicSignKey, signature: t.signature };
            const end = await followIdentityChain(U, state.user!.publicSignKey, [signed]);
            if (!end || end.publicKey !== t.publicKey || end.publicSignKey !== t.publicSignKey) throw new V4ApiError(400, "transition");
            const removeIds = body.removeDeviceIds ?? [];
            const remaining = [...state.devices.keys()].filter(id => !removeIds.includes(id)).sort();
            if (JSON.stringify(remaining) !== JSON.stringify(body.devices.map(d => d.deviceId).sort())) throw new V4ApiError(409, "couverture");
            for (const d of body.devices) {
                const known = state.devices.get(d.deviceId)!;
                if (!(await verifyDeviceCertificate(JSON.parse(t.publicSignKey), d.certificate, U, d.deviceId, known.platform, JSON.parse(known.publicKey)))) throw new V4ApiError(400, "certificat");
            }
            if (state.recovery && !body.recoveryEnvelope) throw new V4ApiError(400, "récupération requise");
            Object.assign(state.user!, body.identity, { publicKey: t.publicKey, publicSignKey: t.publicSignKey });
            for (const d of body.devices) Object.assign(state.devices.get(d.deviceId)!, { envelope: d.envelope, certificate: d.certificate });
            for (const id of removeIds) state.devices.delete(id);
            if (body.recoveryEnvelope && state.recovery) state.recovery = body.recoveryEnvelope;
            let pinRecoveryDisabled = false;
            if (state.pinRecovery) {
                if (body.pinRecoveryEnvelope) state.pinRecovery = body.pinRecoveryEnvelope;
                else { state.pinRecovery = null; pinRecoveryDisabled = true; }
            }
            state.identityArchive = body.identityArchive;
            state.transitions.push(signed);
            state.links.clear();
            return { pinRecoveryDisabled };
        },
        async getIdentityArchive() { return state.identityArchive; },
        async getTransitions() { return [...state.transitions]; },
        async getRecovery() { return state.recovery; },
        async putRecovery(env) { state.recovery = env; },
        async deleteRecovery() { state.recovery = null; },
        async createLink(body) { state.links.set(body.id, { ...body, createdAt: "", expiresAt: "" }); return { expiresAt: "" }; },
        async pendingLinks() { return [...state.links.values()].filter(l => !l.envelope); },
        async answerLink(id, body) { const l = state.links.get(id); if (!l || l.envelope) throw new V4ApiError(404, "x"); Object.assign(l, body); },
        async getLink(id) { const l = state.links.get(id); return l ? { answered: !!l.envelope, responderPublicKey: l.responderPublicKey ?? null, envelope: l.envelope ?? null } : null; },
        async cancelLink(id) { state.links.delete(id); },
    };
    return { api, state };
}

export function trustStore(): OwnIdentityTrust & { pinned?: { publicKey: string; publicSignKey: string } } {
    const t: OwnIdentityTrust & { pinned?: { publicKey: string; publicSignKey: string } } = {
        async pin(identity, opts) {
            if (t.pinned && !opts?.replace && (t.pinned.publicKey !== identity.publicKey || t.pinned.publicSignKey !== identity.publicSignKey)) throw new IdentityMismatchError("pinned");
            t.pinned = identity;
        },
        async pinnedSignKey() { return t.pinned?.publicSignKey; },
    };
    return t;
}

/** Un « appareil » : son stockage, son coffre (PIN local, rapide en test), sa confiance. */
export function device(api: V4Api, pin = "4821") {
    const store = memory();
    const vault = new PinVault(store, 1000);
    const dev: DeviceContext = { userId: U, store, vaultFor: () => vault, api, trust: trustStore() };
    return { dev, vault, ctx: { pin }, opts: { name: "Appareil", platform: "web" as const, vaults: [vault as DeviceVault], ctx: { pin } } };
}

export const sealedOf = (s: ReturnType<typeof fakeServer>["state"]): SealedIdentity => ({ ...s.user! });
export const served = (s: ReturnType<typeof fakeServer>["state"]) => ({ publicKey: s.user!.publicKey, publicSignKey: s.user!.publicSignKey });
export const errName = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code ?? (e as Error).name; } };

