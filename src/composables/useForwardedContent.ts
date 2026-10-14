/**
 * Encodage d'un message transféré à l'intérieur du contenu (E2EE) d'un
 * nouveau message — pas une référence <kind:id> résolue par le serveur
 * (useReferences.ts) : la citation doit rester lisible même si l'original a
 * depuis été supprimé ou n'est plus accessible au lecteur, donc tout ce qu'il
 * faut pour l'afficher (nom/avatar de l'auteur au moment du transfert, texte)
 * est embarqué tel quel dans le token, en base64 pour ne jamais risquer de
 * casser le parsing markdown avec le texte original (guillemets, chevrons,
 * balises <fwd:...> imbriquées si l'original était déjà un transfert…).
 *
 * Rendu par ForwardedMessageCard.vue, comme une vraie carte de message cité
 * plutôt qu'un "X a écrit :" tapé en dur dans le texte.
 */

export interface ForwardedPayload {
    senderId: string;
    senderName: string;
    senderAvatar?: string | null;
    text: string;
}

// Un seul token par message : un transfert ne porte qu'une seule citation,
// jamais une chaîne de transferts imbriqués (voir buildForwardToken).
const FORWARD_TOKEN_REGEX = /<fwd:([A-Za-z0-9+/=]+)>/;

const encodeBase64Utf8 = (s: string): string => btoa(unescape(encodeURIComponent(s)));
const decodeBase64Utf8 = (s: string): string => decodeURIComponent(escape(atob(s)));

export const buildForwardToken = (payload: ForwardedPayload): string => {
    try {
        return `<fwd:${encodeBase64Utf8(JSON.stringify(payload))}>`;
    } catch (err) {
        console.error('[useForwardedContent] Failed to encode forward payload:', err);
        return '';
    }
};

/**
 * Sépare la note éventuelle (texte normal, affiché/formaté comme d'habitude)
 * du token de transfert qu'elle précède — ou renvoie null si ce message n'en
 * contient pas.
 */
export const extractForwardedPayload = (content: string): { note: string; payload: ForwardedPayload } | null => {
    const match = content.match(FORWARD_TOKEN_REGEX);
    if (!match) return null;

    try {
        const payload = JSON.parse(decodeBase64Utf8(match[1]!)) as ForwardedPayload;
        if (!payload || typeof payload.text !== 'string' || typeof payload.senderId !== 'string') return null;
        const note = content.slice(0, match.index).trim();
        return { note, payload };
    } catch (err) {
        console.error('[useForwardedContent] Failed to decode forward payload:', err);
        return null;
    }
};

/** Retire le token de transfert du markdown source, pour ne garder que la note (même esprit que stripBlockReferenceTokens). */
export const stripForwardToken = (content: string): string => content.replace(FORWARD_TOKEN_REGEX, '').trim();
