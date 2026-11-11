import { archivedPrivateKeys, privateKey, unwrapFileKey } from '@/assets/utils/crypto';
import { FileSubstitutedError, isFileKeyV3, openManifestV3, unwrapFileKeyV3 } from '@/assets/utils/fileKeyV3';
import { getWorkspaceKey } from '@/assets/utils/workspaceCrypto';
import { plainSizeForEncrypted, parseFileIv } from '@/assets/utils/chunkedCryptoCore';
import {
    LINK_PASSWORD_ITERATIONS, authHashOf, buildLinkUrl, deriveLinkKeys, derivePasswordKey, fileRefOf, newLinkId,
    newLinkSecret, newPasswordSalt, publicKeyFingerprint, sealItemMeta, unwrapSecretForRecipient, unwrapSecretFromSpace,
    wrapDekForLink, wrapSecretForRecipient, wrapSecretForSpace,
} from '@/assets/utils/linkCrypto';
import { keycloak } from '@/assets/keycloak';
import {
    ShareLinkApiError, shareLinksApi, type LinkCandidate, type RecipientCandidate, type ShareLinkMode, type ShareLinkSummary,
} from './api';
import { openLinkItems } from './linkDownload';

/**
 * Création et entretien des liens de téléchargement dans l'app
 * (synco_api vibe/features/DOWNLOAD_LINKS_FEATURE.md). Tout ce qui touche à
 * une clé se passe ici, dans le navigateur : le serveur ne reçoit que des
 * chiffrés et l'empreinte de la preuve d'accès.
 */

/** Adresse de la page publique. */
export const SHARE_BASE_URL: string = (import.meta.env.VITE_SHARE_URL as string | undefined) || 'https://share.synco.one';

export class LinkSecretUnavailableError extends Error {
    constructor() {
        super('Le secret de ce lien n\'est lisible que par les membres de son espace.');
        this.name = 'LinkSecretUnavailableError';
    }
}

/** DEK brute d'un fichier, sous la clé d'espace ; pour un fichier v3, son manifeste doit correspondre au nom. */
async function openRawDek(file: LinkCandidate, spaceKey: CryptoKey): Promise<Uint8Array> {
    if (!isFileKeyV3(file.encryptedFileKey)) return new Uint8Array(await unwrapFileKey(file.encryptedFileKey, spaceKey));
    const { raw } = await unwrapFileKeyV3(file.encryptedFileKey, spaceKey);
    const dek = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    const manifest = await openManifestV3(file.encryptedFileKey, dek);
    if (manifest.name !== file.originalName) throw new FileSubstitutedError(file.originalName, manifest.name);
    return new Uint8Array(raw);
}

const plainSizeOf = (file: LinkCandidate) => {
    const format = parseFileIv(file.iv);
    if (!format) throw new Error('Format de fichier non pris en charge.');
    return plainSizeForEncrypted(Number(file.size), format.chunkSize);
};

/** Élément du lien : DEK ré-emballée sous KEK_lien et métadonnées scellées. */
async function buildItem(file: LinkCandidate, spaceKey: CryptoKey, kek: CryptoKey, linkId: string) {
    const fileRef = fileRefOf(file);
    const raw = await openRawDek(file, spaceKey);
    try {
        return {
            fileId: file.id,
            wrappedDek: await wrapDekForLink(raw, kek, linkId, fileRef),
            sealedMeta: await sealItemMeta({ name: file.originalName, mime: file.mimeType, size: plainSizeOf(file), path: file.path }, kek, linkId, fileRef),
        };
    } finally {
        raw.fill(0);
    }
}

async function buildItems(files: LinkCandidate[], spaceKey: CryptoKey, kek: CryptoKey, linkId: string) {
    const items = [];
    const failed: string[] = [];
    for (const file of files) {
        try {
            items.push(await buildItem(file, spaceKey, kek, linkId));
        } catch (error) {
            console.warn('[shareLinks] fichier non partagé :', file.id, error);
            failed.push(file.originalName);
        }
    }
    return { items, failed };
}

