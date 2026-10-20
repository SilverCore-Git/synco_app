import { describe, expect, test } from "bun:test";
import { generateAccountKeyBytes } from "../utils/e2eeV4";
import {
    EXTENSION_MESSAGES, ExtensionVault, MAX_REASON_LENGTH, detectExtension,
    type ExtensionMessageEvent, type ExtensionPort, type ExtensionWindow,
} from "./extensionVault";
import { enrollThisDevice, getLocalDevice, switchVault, unlockAccountKey } from "./localDevice";
import { PinVault } from "./pinVault";
import { VaultError, type DeviceVault, type KeyValueStore } from "./types";

const ORIGIN = "https://app.synco.one";
const DEV = "3f2b8c1e-5a7d-4e90-9b6a-1c2d3e4f5a6b";
const FAST = { detectTimeoutMs: 20, shortTimeoutMs: 60, promptTimeoutMs: 120 };
const READY = { source: "synco-extension", type: "ready", protocol: 1 };

const tick = () => new Promise(r => setTimeout(r, 0));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const failure = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e as VaultError; } };
const code = async (p: Promise<unknown>) => (await failure(p))?.code ?? "ok";

/** Port simulé : pas de clonage, la DK transmise est le même ArrayBuffer (on peut vérifier son effacement). */
class FakePort implements ExtensionPort {
    other!: FakePort;
    listener?: (event: { data: unknown }) => void;
    closed = false;
    /** Extension rechargée : le port reste ouvert côté page mais plus personne ne répond. */
    dead = false;
    postMessage(message: unknown) {
        if (this.closed || this.dead || this.other.dead) return;
        queueMicrotask(() => { if (!this.other.closed) this.other.listener?.({ data: message }); });
    }
    addEventListener(_type: "message", listener: (event: { data: unknown }) => void) { this.listener = listener; }
    start() {}
    close() { this.closed = true; }
}
const pair = () => { const a = new FakePort(), b = new FakePort(); a.other = b; b.other = a; return [a, b] as const; };

class FakeWindow implements ExtensionWindow {
    location = { origin: ORIGIN };
    posted: Array<{ message: unknown; target: string }> = [];
    listeners = new Set<(e: ExtensionMessageEvent) => void>();
    onHello?: () => void;
    addEventListener(_t: "message", l: (e: ExtensionMessageEvent) => void) { this.listeners.add(l); }
    removeEventListener(_t: "message", l: (e: ExtensionMessageEvent) => void) { this.listeners.delete(l); }
    postMessage(message: unknown, target: string) {
        this.posted.push({ message, target });
        queueMicrotask(() => {
            this.dispatch({ data: message });
            if ((message as { type?: string }).type === "hello" && target === this.location.origin) this.onHello?.();
        });
    }
    dispatch(e: Partial<ExtensionMessageEvent>) {
        const event: ExtensionMessageEvent = { source: this, origin: this.location.origin, data: undefined, ports: [], ...e };
        for (const l of [...this.listeners]) l(event);
    }
    get hellos() { return this.posted.filter(p => (p.message as { type?: string }).type === "hello").length; }
}

type Req = { id: number; op: string; args: Record<string, unknown> };
type Reply = (response: unknown) => void;

