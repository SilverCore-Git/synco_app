import { describe, expect, test } from "bun:test";
import { getMediaKind, matchesMediaSignature, normalizeMediaMime } from "./mediaTypes";

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

describe("matchesMediaSignature", () => {

    test("accepts genuine headers", () => {
        expect(matchesMediaSignature("image/png", bytes([0x89], "PNG", [0x0D, 0x0A]))).toBe(true);
        expect(matchesMediaSignature("image/jpeg", bytes([0xFF, 0xD8, 0xFF, 0xE0]))).toBe(true);
        expect(matchesMediaSignature("image/gif", bytes("GIF89a"))).toBe(true);
        expect(matchesMediaSignature("image/webp", bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe(true);
        expect(matchesMediaSignature("audio/wav", bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe(true);
        expect(matchesMediaSignature("audio/mpeg", bytes("ID3", [4, 0]))).toBe(true);
        expect(matchesMediaSignature("audio/mpeg", bytes([0xFF, 0xFB, 0x90]))).toBe(true);
        expect(matchesMediaSignature("audio/flac", bytes("fLaC"))).toBe(true);
        expect(matchesMediaSignature("audio/ogg", bytes("OggS"))).toBe(true);
        expect(matchesMediaSignature("video/mp4", bytes([0, 0, 0, 0x20], "ftypisom"))).toBe(true);
        expect(matchesMediaSignature("video/webm", bytes([0x1A, 0x45, 0xDF, 0xA3]))).toBe(true);
    });

    test("rejects markup disguised as media", () => {
        expect(matchesMediaSignature("image/png", bytes("<html><script>"))).toBe(false);
        expect(matchesMediaSignature("video/mp4", bytes("<svg xmlns="))).toBe(false);
    });

    test("rejects a real header under the wrong type", () => {
        expect(matchesMediaSignature("image/jpeg", bytes([0x89], "PNG"))).toBe(false);
        expect(matchesMediaSignature("audio/wav", bytes("RIFF", [0, 0, 0, 0], "WEBP"))).toBe(false);
    });

    test("rejects empty or truncated content and non-media types", () => {
        expect(matchesMediaSignature("image/png", new Uint8Array())).toBe(false);
        expect(matchesMediaSignature("video/mp4", bytes([0, 0]))).toBe(false);
        expect(matchesMediaSignature("image/svg+xml", bytes("<svg"))).toBe(false);
    });

});