/** S chiffré pour chaque destinataire, après vérification de l'empreinte de sa clé. */
async function wrapForRecipients(secret: Uint8Array, recipients: RecipientCandidate[], linkId: string) {
    return Promise.all(recipients.map(async (r) => {
        if (await publicKeyFingerprint(r.publicKey) !== r.fingerprint) throw new Error(`La clé de ${r.name} ne correspond pas à son empreinte.`);
        return { userId: r.userId, wrappedSecret: await wrapSecretForRecipient(secret, r.publicKey, linkId, r.userId), keyFingerprint: r.fingerprint };
    }));
}

export interface CreateShareLinkInput {
    orgId: string;
    target: { fileId: string } | { folderId: string };
    mode: ShareLinkMode;
    expiresAt: Date;
    maxDownloads?: number | null;
    password?: string;
    recipients?: RecipientCandidate[];
}

export interface CreatedShareLink {
    id: string;
    /** À transmettre : contient le secret dans le fragment (sauf lien « utilisateurs »). */
    url: string;
    itemCount: number;
    /** Fichiers du dossier écartés : droits insuffisants ou illisibles. */
    excluded: number;
    failed: string[];
    truncated: boolean;
}

export async function createShareLink(input: CreateShareLinkInput): Promise<CreatedShareLink> {
    if (input.mode === 'PASSWORD' && !input.password) throw new Error('Mot de passe requis.');
    if (input.mode === 'USERS' && !input.recipients?.length) throw new Error('Choisissez au moins un destinataire.');

    const candidates = await shareLinksApi.candidates(input.orgId, input.target);
    if (candidates.files.length === 0) throw new Error('Aucun fichier de cet élément ne peut être partagé par vous.');
    const { key: spaceKey, version } = await getWorkspaceKey(candidates.workspaceId);

    const secret = newLinkSecret();
    const kdf = input.mode === 'PASSWORD' ? { salt: newPasswordSalt(), iterations: LINK_PASSWORD_ITERATIONS } : undefined;
    const passwordKey = kdf ? await derivePasswordKey(input.password!, kdf) : null;

    try {
        // Identifiant tiré ici (il entre dans les AAD) : nouveau tirage s'il était déjà pris.
        for (let attempt = 0; ; attempt++) {
            const id = newLinkId();
            const { kek, auth } = await deriveLinkKeys(id, secret, passwordKey);
            const { items, failed } = await buildItems(candidates.files, spaceKey, kek, id);
            if (items.length === 0) throw new Error('Aucun fichier n\'a pu être préparé pour le partage.');

            try {
                await shareLinksApi.create(input.orgId, {
                    id,
                    mode: input.mode,
                    ...input.target,
                    keyVersion: version,
                    wrappedSecret: await wrapSecretForSpace(spaceKey, id, secret, passwordKey),
                    ...(input.mode === 'USERS' ? {} : { authHash: await authHashOf(auth) }),
                    ...(kdf ? { kdf } : {}),
                    expiresAt: input.expiresAt.toISOString(),
                    maxDownloads: input.maxDownloads ?? null,
                    items,
                    ...(input.mode === 'USERS' ? { recipients: await wrapForRecipients(secret, input.recipients!, id) } : {}),
                });
            } catch (error) {
                if (error instanceof ShareLinkApiError && error.status === 409 && attempt < 2) continue;
                throw error;
            }
            return {
                id,
                url: buildLinkUrl(SHARE_BASE_URL, id, input.mode === 'USERS' ? null : secret),
                itemCount: items.length,
                excluded: candidates.excluded,
                failed,
                truncated: candidates.truncated,
            };
        }
    } finally {
        secret.fill(0);
        passwordKey?.fill(0);
    }
}

/** S ‖ P d'un lien, rouverts avec la clé d'espace. */
async function openLinkSecret(link: ShareLinkSummary) {
    if (!link.wrappedSecret) throw new LinkSecretUnavailableError();
    const { key } = await getWorkspaceKey(link.workspaceId);
    return unwrapSecretFromSpace(link.wrappedSecret, key, link.id);
}