/** Extension simulée : coffre en mémoire, ou réponses imposées par `handler`. */
function fakeExtension(win: FakeWindow, handler?: (req: Req, reply: Reply) => void) {
    const ports: FakePort[] = [];
    const requests: Req[] = [];
    const records = new Map<string, Uint8Array>();
    const sentKeys: ArrayBuffer[] = [];
    const sendDk = (req: Req, reply: Reply, bytes: Uint8Array) => {
        const buf = bytes.slice().buffer;
        sentKeys.push(buf);
        reply({ id: req.id, ok: true, result: { dk: buf } });
    };
    const vault = (req: Req, reply: Reply) => {
        const id = req.args.deviceId as string;
        if (req.op === "status") return reply({ id: req.id, ok: true, result: { present: true, protocol: 1, version: "0.1.0", allowedOrigins: [ORIGIN], records: [...records.keys()] } });
        if (req.op === "has") return reply({ id: req.id, ok: true, result: { exists: records.has(id) } });
        if (req.op === "remove") { records.delete(id); return reply({ id: req.id, ok: true, result: { removed: true } }); }
        if (req.op === "create") { const dk = crypto.getRandomValues(new Uint8Array(32)); records.set(id, dk); return sendDk(req, reply, dk); }
        if (req.op === "load") { const dk = records.get(id); return dk ? sendDk(req, reply, dk) : reply({ id: req.id, ok: false, error: { code: "missing" } }); }
    };
    let present = true;
    win.onHello = () => {
        if (!present) return;
        const [page, ext] = pair();
        ports.push(ext);
        ext.addEventListener("message", (e) => { const req = e.data as Req; requests.push(req); (handler ?? vault)(req, (r) => ext.postMessage(r)); });
        win.dispatch({ data: { ...READY }, ports: [page] });
    };
    return {
        ports, requests, records, sentKeys,
        /** Extension rechargée : les ports existants ne répondent plus, les nouveaux handshakes oui. */
        reload: () => { for (const p of ports) p.dead = true; },
        disable: () => { present = false; for (const p of ports) p.dead = true; },
        enable: () => { present = true; },
    };
}

describe("detectExtension : handshake", () => {
    test("hello envoyé à l'origine de la page (jamais '*'), forme exacte ; ready → canal", async () => {
        const win = new FakeWindow();
        fakeExtension(win);
        const channel = await detectExtension(win, 50);
        expect(channel).not.toBeNull();
        expect(win.posted[0]).toEqual({ message: { source: "synco-page", type: "hello", protocol: 1 }, target: ORIGIN });
        expect(win.listeners.size).toBe(0);
    });

    test("aucune réponse : null après le délai, écouteur retiré", async () => {
        const win = new FakeWindow();
        const t0 = performance.now();
        expect(await detectExtension(win, 30)).toBeNull();
        expect(performance.now() - t0).toBeGreaterThanOrEqual(25);
        expect(win.listeners.size).toBe(0);
    });

    test.each([
        ["autre source (iframe, autre fenêtre)", { source: {} }],
        ["source nulle", { source: null }],
        ["autre origine", { origin: "https://evil.example" }],
        ["origine voisine (port)", { origin: "https://app.synco.one:444" }],
    ])("ready refusé : %s", async (_label, override) => {
        const win = new FakeWindow();
        const [page] = pair();
        win.onHello = () => win.dispatch({ data: { ...READY }, ports: [page], ...override });
        expect(await detectExtension(win, 30)).toBeNull();
    });

    test.each([
        ["clé en trop", { ...READY, extra: 1 }, 1],
        ["clé manquante", { source: "synco-extension", type: "ready" }, 1],
        ["autre protocole", { ...READY, protocol: 2 }, 1],
        ["protocole en texte", { ...READY, protocol: "1" }, 1],
        ["sans port", { ...READY }, 0],
        ["deux ports", { ...READY }, 2],
        ["pas un objet", "ready", 1],
        ["tableau", [READY], 1],
    ])("ready mal formé refusé, ports fermés : %s", async (_label, data, nPorts) => {
        const win = new FakeWindow();
        const ports = Array.from({ length: nPorts as number }, () => pair()[0]);
        win.onHello = () => win.dispatch({ data, ports });
        expect(await detectExtension(win, 30)).toBeNull();
        if (typeof data === "object" && !Array.isArray(data)) for (const p of ports) expect(p.closed).toBe(true);
    });

    test("un ready mal formé n'empêche pas d'accepter le vrai qui suit", async () => {
        const win = new FakeWindow();
        const [page] = pair();
        win.onHello = () => {
            win.dispatch({ data: { ...READY, extra: 1 }, ports: [pair()[0]] });
            win.dispatch({ data: { ...READY }, ports: [page] });
        };
        expect(await detectExtension(win, 30)).not.toBeNull();
    });

    test("unsupported : null tout de suite, sans attendre le délai", async () => {
        const win = new FakeWindow();
        win.onHello = () => win.dispatch({ data: { source: "synco-extension", type: "unsupported", protocol: 2 } });
        const t0 = performance.now();
        expect(await detectExtension(win, 5_000)).toBeNull();
        expect(performance.now() - t0).toBeLessThan(1_000);
    });

    test("détections simultanées : un seul hello, un seul canal", async () => {
        const win = new FakeWindow();
        fakeExtension(win);
        const [a, b] = await Promise.all([detectExtension(win, 50), detectExtension(win, 50)]);
        expect(a).toBe(b);
        expect(win.hellos).toBe(1);
    });
});

