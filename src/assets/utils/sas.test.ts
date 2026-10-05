import { describe, expect, test } from "bun:test";




const { generateFingerprint, dtlsFingerprints, normalizeSas } = await import("@/assets/utils/sas");

const sdp = (fp: string) => `v=0\r\na=fingerprint:sha-256 ${fp}\r\n`;
const key = () => crypto.subtle.importKey("raw", new Uint8Array(32).fill(7), { name: "AES-GCM" }, true, ["encrypt"]);

describe("SAS v2 (audit FC8)", () => {
    test("identique des deux côtés sans interception", async () => {
        const k = await key();
        const alice = await generateFingerprint(k, "call-1", sdp("AA:01"), sdp("BB:02"));
        const bob = await generateFingerprint(k, "call-1", sdp("BB:02"), sdp("AA:01"));
        expect(alice).toBe(bob);
        expect(normalizeSas(alice)).toMatch(/^\d{12}$/);
    });

    test("différent si une empreinte DTLS est substituée (MITM)", async () => {
        const k = await key();
        const alice = await generateFingerprint(k, "call-1", sdp("AA:01"), sdp("EE:99"));
        const bob = await generateFingerprint(k, "call-1", sdp("BB:02"), sdp("EE:98"));
        expect(alice).not.toBe(bob);
    });

    test("extraction des empreintes", () => {
        expect(dtlsFingerprints(sdp("aa:01") + "a=fingerprint:sha-256 0C:0D\n")).toEqual(["SHA-256 0C:0D", "SHA-256 AA:01"]);
    });
});
