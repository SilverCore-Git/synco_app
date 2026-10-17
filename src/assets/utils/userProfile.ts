import type { ProfileBlock, ProfileBlockType, UserProfile } from '@/types/types';

/**
 * Profil professionnel en blocs — miroir client de synco_api
 * src/utils/userProfile.ts (mêmes limites, même filtrage par org).
 * Le serveur reste seul garant de la confidentialité : il ne sert déjà aux
 * autres membres que les blocs visibles dans leur org. Le filtrage ici ne
 * sert qu'à l'aperçu « vu depuis telle org » des paramètres.
 */

export const MAX_BLOCKS = 20;
export const MAX_ITEMS = 30;

export interface BlockMeta {
    label: string;
    icon: string;
    hint: string;
    addLabel: string;
}

export const BLOCK_META: Record<ProfileBlockType, BlockMeta> = {
    positions: { label: 'Postes', icon: 'bi bi-briefcase-fill', hint: 'Vos fonctions, dans une ou plusieurs organisations', addLabel: 'Ajouter un poste' },
    skills: { label: 'Spécialités', icon: 'bi bi-stars', hint: 'Ce sur quoi vos collègues peuvent vous solliciter', addLabel: 'Ajouter' },
    projects: { label: 'Projets & responsabilités', icon: 'bi bi-kanban-fill', hint: 'Ce dont vous êtes responsable ou référent', addLabel: 'Ajouter un projet' },
    languages: { label: 'Langues', icon: 'bi bi-translate', hint: 'Les langues dans lesquelles on peut travailler avec vous', addLabel: 'Ajouter une langue' },
    links: { label: 'Liens', icon: 'bi bi-link-45deg', hint: 'Portfolio, dépôt de code, profil professionnel…', addLabel: 'Ajouter un lien' },
    custom: { label: 'Section libre', icon: 'bi bi-card-text', hint: 'Bureau, horaires, référent RH… à vous de choisir', addLabel: 'Ajouter un champ' },
};

export const BLOCK_ORDER: ProfileBlockType[] = ['positions', 'skills', 'projects', 'languages', 'links', 'custom'];

export const SKILL_LEVELS = [
    { id: 'notions', label: 'Notions' },
    { id: 'confirme', label: 'Confirmé' },
    { id: 'expert', label: 'Expert' },
] as const;

export const LANGUAGE_LEVELS = [
    { id: 'notions', label: 'Notions' },
    { id: 'professionnel', label: 'Professionnel' },
    { id: 'courant', label: 'Courant' },
    { id: 'natif', label: 'Langue maternelle' },
] as const;

export const PROJECT_ROLES = ['Responsable', 'Référent', 'Contributeur', 'Sponsor'];

export const newId = () => crypto.randomUUID();

export function emptyProfile(): UserProfile {
    return { version: 1, blocks: [] };
}

export function newBlock(type: ProfileBlockType): ProfileBlock {
    return { id: newId(), type, orgIds: null, items: [] } as ProfileBlock;
}

export function blockTitle(block: ProfileBlock): string {
    return block.title || BLOCK_META[block.type].label;
}

export function profileForOrg(profile: UserProfile | undefined, orgId: string | null): UserProfile {
    if (!profile) return emptyProfile();
    return {
        version: 1,
        blocks: profile.blocks.filter(b => b.orgIds === null || (orgId !== null && b.orgIds.includes(orgId))),
    };
}

export function profileHeadline(profile: UserProfile | undefined): string | null {
    if (!profile) return null;
    const positions = profile.blocks.flatMap(b => (b.type === 'positions' ? b.items : []));
    return (positions.find(p => p.primary) ?? positions[0])?.title ?? null;
}

/**
 * Nettoie avant envoi : retire les entrées laissées vides (le serveur les
 * refuserait) et les blocs sans entrée.
 */
export function cleanProfile(profile: UserProfile): UserProfile {
    const blocks = profile.blocks.map(raw => {
        // Champs facultatifs vidés (ex. <input type="month"> effacé → '') :
        // le serveur les refuserait au lieu de les ignorer.
        const b = {
            ...raw,
            title: raw.title?.trim() || undefined,
            items: (raw.items as unknown as Record<string, unknown>[]).map(item =>
                Object.fromEntries(Object.entries(item).filter(([, v]) => v !== '' && v !== undefined && v !== null))),
        } as unknown as ProfileBlock;
        switch (b.type) {
            case 'positions': return { ...b, items: b.items.filter(i => i.title?.trim()) };
            case 'skills': return { ...b, items: b.items.filter(i => i.label?.trim()) };
            case 'projects': return { ...b, items: b.items.filter(i => i.name?.trim()).map(i => (i.url ? { ...i, url: normalizeUrl(i.url) } : i)) };
            case 'languages': return { ...b, items: b.items.filter(i => i.label?.trim()) };
            case 'links': return { ...b, items: b.items.filter(i => i.label?.trim() && i.url?.trim()).map(i => ({ ...i, url: normalizeUrl(i.url) })) };
            case 'custom': return { ...b, items: b.items.filter(i => i.label?.trim() && i.value?.trim()) };
        }
    }) as ProfileBlock[];
    return { version: 1, blocks: blocks.filter(b => b.items.length > 0) };
}

/** Lien saisi sans schéma (« github.com/moi ») : on préfixe https://. */
export function normalizeUrl(url: string): string {
    const v = url.trim();
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function isSafeUrl(url: string | undefined): url is string {
    return !!url && /^https?:\/\//i.test(url);
}

export function formatSince(since?: string): string | null {
    if (!since) return null;
    const [y, m] = since.split('-');
    if (!m) return `Depuis ${y}`;
    const d = new Date(Number(y), Number(m) - 1, 1);
    return `Depuis ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
}
