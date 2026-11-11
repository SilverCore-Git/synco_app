<template>
    <div class="flex flex-col gap-5">

        <div
            v-if="historyNote"
            class="flex items-start gap-3 text-xs text-(--text2) bg-(--primary)/8 border border-(--primary)/20 rounded-xl px-4 py-3"
        >
            <i class="bi bi-clock-history text-(--primary) text-base leading-none mt-px" />
            <span>{{ historyNote }}</span>
        </div>

        <!-- Indicateurs -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
                label="Tâches ouvertes" icon="bi-circle-half"
                :value="formatCount(k.todo + k.inProgress)"
                :hint="`dont ${formatCount(k.inProgress)} en cours`"
            />
            <StatTile
                label="Terminées" icon="bi-check2-circle"
                :value="formatCount(k.completed)"
                :delta-ratio="delta(k.completed, k.previous.completed)"
                hint="vs période préc."
            />
            <StatTile
                label="Créées" icon="bi-plus-circle"
                :value="formatCount(k.created)"
                :delta-ratio="delta(k.created, k.previous.created)"
                hint="vs période préc."
            />
            <StatTile
                label="En retard" icon="bi-exclamation-triangle-fill"
                :tone="k.overdue ? 'critical' : 'default'"
                :value="formatCount(k.overdue)"
                :hint="`${formatCount(k.dueSoon)} à échéance sous 7 j`"
            />
            <StatTile
                label="Délai de résolution" icon="bi-hourglass-split"
                :value="formatHours(k.leadTime.medianHours)"
                :hint="k.leadTime.sample ? `médiane · 90 % sous ${formatHours(k.leadTime.p90Hours)}` : 'aucune tâche terminée'"
            />
            <StatTile
                label="Temps de cycle" icon="bi-arrow-repeat"
                :value="formatHours(k.cycleTime.medianHours)"
                :hint="k.cycleTime.sample ? `de « en cours » à terminé · ${k.cycleTime.sample} tâche${k.cycleTime.sample > 1 ? 's' : ''}` : 'pas encore d’historique'"
            />
            <StatTile
                label="Dans les temps" icon="bi-calendar-check"
                :value="formatPercent(k.onTime.rate)"
                :hint="k.onTime.onTime + k.onTime.late ? `${k.onTime.onTime} sur ${k.onTime.onTime + k.onTime.late} avec échéance` : 'aucune échéance concernée'"
            />
            <StatTile
                label="Réouvertures" icon="bi-arrow-counterclockwise"
                :tone="k.reopened ? 'warning' : 'default'"
                :value="formatCount(k.reopened)"
                hint="tâches terminées puis rouvertes"
            />
        </div>

        <!-- Flux -->
        <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <StatsCard class="xl:col-span-3" title="Créées vs terminées" icon="bi-bar-chart-fill" :subtitle="`Par ${granularityWord}`">
                <ColumnsChart
                    :buckets="data.period.buckets"
                    :granularity="data.period.granularity"
                    :series="[
                        { key: 'created', label: 'Créées', slot: 1, values: data.flow.map(f => f.created) },
                        { key: 'completed', label: 'Terminées', slot: 2, values: data.flow.map(f => f.completed) },
                    ]"
                    aria-label="Tâches créées et terminées par période"
                />
            </StatsCard>
            <StatsCard class="xl:col-span-2" title="Tâches ouvertes" icon="bi-graph-up" subtitle="Backlog en fin de période">
                <LineChart
                    :buckets="data.period.buckets"
                    :granularity="data.period.granularity"
                    :values="data.flow.map(f => f.open)"
                    label="Ouvertes"
                    aria-label="Évolution du nombre de tâches ouvertes"
                />
            </StatsCard>
        </div>

        <!-- Répartition & santé -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StatsCard title="Répartition par statut" icon="bi-kanban" :subtitle="`${formatCount(k.total)} tâches actives · ${formatCount(k.archived)} archivées`">
                <SegmentedBar
                    :parts="[
                        { key: 'todo', label: 'À faire', value: k.todo, slot: 1, icon: 'bi-circle' },
                        { key: 'progress', label: 'En cours', value: k.inProgress, slot: 2, icon: 'bi-arrow-repeat' },
                        { key: 'done', label: 'Terminé', value: k.done, slot: 3, icon: 'bi-check-circle-fill' },
                    ]"
                    aria-label="Répartition des tâches actives par statut"
                />
                <div class="grid grid-cols-2 gap-2 mt-1">
                    <div v-for="f in healthFigures" :key="f.label" class="bg-(--text)/[0.03] rounded-xl px-3 py-2 flex items-center gap-2 min-w-0">
                        <i class="bi text-(--text2)" :class="f.icon" />
                        <span class="text-xs text-(--text2) truncate">{{ f.label }}</span>
                        <b class="ml-auto text-sm text-(--text) stats-num">{{ f.value }}</b>
                    </div>
                </div>
            </StatsCard>

            <StatsCard title="Âge des tâches ouvertes" icon="bi-hourglass" subtitle="Depuis leur création">
                <BarList :rows="data.age.map((a, i) => ({ key: a.label, label: a.label, value: a.count, slot: i === 3 ? 8 : 1 }))" />
            </StatsCard>
        </div>

        <!-- Par membre -->
        <StatsCard
            :title="data.canSeeMembers ? 'Par membre' : 'Vos chiffres'"
            icon="bi-people-fill"
            :subtitle="data.canSeeMembers ? 'Tâches assignées à chacun · cliquez sur une colonne pour trier' : 'Le détail des autres membres demande la permission « Statistiques par membre ».'"
        >
            <template v-if="data.canSeeMembers && data.members.length > 8" #actions>
                <div class="relative w-44 shrink-0">
                    <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
                    <input v-model="memberSearch" type="text" placeholder="Rechercher…" class="w-full bg-(--bg) border border-(--border-color) rounded-xl pl-8 pr-3 py-1.5 text-xs text-(--text) focus:outline-none focus:border-(--primary)" />
                </div>
            </template>
            <div class="overflow-x-auto -mx-1">
                <table class="w-full text-xs min-w-[640px]">
                    <thead>
                        <tr class="text-(--text2) text-left">
                            <th class="font-bold py-2 px-1">Membre</th>
                            <th
                                v-for="c in memberColumns" :key="c.key"
                                class="font-bold py-2 px-1 text-right cursor-pointer select-none hover:text-(--text) whitespace-nowrap"
                                :class="sortKey === c.key ? 'text-(--text)' : ''"
                                @click="toggleSort(c.key)"
                            >
                                {{ c.label }}
                                <i v-if="sortKey === c.key" class="bi" :class="sortDesc ? 'bi-arrow-down' : 'bi-arrow-up'" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="m in sortedMembers" :key="m.userId" class="border-t border-(--border-color) hover:bg-(--text)/[0.03]">
                            <td class="py-2 px-1 max-w-48"><StatsUserBadge :user="userById(m.userId)" :is-me="m.userId === meId" /></td>
                            <td class="py-2 px-1 text-right stats-num">
                                <span class="inline-flex items-center gap-2 justify-end">
                                    <span class="w-16 h-1.5 rounded-full bg-(--text)/5 overflow-hidden hidden sm:block">
                                        <span class="block h-full rounded-full" :style="{ width: `${maxOpen ? (m.open / maxOpen) * 100 : 0}%`, background: 'var(--viz-1)' }" />
                                    </span>
                                    {{ m.open }}
                                </span>
                            </td>
                            <td class="py-2 px-1 text-right stats-num">{{ m.inProgress }}</td>
                            <td class="py-2 px-1 text-right stats-num font-bold">{{ m.completed }}</td>
                            <td class="py-2 px-1 text-right stats-num" :class="m.overdue ? 'text-red-400 font-bold' : ''">
                                <i v-if="m.overdue" class="bi bi-exclamation-triangle-fill mr-1" />{{ m.overdue }}
                            </td>
                            <td class="py-2 px-1 text-right stats-num">{{ m.created }}</td>
                            <td class="py-2 px-1 text-right stats-num">{{ formatHours(m.leadTimeMedianHours) }}</td>
                        </tr>
                        <tr v-if="sortedMembers.length === 0">
                            <td colspan="7" class="text-center text-(--text2) italic py-4">Aucun membre</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </StatsCard>

        <!-- Tags & listes -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StatsCard title="Par tag" icon="bi-tags-fill" subtitle="Tâches actives · ouvertes · en retard">
                <BarList :rows="tagRows" empty="Aucune tâche">
                    <template #label="{ row }">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: row.color }" />
                        <span class="truncate" :class="row.key === 'none' ? 'text-(--text2) italic' : 'text-(--text)'">{{ row.label }}</span>
                    </template>
                </BarList>
            </StatsCard>

            <StatsCard title="Avancement des listes" icon="bi-list-check" subtitle="Part des tâches terminées">
                <ul class="flex flex-col gap-3">
                    <li v-for="l in data.lists" :key="l.id" class="flex flex-col gap-1">
                        <div class="flex items-center gap-2 text-xs min-w-0">
                            <span class="truncate text-(--text)">{{ l.title }}</span>
                            <span class="ml-auto text-(--text2) stats-num shrink-0">{{ l.done }} / {{ l.total }}</span>
                            <b class="text-(--text) stats-num w-10 text-right shrink-0">{{ l.total ? Math.round((l.done / l.total) * 100) : 0 }} %</b>
                        </div>
                        <div class="h-1.5 rounded-full bg-(--text)/5 overflow-hidden">
                            <div class="h-full rounded-full" :style="{ width: `${l.total ? (l.done / l.total) * 100 : 0}%`, background: 'var(--viz-3)' }" />
                        </div>
                    </li>
                    <li v-if="data.lists.length === 0" class="text-xs text-(--text2) italic text-center py-4">Aucune liste dans cet espace</li>
                </ul>
            </StatsCard>
        </div>

        <!-- Vigilance -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StatsCard title="Les plus en retard" icon="bi-alarm-fill" subtitle="Échéance dépassée, non terminées">
                <TaskRows :rows="data.overdueTasks.map(t => ({ id: t.id, title: t.title, meta: overdueText(t.dueDate), assigneeIds: t.assigneeIds }))" critical empty="Aucune tâche en retard 🎉" />
            </StatsCard>
            <StatsCard title="Bloquées « en cours »" icon="bi-pause-circle-fill" subtitle="Sans changement de statut depuis plus de 14 jours">
                <TaskRows :rows="data.stuck.map(t => ({ id: t.id, title: t.title, meta: `depuis ${daysSince(t.since)} j`, assigneeIds: t.assigneeIds }))" empty="Rien ne stagne" />
            </StatsCard>
        </div>

        <!-- Rythme -->
        <StatsCard title="Rythme de l’équipe" icon="bi-calendar3-week" :subtitle="`Heure locale (${data.period.timezone})`">
            <template #actions>
                <div class="flex bg-(--text)/5 rounded-xl p-0.5 text-xs font-bold shrink-0">
                    <button
                        v-for="m in heatModes" :key="m.key"
                        type="button"
                        class="px-3 py-1 rounded-lg transition-colors"
                        :class="heatMode === m.key ? 'bg-(--bg) text-(--text) shadow' : 'text-(--text2) hover:text-(--text)'"
                        @click="heatMode = m.key"
                    >{{ m.label }}</button>
                </div>
            </template>
            <HeatmapGrid :grid="data.heatmap[heatMode]" :unit="heatMode === 'created' ? 'créations' : 'tâches terminées'" />
        </StatsCard>
    </div>