describe("ExtensionVault", () => {
    test("capacités déclarées", () => {
        expect(new ExtensionVault({ win: new FakeWindow() }).capabilities).toEqual({ kind: "extension", hardwareBacked: false, biometric: false, needsPin: false, rateLimit: "software" });
    });

    test("aller-retour create / load / has / remove", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        expect(await vault.detect()).toBe(true);
        const dk = await vault.create(DEV);
        expect(dk.length).toBe(32);
        expect(await vault.load(DEV)).toEqual(dk);
        expect(await vault.has(DEV)).toBe(true);
        await vault.remove(DEV);
        expect(await vault.has(DEV)).toBe(false);
        expect(ext.records.size).toBe(0);
    });

    test("extension absente : detect faux, les opérations échouent en unavailable sans attendre", async () => {
        const vault = new ExtensionVault({ win: new FakeWindow(), ...FAST });
        expect(await vault.detect()).toBe(false);
        expect(await code(vault.load(DEV))).toBe("unavailable");
        expect(await code(vault.has(DEV))).toBe("unavailable");
    });

    test("détection mise en cache pour la page ; force refait un handshake", async () => {
        const win = new FakeWindow();
        const vault = new ExtensionVault({ win, ...FAST });
        expect(await vault.detect()).toBe(false);
        fakeExtension(win);
        expect(await vault.detect()).toBe(false);
        expect(win.hellos).toBe(1);
        expect(await vault.detect(true)).toBe(true);
        expect(win.hellos).toBe(2);
    });

    test("onPrompt : appelé une fois quand la demande part, jamais si l'extension est absente", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        let calls = 0;
        await vault.create(DEV, { onPrompt: () => { calls++; expect(ext.requests.length).toBe(0); } });
        expect(calls).toBe(1);

        const absent = new ExtensionVault({ win: new FakeWindow(), ...FAST });
        let absentCalls = 0;
        expect(await code(absent.load(DEV, { onPrompt: () => { absentCalls++; } }))).toBe("unavailable");
        expect(absentCalls).toBe(0);

        // une interface qui plante dans onPrompt n'interrompt pas la demande
        expect(await vault.load(DEV, { onPrompt: () => { throw new Error("ui"); } })).toHaveLength(32);
    });

    test("onPrompt : la fonction de fin est appelée après un succès comme après un refus", async () => {
        const win = new FakeWindow();
        let refuse = false;
        fakeExtension(win, (req, reply) => refuse
            ? reply({ id: req.id, ok: false, error: { code: "cancelled" } })
            : reply({ id: req.id, ok: true, result: { dk: crypto.getRandomValues(new Uint8Array(32)).buffer } }));
        const vault = new ExtensionVault({ win, ...FAST });
        const events: string[] = [];
        const ctx = { onPrompt: () => { events.push("début"); return () => { events.push("fin"); }; } };
        await vault.load(DEV, ctx);
        refuse = true;
        expect(await code(vault.load(DEV, ctx))).toBe("cancelled");
        expect(events).toEqual(["début", "fin", "début", "fin"]);
    });

    test("onPrompt : la fonction de fin reçoit « ok » après un succès, « error » après un refus", async () => {
        const win = new FakeWindow();
        let refuse = false;
        fakeExtension(win, (req, reply) => refuse
            ? reply({ id: req.id, ok: false, error: { code: "cancelled" } })
            : reply({ id: req.id, ok: true, result: { dk: crypto.getRandomValues(new Uint8Array(32)).buffer } }));
        const vault = new ExtensionVault({ win, ...FAST });
        const outcomes: string[] = [];
        const ctx = { onPrompt: () => (outcome: "ok" | "error") => { outcomes.push(outcome); } };
        await vault.load(DEV, ctx);
        refuse = true;
        await code(vault.load(DEV, ctx));
        expect(outcomes).toEqual(["ok", "error"]);
    });

    test("seuls deviceId et la raison partent ; le PIN de ctx n'est jamais transmis", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        await vault.create(DEV, { pin: "4821", reason: "Relier cet appareil" });
        await vault.load(DEV, { pin: "4821" });
        expect(ext.requests.map(r => r.args)).toEqual([{ deviceId: DEV, reason: "Relier cet appareil" }, { deviceId: DEV }]);
        expect(JSON.stringify(ext.requests)).not.toContain("4821");
        for (const r of ext.requests) expect(Object.keys(r).sort()).toEqual(["args", "id", "op"]);
    });

    test("raison : texte brut d'une ligne, au plus 200 caractères ; vide → omise", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        await vault.create(DEV, { reason: "Ligne 1\nLigne\u202e 2\u0000" + "x".repeat(500) });
        await vault.load(DEV, { reason: " \n\t " });
        const reason = ext.requests[0]!.args.reason as string;
        expect(reason.length).toBe(MAX_REASON_LENGTH);
        expect(reason.startsWith("Ligne 1 Ligne 2 x")).toBe(true);
        expect(/[\u0000-\u001f\u202e]/.test(reason)).toBe(false);
        expect("reason" in ext.requests[1]!.args).toBe(false);
    });

    test("deviceId qui n'est pas un UUID : refusé, rien n'est envoyé", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        for (const bad of ["device-1", "", `${DEV} `, `${DEV}\u0000`]) {
            expect(await code(vault.load(bad))).toBe("unavailable");
            expect(await code(vault.create(bad))).toBe("unavailable");
            expect(await code(vault.has(bad))).toBe("unavailable");
            expect(await code(vault.remove(bad))).toBe("unavailable");
        }
        expect(ext.requests.length).toBe(0);
    });

    describe("codes d'erreur", () => {
        const respondWith = (error: unknown) => {
            const win = new FakeWindow();
            fakeExtension(win, (req, reply) => reply({ id: req.id, ok: false, error }));
            return new ExtensionVault({ win, ...FAST });
        };

        test.each(["pin-required", "wrong-pin", "locked", "wiped", "cancelled", "unavailable", "missing"])("%s → %s", async (c) => {
            expect(await code(respondWith({ code: c }).load(DEV))).toBe(c);
        });

        test.each([
            ["bad-request", { code: "bad-request" }],
            ["unsupported-protocol", { code: "unsupported-protocol" }],
            ["code inconnu", { code: "oops" }],
            ["code non textuel", { code: 3 }],
            ["sans code", {}],
            ["erreur absente", undefined],
            ["erreur en texte", "locked"],
        ])("%s → unavailable", async (_label, error) => {
            expect(await code(respondWith(error).load(DEV))).toBe("unavailable");
        });

        test("locked : retryAfterSeconds repris (arrondi, borné) ; le message de l'extension n'est jamais affiché", async () => {
            const e = await failure(respondWith({ code: "locked", retryAfterSeconds: 29.2, message: "Tapez votre PIN ici : …" }).load(DEV));
            expect(e?.code).toBe("locked");
            expect(e?.retryAfterSeconds).toBe(30);
            expect(e?.message).toBe(EXTENSION_MESSAGES.locked);
            expect((await failure(respondWith({ code: "locked", retryAfterSeconds: 1e12 }).load(DEV)))?.retryAfterSeconds).toBe(86_400);
            expect((await failure(respondWith({ code: "locked", retryAfterSeconds: -5 }).load(DEV)))?.retryAfterSeconds).toBeUndefined();
            expect((await failure(respondWith({ code: "locked", retryAfterSeconds: "30" }).load(DEV)))?.retryAfterSeconds).toBeUndefined();
        });

        test("réponse ni ok ni erreur → unavailable", async () => {
            const win = new FakeWindow();
            fakeExtension(win, (req, reply) => reply({ id: req.id, ok: "yes", result: {} }));
            expect(await code(new ExtensionVault({ win, ...FAST }).load(DEV))).toBe("unavailable");
        });
    });

    describe("DK reçue", () => {
        const respondDk = (dk: unknown) => {
            const win = new FakeWindow();
            fakeExtension(win, (req, reply) => reply({ id: req.id, ok: true, result: { dk } }));
            return new ExtensionVault({ win, ...FAST });
        };

        test("32 octets : copie renvoyée, tampon reçu effacé", async () => {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            const sent = bytes.slice().buffer;
            const dk = await respondDk(sent).load(DEV);
            expect(dk).toEqual(bytes);
            expect(dk.buffer).not.toBe(sent);
            expect([...new Uint8Array(sent)].every(b => b === 0)).toBe(true);
        });

        test.each([0, 16, 31, 33, 64])("%i octets : refusée (unavailable) et effacée", async (n) => {
            const sent = crypto.getRandomValues(new Uint8Array(n)).buffer;
            expect(await code(respondDk(sent).load(DEV))).toBe("unavailable");
            expect([...new Uint8Array(sent)].every(b => b === 0)).toBe(true);
        });

        test.each([
            ["Uint8Array", () => crypto.getRandomValues(new Uint8Array(32))],
            ["base64", () => btoa("x".repeat(32))],
            ["tableau", () => Array(32).fill(1)],
            ["absente", () => undefined],
        ])("DK de mauvais type (%s) : refusée", async (_label, make) => {
            expect(await code(respondDk(make()).create(DEV))).toBe("unavailable");
        });

        test("has : réponse de mauvaise forme → unavailable", async () => {
            const win = new FakeWindow();
            fakeExtension(win, (req, reply) => reply({ id: req.id, ok: true, result: { exists: "yes" } }));
            expect(await code(new ExtensionVault({ win, ...FAST }).has(DEV))).toBe("unavailable");
        });
    });

    describe("port mort, délais, annulation", () => {
        test("port mort : délai court dépassé, nouveau handshake et une seule reprise", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win);
            const vault = new ExtensionVault({ win, ...FAST });
            await vault.create(DEV);
            ext.reload();
            const before = win.hellos;
            expect(await vault.has(DEV)).toBe(true);
            expect(win.hellos).toBe(before + 1);
        });

        test("extension désactivée : délai dépassé puis unavailable avec un message clair", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win);
            const vault = new ExtensionVault({ win, ...FAST });
            await vault.create(DEV);
            ext.disable();
            const e = await failure(vault.has(DEV));
            expect(e?.code).toBe("unavailable");
            expect(e?.message).toBe(EXTENSION_MESSAGES.unavailable);
            ext.enable();
            expect(await vault.has(DEV)).toBe(true);
        });

        test("load sur un port mort : nouveau canal, pas d'attente du délai long", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win);
            const vault = new ExtensionVault({ win, detectTimeoutMs: 20, shortTimeoutMs: 60, promptTimeoutMs: 10_000 });
            const dk = await vault.create(DEV);
            ext.reload();
            const t0 = performance.now();
            expect(await vault.load(DEV)).toEqual(dk);
            expect(performance.now() - t0).toBeLessThan(1_000);
        });

        test("pas de réponse à load : unavailable au délai long, jamais relancé (une seule fenêtre de PIN)", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win, () => {});
            const vault = new ExtensionVault({ win, ...FAST });
            expect(await code(vault.load(DEV))).toBe("unavailable");
            expect(ext.requests.filter(r => r.op === "load").length).toBe(1);
        });

        test("délai dépassé : le port côté page est fermé, une réponse tardive ne parvient plus", async () => {
            const win = new FakeWindow();
            let late: (() => void) | undefined;
            const sent = crypto.getRandomValues(new Uint8Array(32)).buffer;
            const ext = fakeExtension(win, (req, reply) => { late = () => reply({ id: req.id, ok: true, result: { dk: sent } }); });
            const vault = new ExtensionVault({ win, ...FAST });
            expect(await code(vault.load(DEV))).toBe("unavailable");
            expect(ext.ports[0]!.other.closed).toBe(true);
            late!();
            await tick();
            expect(await code(vault.load(DEV))).toBe("unavailable");
        });

        test("annulation côté page : cancelled tout de suite ; la DK arrivée ensuite est effacée", async () => {
            const win = new FakeWindow();
            let pendingReply: (() => void) | undefined;
            const sent = crypto.getRandomValues(new Uint8Array(32)).buffer;
            fakeExtension(win, (req, reply) => { if (req.op === "load") pendingReply = () => reply({ id: req.id, ok: true, result: { dk: sent } }); });
            const vault = new ExtensionVault({ win, ...FAST, promptTimeoutMs: 10_000 });
            const ctrl = new AbortController();
            const attempt = vault.load(DEV, { signal: ctrl.signal });
            await sleep(5);
            ctrl.abort();
            expect(await code(attempt)).toBe("cancelled");
            pendingReply!();
            await tick();
            expect([...new Uint8Array(sent)].every(b => b === 0)).toBe(true);
        });

        test("annulation côté page : l'extension reçoit « cancel » pour refermer sa fenêtre de PIN", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win, () => { /* la fenêtre de PIN reste ouverte : aucune réponse */ });
            const vault = new ExtensionVault({ win, ...FAST, promptTimeoutMs: 10_000 });
            const ctrl = new AbortController();
            const attempt = vault.create(DEV, { signal: ctrl.signal, reason: "Protéger" });
            await sleep(5);
            expect(ext.requests.map(r => r.op)).toEqual(["create"]);
            ctrl.abort();
            expect(await code(attempt)).toBe("cancelled");
            await sleep(5);
            expect(ext.requests.map(r => r.op)).toEqual(["create", "cancel"]);
            expect(ext.requests[1]!.args).toEqual({}); // jamais d'identifiant ni de donnée avec cancel
        });

        test("pas de « cancel » après un succès, un refus de l'extension ou un signal déjà annulé", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win);
            const vault = new ExtensionVault({ win, ...FAST });
            const ctrl = new AbortController();
            await vault.create(DEV, { signal: ctrl.signal });
            await sleep(5);
            expect(ext.requests.map(r => r.op)).toEqual(["create"]);

            ctrl.abort(); // abandon après coup : plus rien à fermer
            await sleep(5);
            expect(ext.requests.map(r => r.op)).toEqual(["create"]);

            const win2 = new FakeWindow();
            const ext2 = fakeExtension(win2, (req, reply) => reply({ id: req.id, ok: false, error: { code: "cancelled" } }));
            expect(await code(new ExtensionVault({ win: win2, ...FAST }).load(DEV, { signal: new AbortController().signal }))).toBe("cancelled");
            await sleep(5);
            expect(ext2.requests.map(r => r.op)).toEqual(["load"]);
        });

        test("extension ancienne qui ne connaît pas « cancel » : l'annulation reste propre, sans erreur ni blocage", async () => {
            const win = new FakeWindow();
            fakeExtension(win, (req, reply) => { if (req.op === "cancel") reply({ id: req.id, ok: false, error: { code: "bad-request" } }); });
            const vault = new ExtensionVault({ win, ...FAST, promptTimeoutMs: 10_000 });
            const ctrl = new AbortController();
            const attempt = vault.load(DEV, { signal: ctrl.signal });
            await sleep(5);
            ctrl.abort();
            expect(await code(attempt)).toBe("cancelled");
            await sleep(5);
        });

        test("signal déjà annulé : rien n'est envoyé", async () => {
            const win = new FakeWindow();
            const ext = fakeExtension(win);
            const ctrl = new AbortController();
            ctrl.abort();
            expect(await code(new ExtensionVault({ win, ...FAST }).load(DEV, { signal: ctrl.signal }))).toBe("cancelled");
            expect(ext.requests.length).toBe(0);
        });

        test("réponse d'un id inconnu : ignorée et sa DK effacée", async () => {
            const win = new FakeWindow();
            const sent = crypto.getRandomValues(new Uint8Array(32)).buffer;
            const ext = fakeExtension(win, (req, reply) => {
                reply({ id: req.id + 1000, ok: true, result: { dk: sent } });
                reply({ id: req.id, ok: true, result: { exists: true } });
            });
            expect(await new ExtensionVault({ win, ...FAST }).has(DEV)).toBe(true);
            await tick();
            expect([...new Uint8Array(sent)].every(b => b === 0)).toBe(true);
            void ext;
        });
    });

    test("requêtes simultanées : ids distincts, réponses dans le désordre bien associées", async () => {
        const win = new FakeWindow();
        const held: Array<() => void> = [];
        const other = "0b8f6a2e-1c3d-4e5f-8a9b-0c1d2e3f4a5b";
        const ext = fakeExtension(win, (req, reply) => {
            held.push(() => reply({ id: req.id, ok: true, result: { exists: req.args.deviceId === DEV } }));
            if (held.length === 3) held.reverse().forEach(f => f());
        });
        const vault = new ExtensionVault({ win, ...FAST });
        await vault.detect();
        const results = await Promise.all([vault.has(DEV), vault.has(other), vault.has(DEV)]);
        expect(results).toEqual([true, false, true]);
        const ids = ext.requests.map(r => r.id);
        expect(new Set(ids).size).toBe(3);
        for (const id of ids) expect(Number.isSafeInteger(id) && id >= 0 && id <= 0x7fffffff).toBe(true);
    });
});

