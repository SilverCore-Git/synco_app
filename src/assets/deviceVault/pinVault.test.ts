import { describe, expect, test } from "bun:test";
import { MAX_FAILURES, PinVault } from "./pinVault";
import { VaultError, type KeyValueStore } from "./types";

const memory = () => {
    const m = new Map<string, unknown>();
    const store: KeyValueStore = {
        get: async <T>(k: string) => m.get(k) as T | undefined,
        set: async (k, v) => { m.set(k, structuredClone(v)); },
        del: async (k) => { m.delete(k); },
    };
    return { m, store };
};
const ID = "device-1";
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return (e as VaultError).code; } };

describe("PinVault (repli web)", () => {
    test("aller-retour : la bonne DK revient avec le bon PIN", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        const dk = await vault.create(ID, { pin: "4821" });
        expect(dk.length).toBe(32);
        expect(await vault.load(ID, { pin: "4821" })).toEqual(dk);
        expect(await vault.has(ID)).toBe(true);
    });

    test("PIN absent, trop court ou inconnu", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        expect(await code(vault.create(ID))).toBe("pin-required");
        expect(await code(vault.create(ID, { pin: "12" }))).toBe("wrong-pin");
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("missing");
    });

    test("DK stockée chiffrée : ni la DK ni le PIN n'apparaissent dans le stockage", async () => {
        const { m, store } = memory();
        const vault = new PinVault(store, 1000);
        const dk = await vault.create(ID, { pin: "4821" });
        const dump = JSON.stringify([...m.values()]);
        expect(dump).not.toContain("4821");
        expect(dump).not.toContain(btoa(String.fromCharCode(...dk)));
    });

    test("mauvais PIN : refusé, compteur remis à zéro après un bon essai", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        expect(await code(vault.load(ID, { pin: "0000" }))).toBe("wrong-pin");
        expect(await code(vault.load(ID, { pin: "1111" }))).toBe("wrong-pin");
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("ok");
        const rec = (await store.get<any>(`e4-pinvault:${ID}`))!;
        expect(rec.failures).toBe(0);
    });

    test("temporisation après 5 échecs, puis effacement au 10e", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        for (let i = 0; i < 5; i++) expect(await code(vault.load(ID, { pin: "0000" }))).toBe("wrong-pin");
        // 6e essai : verrouillé par la temporisation (même avec le bon PIN)
        await code(vault.load(ID, { pin: "0000" }));
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("locked");
        // contourner l'attente (simule le temps écoulé) et épuiser les essais
        for (let i = 0; i < MAX_FAILURES; i++) {
            const rec = await store.get<any>(`e4-pinvault:${ID}`);
            if (!rec) break;
            await store.set(`e4-pinvault:${ID}`, { ...rec, lockedUntil: null });
            await code(vault.load(ID, { pin: "0000" }));
        }
        expect(await vault.has(ID)).toBe(false);
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("missing");
    });

    test("l'échec est compté avant l'essai : un bon PIN après tentatives interrompues ne réinitialise pas par erreur", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        // simule des essais dont la réponse n'a jamais été lue : le compteur est déjà monté
        const rec = (await store.get<any>(`e4-pinvault:${ID}`))!;
        await store.set(`e4-pinvault:${ID}`, { ...rec, failures: 4 });
        await vault.load(ID, { pin: "0000" }).catch(() => {});
        expect((await store.get<any>(`e4-pinvault:${ID}`))!.failures).toBe(5);
    });

    test("enregistrement lié à l'appareil : copié sous un autre identifiant, il ne s'ouvre pas", async () => {
        const { m, store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        m.set("e4-pinvault:other", m.get(`e4-pinvault:${ID}`));
        expect(await code(vault.load("other", { pin: "4821" }))).toBe("wrong-pin");
    });

    test("remove", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        await vault.remove(ID);
        expect(await vault.has(ID)).toBe(false);
    });

    test("changement de PIN : même DK, l'ancien PIN ne fonctionne plus", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        const dk = await vault.create(ID, { pin: "4821" });
        await vault.changePin(ID, "4821", "9157");
        expect(await vault.load(ID, { pin: "9157" })).toEqual(dk);
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("wrong-pin");
    });

    test("changement de PIN avec un mauvais ancien PIN : refusé et compté", async () => {
        const { store } = memory();
        const vault = new PinVault(store, 1000);
        await vault.create(ID, { pin: "4821" });
        expect(await code(vault.changePin(ID, "0000", "9157"))).toBe("wrong-pin");
        expect(((await store.get<{ failures: number }>(`e4-pinvault:${ID}`))!).failures).toBe(1);
        expect(await code(vault.changePin(ID, "4821", "12"))).toBe("wrong-pin");
        expect(await code(vault.load(ID, { pin: "4821" }))).toBe("ok");
    });
});
