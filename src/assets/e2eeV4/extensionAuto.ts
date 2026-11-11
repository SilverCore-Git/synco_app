/**
 * Déverrouillage automatique par Synco Extension : à l'ouverture de la page, la fenêtre de l'extension s'ouvre sans bouton.
 * Ce n'est pas un geste de l'utilisateur, donc la décision est strictement bornée. Ouvrir la fenêtre ne donne rien :
 * il faut cliquer « Autoriser » (PIN pour un ancien enregistrement), une seule invite existe à la fois, et l'extension
 * en refuse plus de 3 par minute.
 */
export interface AutoUnlockState {
    kind: string | undefined;
    detected: boolean;
    /** Déjà tenté pendant cette session de la page (partagé entre les montages : un verrouillage volontaire ne relance rien). */
    tried: boolean;
    step: string;
    busy: boolean;
    /** Une invite de l'extension est déjà ouverte. */
    waiting: boolean;
    lockoutSeconds: number;
    missing: boolean;
    visible: boolean;
}

/** Vrai si l'on peut ouvrir la fenêtre de l'extension tout seul, maintenant. */
export function canAutoPrompt(s: AutoUnlockState): boolean {
    return s.kind === 'extension' && s.detected && !s.tried && s.visible
        && s.step === 'unlock' && !s.busy && !s.waiting && s.lockoutSeconds <= 0 && !s.missing;
}

/** Faut-il attendre que l'onglet devienne visible ? (un onglet chargé en arrière-plan n'ouvre jamais de fenêtre) */
export const mustWaitForVisible = (s: Pick<AutoUnlockState, 'kind' | 'detected' | 'tried' | 'visible'>): boolean =>
    s.kind === 'extension' && s.detected && !s.tried && !s.visible;
