// Pas d'import du type Peer de 'peerjs' ici, exprès : useSecurePeer.ts
// l'importe en named (`import { Peer } from 'peerjs'`) et usePrivatMeet.ts
// en default (`import Peer from 'peerjs'`) — deux imports du MÊME type qui,
// une fois passés à une fonction typée sur un `Peer` importé une troisième
// fois ici, ne sont plus reconnus comme identiques par vue-tsc (des membres
// protégés comme `_serializers` sont alors comparés nominalement entre deux
// "instanciations" du même type, et l'assignation échoue). Un type
// structurel local, limité aux seuls membres réellement utilisés,
// contourne complètement le problème.
interface ReconnectablePeer {
    readonly destroyed: boolean;
    readonly disconnected: boolean;
    reconnect(): void;
}

/**
 * PeerJS's Peer object does NOT auto-reconnect its own signaling connection
 * when it drops unexpectedly (network blip, tab backgrounding, server
 * restart...) — unlike the app's main socket.io connection (useWSocket.ts),
 * which is configured with reconnection:true/reconnectionAttempts:Infinity.
 * A Peer left 'disconnected' stays that way forever unless something
 * explicitly calls peer.reconnect() — meanwhile it can neither receive
 * incoming calls/sessions nor place outgoing ones. Confirmed in production
 * logs: both useSecurePeer.ts's and usePrivatMeet.ts's Peer losing their
 * connection to the PeerJS server with no recovery until a full page
 * reload ("parfois le ws ne fonctionne plus").
 *
 * Mirrors useWSocket.ts's own reconnection backoff (1s up to 5s) rather
 * than retrying instantly forever.
 */
export function createPeerReconnector(
    getPeer: () => ReconnectablePeer | null,
    options: { baseDelay?: number; maxDelay?: number } = {}
) {
    const baseDelay = options.baseDelay ?? 1000;
    const maxDelay = options.maxDelay ?? 5000;
    let delay = baseDelay;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cancel = () => {
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
        }
    };

    // À rappeler dès que le Peer confirme être de nouveau connecté (son
    // événement 'open', qui se redéclenche après un reconnect() réussi) —
    // sans ça, un simple blip repartirait avec le délai déjà agrandi par
    // une coupure précédente, plus longue que nécessaire.
    const reset = () => {
        cancel();
        delay = baseDelay;
    };

    const schedule = () => {
        if (timeoutId) return; // déjà une tentative programmée
        timeoutId = setTimeout(() => {
            timeoutId = null;
            const peer = getPeer();
            if (peer && !peer.destroyed && peer.disconnected) {
                peer.reconnect();
            }
            delay = Math.min(delay * 1.5, maxDelay);
        }, delay);
    };

    return { schedule, reset, cancel };
}
