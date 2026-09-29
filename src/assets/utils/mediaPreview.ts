import { fetchDecryptedFile } from "./downloadFile";
import { createMediaCache } from "./mediaCache";
import { detectMediaMime } from "./mediaTypes";

export class MediaPreviewError extends Error {}

// Fetches + decrypts an attachment and hands back a Blob typed with the
// format *detected* from its bytes (allowlist only) — never the declared
// type, which is just the sender's file extension; see mediaTypes.ts.
const loadMediaBlob = async (fileId: string): Promise<Blob> => {
    const { buffer, metadata } = await fetchDecryptedFile(fileId);

    const header = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16));
    const mime = detectMediaMime(header, metadata.mimeType);
    if (!mime) throw new MediaPreviewError("Format de média non reconnu");

    return new Blob([buffer], { type: mime });
};

export const mediaCache = createMediaCache({ load: loadMediaBlob });
