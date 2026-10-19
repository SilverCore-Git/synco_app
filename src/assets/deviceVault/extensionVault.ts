import { DK_LENGTH, VaultError, type DeviceVault, type VaultContext, type VaultErrorCode } from './types';

/**
 * Coffre web fourni par Synco Extension (Chrome, Firefox) : DK est gardée dans le stockage de
 * l'extension, hors de l'origine de la page, et le PIN se saisit dans une fenêtre de l'extension.
 * Contrat : synco_extension/doc/16-coffre-extension.md (protocole 1). Spec de l'application : §16.
 *
 * LIMITES ASSUMÉES :
 * - ce n'est pas un coffre matériel : une copie du profil du navigateur permet d'essayer les PIN
 *   hors ligne (spec de l'extension, M10) ;
 * - l'extension authentifie la page, pas l'inverse (M7) : un script de la page ou une autre
 *   extension peut répondre `ready`. La détection n'est jamais une preuve d'identité.
 *
 * Ce qui part vers l'extension : `deviceId` (UUID) et une raison en texte brut. Jamais le PIN
 * (ctx.pin est ignoré), ni aucune autre donnée.
 */

export const EXTENSION_PROTOCOL = 1;
/**
 * Le content script écoute dès `document_start` et répond `ready` sans passer par le worker de
 * l'extension : la réponse prend quelques millisecondes. 300 ms laissent de la marge à une machine
 * chargée sans retarder perceptiblement le démarrage, qui n'attend jamais cette détection.
 */
export const DETECT_TIMEOUT_MS = 300;
/** status, has, remove : relais vers le worker, que Chrome peut devoir réveiller. */
export const SHORT_TIMEOUT_MS = 5_000;
/** create, load : l'utilisateur saisit son PIN ; la fenêtre de l'extension expire au bout de 2 min. */
export const PROMPT_TIMEOUT_MS = 150_000;
export const MAX_REASON_LENGTH = 200;
/** Plafond d'attente annoncé (le barème de l'extension s'arrête à 1 h). */
const MAX_RETRY_AFTER_SECONDS = 86_400;
const MAX_REQUEST_ID = 0x7fffffff;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Caractères de contrôle, de formatage et de direction (bidi).
const INVISIBLE = new RegExp(
    '[' + '\\u0000-\\u001f' + '\\u007f-\\u009f' + '\\u200b-\\u200f' + '\\u2028-\\u202e' + '\\u2066-\\u2069' + '\\ufeff' + ']',
    'g',
);

/** Port du canal (MessagePort en production). */
export interface ExtensionPort {
    postMessage(message: unknown): void;
    addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
    start(): void;
    close(): void;
}

export interface ExtensionMessageEvent {
    source: unknown;
    origin: string;
    data: unknown;
    ports: readonly ExtensionPort[];
}

/** Fenêtre de la page (window en production). */
export interface ExtensionWindow {
    location: { origin: string };
    postMessage(message: unknown, targetOrigin: string): void;
    addEventListener(type: 'message', listener: (event: ExtensionMessageEvent) => void): void;
    removeEventListener(type: 'message', listener: (event: ExtensionMessageEvent) => void): void;
}

type Op = 'status' | 'has' | 'create' | 'load' | 'remove';

/** Objet simple, y compris venu d'un autre contexte (prototype racine d'un autre monde). */
const isPlain = (v: unknown): v is Record<string, unknown> => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === null || Object.getPrototypeOf(proto) === null;
};
const hasExactly = (o: Record<string, unknown>, keys: readonly string[]) =>
    Object.keys(o).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(o, k));
const isRequestId = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0 && (v as number) <= MAX_REQUEST_ID;

/** Efface la DK d'une réponse qui ne sera remise à personne (tardive, inconnue, mal formée). */
function wipeResponseKey(data: unknown): void {
    if (isPlain(data) && isPlain(data.result) && data.result.dk instanceof ArrayBuffer) new Uint8Array(data.result.dk).fill(0);
}

const KNOWN_CODES: readonly VaultErrorCode[] = ['pin-required', 'wrong-pin', 'locked', 'wiped', 'cancelled', 'unavailable', 'missing'];

/**
 * Messages de l'application. Ceux de l'extension ne sont pas repris : un faux coffre (M7) pourrait
 * y glisser un texte trompeur (« tapez votre PIN ici… »).
 */
export const EXTENSION_MESSAGES: Record<VaultErrorCode, string> = {
    'pin-required': "La fenêtre de l'extension n'a pas reçu de code PIN.",
    'wrong-pin': 'Code PIN incorrect.',
    'locked': "Trop d'essais ou trop de demandes : patientez avant de réessayer.",
    'wiped': "Trop d'essais : l'extension a effacé les clés de cet appareil. Il doit être relié de nouveau.",
    'cancelled': "La demande a été annulée.",
    'unavailable': "Synco Extension ne répond pas : elle est absente, désactivée, ou n'a pas accès à ce site.",
    'missing': "Synco Extension ne contient pas de clé pour cet appareil.",
};

