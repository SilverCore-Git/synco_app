import type { Socket } from 'socket.io-client';
import useWSocket from '@/composables/useWSocket';

/**
 * Accès au socket partagé de l'app pour les événements `support:*`
 * (SUPPORT_FEATURE.md §6).
 *
 * Attention (comportement de l'API) : `support:join` fait quitter au socket
 * toutes les autres rooms `support:*` — y compris l'autre canal du même
 * ticket. Comme l'app n'a qu'un socket, un seul canal reçoit le temps réel
 * à la fois tant que l'API n'est pas corrigée (cf. rapport d'intégration).
 */

export const SUPPORT_ACK_TIMEOUT_MS = 15000;

export async function getSupportSocket(): Promise<Socket> {
    const socket = (await useWSocket()).value;
    if (!socket) throw new Error('Non connecté au serveur.');
    return socket;
}

/** Émet avec accusé de réception ; rejette sur délai dépassé ou `{ error }`. */
export function emitWithAck<T>(socket: Socket, event: string, payload: unknown, timeoutMs = SUPPORT_ACK_TIMEOUT_MS): Promise<T> {
    return new Promise((resolve, reject) => {
        socket.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: unknown) => {
            if (err) return reject(new Error("Le serveur n'a pas répondu."));
            if (res && typeof res === 'object' && 'error' in res && (res as { error?: unknown }).error) {
                return reject(new Error(String((res as { error: unknown }).error)));
            }
            resolve(res as T);
        });
    });
}
