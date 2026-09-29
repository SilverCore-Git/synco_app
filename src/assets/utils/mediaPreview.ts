import { fetchDecryptedFile } from "./downloadFile";
import { createMediaCache } from "./mediaCache";
import { matchesMediaSignature, normalizeMediaMime } from "./mediaTypes";

export class MediaPreviewError extends Error {}

// Fetches + decrypts an attachment and only hands back a Blob if it is an
// allowlisted media type whose bytes actually match it — see mediaTypes.ts
// for why the declared type can't be trusted on its own.
const loadMediaBlob = async (fileId: string): Promise<Blob> => {
    const { buffer, metadata } = await fetchDecryptedFile(fileId);

    const mime = normalizeMediaMime(metadata.mimeType);
    if (!mime) throw new MediaPreviewError("Type de média non pris en charge");

    if (!matchesMediaSignature(mime, new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16)))) {
        throw new MediaPreviewError("Le contenu du fichier ne correspond pas à son type");
    }

    // Rebuilt with the canonical allowlisted type, never the raw declared one.
    return new Blob([buffer], { type: mime });
};

export const mediaCache = createMediaCache({ load: loadMediaBlob });
