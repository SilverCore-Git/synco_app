<template>

    <!-- Carte de profil : popup d'un membre (UserProfile.vue) et aperçu des
         paramètres (UserSettings.vue) — un seul rendu, pour que l'aperçu
         montre exactement ce que voient les collègues.
         Parti pris : l'essentiel en tête (nom, poste, liens), le reste en
         lignes sobres avec une gouttière d'icônes, et tout ce qui peut
         s'allonger (à propos, spécialités, projets) replié au-delà de
         quelques éléments. -->

    <article class="flex flex-col min-h-0 bg-(--bg) text-(--text)">

        <!-- Bandeau -->
        <div
            class="h-[72px] shrink-0 relative transition-colors duration-500"
            :style="{ background: `linear-gradient(135deg, ${dominantColor}, color-mix(in srgb, ${dominantColor} 55%, black))` }"
        >
            <div class="absolute top-2.5 right-2.5 flex gap-1.5">
                <slot name="banner-actions" />
            </div>
        </div>

        <!-- En-tête -->
        <header class="px-5 shrink-0">

            <div class="flex items-end justify-between gap-3 -mt-9">
                <div class="relative shrink-0">
                    <img
                        :src="user.avatarUrl || defaultAvatar(displayName)"
                        :alt="displayName"
                        @error="(e: any) => e.target.src = defaultAvatar(displayName)"
                        class="w-[76px] h-[76px] rounded-2xl object-cover ring-4 ring-(--bg) bg-(--bg2)"
                    />
                    <span
                        v-if="status"
                        class="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-(--bg)"
                        :class="statusColorClass"
                        :title="statusLabel"
                    />
                </div>

                <!-- Liens en pastilles plutôt qu'en liste -->
                <div v-if="links.length" class="flex flex-wrap justify-end gap-1.5 pb-1">
                    <a
                        v-for="link in visibleLinks"
                        :key="link.id"
                        :href="link.url"
                        target="_blank"
                        rel="noopener noreferrer"
                        :title="`${link.label} — ${link.url}`"
                        class="w-8 h-8 rounded-full flex items-center justify-center bg-(--bg2) border border-(--border-color) text-(--text2) hover:text-(--primary) hover:border-(--primary)/50 transition-colors"
                    >
                        <i :class="linkIcon(link.url)" />
                    </a>
                    <button
                        v-if="links.length > MAX_LINK_ICONS"
                        type="button"
                        class="h-8 px-2.5 rounded-full bg-(--bg2) border border-(--border-color) text-xs font-semibold text-(--text2) hover:text-(--text)"
                        @click="showAllLinks = !showAllLinks"
                    >
                        {{ showAllLinks ? 'Moins' : `+${links.length - MAX_LINK_ICONS}` }}
                    </button>
                </div>
            </div>

            <div class="mt-3">
                <h2 class="text-lg font-bold leading-tight flex items-center gap-2">
                    <span class="truncate">{{ displayName }}</span>
                    <span v-if="isSelf" class="shrink-0 px-1.5 py-0.5 rounded-md bg-(--text)/8 text-[10px] font-semibold text-(--text2)">Vous</span>
                </h2>
                <p v-if="mainPosition" class="text-sm text-(--text) mt-0.5">
                    <span class="font-medium text-(--primary)">{{ mainPosition.title }}</span>
                    <span v-if="mainPosition.team" class="text-(--text2)"> · {{ mainPosition.team }}</span>
                </p>
                <p v-if="user.email" class="text-xs text-(--text2) mt-1 truncate">{{ user.email }}</p>
            </div>

            <!-- Rôles dans l'org, discrets -->
            <div v-if="roles?.length" class="flex flex-wrap gap-x-3 gap-y-1 mt-3">
                <span v-for="r in roles" :key="r.id" class="flex items-center gap-1.5 text-xs text-(--text2)">
                    <span class="w-2 h-2 rounded-full" :style="{ backgroundColor: r.color || 'var(--primary)' }" />
                    {{ r.name }}
                </span>
            </div>

        </header>

        <!-- Corps -->
        <div v-if="hasBody" class="flex-1 min-h-0 overflow-y-auto profile-scroll px-5 mt-4 pb-1">
            <div class="flex flex-col divide-y divide-(--border-color)">

                <!-- À propos -->
                <section v-if="user.description?.trim()" class="row">
                    <i class="bi bi-quote row-icon" />
                    <div class="min-w-0">
                        <p
                            class="text-sm leading-relaxed whitespace-pre-line"
                            :class="aboutExpanded ? '' : 'line-clamp-3'"
                            ref="aboutRef"
                        >{{ user.description }}</p>
                        <button v-if="aboutOverflows || aboutExpanded" type="button" class="more-btn" @click="aboutExpanded = !aboutExpanded">
                            {{ aboutExpanded ? 'Réduire' : 'Lire la suite' }}
                        </button>
                    </div>
                </section>

                <template v-for="block in bodyBlocks" :key="block.id">

                    <!-- Autres postes -->
                    <section v-if="block.type === 'positions'" class="row">
                        <i class="bi bi-briefcase row-icon" />
                        <div class="min-w-0 flex-1">
                            <p class="row-label">{{ block.title || (block.items.length > 1 ? 'Autres postes' : 'Autre poste') }}</p>
                            <ul class="flex flex-col gap-1">
                                <li v-for="item in block.items" :key="item.id" class="text-sm">
                                    <span class="font-medium">{{ item.title }}</span>
                                    <span v-if="item.team" class="text-(--text2)"> · {{ item.team }}</span>
                                    <span v-if="item.since" class="text-(--text2) text-xs"> · {{ formatSince(item.since) }}</span>
                                </li>
                            </ul>
                        </div>
                    </section>

                    <!-- Spécialités -->
                    <section v-else-if="block.type === 'skills'" class="row">
                        <i class="bi bi-stars row-icon" />
                        <div class="min-w-0 flex-1">
                            <p class="row-label">{{ blockTitle(block) }}</p>
                            <div class="flex flex-wrap gap-1.5">
                                <span
                                    v-for="item in visibleItems(block, MAX_SKILLS)"
                                    :key="item.id"
                                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                                    :class="item.level === 'expert'
                                        ? 'bg-(--primary)/15 text-(--primary)'
                                        : 'bg-(--text)/6 text-(--text)'"
                                    :title="item.level ? levelLabel(SKILL_LEVELS, item.level) : undefined"
                                >
                                    {{ item.label }}
                                    <i v-if="item.level === 'expert'" class="bi bi-patch-check-fill text-[10px]" />
                                </span>
                                <button
                                    v-if="block.items.length > MAX_SKILLS"
                                    type="button"
                                    class="px-2 py-0.5 rounded-md text-xs font-semibold text-(--text2) hover:text-(--text) hover:bg-(--text)/6"
                                    @click="toggle(block.id)"
                                >
                                    {{ expanded[block.id] ? 'Moins' : `+${block.items.length - MAX_SKILLS}` }}
                                </button>
                            </div>
                        </div>
                    </section>

                    <!-- Projets -->
                    <section v-else-if="block.type === 'projects'" class="row">
                        <i class="bi bi-kanban row-icon" />
                        <div class="min-w-0 flex-1">
                            <p class="row-label">{{ blockTitle(block) }}</p>
                            <ul class="flex flex-col gap-2">
                                <li v-for="item in visibleItems(block, MAX_PROJECTS)" :key="item.id" class="min-w-0">
                                    <div class="flex items-baseline justify-between gap-2">
                                        <a
                                            v-if="isSafeUrl(item.url)"
                                            :href="item.url"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            class="text-sm font-medium truncate hover:text-(--primary) hover:underline"
                                        >{{ item.name }}</a>
                                        <span v-else class="text-sm font-medium truncate">{{ item.name }}</span>
                                        <span v-if="item.role" class="shrink-0 text-[11px] text-(--text2)">{{ item.role }}</span>
                                    </div>
                                    <p v-if="item.description && expanded[block.id]" class="text-xs text-(--text2) leading-relaxed mt-0.5 whitespace-pre-line">{{ item.description }}</p>
                                </li>
                            </ul>
                            <button
                                v-if="block.items.length > MAX_PROJECTS || block.items.some(i => i.description)"
                                type="button"
                                class="more-btn"
                                @click="toggle(block.id)"
                            >
                                {{ expanded[block.id] ? 'Réduire' : projectsMoreLabel(block) }}
                            </button>
                        </div>
                    </section>

                    <!-- Langues : une ligne -->
                    <section v-else-if="block.type === 'languages'" class="row">
                        <i class="bi bi-translate row-icon" />
                        <div class="min-w-0 flex-1">
                            <p class="row-label">{{ blockTitle(block) }}</p>
                            <p class="text-sm">
                                <template v-for="(item, i) in block.items" :key="item.id">
                                    <span v-if="i > 0" class="text-(--text2)"> · </span>
                                    <span>{{ item.label }}</span>
                                    <span v-if="item.level" class="text-(--text2) text-xs"> ({{ levelLabel(LANGUAGE_LEVELS, item.level).toLowerCase() }})</span>
                                </template>
                            </p>
                        </div>
                    </section>

                    <!-- Section libre -->
                    <section v-else-if="block.type === 'custom'" class="row">
                        <i class="bi bi-info-circle row-icon" />
                        <div class="min-w-0 flex-1">
                            <p v-if="block.title" class="row-label">{{ block.title }}</p>
                            <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                                <template v-for="item in block.items" :key="item.id">
                                    <dt class="text-(--text2)">{{ item.label }}</dt>
                                    <dd class="min-w-0 break-words whitespace-pre-line">{{ item.value }}</dd>
                                </template>
                            </dl>
                        </div>
                    </section>

                </template>

            </div>
        </div>

        <p v-else-if="emptyHint" class="px-5 mt-4 text-xs text-(--text2) italic">{{ emptyHint }}</p>

        <!-- Pied -->
        <footer class="px-5 pt-3 pb-4 mt-2 shrink-0 flex flex-col gap-3">
            <p v-if="memberSince" class="text-[11px] text-(--text2) flex items-center gap-1.5">
                <i class="bi bi-calendar3" /> Membre depuis {{ memberSince }}
            </p>
            <slot name="footer" />
        </footer>

    </article>

