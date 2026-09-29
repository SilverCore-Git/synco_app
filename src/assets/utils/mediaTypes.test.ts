import { describe, expect, test } from "bun:test";
import { detectMediaMime, getMediaKind, normalizeMediaMime } from "./mediaTypes";

const bytes = (...parts: (string | number[])[]): Uint8Array =>
    new Uint8Array(parts.flatMap(p => typeof p === "string" ? [...p].map(c => c.charCodeAt(0)) : p));

describe("getMediaKind", () => {

    test("allowlisted types map to their kind", () => {
        expect(getMediaKind("image/png")).toBe("image");
        expect(getMediaKind("audio/mpeg")).toBe("audio");
        expect(getMediaKind("video/mp4")).toBe("video");
    });

    test("aliases, case and parameters are normalized", () => {
        expect(normalizeMediaMime("image/JPG")).toBe("image/jpeg");
        expect(normalizeMediaMime("audio/x-m4a")).toBe("audio/mp4");
        expect(normalizeMediaMime("audio/ogg; codecs=opus")).toBe("audio/ogg");
    });

    test("anything a browser could run as a document is refused", () => {
        expect(getMediaKind("image/svg+xml")).toBeNull();
        expect(getMediaKind("text/html")).toBeNull();
        expect(getMediaKind("application/octet-stream")).toBeNull();
        expect(getMediaKind("")).toBeNull();
        expect(getMediaKind(undefined)).toBeNull();
    });

});

describe("detectMediaMime", () => {

    test("identifies genuine headers", () => {
        expect(detectMediaMime(bytes([0x89], "PNG", [0x0D, 0x0A]))).toBe("image/png");
        expect(detectMediaMime(bytes([0xFF, 0xD8, 0xFF, 0xE0]))).toBe("image/jpeg");
        expect(detectMediaMime(bytes("GIF89a"))).toBe("image/gif");
        expect(detectMediaMime(bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe("image/webp");
        expect(detectMediaMime(bytes([0, 0, 0, 0x1C], "ftypavif"))).toBe("image/avif");
        expect(detectMediaMime(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("audio/wav");
        expect(detectMediaMime(bytes("ID3", [4, 0]))).toBe("audio/mpeg");
        expect(detectMediaMime(bytes("fLaC"))).toBe("audio/flac");
        expect(detectMediaMime(bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe("audio/mp4");
        expect(detectMediaMime(bytes([0, 0, 0, 0x14], "ftypqt  "))).toBe("video/quicktime");
        expect(detectMediaMime(bytes([0, 0, 0, 0x20], "ftypisom"))).toBe("video/mp4");
        expect(detectMediaMime(bytes([0x1A, 0x45, 0xDF, 0xA3]))).toBe("video/webm");
    });

    // Régression : « Gemini_Generated_Image_….gif » est en réalité un JPEG.
    // L'ancienne vérification exigeait la signature du type déclaré
    // (GIF8) et refusait l'aperçu d'une image parfaitement affichable.
    test("the real format wins over a wrong extension", () => {
        const jfif = bytes([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10], "JFIF");
        expect(detectMediaMime(jfif, "image/gif")).toBe("image/jpeg");
        expect(detectMediaMime(bytes([0, 0, 0, 0x20], "ftypisom"), "image/gif")).toBe("video/mp4");
    });

    test("ambiguous containers follow the declared kind", () => {
        const mp4 = bytes([0, 0, 0, 0x20], "ftypisom");
        expect(detectMediaMime(mp4, "audio/mp4")).toBe("audio/mp4");
        expect(detectMediaMime(mp4, "video/mp4")).toBe("video/mp4");
        const webm = bytes([0x1A, 0x45, 0xDF, 0xA3]);
        expect(detectMediaMime(webm, "audio/webm")).toBe("audio/webm");
        expect(detectMediaMime(bytes("OggS"), "audio/ogg")).toBe("audio/ogg");
        expect(detectMediaMime(bytes("OggS"), "video/ogg")).toBe("video/ogg");
    });

    test("bare MPEG frame sync is only trusted for a declared audio type", () => {
        expect(detectMediaMime(bytes([0xFF, 0xFB, 0x90]), "audio/mpeg")).toBe("audio/mpeg");
        expect(detectMediaMime(bytes([0xFF, 0xF1, 0x50]), "audio/aac")).toBe("audio/aac");
        expect(detectMediaMime(bytes([0xFF, 0xFB, 0x90]), "image/png")).toBeNull();
    });

    test("rejects markup and unknown content, whatever the declared type", () => {
        expect(detectMediaMime(bytes("<html><script>"), "image/png")).toBeNull();
        expect(detectMediaMime(bytes("<svg xmlns="), "image/svg+xml")).toBeNull();
        expect(detectMediaMime(bytes("<svg xmlns="), "video/mp4")).toBeNull();
        expect(detectMediaMime(new Uint8Array(), "image/png")).toBeNull();
        expect(detectMediaMime(bytes([0, 0]), "video/mp4")).toBeNull();
    });

});
