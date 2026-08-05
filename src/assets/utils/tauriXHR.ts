import { invoke } from '@tauri-apps/api/core';

interface NativeHttpResponse {
    status: number;
    body: string;
}

class TauriXMLHttpRequest implements Partial<XMLHttpRequest> {
    public readyState = 0;
    public status = 0;
    public statusText = '';
    public responseText = '';
    public response = '';
    public withCredentials = false;
    public timeout = 0;

    public onreadystatechange: (() => void) | null = null;
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;

    private method = 'GET';
    private url = '';
    private headers: Record<string, string> = {};
    private aborted = false;

    open(method: string, url: string, _async?: boolean): void {
        this.method = method;
        this.url = url;
        this.readyState = 1;
        this.aborted = false;
        this.headers = {};
    }

    setRequestHeader(key: string, value: string): void {
        this.headers[key] = value;
    }

    getResponseHeader(_key: string): string | null {
        return null; // non nécessaire pour le protocole polling engine.io
    }

    getAllResponseHeaders(): string {
        return '';
    }

    abort(): void {
        this.aborted = true;
        this.readyState = 0;
        if (this.onabort) this.onabort();
    }

    async send(data?: string | null): Promise<void> {
        this.readyState = 2;
        try {
            const res = await invoke<NativeHttpResponse>('http_request', {
                url: this.url,
                method: this.method,
                headers: this.headers,
                body: data ?? undefined,
            });

            if (this.aborted) return;

            this.status = res.status;
            this.statusText = String(res.status);
            this.responseText = res.body;
            this.response = res.body;
            this.readyState = 4;

            if (this.onreadystatechange) this.onreadystatechange();
            if (this.onload) this.onload();
        } catch (err) {
            console.error('[tauriXHR] invoke failed:', err);  // <-- ajoute cette ligne
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

    window.XMLHttpRequest = function (this: any) {
        // On ne sait l'URL cible qu'au moment de open(), donc on wrap dynamiquement :
        // on retourne toujours notre shim, mais le shim ne doit intercepter QUE
        // les domaines concernés — sinon on délègue au vrai XHR natif.
        const shim = new TauriXMLHttpRequest();
        const real = new OriginalXHR();
        let useShim = false;

        const proxy: any = new Proxy(
            {},
            {
                get(_target, prop) {
                    const target = useShim ? shim : real;
                    const value = (target as any)[prop];
                    return typeof value === 'function' ? value.bind(target) : value;
                },
                set(_target, prop, value) {
                    if (prop === 'open') return true;
                    (shim as any)[prop] = value;
                    (real as any)[prop] = value;
                    return true;
                },
            }
        );

        // Intercepte open() pour décider dynamiquement shim vs natif
        (shim as any)._decideOpen = (method: string, url: string, async?: boolean) => {
            useShim = matchDomains.some((d) => url.includes(d));
            if (useShim) {
                shim.open(method, url, async);
            } else {
                real.open(method, url, async ?? true);
            }
        };

        return new Proxy(proxy, {
            get(target, prop) {
                if (prop === 'open') {
                    return (method: string, url: string, async?: boolean) => {
                        (shim as any)._decideOpen(method, url, async);
                    };
                }
                return target[prop];
            },
        });
    } as any;

    window.XMLHttpRequest.prototype = OriginalXHR.prototype;
}