</template>

<script setup lang="ts">

import { computed, nextTick, reactive, ref, watch } from 'vue';
import type { ProfileBlock, ProfileLinkItem, ProfilePositionItem, UserProfile } from '@/types/types';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { getAverageColor } from '@/assets/utils/getAverageColor';
import { LANGUAGE_LEVELS, SKILL_LEVELS, blockTitle, formatSince, isSafeUrl } from '@/assets/utils/userProfile';

const props = defineProps<{
    user: {
        name?: string;
        avatarUrl?: string;
        email?: string;
        description?: string;
        createdAt?: string | Date;
    };
    // Déjà filtré pour l'org du lecteur.
    profile?: UserProfile | null;
    // Poste servi par l'API, pour les comptes sans profil en sections.
    headline?: string | null;
    roles?: { id: string; name: string; color?: string | null }[];
    status?: string;
    isSelf?: boolean;
    emptyHint?: string;
}>();

const MAX_SKILLS = 8;
const MAX_PROJECTS = 3;
const MAX_LINK_ICONS = 5;

const displayName = computed(() => props.user.name || 'Inconnu');

const blocks = computed(() => (props.profile?.blocks || []).filter(b => b.items.length > 0));

// Poste principal : sorti des sections pour l'en-tête.
const mainPosition = computed<Pick<ProfilePositionItem, 'title' | 'team'> | null>(() => {
    const positions = blocks.value.flatMap(b => (b.type === 'positions' ? b.items : []));
    const main = positions.find(p => p.primary) ?? positions[0];
    if (main) return main;
    return props.headline ? { title: props.headline } : null;
});