/** URL complète d'un lien existant (le mot de passe, lui, n'est jamais réaffiché). */
export async function revealLinkUrl(link: ShareLinkSummary): Promise<string> {
    if (link.mode === 'USERS') return buildLinkUrl(SHARE_BASE_URL, link.id);
    const { secret, passwordKey } = await openLinkSecret(link);
    passwordKey?.fill(0);
    try {
        return buildLinkUrl(SHARE_BASE_URL, link.id, secret);
    } finally {
        secret.fill(0);
    }
}

/**
 * Met le lien à jour avec le contenu actuel : éléments périmés (contenu
 * remplacé) ré-emballés, fichiers ajoutés au dossier inclus, fichiers
 * devenus non partageables retirés.
 */
export async function syncLinkItems(orgId: string, link: ShareLinkSummary): Promise<{ updated: number; removed: number; failed: string[] }> {
    const detail = await shareLinksApi.get(orgId, link.id);
    const target = link.fileId ? { fileId: link.fileId } : { folderId: link.folderId! };
    const candidates = await shareLinksApi.candidates(orgId, target);
    const { secret, passwordKey } = await openLinkSecret(link);
    try {
        const { kek } = await deriveLinkKeys(link.id, secret, passwordKey);
        const current = new Map(detail.items.map(i => [i.fileId, i]));
        const toWrap = candidates.files.filter(f => !current.has(f.id) || current.get(f.id)!.stale);
        const candidateIds = new Set(candidates.files.map(f => f.id));
        const remove = link.fileId ? [] : detail.items.filter(i => !candidateIds.has(i.fileId)).map(i => i.fileId);

        const { key: spaceKey } = await getWorkspaceKey(candidates.workspaceId);
        const { items, failed } = await buildItems(toWrap, spaceKey, kek, link.id);
        if (items.length || remove.length) await shareLinksApi.update(orgId, link.id, { items: { upsert: items, remove } });
        return { updated: items.length, removed: remove.length, failed };
    } finally {
        secret.fill(0);
        passwordKey?.fill(0);
    }
}

export async function addRecipients(orgId: string, link: ShareLinkSummary, recipients: RecipientCandidate[]): Promise<void> {
    const { secret, passwordKey } = await openLinkSecret(link);
    passwordKey?.fill(0);
    try {
        await shareLinksApi.update(orgId, link.id, { recipients: { add: await wrapForRecipients(secret, recipients, link.id) } });
    } finally {
        secret.fill(0);
    }
}

/** RSA-OAEP avec la clé d'identité, puis les clés archivées (rotation d'identité). */
async function unwrapWithIdentity(wrapped: string, linkId: string, userId: string): Promise<Uint8Array> {
    const keys = [privateKey.value, ...archivedPrivateKeys.value].filter((k): k is CryptoKey => !!k);
    if (keys.length === 0) throw new Error('Chiffrement de bout en bout verrouillé.');
    for (const key of keys) {
        try {
            return await unwrapSecretForRecipient(wrapped, key, linkId, userId);
        } catch { /* clé suivante */ }
    }
    throw new Error('Ce lien n\'a pas été chiffré pour votre clé actuelle.');
}

/** Lien reçu : secret rouvert avec la clé privée de l'utilisateur, éléments déchiffrés. */
export async function openReceivedLink(linkId: string) {
    const userId = keycloak.userInfo?.sub ?? keycloak.subject;
    if (!userId) throw new Error('Non connecté.');
    const link = await shareLinksApi.openReceived(linkId);
    const secret = await unwrapWithIdentity(link.wrappedSecret, linkId, userId);
    try {
        const { kek } = await deriveLinkKeys(linkId, secret);
        const { opened, unreadable } = await openLinkItems(link.items, kek, linkId);
        return { link, kek, items: opened, unreadable };
    } finally {
        secret.fill(0);
    }
}