describe("ExtensionVault avec localDevice", () => {
    const memory = (): KeyValueStore => {
        const m = new Map<string, unknown>();
        return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
    };

    test("inscription puis déverrouillage : AK retrouvée, deviceId UUID, DK absente du stockage local", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const vault = new ExtensionVault({ win, ...FAST });
        const store = memory();
        const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const ak = generateAccountKeyBytes();
        const { payload, record } = await enrollThisDevice({ userId: "u", name: "n", platform: "web", akBytes: ak.slice(), identitySignKey: sign.privateKey, vaults: [vault], store });
        expect(record.vaultKind).toBe("extension");
        expect(payload.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const stored = btoa(String.fromCharCode(...ext.records.get(payload.id)!));
        expect(JSON.stringify(await store.get("e4-device:u"))).not.toContain(stored);

        const { akBytes } = await unlockAccountKey({ userId: "u", store, vaultFor: () => vault, fetchEnvelope: async () => ({ envelope: payload.envelope, publicKey: payload.publicKey }) });
        expect(akBytes).toEqual(ak);
        // chaque tampon reçu de l'extension a été effacé
        for (const buf of ext.sentKeys) expect([...new Uint8Array(buf)].every(b => b === 0)).toBe(true);
    });

    test("annulation dans l'extension à l'inscription : pas de repli silencieux vers le coffre suivant", async () => {
        const win = new FakeWindow();
        fakeExtension(win, (req, reply) => reply({ id: req.id, ok: false, error: { code: "cancelled" } }));
        const created: string[] = [];
        const next = { capabilities: { kind: "web-pin", hardwareBacked: false, biometric: false, needsPin: true, rateLimit: "software" } as const, create: async (d: string) => { created.push(d); return new Uint8Array(32); }, load: async () => new Uint8Array(32), remove: async () => {}, has: async () => false };
        const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const attempt = enrollThisDevice({ userId: "u", name: "n", platform: "web", akBytes: generateAccountKeyBytes(), identitySignKey: sign.privateKey, vaults: [new ExtensionVault({ win, ...FAST }), next], store: memory() });
        expect(await code(attempt)).toBe("cancelled");
        expect(created.length).toBe(0);
    });
});