const links = computed<ProfileLinkItem[]>(() =>
    blocks.value.flatMap(b => (b.type === 'links' ? b.items : [])).filter(l => isSafeUrl(l.url)));
const showAllLinks = ref(false);
const visibleLinks = computed(() => (showAllLinks.value ? links.value : links.value.slice(0, MAX_LINK_ICONS)));

// Sections du corps, dans l'ordre choisi par l'utilisateur, sans les liens
// (en-tête) ni le poste principal (en-tête lui aussi).
const bodyBlocks = computed<ProfileBlock[]>(() => blocks.value.flatMap((b): ProfileBlock[] => {
    if (b.type === 'links') return [];
    if (b.type === 'positions') {
        const rest = b.items.filter(i => i !== mainPosition.value);
        return rest.length ? [{ ...b, items: rest }] : [];
    }
    return [b];
}));

const hasBody = computed(() => !!props.user.description?.trim() || bodyBlocks.value.length > 0);

// --- Repliage
const expanded = reactive<Record<string, boolean>>({});
const toggle = (id: string) => { expanded[id] = !expanded[id]; };

const visibleItems = <T extends ProfileBlock>(block: T, max: number): T['items'] =>
    (expanded[block.id] ? block.items : block.items.slice(0, max)) as T['items'];

const projectsMoreLabel = (block: ProfileBlock) => {
    const hidden = block.items.length - MAX_PROJECTS;
    return hidden > 0 ? `Voir les ${hidden} autre${hidden > 1 ? 's' : ''} et les détails` : 'Voir les détails';
};

