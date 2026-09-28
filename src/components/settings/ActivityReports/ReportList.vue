<template>

    <div class="space-y-6">

        <div>
            <h3 class="text-lg font-black text-(--text)">Rapports d'activité</h3>
            <p class="text-sm text-(--text2) mt-1">
                Des e-mails récurrents qui résument ce qui a bougé sur votre périmètre.
            </p>
        </div>

        <div v-if="loading" class="flex justify-center py-10">
            <SpinLoader />
        </div>

        <!--
            Aucun rapport : on ne montre pas un état vide avec un bouton « Créer »,
            mais des préréglages activables d'un clic. Le chemin simple s'arrête
            ici, sans avoir croisé un seul champ de formulaire.
        -->
        <div v-else-if="reports.length === 0" class="space-y-3">

            <p class="text-sm text-(--text2)">
                Choisissez un point de départ — vous pourrez tout ajuster ensuite.
            </p>

            <button
                v-for="preset in REPORT_PRESETS"
                :key="preset.id"
                @click="applyPreset(preset)"
                :disabled="creatingPreset !== null"
                class="w-full flex items-center gap-4 p-5 bg-(--bg2) rounded-xl border border-(--border-color) text-left hover:bg-(--text)/5 hover:border-(--primary)/40 transition-all disabled:opacity-50 disabled:cursor-wait"
            >
                <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-(--primary)/10 text-(--primary)">
                    <i :class="preset.icon" class="text-xl" />
                </div>
                <div class="min-w-0">
                    <h4 class="font-bold text-(--text)">{{ preset.name }}</h4>
                    <p class="text-sm text-(--text2) mt-0.5">{{ preset.tagline }}</p>
                </div>
                <i
                    :class="creatingPreset === preset.id ? 'bi bi-hourglass-split' : 'bi bi-plus-lg'"
                    class="ml-auto shrink-0 text-(--text2)"
                />
            </button>

            <button
                @click="emit('create')"
                class="w-full p-4 rounded-xl border border-dashed border-(--border-color) text-sm text-(--text2) hover:text-(--text) hover:border-(--primary)/40 transition-all"
            >
                <i class="bi bi-sliders2 mr-2" />Partir d'un rapport vierge
            </button>

        </div>

        <div v-else class="space-y-3">

            <div
                v-for="report in reports"
                :key="report.id"
                class="p-5 bg-(--bg2) rounded-xl border border-(--border-color) transition-all"
                :class="report.enabled ? '' : 'opacity-60'"
            >

                <div class="flex items-start gap-4">

                    <button
                        @click="emit('edit', report.id)"
                        class="min-w-0 flex-1 text-left group"
                    >
                        <h4 class="font-bold text-(--text) truncate group-hover:text-(--primary) transition-colors">
                            {{ report.name }}
                        </h4>
                        <p class="text-sm text-(--text2) mt-0.5">
                            {{ describeSchedule(report) }}
                        </p>
                        <div class="flex flex-wrap items-center gap-2 mt-2">
                            <span class="px-2 py-0.5 rounded-md bg-(--text)/5 text-xs text-(--text2)">
                                <i class="bi bi-diagram-3 mr-1" />{{ scopeLabel(report) }}
                            </span>
                            <span class="px-2 py-0.5 rounded-md bg-(--text)/5 text-xs text-(--text2)">
                                {{ enabledSectionCount(report) }} section{{ enabledSectionCount(report) > 1 ? 's' : '' }}
                            </span>
                            <span v-if="report.enabled && report.nextRunAt" class="text-xs text-(--text2)">
                                Prochain envoi {{ relativeNext(report.nextRunAt) }}
                            </span>
                        </div>
                    </button>

                    <!-- Interrupteur dans la liste : suspendre pendant les congés
                         ne doit pas obliger à ouvrir l'éditeur, sinon les gens
                         suppriment leur configuration et la reperdent. -->
                    <div
                        @click="toggle(report)"
                        class="w-12 h-6 shrink-0 rounded-full relative cursor-pointer transition-colors duration-300"
                        :class="report.enabled ? 'bg-(--primary)' : 'bg-(--text)/15'"
                        role="switch"
                        :aria-checked="report.enabled"
                        :title="report.enabled ? 'Suspendre' : 'Réactiver'"
                    >
                        <div
                            class="w-5 h-5 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                            :class="report.enabled ? 'right-0.5' : 'left-0.5 opacity-50'"
                        />
                    </div>

                    <DropDown align="right">
                        <template #trigger>
                            <button class="p-1.5 rounded-md text-(--text2) hover:text-(--text) hover:bg-(--text)/10 transition-all">
                                <i class="bi bi-three-dots-vertical" />
                            </button>
                        </template>
                        <template #content>
                            <button class="menu-item" @click="emit('edit', report.id)">
                                <i class="bi bi-pencil" />Modifier
                            </button>
                            <button class="menu-item" @click="test(report)">
                                <i class="bi bi-send" />M'envoyer un test
                            </button>
                            <button class="menu-item text-red-500" @click="askDelete(report)">
                                <i class="bi bi-trash" />Supprimer
                            </button>
                        </template>
                    </DropDown>

                </div>

            </div>

            <button
                v-if="reports.length < MAX_REPORTS"
                @click="emit('create')"
                class="w-full p-4 rounded-xl border border-dashed border-(--border-color) text-sm text-(--text2) hover:text-(--text) hover:border-(--primary)/40 transition-all"
            >
                <i class="bi bi-plus-lg mr-2" />Nouveau rapport
            </button>
            <p v-else class="text-xs text-(--text2) text-center">
                Vous avez atteint la limite de {{ MAX_REPORTS }} rapports.
            </p>

        </div>

        <ConfirmDelete
            :show="deleteTarget !== null"
            :itemName="deleteTarget?.name || ''"
            itemType="le rapport"
            :loading="deleting"
            @confirm="confirmDelete"
            @cancel="deleteTarget = null"
        />

    </div>

