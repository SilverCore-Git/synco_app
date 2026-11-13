<template>
    <div class="stats-root flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <div class="max-w-7xl mx-auto flex flex-col gap-5">

                <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div>
                        <h3 class="text-2xl font-black text-(--text) mb-1">Statistiques</h3>
                        <p class="text-sm text-(--text2)">Activité des tâches et des fichiers, pour toute l’organisation ou un space.</p>
                    </div>

                    <div class="flex items-center gap-2 shrink-0">
                        <!-- Portée : organisation ou un space (recherche, jusqu'à 100 spaces) -->
                        <DropDown align="right" content-iner-t-w="min-w-[280px]" @toggled="(open: boolean) => { if (open) scopeSearch = '' }">
                            <template #trigger>
                                <button type="button" class="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-(--bg2) border border-(--border-color) hover:border-(--primary)/50 transition-colors max-w-64">
                                    <i class="bi shrink-0 text-(--primary)" :class="scope === 'org' ? 'bi-buildings-fill' : 'bi-grid-fill'" />
                                    <span class="truncate">{{ scopeLabel }}</span>
                                    <i class="bi bi-chevron-down text-[10px] opacity-60 shrink-0" />
                                </button>
                            </template>
                            <template #content>
                                <div>
                                    <button
                                        v-if="statsScopes?.org" type="button" class="dropdown-item-style"
                                        :class="scope === 'org' ? '!bg-(--primary)/15 !text-(--primary)' : ''"
                                        @click="setQuery({ scope: undefined, member: undefined })"
                                    >
                                        <i class="bi bi-buildings-fill mr-2" /> Toute l’organisation
                                    </button>
                                    <div v-if="statsScopes?.org && spaces.length" class="border-t border-(--border-color) my-1.5" />
                                    <div v-if="spaces.length > 6" class="relative px-1 pb-1.5">
                                        <i class="bi bi-search absolute left-3.5 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
                                        <input v-model="scopeSearch" @click.stop type="text" placeholder="Rechercher un space..." class="w-full bg-(--bg3) border border-(--border-color) rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50" />
                                    </div>
                                    <div class="max-h-64 overflow-y-auto">
                                        <button
                                            v-for="s in filteredSpaces" :key="s.id" type="button" class="dropdown-item-style"
                                            :class="scope === s.id ? '!bg-(--primary)/15 !text-(--primary)' : ''"
                                            @click="setQuery({ scope: s.id, member: undefined })"
                                        >
                                            <img v-if="s.logo && s.logo.includes('data:')" :src="s.logo" class="w-5 h-5 rounded-md object-cover mr-2" alt="">
                                            <i v-else class="bi mr-2" :class="s.logo && s.logo.startsWith('bi-') ? s.logo : 'bi-grid'" />
                                            <span class="truncate">{{ s.name }}</span>
                                        </button>
                                        <p v-if="!filteredSpaces.length" class="text-xs text-center text-(--text2) py-3">Aucun space</p>
                                    </div>
                                </div>
                            </template>
                        </DropDown>

                        <DropDown align="right" content-iner-t-w="min-w-[260px]">
                            <template #trigger>
                                <button type="button" class="flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-sm bg-(--primary) text-white shadow-[0_4px_15px_var(--glow-primary-soft)] disabled:opacity-50" :disabled="!current || exporting">
                                    <i class="bi" :class="exporting ? 'bi-hourglass-split animate-pulse' : 'bi-download'" />
                                    <span class="hidden sm:inline">Exporter</span>
                                </button>
                            </template>
                            <template #content>
                                <div>
                                    <button v-for="f in exportFormats" :key="f.key" type="button" class="dropdown-item-style !items-start" @click="runExport(f.key)">
                                        <i class="bi mr-2 mt-0.5" :class="f.icon" />
                                        <span class="flex flex-col text-left">
                                            <span class="font-bold">{{ f.label }}</span>
                                            <span class="text-[11px] text-(--text2) font-normal">{{ f.hint }}</span>
                                        </span>
                                    </button>
                                </div>
                            </template>
                        </DropDown>

                        <button type="button" class="w-9 h-9 rounded-xl text-(--text2) hover:text-(--text) hover:bg-(--text)/5 transition-colors" title="Actualiser" :disabled="loading" @click="load">
                            <i class="bi bi-arrow-clockwise inline-block" :class="loading ? 'animate-spin' : ''" />
                        </button>
                    </div>
                </div>

                <!-- Onglets + filtres : une seule ligne au-dessus des graphiques -->
                <div v-if="tabs.length" class="flex flex-row flex-wrap items-center gap-2">
                    <div v-if="tabs.length > 1" class="flex bg-(--text)/5 rounded-xl p-0.5 text-xs font-bold">
                        <button
                            v-for="t in tabs" :key="t.key" type="button"
                            class="px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                            :class="tab === t.key ? 'bg-(--primary) text-white shadow-[0_4px_15px_var(--glow-primary-soft)]' : 'text-(--text2) hover:text-(--text)'"
                            @click="setQuery({ tab: t.key })"
                        >
                            <i class="bi" :class="t.icon" /> {{ t.label }}
                        </button>
                    </div>

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
                        :members="current?.canSeeMembers ? scopeMembers : []"
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

                <div v-else-if="scopesReady && !scopeAllowed" class="flex flex-col items-center justify-center text-center py-24 gap-3 text-(--text2)">
                    <i class="bi bi-shield-lock text-5xl text-(--text)/15" />
                    <p class="text-sm">Vous n’avez accès aux statistiques d’aucun space ni de l’organisation.</p>
                </div>

                <div v-else-if="error" class="flex flex-col items-center justify-center text-center py-24 gap-3">
                    <i class="bi bi-exclamation-octagon text-5xl text-red-400/60" />
                    <p class="text-sm text-(--text2)">{{ error }}</p>
                    <button type="button" class="default" @click="load"><i class="bi bi-arrow-clockwise" /> Réessayer</button>
                </div>

                <div v-else-if="!current" class="flex flex-col gap-5 animate-pulse">
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div v-for="i in 8" :key="i" class="h-28 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                    </div>
                    <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
                        <div class="xl:col-span-3 h-72 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                        <div class="xl:col-span-2 h-72 rounded-2xl bg-(--surface-sunken) border border-(--border-color)" />
                    </div>
                </div>

                <div v-else class="transition-opacity" :class="loading ? 'opacity-60' : ''">
                    <TaskStatsPanel v-if="tab === 'tasks' && taskStats" :data="taskStats" />
                    <FileStatsPanel v-else-if="tab === 'files' && fileStats" :data="fileStats" :space-id="scope === 'org' ? null : scope" />
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
import { useSettingsAccess } from '@/composables/useSettingsAccess';
import { useToast } from '@/composables/useToast';
import type { OrgMember } from '@/types/types';
import DropDown from '@/components/DropDown.vue';
import TaskUserFilter from '../../../components/TaskUserFilter.vue';
import TaskTagPicker from '../../../components/popup/TaskTagPicker.vue';
import TaskStatsPanel from '../../../components/SpaceStats/TaskStatsPanel.vue';
import FileStatsPanel from '../../../components/SpaceStats/FileStatsPanel.vue';
import { exportStats, type ExportFormat } from '../../../components/SpaceStats/statsExport';
import type { FileStatsResponse, TaskStatsResponse } from '../../../components/SpaceStats/statsTypes';
import '../../../components/SpaceStats/stats.css';

type Tab = 'tasks' | 'files';
type RangeKey = '7d' | '30d' | '90d' | '12m';

const DEFAULT_RANGE: RangeKey = '30d';
const ranges: Array<{ key: RangeKey; label: string; days: number }> = [
    { key: '7d', label: '7 j', days: 7 },
    { key: '30d', label: '30 j', days: 30 },
    { key: '90d', label: '90 j', days: 90 },
    { key: '12m', label: '12 mois', days: 365 },
];

const exportFormats: Array<{ key: ExportFormat; label: string; hint: string; icon: string }> = [
    { key: 'xlsx', label: 'Excel (.xlsx)', hint: 'Un classeur, une feuille par tableau', icon: 'bi-file-earmark-spreadsheet' },
    { key: 'csv', label: 'CSV (.zip)', hint: 'Un fichier par tableau, prêt pour Excel / Sheets', icon: 'bi-filetype-csv' },
    { key: 'json', label: 'JSON', hint: 'Données brutes, pour vos outils', icon: 'bi-filetype-json' },
];

const route = useRoute();
const router = useRouter();
const toast = useToast();

const orgId = computed(() => String(route.params.orgId));
const orgIdRef = computed<string | undefined>(() => openedOrg.value?.id);
const { statsScopes, refreshStatsScopes } = useSettingsAccess(orgIdRef);
refreshStatsScopes();

const spaces = computed(() => statsScopes.value?.spaces ?? []);
const scopeSearch = ref('');
const filteredSpaces = computed(() => {
    const q = scopeSearch.value.trim().toLowerCase();
    return q ? spaces.value.filter(s => s.name.toLowerCase().includes(q)) : spaces.value;
});

const tabs = computed(() => [
    ...(todoEnabled.value ? [{ key: 'tasks' as const, label: 'Tâches', icon: 'bi-check2-square' }] : []),
    ...(filesEnabled.value ? [{ key: 'files' as const, label: 'Fichiers', icon: 'bi-folder-fill' }] : []),
]);

// État dans l'URL : lien partageable, retour arrière cohérent.
// scope = 'org' (défaut si autorisé) ou l'id d'un space.
const scopesReady = computed(() => !!statsScopes.value);
const scope = computed<string>(() => {
    const wanted = typeof route.query.scope === 'string' ? route.query.scope : 'org';
    if (wanted !== 'org' && spaces.value.some(s => s.id === wanted)) return wanted;
    if (statsScopes.value?.org) return 'org';
    return spaces.value[0]?.id ?? 'org';
});
const scopeAllowed = computed(() => (scope.value === 'org' ? !!statsScopes.value?.org : spaces.value.some(s => s.id === scope.value)));
const scopeLabel = computed(() => (scope.value === 'org' ? 'Toute l’organisation' : spaces.value.find(s => s.id === scope.value)?.name ?? 'Space'));

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

const scopeMembers = computed<OrgMember[]>(() => {
    const members = openedOrg.value?.members ?? [];
    if (scope.value === 'org') return members;
    const space = openedOrg.value?.spaces?.find(s => s.id === scope.value);
    return space ? members.filter(m => space.membersId.includes(m.userId) || m.userId === space.ownerId) : [];
});

const taskStats = ref<TaskStatsResponse | null>(null);
const fileStats = ref<FileStatsResponse | null>(null);
const current = computed(() => (tab.value === 'tasks' ? taskStats.value : fileStats.value));
const loading = ref(false);
const error = ref<string | null>(null);

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const periodLabel = computed(() => {
    const p = current.value?.period;
    return p ? `Du ${fmtDate(p.from)} au ${fmtDate(p.to)}` : '';
});

let requestId = 0;
async function load() {
    if (!tabs.value.length || !scopesReady.value || !scopeAllowed.value) return;
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
    if (scope.value !== 'org') params.set('space', scope.value);
    if (memberId.value) params.set('members', memberId.value);
    if (tagIds.value.length) params.set('tags', tagIds.value.join(','));

    const which = tab.value;
    try {
        const res = await sfetch(`/api/orgs/${orgId.value}/stats/${which}?${params}`);
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
    () => [scopesReady.value, scope.value, tab.value, range.value, memberId.value, tagIds.value.join(',')],
    (now, before) => {
        // Changer de portée : les chiffres de l'ancienne ne doivent pas rester affichés.
        if (before && now[1] !== before[1]) { taskStats.value = null; fileStats.value = null; }
        load();
    },
    { immediate: true },
);

// ── Export ──
const exporting = ref(false);
async function runExport(format: ExportFormat) {
    const data = current.value;
    if (!data || exporting.value) return;
    exporting.value = true;
    try {
        const filters = [
            `Période : ${periodLabel.value}`,
            ...(memberId.value ? [`Membre : ${scopeMembers.value.find(m => m.userId === memberId.value)?.user?.name ?? memberId.value}`] : []),
            ...(tagIds.value.length ? [`Tags : ${tagIds.value.length}`] : []),
        ];
        const day = new Date().toISOString().slice(0, 10);
        await exportStats(format, tab.value, data, {
            scopeLabel: scope.value === 'org' ? `${openedOrg.value?.name ?? 'Organisation'} (toute l’organisation)` : scopeLabel.value,
            filters,
            fileBase: `statistiques ${tab.value === 'tasks' ? 'taches' : 'fichiers'} ${scope.value === 'org' ? openedOrg.value?.name ?? 'organisation' : scopeLabel.value} ${day}`,
        });
    } catch (err) {
        console.error('[StatsSettings] export', err);
        toast.show('L’export a échoué.', 'error');
    } finally {
        exporting.value = false;
    }
}
</script>
