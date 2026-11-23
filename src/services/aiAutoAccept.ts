/**
 * « Toujours accepter » (PC42, 12 §11) : réglage LOCAL de l'app (`autoAcceptTools`), jamais côté serveur.
 * Une entrée est un type d'action (`thread.create`…) ou `server.call:<outil>`. Une action sensible n'y
 * entre jamais : suppression (`delete_*`) ou envoi hors de Synco (`create_email_report`).
 */
import { computed, type ComputedRef } from 'vue';
import useSettingsItem from '@/composables/useSettingsItem';

const KEY = /^[a-z][a-z0-9_.]{0,63}(:[a-z][a-z0-9_]{0,63})?$/;
const MAX_ENTRIES = 100;

const toolOf = (key: string): string | null => (key.startsWith('server.call:') ? key.slice('server.call:'.length) : null);

export function isSensitiveAutoAcceptKey(key: string): boolean {
    const tool = toolOf(key);
    if (tool === null) return false;
    return tool.startsWith('delete_') || tool === 'create_email_report';
}

/** Lecture tolérante du réglage stocké : ignore le malformé, le sensible et les doublons. */
export function parseAutoAccept(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const v of raw) {
        if (typeof v === 'string' && KEY.test(v) && !isSensitiveAutoAcceptKey(v) && !out.includes(v)) out.push(v);
        if (out.length >= MAX_ENTRIES) break;
    }
    return out;
}

/** Ajout refusé (`false`) pour une action sensible : la protection ne dépend pas de l'écran. */
export function addAutoAccept(list: readonly string[], key: string): string[] | false {
    if (!KEY.test(key) || isSensitiveAutoAcceptKey(key)) return false;
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
    const tool = toolOf(key);
    const text = (tool ?? key).replace(/[_.]/g, ' ');
    return { label: text.charAt(0).toUpperCase() + text.slice(1), icon: 'bi-check2-circle' };
}

/** Liste réactive (réglage synchronisé du compte) ; le retrait est écrit tout de suite. */
export function useAutoAcceptTools(orgId: () => string): { list: ComputedRef<string[]>; remove: (key: string) => void } {
    const item = (id: string) => useSettingsItem(`ai_auto_accept_${id}`, []);
    const list = computed(() => (orgId() ? parseAutoAccept(item(orgId()).Item.value) : []));
    const remove = (key: string) => { if (orgId()) item(orgId()).Item.value = removeAutoAccept(list.value, key); };
    return { list, remove };
}
