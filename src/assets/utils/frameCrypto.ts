/**
 * Surchiffrement des trames média d'un appel P2P (Insertable Streams), commun au
 * chemin Chrome (createEncodedStreams, thread principal) et au chemin standard
 * RTCRtpScriptTransform (Firefox, Safari ; worker workers/frameCrypto.worker.ts).
 *
 * Format de trame, identique sur les deux chemins pour que Chrome ↔ Firefox/Safari
 * restent compatibles : IV aléatoire (12 octets) ‖ AES-GCM(clé de session, trame).
 */

interface EncodedFrame { data: ArrayBuffer }

const IV_LENGTH = 12;

/** `getKey` est lu à chaque trame : la clé peut arriver après la création du transform. */
export function createFrameTransform(side: 'send' | 'receive', getKey: () => CryptoKey | null): TransformStream<EncodedFrame, EncodedFrame> {
    return new TransformStream<EncodedFrame, EncodedFrame>({
        async transform(frame, controller) {
            const key = getKey();
            if (!key) return; // clé pas prête : la trame est abandonnée, jamais envoyée en clair

            try {
                if (side === 'send') {
                    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
                    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, frame.data);
                    const payload = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
                    payload.set(iv, 0);
                    payload.set(new Uint8Array(ciphertext), IV_LENGTH);
                    frame.data = payload.buffer;
                } else {
                    const payload = new Uint8Array(frame.data);
                    if (payload.byteLength <= IV_LENGTH) return;
                    frame.data = await crypto.subtle.decrypt(
                        { name: 'AES-GCM', iv: payload.slice(0, IV_LENGTH) },
                        key,
                        payload.slice(IV_LENGTH)
                    );
                }
                controller.enqueue(frame);
            } catch {
                // Chiffrement ou déchiffrement impossible : trame abandonnée.
            }
        },
    });
}
