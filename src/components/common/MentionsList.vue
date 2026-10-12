<template>

    <div
        v-if="isOpen && (kind === 'user' ? filteredUsers.length > 0 : true)"
        class="absolute bottom-full left-0 mb-2 bg-(--bg) border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 backdrop-blur-3xl"
        :class="kind === 'user' ? 'w-64 max-h-48 overflow-y-auto p-1' : 'w-80 max-h-64 overflow-y-auto p-1'"
    >

        <div class="p-2 text-[10px] uppercase font-bold tracking-wider text-(--text2) border-b border-(--border-color)">
            {{ headerLabel }}
        </div>

        <!-- Fichiers/dossiers (et toute recherche distante) : liste chargée,
             groupée par type avec un petit libellé de section, pour qu'on
             voie tout de suite si ce qu'on cherche est un dossier ou un
             fichier avant de cliquer. -->
        <template v-if="kind !== 'user'">

            <div v-if="loading" class="flex items-center gap-2 px-3 py-4 text-xs text-(--text2)">
                <span class="w-3.5 h-3.5 border-2 border-(--text2)/30 border-t-(--primary) rounded-full animate-spin shrink-0" />
                Recherche en cours…
            </div>

            <template v-else-if="filteredUsers.length === 0">
                <div class="flex flex-col items-center gap-1.5 px-3 py-6 text-center text-(--text2)">
                    <i class="bi bi-search text-lg opacity-50" />
                    <span class="text-xs">
                        {{ searchQuery ? `Aucun résultat pour "${searchQuery}"` : 'Commencez à taper pour chercher' }}
                    </span>
                </div>
            </template>

            <template v-else>
                <template v-for="(group, groupIndex) in groupedEntries" :key="group.kind">

                    <div
                        v-if="groupedEntries.length > 1"
                        class="px-3 pt-2 pb-1 text-[9px] uppercase font-bold tracking-wider text-(--text2)/70 flex items-center gap-1.5"
                        :class="groupIndex > 0 ? 'border-t border-(--border-color) mt-1' : ''"
                    >
                        <i class="bi" :class="group.icon" />
                        {{ group.label }}
                    </div>

                    <button
                        v-for="entry in group.items"
                        :key="entry.id"
                        :ref="(el) => setItemRef(el, flatIndexOf(entry))"
                        @mousedown.prevent
                        @click="$emit('select', entry)"
                        :class="[
                            'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors text-(--text)',
                            flatIndexOf(entry) === activeIndex ? 'bg-(--primary)/20 text-(--primary)' : 'hover:bg-(--text)/5'
                        ]"
                    >
                        <div
                            class="w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0"
                            :class="entry.kind === 'folder'
                                ? 'bg-amber-500/15 text-amber-400'
                                : (entry.kind === 'role' ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--primary)/15 text-(--primary)')"
                        >
                            <i class="bi" :class="iconForEntry(entry)" />
                        </div>
                        <div class="flex flex-col min-w-0 flex-1">
                            <span class="truncate" v-html="highlight(entry.name)" />
                            <span v-if="entry.pseudo" class="text-[11px] text-(--text2) truncate">{{ entry.pseudo }}</span>
                        </div>
                    </button>

                </template>
            </template>

        </template>

        <!-- Membres/rôles : comportement historique, filtrage local déjà
             appliqué par filteredUsers. -->
        <template v-else>
            <button
                v-for="(user, index) in filteredUsers"
                :key="user.id"
                :ref="(el) => setItemRef(el, index)"
                @mousedown.prevent
                @click="$emit('select', user)"
                :class="[
                    'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors text-(--text)',
                    index === activeIndex ? 'bg-(--primary)/20 text-(--primary)' : 'hover:bg-(--text)/5'
                ]"
            >
                <div
                    v-if="user.special"
                    class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-xs shrink-0"
                >
                    <i class="bi" :class="user.special === 'everyone' ? 'bi-megaphone-fill' : 'bi-broadcast'" />
                </div>
                <div
                    v-else-if="user.kind === 'role'"
                    class="w-6 h-6 rounded-full bg-(--primary)/15 text-(--primary) flex items-center justify-center text-xs shrink-0"
                >
                    <i class="bi bi-shield-fill" />
                </div>
                <div v-else class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">
                    {{ $p(user.name).charAt(0).toUpperCase() }}
                </div>
                <div class="flex flex-col min-w-0">
                    <span class="truncate" v-html="highlight($p(user.name))" />
                    <span v-if="user.pseudo" class="text-xs text-(--primary) truncate">@{{ user.pseudo }}</span>
                </div>
            </button>
        </template>

    </div>

