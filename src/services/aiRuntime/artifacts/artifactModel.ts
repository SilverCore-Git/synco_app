/**
 * Fichiers envoyés par l'agent (PC72, PC77). Le format de stockage des artefacts n'est pas encore dans la
 * spec (13) : l'app ne connaît qu'une INTERFACE de source ; `artifactSource.ts` (L12b) la branche sur
 * `…/artifacts/:id` déchiffré sous `CK`. Ici : nom assaini, empreinte vérifiée, rendu Markdown sans HTML.
 */
import { cleanText } from '../plan/planLabels';

export interface ArtifactMeta {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    /** SHA-256 hexadécimal du contenu clair, annoncé par l'agent. */
    sha256: string;
}

export interface ArtifactSource {
    /** Contenu clair (déjà déchiffré sous `CK`), ou rejette si illisible. */
    read(id: string): Promise<Uint8Array>;
}

export class ArtifactUnreadableError extends Error {
    constructor() { super('artifact_unreadable'); this.name = 'ArtifactUnreadableError'; }
}

/** Nom affichable et enregistrable : pas de chemin, de contrôle ni de marque bidi, jamais vide. */
export function sanitizeArtifactName(raw: string): string {
    const base = raw.replace(/^.*[\\/]/, '');
    const clean = cleanText(base, 120).replace(/[:*?"<>|]+/g, '-').replace(/^\.+/, '').trim();
    return clean || 'fichier';
}

const hex = (buf: ArrayBuffer): string => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Vérifie l'empreinte annoncée (simple hachage SHA-256 de la plateforme, aucune crypto maison). */
export async function artifactMatches(bytes: Uint8Array, sha256: string): Promise<boolean> {
    const copy = new Uint8Array(bytes);
    // Hexadécimal minuscule exigé (13 §3) : une empreinte en majuscules est refusée, pas normalisée.
    if (!/^[0-9a-f]{64}$/.test(sha256)) return false;
    return hex(await crypto.subtle.digest('SHA-256', copy)) === sha256;
}

/** Lit l'artefact et vérifie son empreinte ; tout écart est « illisible » (carte grise). */
export async function readVerified(source: ArtifactSource, meta: ArtifactMeta): Promise<Uint8Array> {
    let bytes: Uint8Array;
    try { bytes = await source.read(meta.id); } catch { throw new ArtifactUnreadableError(); }
    if (!(await artifactMatches(bytes, meta.sha256))) throw new ArtifactUnreadableError();
    return bytes;
}

export const isMarkdownName = (name: string): boolean => /\.(md|markdown)$/i.test(name);

// ---------------------------------------------------------------------------
// Markdown minimal vers blocs : rendu par interpolation de texte, jamais de HTML ni de lien actif.
// ---------------------------------------------------------------------------

export type MdBlock =
    | { t: 'h'; level: 1 | 2 | 3; text: string }
    | { t: 'p'; text: string }
    | { t: 'ul'; items: string[] }
    | { t: 'ol'; items: string[] }
    | { t: 'code'; text: string }
    | { t: 'quote'; text: string };

export function parseMarkdown(src: string): MdBlock[] {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const out: MdBlock[] = [];
    let para: string[] = [];
    const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        if (/^```/.test(line)) {
            flush();
            const code: string[] = [];
            for (i++; i < lines.length && !/^```/.test(lines[i]!); i++) code.push(lines[i]!);
            out.push({ t: 'code', text: code.join('\n') });
            continue;
        }
        const h = /^(#{1,3})\s+(.*)$/.exec(line);
        const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
        const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
        const q = /^>\s?(.*)$/.exec(line);
        if (h) { flush(); out.push({ t: 'h', level: h[1]!.length as 1 | 2 | 3, text: h[2]! }); }
        else if (ul || ol) {
            flush();
            const kind = ul ? 'ul' : 'ol';
            const last = out[out.length - 1];
            if (last && last.t === kind) last.items.push((ul ?? ol)![1]!); else out.push({ t: kind, items: [(ul ?? ol)![1]!] });
        } else if (q) { flush(); out.push({ t: 'quote', text: q[1]! }); }
        else if (line.trim() === '') flush();
        else para.push(line.trim());
    }
    flush();
    return out;
}
