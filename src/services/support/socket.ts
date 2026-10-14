import type { Socket } from 'socket.io-client';
import useWSocket from '@/composables/useWSocket';

/**
 * Accès au socket partagé de l'app pour les événements `support:*`
 * (SUPPORT_FEATURE.md §6). `support:join` fait quitter les rooms des autres
 * tickets, mais garde les deux canaux du ticket courant : les timelines
 * PUBLIC et INTERNAL d'un même ticket cohabitent sur ce socket unique.
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