const aboutExpanded = ref(false);
const aboutOverflows = ref(false);
const aboutRef = ref<HTMLElement | null>(null);

watch(() => props.user.description, async () => {
    aboutExpanded.value = false;
    await nextTick();
    const el = aboutRef.value;
    aboutOverflows.value = !!el && el.scrollHeight > el.clientHeight + 1;
}, { immediate: true });

// --- Divers
const levelLabel = (levels: readonly { id: string; label: string }[], id: string) =>
    levels.find(l => l.id === id)?.label ?? '';

const LINK_ICONS: [RegExp, string][] = [
    [/github\.com/i, 'bi bi-github'],
    [/gitlab\./i, 'bi bi-gitlab'],
    [/linkedin\.com/i, 'bi bi-linkedin'],
    [/(twitter|x)\.com/i, 'bi bi-twitter-x'],
    [/behance\.net/i, 'bi bi-behance'],
    [/dribbble\.com/i, 'bi bi-dribbble'],
    [/youtube\.com|youtu\.be/i, 'bi bi-youtube'],
    [/figma\.com/i, 'bi bi-vector-pen'],
];
const linkIcon = (url: string) => LINK_ICONS.find(([re]) => re.test(url))?.[1] ?? 'bi bi-globe2';

const memberSince = computed(() => {
    if (!props.user.createdAt) return null;
    const d = new Date(props.user.createdAt);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
});

const statusColorClass = computed(() => {
    switch (props.status) {
        case 'online': return 'bg-green-500';
        case 'idle': return 'bg-yellow-500';
        case 'dnd': return 'bg-red-500';
        default: return 'bg-gray-500';
    }
});

const statusLabel = computed(() => ({ online: 'En ligne', idle: 'Absent', dnd: 'Ne pas déranger' } as Record<string, string>)[props.status || ''] ?? 'Hors ligne');

const dominantColor = ref('#16ac77');
watch(() => [props.user.avatarUrl, props.user.name], async () => {
    dominantColor.value = await getAverageColor(props.user.avatarUrl || defaultAvatar(displayName.value));
}, { immediate: true });

</script>

<style scoped>
@reference "@/style.css";

.row {
    @apply grid grid-cols-[1.25rem_1fr] gap-3 py-3 first:pt-0;
}

.row-icon {
    @apply text-(--text2) text-sm leading-5;
}

.row-label {
    @apply text-[11px] font-semibold text-(--text2) mb-1;
}

.more-btn {
    @apply mt-1 text-xs font-semibold text-(--primary) hover:underline;
}

.profile-scroll::-webkit-scrollbar { width: 6px; }
.profile-scroll::-webkit-scrollbar-track { background: transparent; }
.profile-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text) 12%, transparent); border-radius: 10px; }
</style>
