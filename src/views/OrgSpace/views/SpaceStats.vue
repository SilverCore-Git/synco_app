<template>
    <div class="stats-root flex flex-col h-full w-full overflow-hidden relative">
        <header class="min-h-14 pl-5 px-3 flex items-center gap-3 border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
            <MobileBackBtn />
            <i class="bi bi-bar-chart-line-fill text-(--text)" />
            <h3 class="font-semibold text-(--text)">Statistiques</h3>

            <div v-if="tabs.length > 1" class="ml-2 flex bg-(--text)/5 rounded-xl p-0.5 text-xs font-bold">
                <button
                    v-for="t in tabs" :key="t.key" type="button"
                    class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                    :class="tab === t.key ? 'bg-(--primary) text-white shadow-[0_4px_15px_var(--glow-primary-soft)]' : 'text-(--text2) hover:text-(--text)'"
                    @click="setQuery({ tab: t.key })"
                >
                    <i class="bi" :class="t.icon" />
                    <span class="hidden sm:inline">{{ t.label }}</span>
                </button>
            </div>

            <button type="button" class="ml-auto text-(--text2) hover:text-(--text) transition-colors" title="Actualiser" :disabled="loading" @click="load">
                <i class="bi bi-arrow-clockwise inline-block" :class="loading ? 'animate-spin' : ''" />
            </button>
        </header>

        <main class="flex-1 overflow-y-auto p-4 sm:p-6 w-full">
            <div class="max-w-7xl mx-auto flex flex-col gap-5">

                <!-- Filtres : une seule ligne au-dessus des graphiques -->
                <div v-if="tabs.length" class="flex flex-row flex-wrap items-center gap-2">
                    <div class="flex bg-(--text)/5 rounded-xl p-0.5 text-xs font-bold">
                        <button
                            v-for="r in ranges" :key="r.key" type="button"
                            class="px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                            :class="range === r.key ? 'bg-(--bg) text-(--text) shadow' : 'text-(--text2) hover:text-(--text)'"
                            @click="setQuery({ range: r.key })"
                        >{{ r.label }}</button>
                    </div>

                    <div class="hidden sm:block w-px h-6 bg-(--border-color) mx-1" />

                    <TaskUserFilter
                        :model-value="memberId"
                        :members="canSeeMembers ? spaceMembers : []"
                        :current-user-id="user?.id || null"
                        :me="user"
                        all-label="Tous les membres"
                        mine-label="Moi"
                        @update:model-value="v => setQuery({ member: v ?? undefined })"
                    />

                    <DropDown v-if="todoEnabled" align="left" content-iner-t-w="min-w-[280px]">
                        <template #trigger>
                            <button type="button" class="flex items-center gap-2 px-3 py-1.5 rounded-xl font-bold text-xs transition-all whitespace-nowrap h-full" :class="tagIds.length ? 'bg-(--primary)/15 text-(--primary)' : 'bg-(--text)/5 text-(--text)/70 hover:bg-(--text)/10'">
                                <i class="bi bi-tags" />
                                {{ tagIds.length ? `${tagIds.length} tag${tagIds.length > 1 ? 's' : ''}` : 'Tags' }}
                                <i class="bi bi-chevron-down text-[10px] opacity-60" />
                            </button>
                        </template>
                        <template #content>
                            <div @click.stop>
                                <button v-if="tagIds.length" type="button" class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 mb-2" @click="setQuery({ tags: undefined })">
                                    <i class="bi bi-x-lg" /> Tout désélectionner
                                </button>
                                <TaskTagPicker :org-id="orgId" :model-value="tagIds" @update:model-value="v => setQuery({ tags: v.length ? v.join(',') : undefined })" />
                            </div>
                        </template>
                    </DropDown>

                    <button
                        v-if="memberId || tagIds.length || range !== DEFAULT_RANGE"
                        type="button"
                        class="text-[11px] font-bold text-(--text2) hover:text-(--text) flex items-center gap-1 ml-1"
                        @click="setQuery({ member: undefined, tags: undefined, range: undefined })"
                    >
                        <i class="bi bi-x-circle" /> Réinitialiser
                    </button>

                    <span v-if="periodLabel" class="ml-auto text-[11px] text-(--text2) hidden md:inline">{{ periodLabel }}</span>
                </div>

                <div v-if="!tabs.length" class="flex flex-col items-center justify-center text-center py-24 gap-3 text-(--text2)">
                    <i class="bi bi-bar-chart-line text-6xl text-(--text)/10" />
                    <p class="text-sm">Les modules Tâches et Fichiers sont désactivés pour cette organisation.</p>
                </div>

                <div v-else-if="error" class="flex flex-col items-center justify-center text-center py-24 gap-3">
                    <i class="bi bi-exclamation-octagon text-5xl text-red-400/60" />
                    <p class="text-sm text-(--text2)">{{ error }}</p>
                    <button type="button" class="default" @click="load"><i class="bi bi-arrow-clockwise" /> Réessayer</button>
                </div>

                <div v-else-if="loading && !current" class="flex flex-col gap-5 animate-pulse">
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div v-for="i in 8" :key="i" class="h-28 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                    </div>
                    <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
                        <div class="xl:col-span-3 h-72 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                        <div class="xl:col-span-2 h-72 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                    </div>
                </div>

                <div v-else-if="current" class="transition-opacity" :class="loading ? 'opacity-60' : ''">
                    <TaskStatsPanel v-if="tab === 'tasks' && taskStats" :data="taskStats" />
                    <FileStatsPanel v-else-if="tab === 'files' && fileStats" :data="fileStats" />
                </div>
            </div>
        </main>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import sfetch from '@/assets/utils/sfetch';
