import { get, set } from 'idb-keyval';
import { user } from '@/assets/var';

/**
 * Épinglage des clés symétriques (salon, espace, DM, session IA) par
 * contexte et version — audit FC4 §1.
 *
 * Un scellé RSA-OAEP garantit la confidentialité, pas l'origine : n'importe
 * qui connaissant notre clé publique peut nous sceller une clé de son choix,
 * et le client basculait en silence sur toute nouvelle clé servie (ThreadView
 * redéchiffrait l'historique avec). Désormais la première clé vue pour un
 * (contexte, version) est épinglée ; une clé différente ensuite est refusée
 * (KeyChangedError) et ne sert ni à lire ni à écrire, jusqu'à une décision
 * explicite de l'utilisateur (repinKey).
 *
 * Limite assumée : une clé fausse servie dès le tout premier accès est
 * épinglée (TOFU). Seule une signature de l'émetteur (FC4 §2) la détecterait.
 */

export type KeyContext = `space:${string}` | `thread:${string}` | `dm:${string}` | `ai:${string}`;

export class KeyChangedError extends Error {
    readonly context: KeyContext;
    readonly version: number;
    constructor(context: KeyContext, version: number) {
        super("La clé de chiffrement de cette conversation a été remplacée de manière inattendue. Par sécurité, elle n'est pas utilisée.");
        this.name = 'KeyChangedError';
        this.context = context;
        this.version = version;
    }
}

const slot = (ctx: KeyContext, version: number) => `key-pin:${user.value?.id ?? 'anon'}:${ctx}:v${version}`;

async function rawOf(key: CryptoKey | ArrayBuffer): Promise<ArrayBuffer> {
    return key instanceof ArrayBuffer ? key : crypto.subtle.exportKey('raw', key);
}

/** Engagement sur la clé, lié à son contexte : SHA-256("synco-key-commit-v1|ctx|v|" ‖ clé). */
export async function keyCommitment(key: CryptoKey | ArrayBuffer, ctx: KeyContext, version: number): Promise<string> {
    const raw = new Uint8Array(await rawOf(key));
    const label = new TextEncoder().encode(`synco-key-commit-v1|${ctx}|${version}|`);
    const buf = new Uint8Array(label.length + raw.length);
    buf.set(label, 0);
    buf.set(raw, label.length);
    const h = await crypto.subtle.digest('SHA-256', buf);
    buf.fill(0);
    return btoa(String.fromCharCode(...new Uint8Array(h)));
}

/** Premier usage : épingle. Ensuite : toute clé différente pour (ctx, version) lève KeyChangedError. */
export async function pinOrCheckKey(key: CryptoKey | ArrayBuffer, ctx: KeyContext, version: number): Promise<void> {
    const commit = await keyCommitment(key, ctx, version);
    const pinned = await get<string>(slot(ctx, version));
    if (!pinned) {
        await set(slot(ctx, version), commit);
        return;
    }
    if (pinned !== commit) throw new KeyChangedError(ctx, version);
}

/** Accepte explicitement une nouvelle clé (décision de l'utilisateur, après vérification). */
export async function repinKey(key: CryptoKey | ArrayBuffer, ctx: KeyContext, version: number): Promise<void> {
    await set(slot(ctx, version), await keyCommitment(key, ctx, version));
}
