import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";

// API (sfetch) et CDN (fetch, XMLHttpRequest) simulés : on vérifie ce que
// le client envoie et comment il réagit aux réponses du CDN.

type Call = { url: string; method: string; headers: Record<string, string>; body?: any };
const apiCalls: Call[] = [];
const cdnCalls: Call[] = [];
let apiRoute: (url: string, init: any) => { status: number; body: any };
let cdnRoute: (call: Call) => { status: number; body?: any; bytes?: Uint8Array };

const json = (status: number, body: any) => new Response(body === undefined ? null : JSON.stringify(body), { status });

mock.module("@/assets/utils/sfetch", () => ({
    default: async (url: string, init: any = {}) => {
        apiCalls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : undefined });
        const { status, body } = apiRoute(url, init);
        return json(status, body);
    },
}));

const realFetch = globalThis.fetch;
const realXHR = (globalThis as any).XMLHttpRequest;
afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as any).XMLHttpRequest = realXHR;
});

globalThis.fetch = (async (url: string, init: any = {}) => {
    const call = { url, method: init.method ?? "GET", headers: init.headers ?? {} };
    cdnCalls.push(call);
    const res = cdnRoute(call);
    return res.bytes ? new Response(res.bytes, { status: res.status }) : json(res.status, res.body);
}) as any;

class FakeXHR {
    static sent: { url: string; headers: Record<string, string>; size: number }[] = [];
    upload: { onprogress?: (e: any) => void } = {};
    status = 0;
    responseText = "";
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    private url = "";
    private headers: Record<string, string> = {};
    open(_method: string, url: string) { this.url = url; }
    setRequestHeader(name: string, value: string) { this.headers[name] = value; }
    abort() { this.onabort?.(); }
    send(body: Blob) {
        FakeXHR.sent.push({ url: this.url, headers: { ...this.headers }, size: body.size });
        const res = cdnRoute({ url: this.url, method: "PUT", headers: this.headers });
        this.status = res.status;
        this.responseText = res.body ? JSON.stringify(res.body) : "";
        queueMicrotask(() => {
            this.upload.onprogress?.({ loaded: body.size });
            this.onload?.();
        });
    }
}
(globalThis as any).XMLHttpRequest = FakeXHR;

const { CdnUpload, CdnDownload, FileChangedError } = await import("./cdn");

const signal = () => new AbortController().signal;
const ticket = (n: number, expiresInMs = 3600_000) => ({
    tid: "tid-1", fileId: "file-1", cdnUrl: "https://cdn.test", ticket: `t${n}`,
    expiresAt: Date.now() + expiresInMs, size: 300, partSize: 100, partCount: 3,
});

beforeEach(() => {
    apiCalls.length = 0;
    cdnCalls.length = 0;
    FakeXHR.sent.length = 0;
});

describe("envoi", () => {
    const request = {
        create: { orgId: "org", workspaceId: "ws", fileName: "a.txt" },
        size: 300, partSize: 100, mimeType: "text/plain", encryptedFileKey: "k", keyVersion: 1, iv: "v2:4194304:AAAAAAAAAAA=",
    };

    test("ouverture : API puis session CDN avec le ticket", async () => {
        apiRoute = () => ({ status: 201, body: ticket(1) });
        cdnRoute = () => ({ status: 201, body: {} });
        const upload = await CdnUpload.open(request, signal());

        expect(apiCalls[0]).toMatchObject({ url: "/api/cdn/transfers/uploads", method: "POST" });
        expect(apiCalls[0].body).toMatchObject({ orgId: "org", workspaceId: "ws", fileName: "a.txt", size: 300, iv: request.iv });
        expect(cdnCalls[0]).toMatchObject({ url: "https://cdn.test/v1/uploads", method: "POST", headers: { Authorization: "Bearer t1" } });
        expect(upload.partCount).toBe(3);
    });

    test("remplacement : route replace, sans champs de destination", async () => {
        apiRoute = () => ({ status: 201, body: ticket(1) });
        cdnRoute = () => ({ status: 201, body: {} });
        const { create: _create, ...content } = request;
        await CdnUpload.open({ ...content, replaceFileId: "file-9" }, signal());
        expect(apiCalls[0].url).toBe("/api/cdn/transfers/uploads/replace/file-9");
        expect(apiCalls[0].body.orgId).toBeUndefined();
    });

    test("part : X-Part-Index et ticket ; 401 → renouvellement puis nouvelle tentative", async () => {
        apiRoute = (url) => url.endsWith("/renew") ? { status: 200, body: ticket(2) } : { status: 201, body: ticket(1) };
        let rejected = false;
        cdnRoute = (call) => {
            if (call.method === "PUT" && !rejected) {
                rejected = true;
                return { status: 401, body: { error: "ticket_expired", message: "Ticket expiré." } };
            }
            return { status: 204 };
        };
        const upload = await CdnUpload.open(request, signal());
        await upload.putPart(2, new Blob([new Uint8Array(100)]), signal(), () => {});

        expect(FakeXHR.sent.map((s) => s.headers.Authorization)).toEqual(["Bearer t1", "Bearer t2"]);
        expect(FakeXHR.sent[1]).toMatchObject({ url: "https://cdn.test/v1/uploads/tid-1/part", headers: { "X-Part-Index": "2" } });
        expect(apiCalls.filter((c) => c.url.endsWith("/renew"))).toHaveLength(1);
    });

    test("ticket proche de l'expiration : renouvelé avant la requête, une seule fois pour des parts en parallèle", async () => {
        apiRoute = (url) => url.endsWith("/renew") ? { status: 200, body: ticket(2) } : { status: 201, body: ticket(1, 60_000) };
        cdnRoute = () => ({ status: 204 });
        const upload = await CdnUpload.open(request, signal());
        await Promise.all([0, 1, 2].map((i) => upload.putPart(i, new Blob([new Uint8Array(10)]), signal(), () => {})));

        expect(apiCalls.filter((c) => c.url.endsWith("/renew"))).toHaveLength(1);
        expect(FakeXHR.sent.every((s) => s.headers.Authorization === "Bearer t2")).toBe(true);
    });

    test("erreur du CDN : code et message conservés", async () => {
        apiRoute = () => ({ status: 201, body: ticket(1) });
        cdnRoute = (call) => call.url.endsWith("/complete")
            ? { status: 409, body: { error: "upload_rejected", message: "L'enregistrement du fichier a été refusé." } }
            : { status: 201, body: {} };
        const upload = await CdnUpload.open(request, signal());
        const error: any = await upload.complete(signal()).catch((e) => e);
        expect(error.status).toBe(409);
        expect(error.code).toBe("upload_rejected");
        expect(error.retryable).toBe(false);
    });

    test("abandon : transfert annulé via l'API", async () => {
        apiRoute = () => ({ status: 201, body: ticket(1) });
        cdnRoute = () => ({ status: 201, body: {} });
        const upload = await CdnUpload.open(request, signal());
        upload.cancel();
        await Promise.resolve();
        expect(apiCalls.at(-1)).toMatchObject({ url: "/api/cdn/transfers/uploads/tid-1", method: "DELETE" });
    });
});

