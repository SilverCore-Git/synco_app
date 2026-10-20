/**
 * Scène « Synco ↔ Synco Extension » : ce que la page montre pendant que la fenêtre de l'extension demande le
 * code PIN. Logique seule (sans Vue) pour pouvoir la tester ; le composant ExtensionScene.vue l'affiche.
 *
 * Elle ne reçoit jamais de PIN ni de clé : seulement « une invite vient de s'ouvrir » et « elle s'est terminée ».
 */

export type SceneMode = 'enroll' | 'unlock';
export type SceneState = 'waiting' | 'success';

export interface SceneView {
    state: SceneState;
    mode: SceneMode;
}

export interface SceneOptions {
    onChange(view: SceneView | null): void;
    /** Durée d'affichage de la réussite avant de fermer la scène. */
    holdMs?: number;
    schedule?: (fn: () => void, ms: number) => unknown;
    unschedule?: (handle: unknown) => void;
}

export interface ExtensionScene {
    /** Une invite vient de s'ouvrir. Renvoie la fonction à appeler quand elle se termine (`VaultContext.onPrompt`). */
    begin(mode: SceneMode): (outcome?: 'ok' | 'error') => void;
    /** L'utilisateur a cliqué « Annuler » dans la scène : l'annulation qui suit n'est pas une erreur à lui annoncer. */
    markUserCancel(): void;
    /** Vrai (une seule fois) si la dernière annulation vient de l'utilisateur lui-même. */
    takeUserCancel(): boolean;
    dispose(): void;
}

export const SCENE_HOLD_MS = 1400;

export function createExtensionScene(opts: SceneOptions): ExtensionScene {
    const schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    const unschedule = opts.unschedule ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    let timer: unknown;
    let current: object | null = null;
    let userCancelled = false;

    const stopTimer = () => {
        if (timer !== undefined) unschedule(timer);
        timer = undefined;
    };

    return {
        begin(mode) {
            stopTimer();
            userCancelled = false;
            const token = {};
            current = token;
            opts.onChange({ state: 'waiting', mode });
            return (outcome) => {
                // Une invite plus récente a pris la place : cette fin tardive ne doit pas toucher à l'affichage.
                if (current !== token) return;
                if (outcome === 'ok') {
                    opts.onChange({ state: 'success', mode });
                    timer = schedule(() => {
                        if (current === token) { current = null; opts.onChange(null); }
                    }, opts.holdMs ?? SCENE_HOLD_MS);
                } else {
                    current = null;
                    opts.onChange(null);
                }
            };
        },
        markUserCancel() { userCancelled = true; },
        takeUserCancel() {
            const was = userCancelled;
            userCancelled = false;
            return was;
        },
        dispose() {
            stopTimer();
            current = null;
        },
    };
}
