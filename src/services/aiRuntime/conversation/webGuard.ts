/**
 * Confirmation d'un appel web du runtime (synco_ai_runtime/docs/plan/10 §4.4 ; PC93). Le worker n'envoie rien
 * et attend l'accord de l'utilisateur ; le `pendingToolCall` porte un champ `guard` chiffré sous `CK`
 * (`gcm1:`, AAD `sessionId:<toolCallId>:web_guard`), clair `{ v: 1, reasons, spans }`, positions en unités
 * UTF-16 dans la chaîne affichée (requête, ou URL complète). Lecture rétrocompatible : sans `guard`, la carte
 * reste une confirmation sans motif. Texte seulement : aucun HTML, aucun lien.
 */
import { decryptAiFieldStrict } from '@/assets/utils/aiActionPlan';

export const WEB_GUARD_TOOLS: readonly string[] = ['web_search', 'web_fetch'];
export const isWebGuardTool = (name: string): boolean => WEB_GUARD_TOOLS.includes(name);

export type GuardReason = 'e2ee_passage' | 'e2ee_token' | 'member_name' | 'guard_saturated' | 'url_provenance';

const REASON_TEXT: Record<GuardReason, string> = {
    e2ee_passage: 'contient un passage d’un message ou d’un fichier chiffré lu dans cette conversation',
    e2ee_token: 'contient une donnée rare lue dans Synco (adresse e-mail, numéro, identifiant, lien interne)',
    member_name: 'contient le nom d’un membre de votre organisation',
    guard_saturated: 'l’agent a lu trop de contenu pour le vérifier : chaque envoi vous est montré',
    url_provenance: 'adresse qui ne vient ni d’une recherche ni de vous',
};

export interface GuardSpan { start: number; end: number }
export interface WebGuard { reasons: GuardReason[]; spans: GuardSpan[] }
export interface GuardSegment { text: string; marked: boolean }

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isReason = (v: unknown): v is GuardReason => typeof v === 'string' && Object.prototype.hasOwnProperty.call(REASON_TEXT, v);

/** Clair du champ `guard` ; motifs inconnus ignorés, positions invalides écartées ; `null` si illisible. */
export function parseGuard(clear: string): WebGuard | null {
    let v: unknown;
    try {
        v = JSON.parse(clear);
    } catch {
        return null;
    }
    if (!isRec(v) || v.v !== 1 || !Array.isArray(v.reasons)) return null;
    const reasons = v.reasons.filter(isReason).slice(0, 5);
    const spans = (Array.isArray(v.spans) ? v.spans : [])
        .filter(isRec)
        .map(s => ({ start: s.start, end: s.end }))
        .filter((s): s is GuardSpan => Number.isSafeInteger(s.start) && Number.isSafeInteger(s.end) && (s.start as number) >= 0 && (s.end as number) > (s.start as number))
        .slice(0, 50);
    return { reasons, spans };
}

export const guardReasonText = (r: GuardReason): string => REASON_TEXT[r];

/** Découpe `text` en passages soulignés ou non (positions UTF-16, chevauchements fusionnés, bornées au texte). */
export function guardSegments(text: string, spans: readonly GuardSpan[]): GuardSegment[] {
    const sorted = spans
        .map(s => ({ start: Math.min(s.start, text.length), end: Math.min(s.end, text.length) }))
        .filter(s => s.end > s.start)
        .sort((a, b) => a.start - b.start);
    const merged: GuardSpan[] = [];
    for (const s of sorted) {
        const last = merged[merged.length - 1];
        if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
        else merged.push({ ...s });
    }
    const out: GuardSegment[] = [];
    let at = 0;
    for (const s of merged) {
        if (s.start > at) out.push({ text: text.slice(at, s.start), marked: false });
        out.push({ text: text.slice(s.start, s.end), marked: true });
        at = s.end;
    }
    if (at < text.length || !out.length) out.push({ text: text.slice(at), marked: false });
    return out;
}

/**
 * Chaîne que le worker a contrôlée et que les positions désignent : la requête telle quelle, ou l'URL sous sa
 * forme WHATWG (même sérialisation que la crate `url` du worker). `null` si l'argument manque.
 */
export function guardedText(name: string, args: unknown): string | null {
    const a = isRec(args) ? args : {};
    if (name === 'web_search') return typeof a.query === 'string' ? a.query : null;
    if (name === 'web_fetch') {
        if (typeof a.url !== 'string') return null;
        try {
            return new URL(a.url).href;
        } catch {
            return a.url;
        }
    }
    return null;
}

export interface GuardSources {
    /** `pendingToolCall` de la conversation, lu par l'API (chiffré). */
    fetchPending(): Promise<unknown>;
    /** Clé `CK` de la conversation. */
    openKey(): Promise<CryptoKey>;
}

/**
 * Motifs de la garde de l'appel `toolCallId` : lus dans le `pendingToolCall` de l'API, déchiffrés sous `CK`.
 * `null` : pas de garde (ancien worker, appel différent) ; lève si le champ est présent mais illisible.
 */
export async function loadWebGuard(src: GuardSources, sessionId: string, toolCallId: string): Promise<WebGuard | null> {
    const pending = await src.fetchPending();
    if (!isRec(pending) || pending.id !== toolCallId || typeof pending.guard !== 'string') return null;
    const clear = pending.guard.startsWith('gcm1:')
        ? await decryptAiFieldStrict(await src.openKey(), sessionId, toolCallId, 'web_guard', pending.guard)
        : null;
    const g = clear === null ? null : parseGuard(clear);
    if (!g) throw new Error('web_guard_unreadable');
    return g;
}
