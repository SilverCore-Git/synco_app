import { describe, expect, test } from "bun:test";
import { VaultError, type VaultKind } from "../deviceVault/types";
import { unlockFailure } from "./unlockFailure";

const others: VaultKind[] = ["webauthn-prf", "web-pin", "native-biometric", "os-keyring"];

describe("unlockFailure : décision après un refus du coffre", () => {
    test("extension indisponible (désactivée, sans accès au site, mise à jour) : l'appareil n'est PAS oublié", () => {
        const r = unlockFailure("extension", new VaultError("unavailable", "Synco Extension ne répond plus."));
        expect(r).toEqual({ action: "extension-unavailable", message: "Synco Extension ne répond plus." });
        expect("forget" in r).toBe(false);
    });

    test.each(others)("autre coffre indisponible (%s) : oublié et reconnexion, comme avant", (kind) => {
        expect(unlockFailure(kind, new VaultError("unavailable"))).toMatchObject({ action: "reconnect", forget: true });
    });

    test.each(["extension", ...others] as VaultKind[])("clés effacées ou introuvables (%s) : oublié et reconnexion", (kind) => {
        expect(unlockFailure(kind, new VaultError("wiped"))).toMatchObject({ action: "reconnect", forget: true });
        expect(unlockFailure(kind, new VaultError("missing"))).toMatchObject({ action: "reconnect", forget: true });
    });

    test("verrouillage : compte à rebours de l'extension repris, 30 s par défaut", () => {
        expect(unlockFailure("extension", new VaultError("locked", "x", 120))).toEqual({ action: "lockout", retryAfterSeconds: 120 });
        expect(unlockFailure("extension", new VaultError("locked", "Trop d'essais"))).toEqual({ action: "lockout", retryAfterSeconds: 30, message: "Trop d'essais" });
    });

    test("annulation : explication propre à l'extension (fenêtre restée ouverte, autre onglet)", () => {
        expect(unlockFailure("extension", new VaultError("cancelled")).action).toBe("cancelled");
        expect((unlockFailure("extension", new VaultError("cancelled")) as { message?: string }).message).toContain("autre onglet");
        expect(unlockFailure("web-pin", new VaultError("cancelled"))).toEqual({ action: "cancelled" });
    });

    test("mauvais PIN, erreur inconnue", () => {
        expect(unlockFailure("web-pin", new VaultError("wrong-pin", undefined, 30))).toEqual({ action: "wrong-pin", retryAfterSeconds: 30 });
        expect(unlockFailure("extension", new Error("x"))).toEqual({ action: "error" });
        expect(unlockFailure(undefined, new VaultError("pin-required"))).toEqual({ action: "error" });
    });

    test("type de coffre inconnu de cette version (enregistrement futur) : jamais traité comme l'extension", () => {
        expect(unlockFailure("autre" as VaultKind, new VaultError("unavailable"))).toMatchObject({ action: "reconnect" });
    });
});
