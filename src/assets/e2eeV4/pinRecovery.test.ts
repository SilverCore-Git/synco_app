import { describe, expect, test } from "bun:test";
import { p256_oprf } from "@noble/curves/nist.js";
import { getLocalDevice } from "../deviceVault/localDevice";
import { prepareV4Account, removeDevices, unlockV4 } from "./session";
import { PinRecoveryFailure, disablePinRecovery, enablePinRecovery, keepPinRecovery, pinRecoveryStatus, recoverWithPin, type OprfActor, type PinRecoveryActors } from "./pinRecovery";
import { U, device, errName, fakeServer, sealedOf, served } from "./testkit";
import { actionProofMessage } from "../utils/e2eeV4";

const oprf = p256_oprf.oprf;
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const MAX = 10;

/** Acteur OPRF simulé, mêmes règles que synco_api et synco_keyguard. */
function fakeActor(envelopeStore?: { get(): string | null; set(v: string | null): void }) {
    const st = { key: null as Uint8Array | null, verifyHash: null as string | null, failures: 0, pending: null as null | { id: string; key: Uint8Array }, seen: [] as string[] };
    const err = (status: number) => Object.assign(new Error(String(status)), { status });
    const actor: OprfActor & { commit(id: string, h: string, env?: string): Promise<void> } = {
        async status() { const enabled = !!st.key && (!envelopeStore || !!envelopeStore.get()); return { enabled, attemptsLeft: enabled ? MAX - st.failures : 0, locked: enabled && st.failures >= MAX }; },
        async begin(blinded) { st.seen.push(blinded); const { secretKey } = oprf.generateKeyPair(); st.pending = { id: crypto.randomUUID(), key: secretKey }; return { setupId: st.pending.id, evaluated: toB64(oprf.blindEvaluate(secretKey, fromB64(blinded))) }; },
        async commit(id, h, env, _proof?: string) { if (st.pending?.id !== id) throw err(409); st.key = st.pending.key; st.verifyHash = h; st.failures = 0; st.pending = null; if (envelopeStore && env) envelopeStore.set(env); },
        async evaluate(blinded) {
            st.seen.push(blinded);
            if (!st.key || (envelopeStore && !envelopeStore.get())) throw err(404);
            if (st.failures >= MAX) throw err(423);
            st.failures++;
            return { evaluated: toB64(oprf.blindEvaluate(st.key, fromB64(blinded))), attemptsLeft: MAX - st.failures, ...(envelopeStore ? { envelope: envelopeStore.get()! } : {}) };
        },
        async verify(token) { const h = toB64(new Uint8Array(await crypto.subtle.digest("SHA-256", fromB64(token)))); if (h !== st.verifyHash) throw err(422); st.failures = 0; },
        async disable(_proof?: string) { st.key = null; st.verifyHash = null; envelopeStore?.set(null); },
    };
    return { actor, st };
}

async function setup() {
    const server = fakeServer();
    const a = device(server.api);
    await (await prepareV4Account(a.dev, { ...a.opts, mode: "create" })).commit(false);
    const apiActor = fakeActor({ get: () => server.state.pinRecovery, set: (v) => { server.state.pinRecovery = v; } });
    const guardActor = fakeActor();
    const actors = { server: apiActor.actor, guard: guardActor.actor } as PinRecoveryActors;
    return { server, a, actors, apiActor, guardActor };
}

