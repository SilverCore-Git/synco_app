<template>
    <div class="flex flex-col gap-5">

        <!-- Indicateurs -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile label="Fichiers" icon="bi-files" :value="formatCount(k.files)" :hint="`${formatCount(k.folders)} dossier${k.folders > 1 ? 's' : ''}`" />
            <StatTile label="Volume" icon="bi-hdd-fill" :value="formatBytes(k.bytes)" :hint="quotaHint" />
            <StatTile
                label="Ajoutés" icon="bi-cloud-arrow-up-fill"
                :value="formatCount(k.added)"
                :delta-ratio="delta(k.added, k.previous.added)"
                :hint="formatBytes(k.addedBytes)"
            />
            <StatTile
                label="Dormants" icon="bi-moon-stars-fill"
                :tone="k.dormant.files ? 'warning' : 'default'"
                :value="formatCount(k.dormant.files)"
                :hint="`${formatBytes(k.dormant.bytes)} · intouchés depuis 6 mois`"
            />
        </div>

        <!-- Évolution -->
        <div class="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <StatsCard class="xl:col-span-3" title="Envois" icon="bi-bar-chart-fill" :subtitle="`Fichiers ajoutés par ${granularityWord}`">
                <ColumnsChart
                    :buckets="data.period.buckets"
                    :granularity="data.period.granularity"
                    :series="[{ key: 'uploads', label: 'Fichiers ajoutés', slot: 1, values: data.series.map(s => s.uploads) }]"
                    aria-label="Fichiers ajoutés par période"
                />
            </StatsCard>
            <StatsCard class="xl:col-span-2" title="Volume cumulé" icon="bi-graph-up" subtitle="Fichiers encore présents">
                <LineChart
                    :buckets="data.period.buckets"
                    :granularity="data.period.granularity"
                    :values="data.series.map(s => s.cumulativeBytes)"
                    label="Volume"
                    :format="formatBytes"
                    aria-label="Évolution du volume de fichiers"
                />
            </StatsCard>
        </div>

        <!-- Types & origine -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StatsCard title="Types de fichiers" icon="bi-pie-chart-fill" subtitle="Part du volume (type déclaré à l’envoi)">
                <template #actions>
                    <div class="flex bg-(--text)/5 rounded-xl p-0.5 text-xs font-bold shrink-0">
                        <button
                            v-for="m in typeModes" :key="m.key" type="button"
                            class="px-3 py-1 rounded-lg transition-colors"
                            :class="typeMode === m.key ? 'bg-(--bg) text-(--text) shadow' : 'text-(--text2) hover:text-(--text)'"
                            @click="typeMode = m.key"
                        >{{ m.label }}</button>
                    </div>
                </template>
                <SegmentedBar
                    :parts="data.types.map(t => ({ key: t.family, label: FAMILY_LABELS[t.family].label, icon: FAMILY_LABELS[t.family].icon, slot: FAMILY_SLOT[t.family], value: typeMode === 'bytes' ? t.bytes : t.files }))"
                    :format="typeMode === 'bytes' ? formatBytes : formatCount"
                    :columns="2"
                    aria-label="Répartition des fichiers par type"
                />
            </StatsCard>

            <StatsCard title="Origine et usage" icon="bi-diagram-3-fill" subtitle="D’où viennent les fichiers, à quoi ils servent">
                <SegmentedBar
                    :parts="[
                        { key: 'space', label: 'Gestionnaire de fichiers', icon: 'bi-folder-fill', slot: 1, value: data.origin.space.bytes },
                        { key: 'messages', label: 'Pièces jointes de messages', icon: 'bi-chat-dots-fill', slot: 2, value: data.origin.messages.bytes },
                        { key: 'tasks', label: 'Images de tâches', icon: 'bi-check2-square', slot: 3, value: data.origin.tasks.bytes },
                    ]"
                    :format="formatBytes"
                    aria-label="Volume par origine"
                />
                <div class="grid grid-cols-2 gap-2 mt-1">
                    <div class="bg-(--text)/[0.03] rounded-xl px-3 py-2 flex items-center gap-2 min-w-0">
                        <i class="bi bi-link-45deg text-(--text2)" />
                        <span class="text-xs text-(--text2) truncate">Fichiers liés à une tâche</span>
                        <b class="ml-auto text-sm text-(--text) stats-num">{{ formatCount(data.tasks.filesLinkedToTasks) }}</b>
                    </div>
                    <div class="bg-(--text)/[0.03] rounded-xl px-3 py-2 flex items-center gap-2 min-w-0">
                        <i class="bi bi-paperclip text-(--text2)" />
                        <span class="text-xs text-(--text2) truncate">Tâches avec fichier</span>
                        <b class="ml-auto text-sm text-(--text) stats-num">{{ data.tasks.tasksWithFiles }} / {{ data.tasks.tasksTotal }}</b>
                    </div>
                </div>
            </StatsCard>
        </div>

        <!-- Par membre -->
        <StatsCard
            :title="data.canSeeMembers ? 'Par membre' : 'Vos fichiers'"
            icon="bi-people-fill"
            :subtitle="data.canSeeMembers ? 'Fichiers déposés par chacun' : 'Le détail des autres membres demande la permission « Statistiques par membre ».'"
        >
            <BarList :rows="memberRows" :format="formatBytes" empty="Aucun fichier">
                <template #label="{ row }">
                    <StatsUserBadge :user="userById(row.key)" :is-me="row.key === meId" size="w-5 h-5" />
                </template>
            </BarList>
        </StatsCard>

        <!-- Dossiers, gros fichiers, tags -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <StatsCard title="Dossiers les plus lourds" icon="bi-folder-fill" subtitle="Dossiers de premier niveau, sous-dossiers compris">
                <BarList :rows="folderRows" :format="formatBytes" empty="Aucun dossier">
                    <template #label="{ row }">
                        <i class="bi shrink-0" :class="row.key === 'root' ? 'bi-house-fill text-(--text2)' : 'bi-folder-fill'" :style="row.color ? { color: row.color } : {}" />
                        <button type="button" class="truncate text-(--text) hover:underline text-left" @click="openFolder(row.key)">{{ row.label }}</button>
                    </template>
                </BarList>
            </StatsCard>

            <StatsCard title="Plus gros fichiers" icon="bi-sort-down" subtitle="Candidats au ménage">
                <ul class="flex flex-col gap-1">
                    <li v-for="f in data.largest" :key="f.id">
                        <button type="button" class="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-(--text)/5 transition-colors text-left min-w-0" @click="revealFile(f.id)">
                            <i class="bi text-(--text2) shrink-0" :class="FAMILY_LABELS[fileFamily(f.mimeType)].icon" />
                            <span class="text-xs text-(--text) truncate flex-1">{{ f.name }}</span>
                            <StatsUserBadge :user="userById(f.ownerId)" avatar-only size="w-5 h-5" />
                            <b class="text-xs text-(--text) stats-num shrink-0 w-16 text-right">{{ formatBytes(f.size) }}</b>
                        </button>
                    </li>
                    <li v-if="data.largest.length === 0" class="text-xs text-(--text2) italic text-center py-4">Aucun fichier</li>
                </ul>
            </StatsCard>
        </div>

        <StatsCard v-if="tagRows.length" title="Volume par tag" icon="bi-tags-fill" subtitle="Fichiers joints ou liés aux tâches de chaque tag">
            <BarList :rows="tagRows" :format="formatBytes">
                <template #label="{ row }">
                    <span class="w-2.5 h-2.5 rounded-full shrink-0" :style="{ background: row.color }" />
                    <span class="truncate text-(--text)">{{ row.label }}</span>
                </template>
            </BarList>
        </StatsCard>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { user } from '@/assets/var';
