import type { Message } from '@/types/types';
import { decryptMessageWithContentKey } from '@/assets/utils/crypto';

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

const decryptSingleMessage = async (msg: Message | null | undefined, key: CryptoKey): Promise<Message | null> => {

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

        const clearText = await decryptMessageWithContentKey(msg.content, vectorInit, key);

        const formattedReactions = msg.reactions ? normalizeReactions(msg.reactions) : {};

        return { ...msg, content: clearText, reactions: formattedReactions };

    }
    catch (cryptoErr) {
        console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
        return { ...msg, content: "[⚠️ Impossible de déchiffrer ce message.]" };
    }

};

/**
 * Déchiffre une liste de messages (et les messages cités/transférés qu'ils
 * embarquent), puis la trie par date. Sans clé, renvoie la liste telle quelle.
 */
export const decryptMessages = async (msgs: Message[], key: CryptoKey | null): Promise<Message[]> => {

    if (!key) return msgs;

    const decryptedMessages = await Promise.all(msgs.map(async m => {

        let decryptedMain = await decryptSingleMessage(m, key);
        if (!decryptedMain) return m;

        if (decryptedMain.replyMessage)
        {
            const decryptedReply = await decryptSingleMessage(decryptedMain.replyMessage, key);
            if (decryptedReply) {
                decryptedMain.replyMessage = decryptedReply;
            }
        }

        // Le transfert de message est une fonctionnalité en attente : le
        // serveur ne l'envoie plus dans l'historique allégé, mais les anciens
        // formats (et la future fonctionnalité) peuvent encore le porter.
        if (decryptedMain.transferMessage)
        {
            const decryptedTransfer = await decryptSingleMessage(decryptedMain.transferMessage, key);
            if (decryptedTransfer) {
                decryptedMain.transferMessage = decryptedTransfer;
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
    if (editedMsg.content && editedMsg.content.trim() !== "" && key)
    {
        try {
            const vectorInit = editedMsg.iv && editedMsg.iv.trim() !== "" ? editedMsg.iv : editedMsg.nonce;
            decryptedContent = await decryptMessageWithContentKey(editedMsg.content, vectorInit, key);
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
        reactions: formattedReactions,
        replyMessage: previous?.replyMessage ?? editedMsg.replyMessage,
        transferMessage: previous?.transferMessage ?? editedMsg.transferMessage,
    };

};
