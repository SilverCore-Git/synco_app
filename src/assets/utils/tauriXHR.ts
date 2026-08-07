import { invoke } from '@tauri-apps/api/core';

interface NativeHttpResponse {
    status: number;
    body: string;
    headers: Record<string, string>;
}

class TauriXMLHttpRequest extends EventTarget implements Partial<XMLHttpRequest> {
    public readyState = 0;
    public status = 0;
    public statusText = '';
    public responseText = '';
    public response = '';
    public responseType: XMLHttpRequestResponseType = '';
    public responseURL = '';
    public withCredentials = false;
    public timeout = 0;
    public upload = new EventTarget() as XMLHttpRequestUpload;

    public readonly UNSENT = 0;
    public readonly OPENED = 1;
    public readonly HEADERS_RECEIVED = 2;
    public readonly LOADING = 3;
    public readonly DONE = 4;

    public onreadystatechange: (() => void) | null = null;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;
    public ontimeout: (() => void) | null = null;

    private method = 'GET';
    private url = '';
    private requestHeaders: Record<string, string> = {};
    private responseHeaders: Record<string, string> = {};  // <-- nouveau
    private aborted = false;

    open(method: string, url: string, _async?: boolean): void {
        this.method = method;
        this.url = url;
        this.readyState = 1;
        this.aborted = false;
        this.requestHeaders = {};
        this.responseHeaders = {};
    }

    setRequestHeader(key: string, value: string): void {
        this.requestHeaders[key] = value;
    }

    // Exposé correctement maintenant
    getResponseHeader(key: string): string | null {
        return this.responseHeaders[key.toLowerCase()] ?? null;
    }

    getAllResponseHeaders(): string {
        return Object.entries(this.responseHeaders)
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n');
    }

    abort(): void {
        this.aborted = true;
        this.readyState = 0;
        if (this.onabort) this.onabort();
    }

    async send(data?: string | null): Promise<void> {
        this.readyState = 2;
        console.log('[tauriXHR] sending:', this.method, this.url, {
            headers: this.requestHeaders,
            body: data,
        });
        try {
            const res = await invoke<NativeHttpResponse>('http_request', {
                url: this.url,
                method: this.method,
                headers: this.requestHeaders,
                body: data ?? undefined,
            });

            if (this.aborted) return;

            console.log('[tauriXHR] success:', this.method, this.url, res.status, res.headers);

            this.status = res.status;
            this.statusText = String(res.status);
            this.responseText = res.body;
            this.response = res.body;
            this.responseHeaders = Object.fromEntries(
                Object.entries(res.headers).map(([k, v]) => [k.toLowerCase(), v])
            );
            this.readyState = 4;

            if (this.onreadystatechange) this.onreadystatechange();
            if (this.onload) this.onload();
        } catch (err) {
            console.error('[tauriXHR] invoke failed:', this.method, this.url, err);
            if (this.aborted) return;
            this.status = 0;
            this.readyState = 4;
            if (this.onreadystatechange) this.onreadystatechange();
            if (this.onerror) this.onerror();
        }
    }
}

export function installTauriXHRPatch(matchDomains: string[]): void {
    const OriginalXHR = window.XMLHttpRequest;

    class PatchedXHR {
        constructor() {
            const pending: Record<string, any> = {};

            return new Proxy({} as any, {
                get(target, prop) {
                    if (target._instance) {
                        const value = target._instance[prop];
                        return typeof value === 'function' ? value.bind(target._instance) : value;
                    }
                    if (prop === 'open') {
                        return (method: string, url: string, async?: boolean) => {
                            const useShim = matchDomains.some((d) => url.includes(d));
                            target._instance = useShim
                                ? new TauriXMLHttpRequest()
                                : new OriginalXHR();

                            // Applique toutes les valeurs stockées avant open()
                            for (const [k, v] of Object.entries(pending)) {
                                target._instance[k] = v;
                            }

                            target._instance.open(method, url, async ?? true);
                        };
                    }
                    if (prop === 'addEventListener' || prop === 'removeEventListener') {
                        return () => {};
                    }
                    // Retourne la valeur pending si pas encore d'instance
                    return pending[prop as string];
                },
                set(target, prop, value) {
                    if (target._instance) {
                        target._instance[prop] = value;
                    } else {
                        // Stocke pour appliquer dès que open() crée l'instance
                        pending[prop as string] = value;
                    }
                    return true;
                },
                has(_target, _prop) {
                    return true;
                },
            });
        }
    }

    window.XMLHttpRequest = PatchedXHR as any;
}