import StatTile from './StatTile.vue';
import StatsCard from './StatsCard.vue';
import ColumnsChart from './ColumnsChart.vue';
import LineChart from './LineChart.vue';
import SegmentedBar from './SegmentedBar.vue';
import BarList from './BarList.vue';
import StatsUserBadge from './StatsUserBadge.vue';
import { delta, fileFamily, formatBytes, formatCount, formatPercent, FAMILY_LABELS, FAMILY_SLOT } from './statsFormat';
import type { FileStatsResponse, StatsUser } from './statsTypes';

const props = defineProps<{ data: FileStatsResponse }>();

const route = useRoute();
const router = useRouter();
const meId = computed(() => user.value?.id ?? null);
const k = computed(() => props.data.kpis);
const granularityWord = computed(() => ({ day: 'jour', week: 'semaine', month: 'mois' }[props.data.period.granularity]));

const quotaHint = computed(() => {
    const q = props.data.quota;
    if (!q || q.orgMax <= 0) return undefined;
    return `${formatPercent(k.value.bytes / q.orgMax)} du quota de l’organisation`;
});

const typeModes = [{ key: 'bytes', label: 'Volume' }, { key: 'files', label: 'Nombre' }] as const;
const typeMode = ref<'bytes' | 'files'>('bytes');

const usersById = computed(() => new Map(props.data.users.map(u => [u.id, u])));
const userById = (id: string): StatsUser | undefined => usersById.value.get(id);

const memberRows = computed(() => props.data.members
    .filter(m => m.files > 0 || m.userId === meId.value)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map(m => ({
        key: m.userId,
        label: userById(m.userId)?.name ?? 'Membre',
        value: m.bytes,
        extra: `${m.files} fich.${m.added ? ` · +${m.added}` : ''}`,
        title: m.lastAt ? `Dernier ajout le ${new Date(m.lastAt).toLocaleDateString('fr-FR')}` : undefined,
    })));

const folderRows = computed(() => props.data.folders.map(f => ({
    key: f.id ?? 'root',
    label: f.name,
    color: f.color,
    value: f.bytes,
    extra: `${f.files} fich.`,
})));

const tagRows = computed(() => {
    const meta = new Map(props.data.tagsMeta.map(t => [t.id, t]));
    return props.data.tags.slice(0, 10).map(t => ({
        key: t.tagId,
        label: meta.get(t.tagId)?.name ?? 'Tag supprimé',
        color: meta.get(t.tagId)?.color ?? 'var(--viz-muted)',
        value: t.bytes,
        extra: `${t.files} fich.`,
    }));
});

const filesRoute = (query: Record<string, string>) =>
    ({ name: 'SpaceFiles', params: { orgId: route.params.orgId, spaceId: route.params.spaceId }, query: { showView: '1', ...query } });
const revealFile = (id: string) => router.push(filesRoute({ reveal: id }));
const openFolder = (key: string) => router.push(filesRoute(key === 'root' ? {} : { folderId: key }));
</script>