/** Traduit une erreur du protocole ; tout code inconnu (dont bad-request, unsupported-protocol) → unavailable. */
function toVaultError(error: unknown): VaultError {
    const e = isPlain(error) ? error : {};
    const code = KNOWN_CODES.find(c => c === e.code) ?? 'unavailable';
    const raw = e.retryAfterSeconds;
    const retry = (code === 'locked' || code === 'wrong-pin') && typeof raw === 'number' && Number.isFinite(raw) && raw > 0
        ? Math.min(Math.ceil(raw), MAX_RETRY_AFTER_SECONDS) : undefined;
    return new VaultError(code, EXTENSION_MESSAGES[code], retry);
}

const unavailable = (message = EXTENSION_MESSAGES.unavailable) => new VaultError('unavailable', message);

/** Raison affichée dans la fenêtre de l'extension : texte brut d'une ligne, au plus 200 caractères. */
export function extensionReason(reason: string | undefined): string | undefined {
    if (reason === undefined) return undefined;
    const clean = reason.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH);
    return clean === '' ? undefined : clean;
}

interface Pending {
    resolve: (result: unknown) => void;
    reject: (error: VaultError) => void;
}

/**
 * Canal établi par le handshake : requêtes `{ id, op, args }` sur le port, réponses associées par
 * `id`. Un délai dépassé ferme le canal (port mort : extension rechargée, mise à jour, désactivée).
 */
export class ExtensionChannel {
    private readonly port: ExtensionPort;
    private readonly pending = new Map<number, Pending>();
    private nextId = 1;
    private closed = false;
    private closeWhenIdle = false;

    constructor(port: ExtensionPort) {
        this.port = port;
        port.addEventListener('message', (event) => this.onMessage(event.data));
        port.start();
    }

    get isClosed(): boolean {
        return this.closed;
    }

    request(op: Op, args: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<unknown> {
        if (this.closed) return Promise.reject(unavailable());
        if (signal?.aborted) return Promise.reject(new VaultError('cancelled', EXTENSION_MESSAGES.cancelled));
        const id = this.nextId;
        this.nextId = id >= MAX_REQUEST_ID ? 1 : id + 1;

        return new Promise((resolve, reject) => {
            const settle = () => {
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                this.pending.delete(id);
                if (this.closeWhenIdle && this.pending.size === 0) this.close();
            };
            const onAbort = () => { settle(); reject(new VaultError('cancelled', EXTENSION_MESSAGES.cancelled)); };
            const timer = setTimeout(() => {
                settle();
                this.close();
                reject(unavailable("Synco Extension ne répond plus. Si elle vient d'être mise à jour, rechargée ou désactivée, rechargez la page."));
            }, timeoutMs);
            signal?.addEventListener('abort', onAbort, { once: true });
            this.pending.set(id, {
                resolve: (result) => { settle(); resolve(result); },
                reject: (error) => { settle(); reject(error); },
            });
            try {
                this.port.postMessage({ id, op, args });
            } catch {
                settle();
                this.close();
                reject(unavailable());
            }
        });
    }

    private onMessage(data: unknown): void {
        const pending = isPlain(data) && isRequestId(data.id) ? this.pending.get(data.id) : undefined;
        if (!pending || !isPlain(data)) { wipeResponseKey(data); return; }
        if (data.ok === true && 'result' in data) pending.resolve(data.result);
        else if (data.ok === false) pending.reject(toVaultError(data.error));
        else { wipeResponseKey(data); pending.reject(unavailable()); }
    }

    /** Ferme le canal dès qu'aucune requête n'y est plus en cours. */
    retire(): void {
        if (this.pending.size === 0) this.close();
        else this.closeWhenIdle = true;
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        const waiting = [...this.pending.values()];
        this.pending.clear();
        for (const p of waiting) p.reject(unavailable());
        try { this.port.close(); } catch { /* port déjà fermé */ }
    }
}

const detecting = new WeakMap<object, Promise<ExtensionChannel | null>>();

/**
 * Handshake : `hello` envoyé à l'origine de la page (jamais '*'), `ready` accepté seulement s'il
 * vient de cette fenêtre, de cette origine, avec exactement la forme attendue et un seul port.
 * Renvoie `null` sans réponse dans le délai, ou sur `unsupported`. Ne bloque jamais au-delà du délai.
 */
export function detectExtension(win: ExtensionWindow, timeoutMs = DETECT_TIMEOUT_MS): Promise<ExtensionChannel | null> {
    const running = detecting.get(win);
    if (running) return running;

    const result = new Promise<ExtensionChannel | null>((resolve) => {
        let done = false;
        const finish = (channel: ExtensionChannel | null) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            win.removeEventListener('message', onMessage);
            resolve(channel);
        };
        const onMessage = (event: ExtensionMessageEvent) => {
            if (event.source !== win || event.origin !== win.location.origin) return;
            const d = event.data;
            if (!isPlain(d) || d.source !== 'synco-extension') return;
            const ports = Array.isArray(event.ports) ? event.ports : [];
            const shaped = hasExactly(d, ['source', 'type', 'protocol']);
            if (shaped && d.type === 'ready' && d.protocol === EXTENSION_PROTOCOL && ports.length === 1) {
                finish(new ExtensionChannel(ports[0]!));
                return;
            }
            if (shaped && d.type === 'unsupported' && ports.length === 0) {
                finish(null);
                return;
            }
            // Réponse mal formée : ignorée (la vraie peut encore arriver), ses ports fermés.
            for (const p of ports) { try { p.close(); } catch { /* ignoré */ } }
        };
        win.addEventListener('message', onMessage);
        const timer = setTimeout(() => finish(null), timeoutMs);
        try {
            win.postMessage({ source: 'synco-page', type: 'hello', protocol: EXTENSION_PROTOCOL }, win.location.origin);
        } catch {
            finish(null);
        }
    });
    detecting.set(win, result);
    void result.then(() => { if (detecting.get(win) === result) detecting.delete(win); });
    return result;
}

