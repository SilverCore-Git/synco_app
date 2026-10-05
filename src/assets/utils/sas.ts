/** Empreintes DTLS d'une description SDP (a=fingerprint:), normalisées et triées. */
export function dtlsFingerprints(sdp: string | undefined | null): string[] {
    return (sdp ?? '').split(/\r?\n/)
        .filter(l => l.startsWith('a=fingerprint:'))
        .map(l => l.slice('a=fingerprint:'.length).trim().toUpperCase())
        .sort();
}

/**
 * Code de vérification (SAS) v2 — audit FC8.
 *
 * Le SAS v1 ne couvrait que la clé ECDH du surchiffrement : sur un navigateur
 * sans Insertable Streams (Firefox, Safari), aucun surchiffrement n'a lieu et
 * un homme du milieu DTLS passait inaperçu malgré un code « vérifié ». Le SAS
 * dérive désormais aussi des empreintes DTLS effectivement négociées (locale
 * et distante, ensemble identique des deux côtés sans interception) : un MITM
 * DTLS produit deux codes différents, avec ou sans surchiffrement.
 *
 * 40 bits affichés en 4 groupes de 3 chiffres, faciles à lire à voix haute.
 */
export async function generateFingerprint(sessionKey: CryptoKey, callId: string, localSdp?: string | null, remoteSdp?: string | null): Promise<string> {
    const fps = [...dtlsFingerprints(localSdp), ...dtlsFingerprints(remoteSdp)].sort();
    const ikm = await crypto.subtle.importKey('raw', await crypto.subtle.exportKey('raw', sessionKey), 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(`synco-sas-v2|${callId}`),
        info: new TextEncoder().encode(fps.join('|')),
    }, ikm, 40);
    const n = new Uint8Array(bits).reduce((acc, b) => acc * 256n + BigInt(b), 0n);
    return n.toString().padStart(13, '0').slice(-12).replace(/(\d{3})(?=\d)/g, '$1 ');
}

/** Comparaison d'un code saisi : espaces et casse ignorés. */
export const normalizeSas = (code: string) => code.replace(/\s+/g, '').toUpperCase();