describe("récupération par PIN", () => {
    test("activation puis connexion d'un appareil neuf avec le PIN ; les acteurs ne voient jamais le PIN", async () => {
        const { server, a, actors, apiActor, guardActor } = await setup();
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        expect((await pinRecoveryStatus(actors)).enabled).toBe(true);

        const b = device(server.api, "1111");
        await recoverWithPin(b.dev, actors, "4821", sealedOf(server.state), served(server.state), b.opts);
        expect(server.state.devices.size).toBe(2);
        await unlockV4(b.dev, sealedOf(server.state), served(server.state), b.ctx);

        const seen = JSON.stringify([...apiActor.st.seen, ...guardActor.st.seen, server.state.calls]);
        expect(seen).not.toContain("4821");
        // la réussite a remis les compteurs à zéro
        expect(apiActor.st.failures).toBe(0);
        expect(guardActor.st.failures).toBe(0);
    });

    test("mauvais PIN : essais restants, puis blocage chez les acteurs ; rien n'est inscrit", async () => {
        const { server, a, actors } = await setup();
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        const b = device(server.api, "1111");
        const first = await recoverWithPin(b.dev, actors, "0000", sealedOf(server.state), served(server.state), b.opts).catch(e => e);
        expect(first).toBeInstanceOf(PinRecoveryFailure);
        expect((first as PinRecoveryFailure).reason).toBe("wrong-pin");
        expect((first as PinRecoveryFailure).attemptsLeft).toBe(9);
        for (let i = 0; i < 9; i++) await recoverWithPin(b.dev, actors, "0000", sealedOf(server.state), served(server.state), b.opts).catch(() => {});
        const locked = await recoverWithPin(b.dev, actors, "4821", sealedOf(server.state), served(server.state), b.opts).catch(e => e);
        expect((locked as PinRecoveryFailure).reason).toBe("locked");
        expect(await getLocalDevice(b.dev.store, U)).toBeUndefined();
        expect(server.state.devices.size).toBe(1);
    });

    test("un seul acteur ne suffit pas : sans la sortie de l'autre, l'enveloppe ne s'ouvre pas", async () => {
        const { server, a, actors } = await setup();
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        // le keyguard a été réactivé ailleurs (clé neuve) : sa sortie change, l'enveloppe ne s'ouvre plus
        const rogue = fakeActor();
        const b = device(server.api, "1111");
        const e = await recoverWithPin(b.dev, { server: actors.server, guard: rogue.actor } as PinRecoveryActors, "4821", sealedOf(server.state), served(server.state), b.opts).catch(x => x);
        expect((e as PinRecoveryFailure).reason).toBe("disabled");
        await rogue.actor.commit((await rogue.actor.begin(toB64(oprf.blind(new Uint8Array([1])).blinded))).setupId, "x");
        const e2 = await recoverWithPin(b.dev, { server: actors.server, guard: rogue.actor } as PinRecoveryActors, "4821", sealedOf(server.state), served(server.state), b.opts).catch(x => x);
        expect((e2 as PinRecoveryFailure).reason).toBe("wrong-pin");
    });

    test("retrait d'appareil : avec le PIN la récupération suit la nouvelle AK ; sans, elle est désactivée", async () => {
        const { server, a, actors } = await setup();
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        const b = device(server.api, "1111");
        await recoverWithPin(b.dev, actors, "4821", sealedOf(server.state), served(server.state), b.opts);
        const bId = (await getLocalDevice(b.dev.store, U))!.deviceId;

        // mauvais PIN : la rotation n'a pas lieu
        expect(await errName(removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx, keepPinRecovery(actors, U, "0000")))).toBe("PinRecoveryFailure");
        expect(server.state.devices.size).toBe(2);

        const kept = await removeDevices(a.dev, [bId], async () => sealedOf(server.state), a.ctx, keepPinRecovery(actors, U, "4821"));
        expect(kept.pinRecoveryDisabled).toBe(false);
        const c = device(server.api, "2222");
        await recoverWithPin(c.dev, actors, "4821", sealedOf(server.state), served(server.state), c.opts);

        const cId = (await getLocalDevice(c.dev.store, U))!.deviceId;
        const dropped = await removeDevices(a.dev, [cId], async () => sealedOf(server.state), a.ctx);
        expect(dropped.pinRecoveryDisabled).toBe(true);
        expect((await pinRecoveryStatus(actors)).enabled).toBe(false);
    });

    test("désactivation ; keyguard injoignable : signalé comme tel", async () => {
        const { a, actors } = await setup();
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        await disablePinRecovery(a.dev, actors, a.ctx);
        expect((await pinRecoveryStatus(actors)).enabled).toBe(false);
        const down = { ...actors, guard: { ...actors.guard, status: async () => { throw new Error("réseau"); } } } as PinRecoveryActors;
        expect((await pinRecoveryStatus(down)).guardReachable).toBe(false);
    });

    test("PIN mal formé refusé avant tout appel", async () => {
        const { a, actors, apiActor } = await setup();
        expect(await errName(enablePinRecovery(a.dev, actors, "12", a.ctx))).toBe("E2eeV4Error");
        expect(apiActor.st.seen.length).toBe(0);
    });
});

describe("preuve d'identité (V4A1)", () => {
    test("l'activation et la désactivation chez synco_api portent une preuve valide de l'identité", async () => {
        const { server, a, actors } = await setup();
        const proofs: Array<{ action: "pin-commit" | "pin-delete"; body: Record<string, unknown> }> = [];
        const commit = actors.server.commit;
        actors.server.commit = async (setupId, verifyHash, envelope, proof) => { proofs.push({ action: "pin-commit", body: { setupId, verifyHash, envelope, proof } }); return commit(setupId, verifyHash, envelope, proof); };
        const disable = actors.server.disable;
        actors.server.disable = async (proof) => { proofs.push({ action: "pin-delete", body: { proof } }); return disable(proof); };
        await enablePinRecovery(a.dev, actors, "4821", a.ctx);
        await disablePinRecovery(a.dev, actors, a.ctx);
        const key = await crypto.subtle.importKey("jwk", JSON.parse(server.state.user!.publicSignKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
        for (const p of proofs) {
            const msg = new TextEncoder().encode(await actionProofMessage(U, p.action, server.state.user!.encryptedPrivateKey, p.body));
            expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Uint8Array.from(atob(p.body.proof as string), c => c.charCodeAt(0)), msg)).toBe(true);
        }
        expect(proofs.map(p => p.action)).toEqual(["pin-commit", "pin-delete"]);
    });
});

