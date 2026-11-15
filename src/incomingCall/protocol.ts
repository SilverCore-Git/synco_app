/**
 * Échanges entre la fenêtre principale (desktopCallPopup.ts) et la pop-up d'appel entrant
 * (IncomingCallPopup.vue), par évènements Tauri ciblés.
 *
 *   pop-up    → principale : READY  (prête à afficher)
 *   principale → pop-up    : DATA   (qui appelle, thème)
 *   pop-up    → principale : ACTION (Répondre / Refuser)
 *
 * La pop-up ne fait rien d'autre : l'appel, le socket et PeerJS restent dans la fenêtre principale.
 */

export const POPUP_LABEL = 'incoming-call';
export const MAIN_LABEL = 'main';

export const EV_READY = 'incoming-call:ready';
export const EV_DATA = 'incoming-call:data';
export const EV_ACTION = 'incoming-call:action';

export type IncomingCallKind = 'call' | 'meet';

export interface IncomingCallData {
    kind: IncomingCallKind;
    callerId: string;
    /** Déjà passé par le mode confidentialité ($p) côté fenêtre principale. */
    name: string;
    avatar: string;
    theme: 'light' | 'dark';
}

export interface IncomingCallAction {
    action: 'answer' | 'decline';
    kind: IncomingCallKind;
    callerId: string;
}