import { openedOrg, user, todoEnabled, filesEnabled } from '@/assets/var';
import { useHerePermissions } from '@/composables/useHerePermissions';
import type { OrgMember } from '@/types/types';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import DropDown from '@/components/DropDown.vue';
import TaskUserFilter from '../components/TaskUserFilter.vue';
import TaskTagPicker from '../components/popup/TaskTagPicker.vue';
import TaskStatsPanel from '../components/SpaceStats/TaskStatsPanel.vue';
import FileStatsPanel from '../components/SpaceStats/FileStatsPanel.vue';
import type { FileStatsResponse, TaskStatsResponse } from '../components/SpaceStats/statsTypes';
import '../components/SpaceStats/stats.css';

type Tab = 'tasks' | 'files';
type RangeKey = '7d' | '30d' | '90d' | '12m';

const DEFAULT_RANGE: RangeKey = '30d';
const ranges: Array<{ key: RangeKey; label: string; days: number }> = [
    { key: '7d', label: '7 j', days: 7 },
    { key: '30d', label: '30 j', days: 30 },
    { key: '90d', label: '90 j', days: 90 },
    { key: '12m', label: '12 mois', days: 365 },
];

const route = useRoute();
const router = useRouter();
const { canHere } = useHerePermissions();

const orgId = computed(() => String(route.params.orgId));
const spaceId = computed(() => String(route.params.spaceId));
const canSeeMembers = computed(() => canHere('STATS_MEMBERS'));

const tabs = computed(() => [
    ...(todoEnabled.value ? [{ key: 'tasks' as const, label: 'Tâches', icon: 'bi-check2-square' }] : []),
    ...(filesEnabled.value ? [{ key: 'files' as const, label: 'Fichiers', icon: 'bi-folder-fill' }] : []),
]);

// État des filtres dans l'URL : lien partageable, retour arrière cohérent.
const tab = computed<Tab>(() => {
    const wanted = route.query.tab === 'files' ? 'files' : 'tasks';
    return tabs.value.some(t => t.key === wanted) ? wanted : (tabs.value[0]?.key ?? 'tasks');
});
const range = computed<RangeKey>(() => ranges.find(r => r.key === route.query.range)?.key ?? DEFAULT_RANGE);
const memberId = computed(() => (typeof route.query.member === 'string' ? route.query.member : null));
const tagIds = computed(() => (typeof route.query.tags === 'string' && route.query.tags ? route.query.tags.split(',') : []));

const setQuery = (patch: Record<string, string | undefined>) => {
    const query: LocationQueryRaw = { ...route.query, ...patch };
    for (const key of Object.keys(query)) if (query[key] === undefined) delete query[key];
    router.replace({ query });
};

const spaceMembers = computed<OrgMember[]>(() => {
    const space = openedOrg.value?.spaces?.find(s => s.id === spaceId.value);
    if (!space || !openedOrg.value?.members) return [];
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId) || m.userId === space.ownerId);
});

const taskStats = ref<TaskStatsResponse | null>(null);
const fileStats = ref<FileStatsResponse | null>(null);
const current = computed(() => (tab.value === 'tasks' ? taskStats.value : fileStats.value));
const loading = ref(false);
const error = ref<string | null>(null);

const periodLabel = computed(() => {
    const p = current.value?.period;
    if (!p) return '';
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    return `Du ${fmt(p.from)} au ${fmt(p.to)}`;
});

let requestId = 0;
async function load() {
    if (!tabs.value.length) return;
    const id = ++requestId;
    loading.value = true;
    error.value = null;

    const days = ranges.find(r => r.key === range.value)!.days;
    const to = new Date();
    const params = new URLSearchParams({
        from: new Date(to.getTime() - days * 86_400_000).toISOString(),
        to: to.toISOString(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (memberId.value) params.set('members', memberId.value);
    if (tagIds.value.length) params.set('tags', tagIds.value.join(','));

    const which = tab.value;
    const url = which === 'tasks'
        ? `/api/tasks/${orgId.value}/spaces/${spaceId.value}/stats?${params}`
        : `/api/spaces/${spaceId.value}/stats/files?${params}`;

    try {
        const res = await sfetch(url);
        const body = await res.json();
        if (id !== requestId) return;
        if (!res.ok) {
            error.value = body?.error ?? 'Impossible de charger les statistiques.';
            return;
        }
        if (which === 'tasks') taskStats.value = body as TaskStatsResponse;
        else fileStats.value = body as FileStatsResponse;
    } catch {
        if (id === requestId) error.value = 'Impossible de charger les statistiques.';
    } finally {
        if (id === requestId) loading.value = false;
    }
}

watch(
    () => [spaceId.value, tab.value, range.value, memberId.value, tagIds.value.join(',')],
    (now, before) => {
        // Changer d'espace : les données de l'ancien ne doivent pas s'afficher.
        if (before && now[0] !== before[0]) { taskStats.value = null; fileStats.value = null; }
        load();
    },
    { immediate: true },
);
</script>
