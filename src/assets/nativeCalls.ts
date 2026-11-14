import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { debugWarn } from './utils/debugLog';

/**
 * Pont avec la notification d'appel native d'Android (CallNotifications.java / CallNotifyPlugin.java).
 *
 * App fermée ou en arrière-plan, un appel DM ou une invitation à une session éphémère fait sonner le
 * téléphone (push « appel » de synco_api). Quand l'utilisateur répond ou touche la notification, l'app
 * s'ouvre et reçoit ici l'action : `answer` (décrocher dès que l'appel arrive) ou `open` (afficher la
 * carte d'appel entrant). L'appel lui-même doit alors être recomposé par l'appelant (call:ready /
 * privateMeet:ready), son offre initiale étant partie pendant que l'app était fermée.
 *
 * Android seulement : iOS exigerait CallKit et des push VoIP.
 */

export type NativeCallKind = 'call' | 'meet';

export interface NativeCallAction {
    action: 'answer' | 'open';
    kind: NativeCallKind;
    callerId: string;
}

interface CallNotifyPlugin {
    consumePendingAction(): Promise<Partial<NativeCallAction>>;
    addListener(event: 'callAction', handler: (action: NativeCallAction) => void): Promise<PluginListenerHandle>;
}

const CallNotify = registerPlugin<CallNotifyPlugin>('CallNotify');

let handle: PluginListenerHandle | null = null;

const isComplete = (a: Partial<NativeCallAction>): a is NativeCallAction =>
    (a.action === 'answer' || a.action === 'open') && (a.kind === 'call' || a.kind === 'meet') && typeof a.callerId === 'string';

/** Branche `onAction` sur les actions de la notification d'appel, y compris celle qui a lancé l'app. */
export async function startNativeCallBridge(onAction: (action: NativeCallAction) => void): Promise<void> {
    if (Capacitor.getPlatform() !== 'android' || handle) return;
    try {
        handle = await CallNotify.addListener('callAction', (a) => {
            if (isComplete(a)) onAction(a);
        });
        const pending = await CallNotify.consumePendingAction();
        if (isComplete(pending)) onAction(pending);
    } catch (e) {
        debugWarn('[calls] pont de notification d\'appel indisponible', e);
    }
}

/**
 * Vrai quand la sonnerie de l'app ne doit pas jouer : app native en arrière-plan, c'est la notification
 * d'appel native qui sonne (sinon, deux sonneries).
 */
export function nativeRingsInstead(): boolean {
    return Capacitor.getPlatform() === 'android' && document.visibilityState === 'hidden';
}
