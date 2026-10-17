import { createFrameTransform } from '@/assets/utils/frameCrypto';

/**
 * Surchiffrement des trames média via RTCRtpScriptTransform (Firefox, Safari), cf.
 * assets/utils/frameCrypto.ts. Le thread principal envoie la clé de session par
 * `{ type: 'key', key }` dès qu'elle est négociée (et à chaque renégociation).
 */

let sessionKey: CryptoKey | null = null;

self.onmessage = (event: MessageEvent<{ type: 'key'; key: CryptoKey | null }>) => {
    if (event.data?.type === 'key') sessionKey = event.data.key;
};

(self as any).onrtctransform = (event: any) => {
    const { readable, writable, options } = event.transformer;
    const side: 'send' | 'receive' = options?.side === 'receive' ? 'receive' : 'send';
    readable.pipeThrough(createFrameTransform(side, () => sessionKey)).pipeTo(writable);
};
