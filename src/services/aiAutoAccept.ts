/**
 * « Toujours accepter » (PC42, 12 §11) : réglage LOCAL de l'app (`autoAcceptTools`), jamais côté serveur.
 * Une entrée est un type d'action (`thread.create`…) ou `server.call:<outil>`. Seules les actions de la
 * liste blanche y entrent : jamais une suppression ni un envoi hors de Synco, quel que soit leur nom.
 */
import { computed, type ComputedRef } from 'vue';
import useSettingsItem from '@/composables/useSettingsItem';
import { planKindDescription } from '@/services/aiRuntime/planKinds';

const KEY = /^[a-z][a-z0-9_.]{0,63}(:[a-z][a-z0-9_]{0,63})?$/;
const MAX_ENTRIES = 100;

const toolOf = (key: string): string | null => (key.startsWith('server.call:') ? key.slice('server.call:'.length) : null);

/**
 * LISTE BLANCHE des types d'action admis : une clé inconnue est refusée (jamais l'inverse : un motif de
 * noms sensibles laisserait passer `remove_*`, `send_*`…). Le manifeste des outils ne porte pas encore de
 * drapeau « sensible » : s'il en porte un, il l'emporte (voir `isAutoAcceptable`).
 */
const ADMITTED_ACTIONS: readonly string[] = ['category.create', 'thread.create', 'folder.create', 'file.create_text'];
const ADMITTED_SERVER_TOOLS: readonly string[] = ['create_task', 'update_task', 'complete_task', 'create_space', 'create_thread', 'create_file', 'create_folder'];

export interface ManifestFlags { name: string; sensitive?: boolean }

/** Admise dans « Toujours accepter » : dans la liste blanche ET non marquée sensible par le manifeste. */
export function isAutoAcceptable(key: string, manifest: readonly ManifestFlags[] = []): boolean {
    if (!KEY.test(key)) return false;
    const tool = toolOf(key);
    if (tool === null) return ADMITTED_ACTIONS.includes(key);
    if (!ADMITTED_SERVER_TOOLS.includes(tool)) return false;
    return !manifest.some(t => t.name === tool && t.sensitive === true);
}

export const isSensitiveAutoAcceptKey = (key: string, manifest: readonly ManifestFlags[] = []): boolean => !isAutoAcceptable(key, manifest);

/** Lecture tolérante du réglage stocké : ignore le malformé, le sensible et les doublons. */
export function parseAutoAccept(input: unknown): string[] {
    // Le réglage du compte n'accepte que chaîne, booléen ou nombre : la liste y est stockée en JSON.
    let raw: unknown = input;
    if (typeof input === 'string') {
        try { raw = JSON.parse(input); } catch { return []; }
    }
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        if (typeof v === 'string' && isAutoAcceptable(v) && !out.includes(v)) out.push(v);
        if (out.length >= MAX_ENTRIES) break;
    }
    return out;
}

/** Ajout refusé (`false`) pour une action sensible : la protection ne dépend pas de l'écran. */
export function addAutoAccept(list: readonly string[], key: string, manifest: readonly ManifestFlags[] = []): string[] | false {
    if (!isAutoAcceptable(key, manifest)) return false;
    return list.includes(key) ? [...list] : [...list, key].slice(-MAX_ENTRIES);
}

export const removeAutoAccept = (list: readonly string[], key: string): string[] => list.filter(k => k !== key);

const LABELS: Record<string, { label: string; icon: string }> = {
    'category.create': { label: "Création d'une catégorie", icon: 'bi-folder-plus' },
    'thread.create': { label: "Création d'un salon", icon: 'bi-chat-left-text' },
    'folder.create': { label: "Création d'un dossier", icon: 'bi-folder-plus' },
    'file.create_text': { label: "Création d'un fichier texte", icon: 'bi-file-earmark-plus' },
};

export function autoAcceptLabel(key: string): { label: string; icon: string } {
    const known = LABELS[key];
    if (known) return known;
    const declared = planKindDescription(key);
    if (declared?.title) return { label: declared.title, icon: declared.icon ?? 'bi-check2-circle' };
    const tool = toolOf(key);
    const text = (tool ?? key).replace(/[_.]/g, ' ');
    return { label: text.charAt(0).toUpperCase() + text.slice(1), icon: 'bi-check2-circle' };
}

/** Liste réactive (réglage synchronisé du compte) ; le retrait est écrit tout de suite. */
export function useAutoAcceptTools(orgId: () => string): { list: ComputedRef<string[]>; remove: (key: string) => void } {
    const item = (id: string) => useSettingsItem(`ai_auto_accept_${id}`, '[]');
    const list = computed(() => (orgId() ? parseAutoAccept(item(orgId()).Item.value) : []));
    const remove = (key: string) => { if (orgId()) item(orgId()).Item.value = JSON.stringify(removeAutoAccept(list.value, key)); };
    return { list, remove };
}
