import type { Message } from '@/types/types';
import { decryptMessageWithContentKey } from '@/assets/utils/crypto';
import { undecryptableMessageText } from '@/assets/utils/undecryptable';
import { clientMsgIdOf, decryptThreadMessageV2, findReplayedMessages, isAuthenticatedIv, type AgentMark } from '@/assets/utils/messageAuth';
import { findReplayedDeclarations } from '@/assets/utils/agentMessage';
import { openedOrg } from '@/assets/var';

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

/**
 * `agentMark` et `authState` sont posés UNIQUEMENT par le déchiffrement local ; un champ de même nom servi par le
 * serveur est inventé (un serveur ferait sinon afficher « avec Synco AI » sur un message humain). Chaque branche de
 * retour passe par ici : le champ servi est retiré, la valeur calculée (ou rien) est posée explicitement.
 */
const withoutServedMarks = <T extends Message>(msg: T): T => {
    const { agentMark: _mark, authState: _state, ...rest } = msg;
    return rest as T;
};

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
): Promise<{ text: string; authState: NonNullable<Message['authState']>; agentMark?: AgentMark }> => {
    if (isAuthenticatedIv(vectorInit) && msg.senderId) {
        // Message de l'agent (m3, 12 §4.3) : la déclaration du texte se contrôle contre l'org du salon ouvert.
        const orgId = openedOrg.value?.id;
        const reader = orgId ? { orgId, messageId: msg.id, replyToId: msg.replyToId ?? null } : undefined;
        const { text, auth, agent } = await decryptThreadMessageV2(msg.content, vectorInit, key, { threadId: msg.threadId, senderId: msg.senderId, reader }, replayed);
        if (auth === 'invalid') return { text: UNVERIFIED_SENDER_TEXT, authState: 'invalid' };
        return agent ? { text, authState: auth, agentMark: agent } : { text, authState: auth };
    }
    return { text: await decryptMessageWithContentKey(msg.content, vectorInit, key), authState: 'legacy' };
};

/**
 * Vecteur du message : `iv`, ou à défaut `nonce` (ancien format). Le format `m3` ne se lit QUE dans `iv` : un `m3.` dans
 * `nonce` (champ libre de l'expéditeur) n'est jamais interprété (il lèverait au déchiffrement, comme tout nonce invalide).
 */
const vectorInitOf = (msg: Message): string => {
    if (msg.iv && msg.iv.trim() !== "") return msg.iv;
    const nonce = msg.nonce ?? "";
    return nonce.startsWith("m3.") ? "" : nonce;
};

const decryptSingleMessage = async (msg: Message | null | undefined, key: CryptoKey, replayed = false): Promise<Message | null> => {

    if (!msg) return null;
    if (!msg.content || msg.content.trim() === "") return withoutServedMarks(msg);
    if (msg.isWebhook) return withoutServedMarks(msg);

    try {

        const vectorInit = vectorInitOf(msg);

        if (!vectorInit || vectorInit.trim() === "")
        {
            console.error('ProcesMessages : Erreur E2EE : Vecteur d\'initialisation manquant')
            return { ...withoutServedMarks(msg), content: undecryptableMessageText() };
        }

        const { text: clearText, authState, agentMark } = await decryptContent(msg, vectorInit, key, replayed);

        const formattedReactions = msg.reactions ? normalizeReactions(msg.reactions) : {};

        return { ...withoutServedMarks(msg), content: clearText, authState, reactions: formattedReactions, ...(agentMark ? { agentMark } : {}) };

    }
    catch (cryptoErr) {
        console.error(`[E2EE] Échec du déchiffrement pour le message ${msg.id}:`, cryptoErr);
        return { ...withoutServedMarks(msg), content: undecryptableMessageText() };
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

    if (!key) return msgs.map(withoutServedMarks);

    // Messages qui répètent l'identifiant d'un message plus ancien : rejeux (FC7).
    const replayed = findReplayedMessages(msgs);

    const decryptedMessages = await Promise.all(msgs.map(async m => {

        let decryptedMain = await decryptSingleMessage(m, key, replayed.has(m.id));
        if (!decryptedMain) return withoutServedMarks(m);

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

    markReplayedDeclarations(decryptedMessages);

    return decryptedMessages.sort((a, b) => {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

};

/**
 * 12 §10.7, étape 8 : une même déclaration `(planId, n)` sur un AUTRE `clientMsgId` du salon (fenêtre chargée) → le
 * plus récent est `text_unverified` (`replayed`), affiché avec l'avertissement, jamais masqué. À relancer sur la liste
 * entière à chaque insertion ou modification d'un message reçu en direct (ChatTimeline.vue), pas seulement au chargement.
 */
export const markReplayedDeclarations = (msgs: Message[]): void => {
    const candidates = msgs.flatMap(m => {
        const mark = m.agentMark;
        const cid = clientMsgIdOf(m.iv);
        return mark?.author === 'rt1' && mark.action && cid ? [{ id: m.id, clientMsgId: cid, createdAt: m.createdAt, action: mark.action }] : [];
    });
    if (candidates.length < 2) return;
    const replayed = findReplayedDeclarations(candidates);
    for (const m of msgs) {
        if (replayed.has(m.id) && m.agentMark?.author === 'rt1') m.agentMark = { ...m.agentMark, text: 'text_unverified', reason: 'replayed' };
    }
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
    let agentMark: AgentMark | undefined;
    if (editedMsg.content && editedMsg.content.trim() !== "" && key)
    {
        try {
            const vectorInit = vectorInitOf(editedMsg);
            ({ text: decryptedContent, authState, agentMark } = await decryptContent(editedMsg, vectorInit, key));
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
        agentMark,
        reactions: formattedReactions,
        replyMessage: previous?.replyMessage ?? editedMsg.replyMessage,
    };

};
