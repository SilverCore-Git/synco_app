import { computed, inject, ref, watch, type InjectionKey, type Ref } from 'vue';
import { useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { OrgMember } from '@/types/types';
import {
    buildMentionableList, orgMentionLookup,
    type MentionEntry, type MentionLookup,
} from '@/composables/useMentions';
import {
    buildLocalUserResolutions, seedResolveCache,
    type ExtractedReference, type ReferenceKind,
} from '@/composables/useReferences';

/**
 * D'où viennent les personnes (et références) qu'on peut citer dans une
 * conversation, et comment on résout leurs libellés.
 *
 * Un thread puise dans l'organisation ouverte (membres, rôles, recherche
 * distante des salons/tâches/fichiers) ; un ticket de support n'aura qu'une
 * liste fixe de personnes et aucune référence `#`/`!`/`&`. Les composants de
 * saisie et de rendu (ThreadTextarea, MarkdownRender, ThreadMessage) ne
 * connaissent que cette interface, jamais `openedOrg` ni la route.
 */

/** Une entrée telle que renvoyée par /api/mentions/resolve. */
export interface ResolvedMentionItem {
    type: ReferenceKind;
    id: string;
    ok: boolean;
    label?: string;
    spaceId?: string | null;
}

/** Ce dont le rendu d'un message a besoin (MarkdownRender, surlignage « on me mentionne »). */
export interface MentionRenderSource {
    /** Table token/id → personne : ancien format @pseudo, chips <@:id>, clic vers un profil. */
    lookup: Readonly<Ref<MentionLookup>>;
    /**
     * Résout des tokens <kind:id> en libellés. `null` : la requête a échoué
     * (l'appelant garde alors les tokens bruts). Peut lever : l'appelant
     * journalise.
     */
    resolve: (items: ExtractedReference[]) => Promise<ResolvedMentionItem[] | null>;
    /** Pré-remplit le cache de résolution avec les personnes déjà connues (évite un aller-retour). */
    seedLocal?: () => void;
}

/** Ce dont la saisie a besoin en plus (ThreadTextarea). */
export interface MentionSource extends MentionRenderSource {
    /** Entrées proposées après `@`, filtrées côté client (membres, @everyone/@here, rôles…). */
    entries: Readonly<Ref<MentionEntry[]>>;
    /**
     * Recherche distante pour `#`/`!`/`&` (noms chiffrés côté serveur, pas de
     * filtrage local possible). Absente : ces déclencheurs n'ouvrent rien
     * (références désactivées, ex. support).
     */
    search?: (kind: ReferenceKind, query: string) => Promise<MentionEntry[]>;
    /** Rafraîchit les données qui peuvent changer côté serveur (rôles) — appelé au montage d'un champ. */
    refresh?: () => void;
}

/** Fourni par ChatTimeline à partir de son MessageChannel ; ThreadTextarea l'injecte. */
export const MENTION_SOURCE_KEY: InjectionKey<MentionSource> = Symbol('mentionSource');

// Membres pour lesquels le cache de résolution des mentions @user a déjà été
// pré-rempli : inutile de le refaire pour chaque message tant que la liste
// des membres n'a pas changé. Partagé par toutes les instances (comme le
// cache lui-même).
let seededMembers: OrgMember[] | undefined | null = null;

/** Rendu des mentions de l'organisation ouverte — sans état propre, partageable partout. */
export const orgMentionRenderSource: MentionRenderSource = {
    lookup: orgMentionLookup,

    resolve: async (items) => {
        const orgId = openedOrg.value?.id;
        if (!orgId || items.length === 0) return [];
        const res = await sfetch('/api/mentions/resolve', {
            method: 'POST',
            body: JSON.stringify({ orgId, items }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return data.items || [];
    },

    seedLocal: () => {
        const members = openedOrg.value?.members;
        if (members === seededMembers) return;
        seedResolveCache(buildLocalUserResolutions(members));
        seededMembers = members;
    },
};

/**
 * Source complète de l'organisation ouverte (comportement historique de
 * ThreadTextarea). À appeler dans un `setup()` : lit la route et pose des
 * watchers liés au composant appelant.
 */
export const createOrgMentionSource = (): MentionSource => {

    const route = useRoute();

    const mentionableUsers = ref<MentionEntry[]>(buildMentionableList(openedOrg.value?.members));
    watch(() => openedOrg.value?.members, (members) => {
        mentionableUsers.value = buildMentionableList(members);
    });

    // @ ouvre un picker mixte membres+rôles (comme Discord) — Role.name n'étant
    // pas chiffré (contrairement à Thread/Task/File), on peut se permettre la
    // même liste-locale-filtrée-côté-client que les membres, pas besoin du
    // aller-retour /mentions/search débouncé utilisé pour #/!/&.
    const orgRoles = ref<MentionEntry[]>([]);

    const fetchOrgRoles = async () => {
        const orgId = openedOrg.value?.id;
        if (!orgId) { orgRoles.value = []; return; }
        try {
            const res = await sfetch(`/api/orgs/${orgId}/roles`);
            if (!res.ok) { orgRoles.value = []; return; }
            const data: { id: string; name: string }[] = await res.json();
            orgRoles.value = data.map(r => ({ id: r.id, name: r.name, kind: 'role' as const }));
        } catch (err) {
            console.error('[ThreadTextarea] Failed to fetch org roles:', err);
            orgRoles.value = [];
        }
    };

    // Pas `immediate` : chaque champ appelle refresh() à son montage (même
    // moment que l'ancien watch immédiat de ThreadTextarea), la source
    // partagée par une timeline ne refait donc pas une requête de plus.
    watch(() => openedOrg.value?.id, fetchOrgRoles);

    return {
        ...orgMentionRenderSource,

        entries: computed(() => [...mentionableUsers.value, ...orgRoles.value]),

        search: async (kind, query) => {
            const orgId = route.params.orgId as string | undefined;
            const spaceId = route.params.spaceId as string | undefined;
            if (!orgId) return [];

            const params = new URLSearchParams({ q: query, types: kind, orgId });
            if (spaceId) params.set('spaceId', spaceId);
            const res = await sfetch(`/api/mentions/search?${params.toString()}`);
            if (!res.ok) return [];
            const data = await res.json();
            const entries: { id: string; label: string; subtitle?: string }[] = data[kind] || [];
            return entries.map(e => ({ id: e.id, name: e.label, pseudo: e.subtitle }));
        },

        refresh: fetchOrgRoles,
    };

};

/**
 * Source injectée par la conversation englobante, sinon celle de
 * l'organisation : ThreadTextarea sert aussi hors conversation (tâches, DM,
 * IA, appel privé) où l'organisation ouverte est la bonne source.
 */
export const useMentionSource = (): MentionSource =>
    inject(MENTION_SOURCE_KEY, null) ?? createOrgMentionSource();

/** Liste fixe de personnes (ex. participants d'un ticket) : pas de rôle, pas de référence. */
export const createStaticMentionSource = (
    people: Readonly<Ref<{ id: string; name: string; pseudo?: string | null; avatarUrl?: string | null }[]>>
): MentionSource => {

    const lookup = computed<MentionLookup>(() => {
        const byToken: MentionLookup['byToken'] = new Map();
        const usersById: MentionLookup['usersById'] = new Map();
        for (const p of people.value) {
            const user = { id: p.id, name: p.name, pseudo: p.pseudo ?? undefined, avatarUrl: p.avatarUrl ?? undefined } as any;
            usersById.set(p.id, user);
            // Même normalisation que buildMentionLookup (useMentions.ts).
            if (p.pseudo) byToken.set(p.pseudo.trim().toLowerCase(), { type: 'user', user });
            if (p.name) byToken.set(p.name.replace(/\s+/g, '').trim().toLowerCase(), { type: 'user', user });
        }
        return { byToken, usersById };
    });

    return {
        lookup,
        entries: computed(() => people.value.map(p => ({ id: p.id, name: p.name, pseudo: p.pseudo ?? undefined }))),
        // Seules les personnes connues se résolvent ; tout autre token reste
        // « Accès refusé » plutôt que de partir vers une API d'organisation.
        resolve: async (items) => items.map(item => {
            const person = item.type === 'user' ? people.value.find(p => p.id === item.id) : undefined;
            return person
                ? { type: item.type, id: item.id, ok: true, label: person.name }
                : { type: item.type, id: item.id, ok: false };
        }),
    };

};