</template>

<script setup lang="ts">
import { computed, ref, h, type FunctionalComponent } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { user } from '@/assets/var';
import StatTile from './StatTile.vue';
import StatsCard from './StatsCard.vue';
import ColumnsChart from './ColumnsChart.vue';
import LineChart from './LineChart.vue';
import SegmentedBar from './SegmentedBar.vue';
import BarList from './BarList.vue';
import HeatmapGrid from './HeatmapGrid.vue';
import StatsUserBadge from './StatsUserBadge.vue';
import { delta, formatCount, formatHours, formatPercent } from './statsFormat';
import type { StatsUser, TaskStatsResponse } from './statsTypes';

const props = defineProps<{ data: TaskStatsResponse }>();

const router = useRouter();
const route = useRoute();
const meId = computed(() => user.value?.id ?? null);
const k = computed(() => props.data.kpis);

const granularityWord = computed(() => ({ day: 'jour', week: 'semaine', month: 'mois' }[props.data.period.granularity]));

const historyNote = computed(() => {
    const since = props.data.historySince;
    const fmt = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!since) return 'Le temps de cycle et les réouvertures s’appuient sur l’historique des tâches, enregistré à partir de maintenant : ils se rempliront au fil des changements de statut.';
    if (new Date(since) > new Date(props.data.period.from)) return `L’historique des tâches est enregistré depuis le ${fmt(since)} : temps de cycle et réouvertures ne couvrent que la période qui suit.`;
    return null;
});