export interface ExtensionVaultOptions {
    win: ExtensionWindow;
    detectTimeoutMs?: number;
    shortTimeoutMs?: number;
    promptTimeoutMs?: number;
}

/** Copie DK hors du tampon reçu, puis efface ce tampon dans tous les cas. */
function takeDk(result: unknown): Uint8Array {
    const raw = isPlain(result) ? result.dk : undefined;
    if (!(raw instanceof ArrayBuffer)) throw unavailable("Synco Extension a renvoyé une clé invalide.");
    const received = new Uint8Array(raw);
    try {
        if (received.length !== DK_LENGTH) throw unavailable("Synco Extension a renvoyé une clé invalide.");
        return new Uint8Array(received);
    } finally {
        received.fill(0);
    }
}

function checkDeviceId(deviceId: string): void {
    if (!UUID.test(deviceId)) throw unavailable("Identifiant d'appareil invalide pour Synco Extension.");
}

export class ExtensionVault implements DeviceVault {
    readonly capabilities = { kind: 'extension', hardwareBacked: false, biometric: false, needsPin: false, rateLimit: 'software' } as const;

    private readonly win: ExtensionWindow;
    private readonly detectTimeoutMs: number;
    private readonly shortTimeoutMs: number;
    private readonly promptTimeoutMs: number;
    private channel: ExtensionChannel | null = null;

    constructor(opts: ExtensionVaultOptions) {
        this.win = opts.win;
        this.detectTimeoutMs = opts.detectTimeoutMs ?? DETECT_TIMEOUT_MS;
        this.shortTimeoutMs = opts.shortTimeoutMs ?? SHORT_TIMEOUT_MS;
        this.promptTimeoutMs = opts.promptTimeoutMs ?? PROMPT_TIMEOUT_MS;
    }

    /** Un handshake répond-il ? « Extension détectée », jamais « vérifiée » (M7). */
    async detect(): Promise<boolean> {
        return (await this.handshake()) !== null;
    }

    private async handshake(): Promise<ExtensionChannel | null> {
        const channel = await detectExtension(this.win, this.detectTimeoutMs);
        if (channel && channel !== this.channel) {
            this.channel?.retire();
            this.channel = channel;
        }
        return channel;
    }

    private async current(): Promise<ExtensionChannel> {
        if (this.channel && !this.channel.isClosed) return this.channel;
        const channel = await this.handshake();
        if (!channel) throw unavailable();
        return channel;
    }

    /** Opération courte ; un port mort est remplacé par un nouveau handshake, une seule fois. */
    private async short(op: Op, args: Record<string, unknown>): Promise<unknown> {
        const channel = await this.current();
        try {
            return await channel.request(op, args, this.shortTimeoutMs);
        } catch (e) {
            if (!channel.isClosed) throw e;
            return (await this.current()).request(op, args, this.shortTimeoutMs);
        }
    }

    /**
     * Opération avec saisie du PIN : toujours sur un canal fraîchement établi, pour ne pas attendre
     * 150 s sur un port mort. Jamais relancée d'office (pas de seconde fenêtre de PIN).
     */
    private async prompt(op: 'create' | 'load', deviceId: string, ctx?: VaultContext): Promise<Uint8Array> {
        checkDeviceId(deviceId);
        if (ctx?.signal?.aborted) throw new VaultError('cancelled', EXTENSION_MESSAGES.cancelled);
        const channel = await this.handshake();
        if (!channel) throw unavailable();
        const reason = extensionReason(ctx?.reason);
        const result = await channel.request(op, reason === undefined ? { deviceId } : { deviceId, reason }, this.promptTimeoutMs, ctx?.signal);
        return takeDk(result);
    }

    create(deviceId: string, ctx?: VaultContext): Promise<Uint8Array> {
        return this.prompt('create', deviceId, ctx);
    }

    load(deviceId: string, ctx?: VaultContext): Promise<Uint8Array> {
        return this.prompt('load', deviceId, ctx);
    }

    async remove(deviceId: string): Promise<void> {
        checkDeviceId(deviceId);
        await this.short('remove', { deviceId });
    }

    async has(deviceId: string): Promise<boolean> {
        checkDeviceId(deviceId);
        const result = await this.short('has', { deviceId });
        if (!isPlain(result) || typeof result.exists !== 'boolean') throw unavailable();
        return result.exists;
    }
}
