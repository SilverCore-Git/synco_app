import type { Message } from '@/types/types';
import { decryptMessageWithContentKey } from '@/assets/utils/crypto';
import { decryptThreadMessageV2, findReplayedMessages, isAuthenticatedIv } from '@/assets/utils/messageAuth';

/**
 * Déchiffrement des messages d'une conversation au format « thread »
 * (content + iv/nonce chiffrés avec la clé AES du canal). Extrait de
 * ThreadView.vue pour être partagé par toute timeline (threads, support).
 */

export type ReactionMap = Record<string, { count: number; users: Array<{ id: string; name: string; avatarUrl?: string }> }>;

// Transforme le tableau de réactions Prisma en objet groupé par emoji.
export const formatReactions = (reactions: any[]): ReactionMap => {
    if (!reactions || reactions.length === 0) return {};

    return reactions.reduce((acc: ReactionMap, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = { count: 0, users: [] };
        }
        acc[reaction.emoji]!.count++;
        if (reaction.user) {
            acc[reaction.emoji]!.users.push({
                id: reaction.user.id,
                name: reaction.user.name,
                avatarUrl: reaction.user.avatarUrl
            });
        }
        return acc;
    }, {});
};

// Les réactions arrivent soit en tableau (Prisma, historique) soit déjà
// groupées (mises à jour WebSocket).
const normalizeReactions = (reactions: Message['reactions']) =>
    Array.isArray(reactions) ? formatReactions(reactions as any) : reactions;

export const UNVERIFIED_SENDER_TEXT = "[⚠️ Expéditeur non vérifié — ce message n'est pas affiché.]";

/**
 * Déchiffre le contenu d'un message, au format authentifié (FC7) ou historique. Un message v2 dont
 * l'origine n'est pas valide (signature fausse, rejeu) n'est jamais affiché : il est remplacé par
 * UNVERIFIED_SENDER_TEXT. Lève si le chiffré ne correspond pas à son contexte (salon, expéditeur).
 */
const decryptContent = async (
    msg: Message,
    vectorInit: string,
    key: CryptoKey,
    replayed = false
): Promise<{ text: string; authState: NonNullable<Message['authState']> }> => {
    if (isAuthenticatedIv(vectorInit) && msg.senderId) {
        const { text, auth } = await decryptThreadMessageV2(msg.content, vectorInit, key, { threadId: msg.threadId, senderId: msg.senderId }, replayed);
        return auth === 'invalid' ? { text: UNVERIFIED_SENDER_TEXT, authState: 'invalid' } : { text, authState: auth };
    }
    return { text: await decryptMessageWithContentKey(msg.content, vectorInit, key), authState: 'legacy' };
};

const decryptSingleMessage = async (msg: Message | null | undefined, key: CryptoKey, replayed = false): Promise<Message | null> => {

    if (!msg) return null;
    if (!msg.content || msg.content.trim() === "") return msg;
    if (msg.isWebhook) return msg;

    try {

        const vectorInit = msg.iv && msg.iv.trim() !== "" ? msg.iv : msg.nonce;

        if (!vectorInit || vectorInit.trim() === "")
        {
            console.error('ProcesMessages : Erreur E2EE : Vecteur d\'initialisation manquant')
            return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
        }

        const { text: clearText, authState } = await decryptContent(msg, vectorInit, key, replayed);

        const formattedReactions = msg.reactions ? normalizeReactions(msg.reactions) : {};

        return { ...msg, content: clearText, authState, reactions: formattedReactions };

    }
    catch (cryptoErr) {
        console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
        return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
    }

};

/**
 * Déchiffre une liste de messages (et les messages cités qu'ils embarquent),
 * puis la trie par date. Sans clé, renvoie la liste telle quelle. Un message
 * transféré n'a rien de spécial à déchiffrer ici : son contenu (attribution +
 * citation de l'original) est du texte normal, déjà rechiffré pour CE salon/
 * DM au moment de l'envoi (voir useShareReference.ts::forwardMessage).
 */
export const decryptMessages = async (msgs: Message[], key: CryptoKey | null): Promise<Message[]> => {

    if (!key) return msgs;

    // Messages qui répètent l'identifiant d'un message plus ancien : rejeux (FC7).
    const replayed = findReplayedMessages(msgs);

    const decryptedMessages = await Promise.all(msgs.map(async m => {

        let decryptedMain = await decryptSingleMessage(m, key, replayed.has(m.id));
        if (!decryptedMain) return m;

        if (decryptedMain.replyMessage)
        {
            const decryptedReply = await decryptSingleMessage(decryptedMain.replyMessage, key);
            if (decryptedReply) {
                decryptedMain.replyMessage = decryptedReply;
            }
        }

        // Réactions formatées même quand le contenu du message était vide.
        if (m.reactions) {
            decryptedMain.reactions = normalizeReactions(m.reactions);
        }

        return decryptedMain;

    }));

    return decryptedMessages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

};

/**
 * Message modifié reçu en direct : déchiffre son contenu et conserve les
 * messages cités déjà déchiffrés de la version précédente (la charge utile
 * d'une édition ne les porte pas, et une édition ne change jamais ce qu'un
 * message cite — sinon l'encart de réponse disparaîtrait après une édition
 * ou l'ajout d'une pièce jointe).
 */
export const decryptEditedMessage = async (editedMsg: Message, key: CryptoKey | null, findPrevious: () => Message | undefined): Promise<Message> => {

    let decryptedContent = editedMsg.content;
    let authState: Message['authState'];
    if (editedMsg.content && editedMsg.content.trim() !== "" && key)
    {
        try {
            const vectorInit = editedMsg.iv && editedMsg.iv.trim() !== "" ? editedMsg.iv : editedMsg.nonce;
            ({ text: decryptedContent, authState } = await decryptContent(editedMsg, vectorInit, key));
        } catch (err) {
            decryptedContent = "🔒 Échec du déchiffrement lors de l'édition.";
        }
    }

    const formattedReactions = editedMsg.reactions ? normalizeReactions(editedMsg.reactions) : {};

    // Lu après le déchiffrement : l'état courant de la liste, pas celui
    // d'avant l'attente.
    const previous = findPrevious();
    return {
        ...editedMsg,
        content: decryptedContent,
        authState,
        reactions: formattedReactions,
        replyMessage: previous?.replyMessage ?? editedMsg.replyMessage,
    };

};