const healthFigures = computed(() => [
    { label: 'Non assignées', icon: 'bi-person-dash', value: formatCount(k.value.unassigned) },
    { label: 'Sans échéance', icon: 'bi-calendar-x', value: formatCount(k.value.noDueDate) },
    { label: 'Avec fichiers', icon: 'bi-paperclip', value: formatCount(k.value.withFiles) },
    { label: 'Sous-tâches finies', icon: 'bi-list-nested', value: `${k.value.subtasks.done} / ${k.value.subtasks.total}` },
]);

// ── Membres ──
const usersById = computed(() => new Map(props.data.users.map(u => [u.id, u])));
const userById = (id: string): StatsUser | undefined => usersById.value.get(id);

type MemberKey = 'open' | 'inProgress' | 'completed' | 'overdue' | 'created' | 'leadTimeMedianHours';
const memberColumns: Array<{ key: MemberKey; label: string }> = [
    { key: 'open', label: 'Ouvertes' },
    { key: 'inProgress', label: 'En cours' },
    { key: 'completed', label: 'Terminées' },
    { key: 'overdue', label: 'En retard' },
    { key: 'created', label: 'Créées' },
    { key: 'leadTimeMedianHours', label: 'Délai médian' },
];
const sortKey = ref<MemberKey>('open');
const sortDesc = ref(true);
const memberSearch = ref('');
const toggleSort = (key: MemberKey) => {
    if (sortKey.value === key) sortDesc.value = !sortDesc.value;
    else { sortKey.value = key; sortDesc.value = true; }
};
const sortedMembers = computed(() => {
    const q = memberSearch.value.trim().toLowerCase();
    return props.data.members
        .filter(m => !q || (userById(m.userId)?.name ?? '').toLowerCase().includes(q))
        .sort((a, b) => {
            const av = a[sortKey.value] ?? -1;
            const bv = b[sortKey.value] ?? -1;
            return sortDesc.value ? bv - av : av - bv;
        });
});
const maxOpen = computed(() => Math.max(0, ...props.data.members.map(m => m.open)));