describe("téléchargement", () => {
    const download = (n: number, expiresInMs = 900_000) => ({ url: "https://cdn.test/v1/files/blob-1", ticket: `d${n}`, expiresAt: Date.now() + expiresInMs });
    const bytes = new Uint8Array(1000).map((_, i) => i % 251);

    test("plage demandée avec le ticket", async () => {
        cdnRoute = () => ({ status: 206, bytes: bytes.slice(100, 200) });
        const cdn = new CdnDownload("file-1", download(1), "blob-1");
        const out = await cdn.fetchRange(100, 200, signal());
        expect(new Uint8Array(out)).toEqual(bytes.slice(100, 200));
        expect(cdnCalls[0].headers).toMatchObject({ Authorization: "Bearer d1", Range: "bytes=100-199" });
    });

    test("plage ignorée par un intermédiaire (200) : tranche extraite", async () => {
        cdnRoute = () => ({ status: 200, bytes });
        const out = await new CdnDownload("file-1", download(1), "blob-1").fetchRange(10, 20, signal());
        expect(new Uint8Array(out)).toEqual(bytes.slice(10, 20));
    });

    test("401 : nouveau ticket via /meta, même contenu", async () => {
        apiRoute = () => ({ status: 200, body: { blobId: "blob-1", download: download(2) } });
        cdnRoute = (call) => call.headers.Authorization === "Bearer d1" ? { status: 401, body: { error: "ticket_expired" } } : { status: 206, bytes: bytes.slice(0, 10) };
        await new CdnDownload("file-1", download(1), "blob-1").fetchRange(0, 10, signal());
        expect(apiCalls[0].url).toBe("/api/cdn/meta/file-1");
        expect(cdnCalls.map((c) => c.headers.Authorization)).toEqual(["Bearer d1", "Bearer d2"]);
    });

    test("contenu remplacé entre-temps : FileChangedError (409 du CDN ou blob différent)", async () => {
        cdnRoute = () => ({ status: 409, body: { error: "file_changed" } });
        expect(await new CdnDownload("file-1", download(1), "blob-1").fetchRange(0, 10, signal()).catch((e) => e)).toBeInstanceOf(FileChangedError);

        apiRoute = () => ({ status: 200, body: { blobId: "blob-2", download: download(2) } });
        cdnRoute = () => ({ status: 401, body: { error: "ticket_expired" } });
        expect(await new CdnDownload("file-1", download(1), "blob-1").fetchRange(0, 10, signal()).catch((e) => e)).toBeInstanceOf(FileChangedError);
    });

    test("morceau tronqué : erreur réessayable", async () => {
        cdnRoute = () => ({ status: 206, bytes: bytes.slice(0, 5) });
        const error: any = await new CdnDownload("file-1", download(1), "blob-1").fetchRange(0, 10, signal()).catch((e) => e);
        expect(error.retryable).toBe(true);
    });
});