</template>

<script setup lang="ts">

import { computed, watch, nextTick } from 'vue';
import type { MentionEntry } from '@/composables/useMentions';
import { TRIGGERS, FOLDER_TRIGGER_CONFIG, type ReferenceKind } from '@/composables/useReferences';

const props = withDefaults(defineProps<{
  isOpen: boolean;
  searchQuery: string;
  users: MentionEntry[];
  activeIndex: number;
  // 'user' (comportement historique, filtré localement) ou 'thread'/'task'/
  // 'file' (déjà filtrés côté appelant via /mentions/search, pas de recoupe
  // ici — la recherche serveur ne peut pas s'ILIKE sur des champs chiffrés,
  // voir mentions.ts). 'file' mélange en réalité fichiers ET dossiers (voir
  // mentionSource.ts), distingués ici via entry.kind === 'folder'.
  kind?: ReferenceKind;
  // true pendant l'aller-retour réseau débouncé (ThreadTextarea.searchRemote)
  // — affiche un spinner plutôt qu'un "aucun résultat" trompeur.
  loading?: boolean;
}>(), {
  kind: 'user',
  loading: false,
});

defineEmits(['select']);

const headerLabel = computed(() => {
    if (props.kind === 'user') return 'Membres & rôles';
    if (props.kind === 'file') return 'Fichiers & dossiers';
    return Object.values(TRIGGERS).find(t => t.kind === props.kind)?.label ?? '';
});

const kindIcon = computed(() => Object.values(TRIGGERS).find(t => t.kind === props.kind)?.icon ?? 'bi-hash');

const iconForEntry = (entry: MentionEntry): string => {
    if (entry.kind === 'folder') return FOLDER_TRIGGER_CONFIG.icon;
    if (entry.kind === 'role') return 'bi-shield-fill';
    return kindIcon.value;
};

const filteredUsers = computed(() => {
    if (props.kind !== 'user') return props.users;
    if (!props.searchQuery) return props.users;
    const query = props.searchQuery.toLowerCase();
    return props.users.filter(u =>
        u.name.toLowerCase().includes(query) ||
        (u.pseudo && u.pseudo.toLowerCase().includes(query))
    );
});

// Regroupe la liste plate (déjà ordonnée dossiers-puis-fichiers côté
// mentionSource.ts) en sections visuelles, sans changer l'ordre ni l'index
// de navigation clavier (flatIndexOf retrouve la position dans `users`).
const groupedEntries = computed(() => {
    if (props.kind !== 'file') {
        return props.users.length ? [{ kind: 'default', label: headerLabel.value, icon: kindIcon.value, items: props.users }] : [];
    }
    const folders = props.users.filter(u => u.kind === 'folder');
    const files = props.users.filter(u => u.kind !== 'folder');
    const groups: { kind: string; label: string; icon: string; items: MentionEntry[] }[] = [];
    if (folders.length) groups.push({ kind: 'folder', label: 'Dossiers', icon: FOLDER_TRIGGER_CONFIG.icon, items: folders });
    if (files.length) groups.push({ kind: 'file', label: 'Fichiers', icon: kindIcon.value, items: files });
    return groups;
});

const flatIndexOf = (entry: MentionEntry): number => props.users.findIndex(u => u.id === entry.id);

const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Met en gras la sous-chaîne qui correspond à la recherche en cours — aide à
// repérer en un coup d'œil pourquoi un résultat a matché.
const highlight = (name: string): string => {
    const escaped = escapeHtml(name);
    const query = props.searchQuery?.trim();
    if (!query) return escaped;
    const idx = escaped.toLowerCase().indexOf(escapeHtml(query).toLowerCase());
    if (idx === -1) return escaped;
    return `${escaped.slice(0, idx)}<strong>${escaped.slice(idx, idx + query.length)}</strong>${escaped.slice(idx + query.length)}`;
};

const itemRefs: (HTMLElement | null)[] = [];
const setItemRef = (el: Element | { $el: HTMLElement } | null, index: number) => {
    itemRefs[index] = (el as HTMLElement) ?? null;
};

// La navigation clavier (ArrowUp/ArrowDown) dans ThreadTextarea ne fait que
// changer activeIndex — sans ça l'item actif pouvait sortir de la zone
// visible (overflow-y-auto) sans jamais scroller vers lui.
watch(() => props.activeIndex, (index) => {
    nextTick(() => {
        itemRefs[index]?.scrollIntoView({ block: 'nearest' });
    });
});

</script>