// ── Tags ──
const tagRows = computed(() => {
    const meta = new Map(props.data.tagsMeta.map(t => [t.id, t]));
    return props.data.tags
        .filter(t => t.total > 0)
        .slice(0, 10)
        .map(t => {
            const tag = t.tagId ? meta.get(t.tagId) : undefined;
            return {
                key: t.tagId ?? 'none',
                label: tag?.name ?? (t.tagId ? 'Tag supprimé' : 'Sans tag'),
                color: tag?.color ?? 'var(--viz-muted)',
                value: t.total,
                extra: `${t.open} ouv.${t.overdue ? ` · ${t.overdue} en retard` : ''}`,
            };
        });
});

// ── Vigilance ──
const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
const overdueText = (iso: string) => {
    const days = daysSince(iso);
    return days < 1 ? 'en retard' : `${days} j de retard`;
};

interface TaskRowItem { id: string; title: string; meta: string; assigneeIds: string[] }

const openTask = (id: string) => {
    router.push({ name: 'TasksSpace', params: { orgId: route.params.orgId, spaceId: route.params.spaceId }, query: { showView: '1', select: id } });
};

const TaskRows: FunctionalComponent<{ rows: TaskRowItem[]; critical?: boolean; empty: string }> = (p) => {
    if (p.rows.length === 0) return h('p', { class: 'text-xs text-(--text2) italic text-center py-4' }, p.empty);
    return h('ul', { class: 'flex flex-col gap-1' }, p.rows.map(r => h('li', { key: r.id },
        h('button', {
            type: 'button',
            class: 'w-full flex items-center gap-3 text-left px-3 py-2 rounded-xl hover:bg-(--text)/5 transition-colors min-w-0',
            onClick: () => openTask(r.id),
        }, [
            h('span', { class: 'text-xs text-(--text) truncate flex-1' }, r.title),
            h('span', { class: 'flex -space-x-1.5 shrink-0' }, r.assigneeIds.slice(0, 3).map(id =>
                h(StatsUserBadge, { key: id, user: userById(id), avatarOnly: true, size: 'w-5 h-5 ring-2 ring-(--bg2)' }))),
            h('span', { class: ['text-[11px] font-bold shrink-0 stats-num', p.critical ? 'text-red-400' : 'text-(--text2)'] }, r.meta),
        ]),
    )));
};
TaskRows.props = ['rows', 'critical', 'empty'];

// ── Rythme ──
const heatModes = [
    { key: 'completed', label: 'Terminées' },
    { key: 'created', label: 'Créées' },
] as const;
const heatMode = ref<'created' | 'completed'>('completed');
</script>
