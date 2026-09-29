// Which attachments get an inline preview in chat messages, and the checks
// their decrypted bytes must pass before being rendered.
//
// The MIME type of an E2EE file is whatever the *sender's* client declared
// (the server only ever sees ciphertext, see cdnRoutes.ts /upload), and in
// practice it is just the file extension — often wrong (a ".gif" that is a
// JPEG, a ".jpg" that is a WebP…). So the declared type only decides whether
// we *try* a preview; what gets rendered is the format actually detected
// from the plaintext's magic bytes, among a strict allowlist (no SVG, no
// HTML — nothing a browser could run as a document).

export type MediaKind = 'image' | 'audio' | 'video';

// Media at or under this size are fetched + decrypted as soon as the message
// is mounted; above it, the user has to ask for it.
export const AUTO_LOAD_MAX_BYTES = 15 * 1024 * 1024;

const MEDIA_KINDS: Record<string, MediaKind> = {
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'image/avif': 'image',

    'audio/mpeg': 'audio',
    'audio/aac': 'audio',
    'audio/mp4': 'audio',
    'audio/ogg': 'audio',
    'audio/wav': 'audio',
    'audio/webm': 'audio',
    'audio/flac': 'audio',

    'video/mp4': 'video',
    'video/quicktime': 'video',
    'video/webm': 'video',
    'video/ogg': 'video',
};

// Non-standard spellings browsers/OSes actually put in File.type
const MIME_ALIASES: Record<string, string> = {
    'image/jpg': 'image/jpeg',
    'audio/mp3': 'audio/mpeg',
    'audio/x-mp3': 'audio/mpeg',
    'audio/x-wav': 'audio/wav',
    'audio/wave': 'audio/wav',
    'audio/vnd.wave': 'audio/wav',
    'audio/x-m4a': 'audio/mp4',
    'audio/m4a': 'audio/mp4',
    'audio/x-flac': 'audio/flac',
    'audio/x-aac': 'audio/aac',
};

// Canonical allowlisted MIME type, or null when the type is not previewable.
export const normalizeMediaMime = (mimeType: string | null | undefined): string | null => {
    const bare = (mimeType ?? '').split(';')[0]!.trim().toLowerCase();
    const canonical = MIME_ALIASES[bare] ?? bare;
    return canonical in MEDIA_KINDS ? canonical : null;
};

export const getMediaKind = (mimeType: string | null | undefined): MediaKind | null => {
    const mime = normalizeMediaMime(mimeType);
    return mime ? MEDIA_KINDS[mime]! : null;
};

const ascii = (b: Uint8Array, offset: number, text: string): boolean => {
    if (b.length < offset + text.length) return false;
    for (let i = 0; i < text.length; i++) {
        if (b[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
};

// Real format of the decrypted bytes, restricted to the allowlist. Containers
// that can hold either sound or picture (ISO-BMFF, WebM, Ogg) are resolved
// with the declared type's kind as a hint. Null = not a previewable medium.
export const detectMediaMime = (bytes: Uint8Array, declaredMime?: string | null): string | null => {
    const b = bytes;
    const declaredKind = getMediaKind(declaredMime);

    if (b.length >= 4 && b[0] === 0x89 && ascii(b, 1, 'PNG')) return 'image/png';
    if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
    if (ascii(b, 0, 'GIF8')) return 'image/gif';
    if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return 'image/webp';
    if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return 'audio/wav';
    if (ascii(b, 0, 'fLaC')) return 'audio/flac';

    // ISO-BMFF: mp4, m4a, mov, avif — the major brand tells them apart
    if (ascii(b, 4, 'ftyp')) {
        if (ascii(b, 8, 'avif') || ascii(b, 8, 'avis')) return 'image/avif';
        if (ascii(b, 8, 'M4A ') || ascii(b, 8, 'M4B ')) return 'audio/mp4';
        if (ascii(b, 8, 'qt  ')) return 'video/quicktime';
        return declaredKind === 'audio' ? 'audio/mp4' : 'video/mp4';
    }
    // Matroska / WebM
    if (b.length >= 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) {
        return declaredKind === 'audio' ? 'audio/webm' : 'video/webm';
    }
    if (ascii(b, 0, 'OggS')) return declaredKind === 'video' ? 'video/ogg' : 'audio/ogg';

    // MP3 (ID3 tag or bare frame sync) / ADTS AAC. The bare 11-bit frame sync
    // is weak, so only trust it when an audio type was declared.
    if (ascii(b, 0, 'ID3')) return 'audio/mpeg';
    if (declaredKind === 'audio' && b.length >= 2 && b[0] === 0xFF && (b[1]! & 0xE0) === 0xE0) {
        return (b[1]! & 0x06) === 0 ? 'audio/aac' : 'audio/mpeg';
    }

    return null;
};
