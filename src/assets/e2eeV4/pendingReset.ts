/**
 * Réinitialisation E2EE demandée depuis Paramètres › Sécurité, une fois le code e-mail validé.
 * Les paramètres verrouillent alors la session ; V4Gate, au montage, lit cette demande et passe
 * directement à la création de nouvelles clés (c'est lui qui oublie l'appareil local).
 *
 * En mémoire seulement : après un rechargement la demande est perdue et l'appareil, resté
 * enregistré, se déverrouille normalement. Rien n'a encore été effacé à ce stade.
 */
let pending = false;

export function requestV4Reset(): void {
    pending = true;
}

/** Vrai une seule fois après requestV4Reset(). */
export function consumeV4ResetRequest(): boolean {
    const was = pending;
    pending = false;
    return was;
}
