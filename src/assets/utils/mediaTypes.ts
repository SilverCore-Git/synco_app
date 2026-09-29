// Which attachments get an inline preview in chat messages, and the checks
// their decrypted bytes must pass before being rendered.
//
// The MIME type of an E2EE file is whatever the *sender's* client declared
// (the server only ever sees ciphertext, see cdnRoutes.ts /upload), so a
// malicious peer can label anything as anything. Hence: a strict allowlist
// (no SVG, no HTML — nothing a browser could run as a document) and a
// magic-byte check on the plaintext before it reaches <img>/<audio>/<video>.

export type MediaKind = 'image' | 'audio' | 'video';

// Media at or under this size are fetched + decrypted as soon as the message
// is mounted; above it, the user has to ask for it.
export const AUTO_LOAD_MAX_BYTES = 15 * 1024 * 1024;

type Signature = (b: Uint8Array) => boolean;

const ascii = (b: Uint8Array, offset: number, text: string): boolean => {
    if (b.length < offset + text.length) return false;
    for (let i = 0; i < text.length; i++) {
        if (b[offset + i] !== text.charCodeAt(i)) return false;
    }
    return true;
};

const PNG: Signature = b => b.length >= 4 && b[0] === 0x89 && ascii(b, 1, 'PNG');
const JPEG: Signature = b => b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
const GIF: Signature = b => ascii(b, 0, 'GIF8');
const WEBP: Signature = b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP');
const WAV: Signature = b => ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE');
// ISO-BMFF container: mp4, m4a, mov, avif
const FTYP: Signature = b => ascii(b, 4, 'ftyp');
// Matroska / WebM
const EBML: Signature = b => b.length >= 4 && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3;
const OGG: Signature = b => ascii(b, 0, 'OggS');
const FLAC: Signature = b => ascii(b, 0, 'fLaC');
// MP3 (with or without ID3 tag) and ADTS AAC share the 11-bit frame sync
const MPEG_AUDIO: Signature = b => ascii(b, 0, 'ID3') || (b.length >= 2 && b[0] === 0xFF && (b[1]! & 0xE0) === 0xE0);

interface MediaType {
    kind: MediaKind;
    signatures: Signature[];
}

const MEDIA_TYPES: Record<string, MediaType> = {
    'image/png': { kind: 'image', signatures: [PNG] },
    'image/jpeg': { kind: 'image', signatures: [JPEG] },
    'image/gif': { kind: 'image', signatures: [GIF] },
    'image/webp': { kind: 'image', signatures: [WEBP] },
    'image/avif': { kind: 'image', signatures: [FTYP] },

    'audio/mpeg': { kind: 'audio', signatures: [MPEG_AUDIO] },
    'audio/aac': { kind: 'audio', signatures: [MPEG_AUDIO, FTYP] },
    'audio/mp4': { kind: 'audio', signatures: [FTYP] },
    'audio/ogg': { kind: 'audio', signatures: [OGG] },
    'audio/wav': { kind: 'audio', signatures: [WAV] },
    'audio/webm': { kind: 'audio', signatures: [EBML] },
    'audio/flac': { kind: 'audio', signatures: [FLAC] },

    'video/mp4': { kind: 'video', signatures: [FTYP] },
    'video/quicktime': { kind: 'video', signatures: [FTYP] },
    'video/webm': { kind: 'video', signatures: [EBML] },
    'video/ogg': { kind: 'video', signatures: [OGG] },
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
    return canonical in MEDIA_TYPES ? canonical : null;
};

export const getMediaKind = (mimeType: string | null | undefined): MediaKind | null => {
    const mime = normalizeMediaMime(mimeType);
    return mime ? MEDIA_TYPES[mime]!.kind : null;
};

// True when the decrypted bytes really start like the declared media type.
export const matchesMediaSignature = (mimeType: string, bytes: Uint8Array): boolean => {
    const mime = normalizeMediaMime(mimeType);
    if (!mime) return false;
    return MEDIA_TYPES[mime]!.signatures.some(sig => sig(bytes));
};
