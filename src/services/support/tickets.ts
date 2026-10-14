import { user } from '@/assets/var';
import { decryptMessageWithContentKey, encryptMessageWithContentKey, privateKey } from '@/assets/utils/crypto';
import { pinOrCheckKey } from '@/assets/utils/keyPinning';
import { uploadFiles } from '@/assets/uploadFile';
import {
    generateTicketKey, sealTicketKey, setCachedTicketKey, signTicketKey,
    supportKeyContext, SUPPORT_KEY_VERSION,
} from '@/assets/utils/supportCrypto';
import {
    isStaffTicket,
    type SupportTicketClientDTO,
    type SupportTicketDTO,
    type SupportTicketPriority,
    type SupportTicketStaffDTO,
} from '@/types/support';
import { supportApi } from './api';
import {
    SupportLockedError, SupportNotConfiguredError,
    ensureInternalKey, fetchCurrentStaffKey, getTicketChannelKey, prepareInternalKeyForClaim,
} from './keys';
import { getSupportSocket } from './socket';

/**
 * Parcours de bout en bout d'un ticket côté client et côté équipe :
 * création (clé PUBLIC générée localement, titre et premier message
 * chiffrés, pièces jointes liées au premier message), ouverture (clés des
 * deux canaux) et prise en charge (clé INTERNAL générée au besoin).
 */

/** Limites de l'API (SUPPORT_FEATURE.md §2.3), à vérifier avant l'envoi. */
export const SUPPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const SUPPORT_MAX_TICKET_BYTES = 200 * 1024 * 1024;

export interface CreateSupportTicketInput {
    /** Titre facultatif (chiffré avec la clé PUBLIC). */
    title?: string | null;
    /** Description complète : premier message du canal PUBLIC. */
    description: string;
    /** Organisation concernée (contexte), dont l'utilisateur est membre. */
    organizationId?: string | null;
    /** Captures / pièces jointes, envoyées après la création puis liées au premier message. */
    files?: File[];
    /** Progression globale de l'envoi des pièces jointes (0-100). */
    onUploadProgress?: (percent: number) => void;
    /** Progression de chaque pièce jointe (index dans `files`). */
    onFileProgress?: (index: number, percent: number) => void;
}

export interface CreateSupportTicketResult {
    ticket: SupportTicketClientDTO;
    /** Clé PUBLIC du ticket (déjà en cache). */
    key: CryptoKey;
    /** Titre en clair tel que saisi (null si aucun). */
    title: string | null;
    /**
     * Échec de l'envoi ou de la liaison des pièces jointes : le ticket est
     * créé malgré tout (à signaler par un toast, l'utilisateur peut les
     * renvoyer depuis la vue du ticket).
     */
    attachmentError: Error | null;
}

/**
 * Crée un ticket (client) :
 *  1. id UUID v4 local (nécessaire au contexte FC4 avant création) ;
 *  2. clé PUBLIC générée, scellée pour soi et pour la clé d'équipe courante
 *     (signature vérifiée), avec l'enveloppe FC4 ;
 *  3. titre + premier message chiffrés, POST /tickets ;
 *  4. pièces jointes : envoi chiffré (contexte support PUBLIC) puis liaison
 *     au premier message (`firstMessageId` de la réponse) par
 *     `support:edit-message-files`, comme un thread.
 */
export async function createSupportTicket(input: CreateSupportTicketInput): Promise<CreateSupportTicketResult> {
    if (!privateKey.value) throw new SupportLockedError();
    const me = user.value;
    if (!me?.publicKey) throw new Error("Votre clé de chiffrement n'est pas configurée.");
    const description = input.description.trim();
    if (!description) throw new Error('La description est obligatoire.');
    const files = input.files ?? [];
    const tooBig = files.find(f => f.size > SUPPORT_MAX_FILE_BYTES);
    if (tooBig) throw new Error(`« ${tooBig.name} » dépasse 25 Mo.`);

    const staff = await fetchCurrentStaffKey();
    if (!staff) throw new SupportNotConfiguredError();

    const id = crypto.randomUUID();
    const key = await generateTicketKey();
    const envelope = await signTicketKey(key, id, 'PUBLIC');
    const creatorKey = await sealTicketKey(key, me.publicKey);
    const staffKey = await sealTicketKey(key, staff.publicKey);

    const title = input.title?.trim() || null;
    const encTitle = title ? await encryptMessageWithContentKey(title, key) : null;
    const encBody = await encryptMessageWithContentKey(description, key);

    const { firstMessageId, ...ticket } = await supportApi.createTicket({
        id,
        ...(encTitle ? { titleCipher: encTitle.ciphertext, titleIv: encTitle.iv } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        keys: {
            creator: { encryptedKey: creatorKey, ...(envelope ?? {}) },
            staff: { encryptedKey: staffKey, staffKeyVersion: staff.version, ...(envelope ?? {}) },
        },
        // nonce : même convention que les threads (ChatTimeline).
        firstMessage: { content: encBody.ciphertext, iv: encBody.iv, nonce: 'n_' + Date.now() },
    });

    // Notre propre clé : épinglée et mise en cache tout de suite.
    await pinOrCheckKey(key, supportKeyContext(id, 'PUBLIC'), SUPPORT_KEY_VERSION);
    setCachedTicketKey(id, 'PUBLIC', ticket.myKey?.encryptedKey ?? creatorKey, key);

    let attachmentError: Error | null = null;
    if (files.length) {
        try {
            await attachFilesToFirstMessage(id, firstMessageId, files, input.onUploadProgress, input.onFileProgress);
        } catch (e) {
            console.error('[Support] Pièces jointes du ticket non envoyées :', (e as Error).message);
            attachmentError = e instanceof Error ? e : new Error(String(e));
        }
    }

    return { ticket, key, title, attachmentError };
}

async function attachFilesToFirstMessage(
    ticketId: string,
    firstMessageId: string,
    files: File[],
    onProgress?: (percent: number) => void,
    onFileProgress?: (index: number, percent: number) => void,
): Promise<void> {
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > SUPPORT_MAX_TICKET_BYTES) throw new Error('Les pièces jointes dépassent 200 Mo au total.');

    const uploaded = await uploadFiles(
        files,
        { supportTicketId: ticketId, supportChannel: 'PUBLIC', supportMessageId: firstMessageId },
        onProgress,
        onFileProgress,
    );
    // Liaison au premier message, comme un thread (upload puis liaison).
    (await getSupportSocket()).emit('support:edit-message-files', { id: firstMessageId, files: uploaded });
}