describe("switchVault vers et depuis l'extension", () => {
    const memory = (): KeyValueStore => {
        const m = new Map<string, unknown>();
        return { get: async <T>(k: string) => m.get(k) as T | undefined, set: async (k, v) => { m.set(k, structuredClone(v)); }, del: async (k) => { m.delete(k); } };
    };

    /** Appareil inscrit avec `first` ; renvoie de quoi rouvrir AK avec n'importe quel coffre. */
    async function enrolled(first: DeviceVault, ctx?: { pin: string }) {
        const store = memory();
        const sign = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
        const ak = generateAccountKeyBytes();
        const { payload } = await enrollThisDevice({ userId: "u", name: "n", platform: "web", akBytes: ak.slice(), identitySignKey: sign.privateKey, vaults: [first], store, ...(ctx ? { ctx } : {}) });
        const unlock = (vault: DeviceVault, c?: { pin: string }) => unlockAccountKey({ userId: "u", store, vaultFor: () => vault, ...(c ? { ctx: c } : {}), fetchEnvelope: async () => ({ envelope: payload.envelope, publicKey: payload.publicKey }) });
        return { store, ak, deviceId: payload.id, unlock };
    }

    test("PIN local → extension : même appareil, même AK, l'ancien coffre est vidé", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const extension = new ExtensionVault({ win, ...FAST });
        const pin = new PinVault(memory(), 1000);
        const d = await enrolled(pin, { pin: "4821" });

        const next = await switchVault({ userId: "u", store: d.store, from: pin, to: extension, fromCtx: { pin: "4821" } });
        expect(next.vaultKind).toBe("extension");
        expect(next.deviceId).toBe(d.deviceId);
        expect(await pin.has(d.deviceId)).toBe(false);
        expect(ext.records.has(d.deviceId)).toBe(true);
        expect((await d.unlock(extension)).akBytes).toEqual(d.ak);
        // le PIN local n'a jamais été transmis à l'extension
        expect(JSON.stringify(ext.requests)).not.toContain("4821");
    });

    test("extension → PIN local : même AK, l'enregistrement de l'extension est supprimé", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const extension = new ExtensionVault({ win, ...FAST });
        const pin = new PinVault(memory(), 1000);
        const d = await enrolled(extension);

        const next = await switchVault({ userId: "u", store: d.store, from: extension, to: pin, toCtx: { pin: "9157" } });
        expect(next.vaultKind).toBe("web-pin");
        expect(ext.records.has(d.deviceId)).toBe(false);
        expect(ext.requests.map(r => r.op)).toEqual(["create", "load", "remove"]);
        expect((await d.unlock(pin, { pin: "9157" })).akBytes).toEqual(d.ak);
    });

    test("PIN local → extension annulé dans sa fenêtre : rien ne change, le PIN local reste utilisable", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win, (req, reply) => reply({ id: req.id, ok: false, error: { code: "cancelled" } }));
        const pin = new PinVault(memory(), 1000);
        const d = await enrolled(pin, { pin: "4821" });
        const before = await getLocalDevice(d.store, "u");

        expect(await code(switchVault({ userId: "u", store: d.store, from: pin, to: new ExtensionVault({ win, ...FAST }), fromCtx: { pin: "4821" } }))).toBe("cancelled");
        expect(await getLocalDevice(d.store, "u")).toEqual(before);
        expect(ext.records.size).toBe(0);
        expect((await d.unlock(pin, { pin: "4821" })).akBytes).toEqual(d.ak);
    });

    test("extension → PIN local, extension désactivée : refusé avant tout changement", async () => {
        const win = new FakeWindow();
        const ext = fakeExtension(win);
        const extension = new ExtensionVault({ win, ...FAST });
        const pin = new PinVault(memory(), 1000);
        const d = await enrolled(extension);
        ext.disable();

        expect(await code(switchVault({ userId: "u", store: d.store, from: extension, to: pin, toCtx: { pin: "9157" } }))).toBe("unavailable");
        expect((await getLocalDevice(d.store, "u"))!.vaultKind).toBe("extension");
        expect(await pin.has(d.deviceId)).toBe(false);
        ext.enable();
        expect((await d.unlock(extension)).akBytes).toEqual(d.ak);
    });

    test("extension → PIN local, extension disparue juste après l'ouverture : le changement aboutit (enregistrement orphelin dans l'extension)", async () => {
        const win = new FakeWindow();
        let ext: ReturnType<typeof fakeExtension>;
        ext = fakeExtension(win, (req, reply) => {
            if (req.op === "remove") return; // plus de réponse : extension désactivée entre-temps
            const id = req.args.deviceId as string;
            if (req.op === "create") { const dk = crypto.getRandomValues(new Uint8Array(32)); ext.records.set(id, dk); return reply({ id: req.id, ok: true, result: { dk: dk.slice().buffer } }); }
            if (req.op === "load") return reply({ id: req.id, ok: true, result: { dk: ext.records.get(id)!.slice().buffer } });
        });
        const extension = new ExtensionVault({ win, ...FAST });
        const pin = new PinVault(memory(), 1000);
        const d = await enrolled(extension);

        const next = await switchVault({ userId: "u", store: d.store, from: extension, to: pin, toCtx: { pin: "9157" } });
        expect(next.vaultKind).toBe("web-pin");
        expect(ext.records.has(d.deviceId)).toBe(true);
        expect((await d.unlock(pin, { pin: "9157" })).akBytes).toEqual(d.ak);
    });
});