</template>

<script setup lang="ts">

import { ref, onMounted } from 'vue';
import DropDown from '@/components/DropDown.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useActivityReports } from '@/composables/useActivityReports';
import { describeSchedule } from '@/assets/utils/describeSchedule';
import { REPORT_PRESETS, type ActivityReport, type ReportPreset } from '@/types/activityReports';

const props = defineProps<{
    /** Organisation courante : portée par défaut d'un rapport créé ici. */
    orgId: string;
}>();

const emit = defineEmits<{
    (e: 'create'): void;
    (e: 'edit', reportId: string): void;
}>();

// Aligné sur MAX_REPORTS_PER_USER côté API — la vraie contrainte est
// appliquée là-bas, celle-ci évite juste de proposer une action qui échouera.
const MAX_REPORTS = 5;

const { reports, loading, fetchReports, createReport, toggleReport, deleteReport, sendTestReport } = useActivityReports();

const creatingPreset = ref<string | null>(null);
const deleteTarget = ref<ActivityReport | null>(null);
const deleting = ref<boolean>(false);

onMounted(() => { fetchReports(); });

const scopeLabel = (report: ActivityReport): string =>
    report.space?.name ? `${report.organization?.name} › ${report.space.name}` : (report.organization?.name ?? 'Organisation');

const enabledSectionCount = (report: ActivityReport): number =>
    report.sections.filter(s => s.enabled).length;

const relativeNext = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(date);
};

const applyPreset = async (preset: ReportPreset) => {
    creatingPreset.value = preset.id;
    try {
        await createReport({ ...preset.build(), organizationId: props.orgId });
    } catch {
        // Le composable a déjà affiché l'erreur.
    } finally {
        creatingPreset.value = null;
    }
};

const toggle = (report: ActivityReport) => {
    toggleReport(report.id, !report.enabled).catch(() => {});
};

const test = (report: ActivityReport) => {
    sendTestReport(report.id).catch(() => {});
};

const askDelete = (report: ActivityReport) => {
    deleteTarget.value = report;
};

const confirmDelete = async () => {
    if (!deleteTarget.value) return;
    deleting.value = true;
    try {
        await deleteReport(deleteTarget.value.id);
        deleteTarget.value = null;
    } catch {
        // Idem.
    } finally {
        deleting.value = false;
    }
};

</script>

<style scoped>

.menu-item {
    @apply w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-(--text) text-left hover:bg-(--text)/10 transition-colors;
}

</style>