/** Titre en clair d'un ticket (null s'il n'en a pas). */
export async function decryptTicketTitle(ticket: Pick<SupportTicketDTO, 'titleCipher' | 'titleIv'>, key: CryptoKey): Promise<string | null> {
    if (!ticket.titleCipher || !ticket.titleIv) return null;
    return decryptMessageWithContentKey(ticket.titleCipher, ticket.titleIv, key);
}

/** Titre d'un ticket sans clé préalable (listes) ; null si aucun, message d'erreur lisible si la clé est indisponible. */
export async function resolveTicketTitle(ticket: SupportTicketDTO): Promise<string | null> {
    if (!ticket.titleCipher || !ticket.titleIv) return null;
    try {
        return await decryptTicketTitle(ticket, await getTicketChannelKey(ticket, 'PUBLIC'));
    } catch {
        return '🔒 Titre indisponible';
    }
}

export interface OpenedSupportTicket {
    ticket: SupportTicketDTO;
    title: string | null;
    publicKey: CryptoKey | null;
    publicKeyError: Error | null;
    /** Équipe seulement (créée si absente) ; toujours null côté client. */
    internalKey: CryptoKey | null;
    internalKeyError: Error | null;
}

/**
 * Ouvre un ticket : lit le DTO projeté par l'API (client ou équipe) et
 * prépare les clés. Côté équipe, la clé INTERNAL est créée paresseusement
 * si le ticket n'en a pas encore. Une clé indisponible n'empêche pas
 * d'afficher le ticket : l'erreur est rendue à côté (bandeau).
 */
export async function openSupportTicket(ticketId: string): Promise<OpenedSupportTicket> {
    let ticket = await supportApi.getTicket(ticketId);
    const out: OpenedSupportTicket = { ticket, title: null, publicKey: null, publicKeyError: null, internalKey: null, internalKeyError: null };

    try {
        out.publicKey = await getTicketChannelKey(ticket, 'PUBLIC');
        out.title = await decryptTicketTitle(ticket, out.publicKey);
    } catch (e) {
        out.publicKeyError = e instanceof Error ? e : new Error(String(e));
    }

    if (isStaffTicket(ticket)) {
        try {
            const res = await ensureInternalKey(ticket);
            out.internalKey = res.key;
            ticket = res.ticket;
            out.ticket = ticket;
        } catch (e) {
            out.internalKeyError = e instanceof Error ? e : new Error(String(e));
        }
    }
    return out;
}

/**
 * Prise en charge (équipe) avec une urgence obligatoire. Génère la clé
 * INTERNAL si le ticket n'en a pas (ignorée par l'API si une autre a été
 * créée entre-temps). Déjà pris : SupportApiError de statut 409.
 */
export async function claimSupportTicket(ticket: SupportTicketStaffDTO, priority: SupportTicketPriority): Promise<{ ticket: SupportTicketStaffDTO; internalKey: CryptoKey | null }> {
    const internalKey = await prepareInternalKeyForClaim(ticket);
    const updated = await supportApi.claimTicket(ticket.id, { priority, ...(internalKey ? { internalKey } : {}) });
    let key: CryptoKey | null = null;
    if (updated.internalStaffKey) {
        try {
            key = await getTicketChannelKey(updated, 'INTERNAL');
        } catch (e) {
            console.warn(`[Support] Clé INTERNAL du ticket ${ticket.id} indisponible :`, (e as Error).message);
        }
    }
    return { ticket: updated, internalKey: key };
}
