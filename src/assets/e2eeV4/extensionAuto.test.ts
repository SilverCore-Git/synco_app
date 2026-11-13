import { describe, expect, test } from "bun:test";
import { canAutoPrompt, mustWaitForVisible, type AutoUnlockState } from "./extensionAuto";

const ok: AutoUnlockState = { kind: "extension", detected: true, tried: false, step: "unlock", busy: false, waiting: false, lockoutSeconds: 0, missing: false, visible: true };

describe("déverrouillage automatique par l'extension", () => {
    test("conditions réunies : la fenêtre du PIN s'ouvre toute seule", () => {
        expect(canAutoPrompt(ok)).toBe(true);
    });

    test.each([
        ["autre verrou (PIN local, passkey…)", { kind: "web-pin" }],
        ["extension absente", { detected: false }],
        ["déjà tenté dans cette session de page (verrouillage volontaire, annulation, rechargement de composant)", { tried: true }],
        ["onglet en arrière-plan : jamais de fenêtre sans que l'utilisateur soit là", { visible: false }],
        ["autre écran que le déverrouillage", { step: "connect" }],
        ["opération en cours", { busy: true }],
        ["invite déjà ouverte", { waiting: true }],
        ["attente après trop d'essais", { lockoutSeconds: 30 }],
        ["extension qui ne répond pas", { missing: true }],
    ] as const)("pas d'ouverture automatique : %s", (_n, over) => {
        expect(canAutoPrompt({ ...ok, ...over })).toBe(false);
    });

    test("onglet masqué : on attend qu'il devienne visible, une seule fois", () => {
        expect(mustWaitForVisible({ ...ok, visible: false })).toBe(true);
        expect(mustWaitForVisible(ok)).toBe(false);
        expect(mustWaitForVisible({ ...ok, visible: false, tried: true })).toBe(false);
        expect(mustWaitForVisible({ ...ok, visible: false, kind: "web-pin" })).toBe(false);
    });
});
