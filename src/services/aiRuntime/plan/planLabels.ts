/**
 * Intitulés des actions d'un plan (12 §17) : GÉNÉRÉS PAR L'APP à partir de `kind`, de `tool` et des
 * arguments, jamais à partir du texte libre du modèle (`summary` est montré à part, en citation). Les
 * valeurs insérées (noms, titres) sont nettoyées (contrôles et marques bidi retirés, longueur bornée)
 * et ne sont jamais interprétées comme du HTML : les composants les affichent en texte.
 */
import { parseArgRef, type JsonObject, type JsonValue } from '@/assets/utils/aiActionPlan';

export type ResolveKind = 'space' | 'category' | 'folder' | 'thread' | 'user';

/** Résolution des identifiants dans l'annuaire LOCAL de l'org ; `null` = inconnu de l'espace. */
export interface NameResolver {
    resolve(kind: ResolveKind, id: string): string | null;
}

export const noResolver: NameResolver = { resolve: () => null };

// Contrôles C0/C1, séparateurs de ligne et marques bidirectionnelles (usurpation d'affichage).
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

export function cleanText(value: unknown, max = 60): string {
    const s = typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    const flat = s.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim();
    const chars = [...flat];
    return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}

const q = (v: unknown, max = 60): string => `« ${cleanText(v, max)} »`;

const FIELD_KIND: Record<string, ResolveKind> = {
    spaceId: 'space', categoryId: 'category', parentFolderId: 'folder', folderId: 'folder', threadId: 'thread',
    assigneeId: 'user', userId: 'user', assignees: 'user', assigneeIds: 'user', userIds: 'user',
};

const FIELD_LABEL: Record<string, string> = {
    name: 'Nom', type: 'Type', spaceId: 'Espace', categoryId: 'Catégorie', parentFolderId: 'Dans le dossier', folderId: 'Dossier',
    content: 'Contenu', title: 'Titre', description: 'Description', dueDate: 'Échéance', assignees: 'Assignés', assigneeIds: 'Assignés',
    assigneeId: 'Assigné à', threadId: 'Salon', userId: 'Personne', userIds: 'Personnes', to: 'Destinataire', recipients: 'Destinataires',
    subject: 'Objet', status: 'État',
};

export interface ArgLine {
    field: string;
    label: string;
    /** Valeur lisible, déjà nettoyée. */
    text: string;
    /** Identifiant que l'annuaire local ne connaît pas (nom en ambre). */
    unknown: boolean;
}

/** Numéro `m` d'une référence `$m.champ`, ou `null`. */
const refAction = (v: JsonValue | undefined): number | null => (typeof v === 'string' ? parseArgRef(v)?.m ?? null : null);

/** Lieu lisible d'une action : « Chantiers » ou « Chantiers › Tilleuls ». */
export function placeOf(args: JsonObject, r: NameResolver, argsRefs?: JsonObject): { text: string; unknown: boolean } | null {
    const space = typeof args.spaceId === 'string' ? args.spaceId : null;
    const cat = typeof args.categoryId === 'string' ? args.categoryId : null;
    const parts: string[] = [];
    let unknown = false;
    // Cible passée par référence : l'objet n'existe pas encore, il sera créé par l'action `m`.
    const spaceRef = refAction(argsRefs?.spaceId);
    const catRef = refAction(argsRefs?.categoryId);
    if (spaceRef !== null) parts.push(`dans l’espace créé par l’action ${spaceRef}`);
    if (catRef !== null) parts.push(`dans la catégorie créée par l’action ${catRef}`);
    if (space) {
        const n = r.resolve('space', space);
        if (n) parts.push(cleanText(n, 40)); else { parts.push('espace inconnu'); unknown = true; }
    }
    if (cat) {
        const n = r.resolve('category', cat);
        if (n) parts.push(cleanText(n, 40)); else { parts.push('catégorie inconnue'); unknown = true; }
    }
    return parts.length ? { text: parts.join(' › '), unknown } : null;
}

const asList = (v: JsonValue | undefined): JsonValue[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);

/** Arguments lisibles du volet de détail. */
export function argLines(args: JsonObject, r: NameResolver, argsRefs?: JsonObject): ArgLine[] {
    const out: ArgLine[] = [];
    for (const [field, value] of Object.entries(argsRefs ?? {})) {
        const m = refAction(value);
        if (m !== null) out.push({ field, label: FIELD_LABEL[field] ?? cleanText(field, 30), text: `créé par l’action ${m}`, unknown: false });
    }
    for (const [field, value] of Object.entries(args)) {
        const kind = FIELD_KIND[field];
        const label = FIELD_LABEL[field] ?? cleanText(field, 30);
        if (kind) {
            const names: string[] = [];
            let unknown = false;
            for (const id of asList(value)) {
                if (typeof id !== 'string') continue;
                const n = r.resolve(kind, id);
                if (n) names.push(cleanText(n, 40)); else { names.push(kind === 'user' ? 'personne hors de l’espace' : 'inconnu'); unknown = true; }
            }
            out.push({ field, label, text: names.join(', '), unknown });
        } else {
            out.push({ field, label, text: cleanText(typeof value === 'object' ? JSON.stringify(value) : value, 200), unknown: false });
        }
    }
    return out;
}

const SERVER_TEMPLATES: Record<string, (a: JsonObject) => string> = {
    create_task: a => `Créer la tâche ${q(a.title)}`,
    update_task: a => `Modifier la tâche ${q(a.title ?? a.taskId)}`,
    complete_task: () => 'Marquer une tâche comme terminée',
    delete_task: () => 'Supprimer une tâche',
    create_space: a => `Créer l’espace ${q(a.name)}`,
    update_space: a => `Modifier l’espace ${q(a.name ?? a.spaceId)}`,
    create_email_report: () => 'Envoyer un rapport par e-mail',
};

/** Intitulé d'une action, de la forme « Créer le salon #budget » (12 §17). */
export function actionLabel(kind: string, tool: string | undefined, args: JsonObject): string {
    switch (kind) {
        case 'category.create': return `Créer la catégorie ${q(args.name)}`;
        case 'thread.create': return `Créer le salon ${args.type === 'voice' ? 'vocal ' : ''}#${cleanText(args.name, 40)}`;
        case 'folder.create': return `Créer le dossier ${q(args.name)}`;
        case 'file.create_text': return `Créer le fichier ${cleanText(args.name, 50)}`;
        case 'server.call': {
            const t = tool ?? '';
            const tpl = SERVER_TEMPLATES[t];
            if (tpl) return tpl(args);
            if (t.startsWith('delete_')) return `Supprimer (${cleanText(t, 40)})`;
            return `Appeler l’outil ${cleanText(t, 40)}`;
        }
        default: return 'Action inconnue';
    }
}

export const KIND_ICON: Record<string, string> = {
    'category.create': 'bi-folder-plus', 'thread.create': 'bi-hash', 'folder.create': 'bi-folder-plus',
    'file.create_text': 'bi-file-earmark-text', 'server.call': 'bi-lightning-charge',
};

/** Puce de synthèse de la carte (« 3 salons ») : nom et pluriel par type d'action. */
export function kindChip(kind: string, tool: string | undefined, count: number): string {
    const p = (one: string, many: string) => `${count} ${count > 1 ? many : one}`;
    switch (kind) {
        case 'category.create': return p('catégorie', 'catégories');
        case 'thread.create': return p('salon', 'salons');
        case 'folder.create': return p('dossier', 'dossiers');
        case 'file.create_text': return p('fichier', 'fichiers');
        default:
            if (tool === 'create_task') return p('tâche', 'tâches');
            if (tool === 'create_email_report') return p('e-mail', 'e-mails');
            return p('action serveur', 'actions serveur');
    }
}
