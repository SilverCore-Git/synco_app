<template>

    <div class="space-y-6">

        <div class="flex items-center gap-3">
            <button
                @click="emit('back')"
                class="p-2 rounded-lg text-(--text2) hover:text-(--text) hover:bg-(--text)/10 transition-all"
            >
                <i class="bi bi-arrow-left" />
            </button>
            <h3 class="text-lg font-black text-(--text)">
                {{ reportId ? 'Modifier le rapport' : 'Nouveau rapport' }}
            </h3>
        </div>

        <div v-if="loadingReport" class="flex justify-center py-10">
            <SpinLoader />
        </div>

        <template v-else>

            <!-- NOM ET PORTÉE -->
            <section class="space-y-3">
                <label class="field">
                    <span class="field-label">Nom du rapport</span>
                    <input v-model="draft.name" type="text" class="input" maxlength="80"
                        placeholder="Mon point du matin" />
                </label>

                <label class="field">
                    <span class="field-label">Ce rapport concerne</span>
                    <select
                        :value="draft.spaceId ?? ''"
                        @change="draft.spaceId = ($event.target as HTMLSelectElement).value || null"
                        class="input"
                    >
                        <option value="">Toute l'organisation</option>
                        <option v-for="space in spaces" :key="space.id" :value="space.id">
                            {{ space.name }}
                        </option>
                    </select>
                </label>
            </section>

            <!-- QUAND -->
            <section class="space-y-3">
                <h4 class="font-bold text-(--text)">Quand</h4>
                <ScheduleBuilder v-model="draft" :nextRunAt="nextRunAt" />
            </section>

            <!-- CONTENU -->
            <section class="space-y-3">

                <div class="flex items-center justify-between">
                    <h4 class="font-bold text-(--text)">Contenu</h4>
                    <DropDown align="right" contentInerTW="w-72 max-h-80 overflow-y-auto">
                        <template #trigger>
                            <button class="px-3 py-1.5 rounded-lg bg-(--text)/5 text-sm text-(--text) hover:bg-(--text)/10 transition-colors">
                                <i class="bi bi-plus-lg mr-1.5" />Ajouter une section
                            </button>
                        </template>
                        <template #content>
                            <template v-for="family in families" :key="family">
                                <div class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-(--text2)">
                                    {{ family }}
                                </div>
                                <button
                                    v-for="def in definitionsByFamily(family)"
                                    :key="def.type"
                                    @click="addSection(def.type)"
                                    class="w-full flex items-start gap-2 px-3 py-2 rounded-lg text-left hover:bg-(--text)/10 transition-colors"
                                >
                                    <i :class="def.icon" class="text-(--primary) mt-0.5 shrink-0" />
                                    <span class="min-w-0">
                                        <span class="block text-sm text-(--text)">{{ def.label }}</span>
                                        <span class="block text-xs text-(--text2)">{{ def.description }}</span>
                                    </span>
                                </button>
                            </template>
                        </template>
                    </DropDown>
                </div>

                <!-- Un rapport qui n'agrège que des sections d'état n'est jamais
                     vide : la règle « ne rien envoyer si vide » ne s'y
                     déclenchera pas, ce qu'il faut dire avant l'enregistrement. -->
                <p
                    v-if="onlyStateSections && draft.rhythm === 'HOURLY'"
                    class="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-xs text-amber-600 leading-snug"
                >
                    <i class="bi bi-exclamation-triangle-fill mt-0.5 shrink-0" />
                    Ce rapport ne contient que des sections d'état, qui décrivent la
                    situation plutôt qu'une période. Il ne sera donc jamais considéré
                    comme vide et partira à chaque échéance, même sans rien de neuf.
                </p>

                <div v-if="draft.sections.length === 0" class="p-6 text-center rounded-xl border border-dashed border-(--border-color)">
                    <p class="text-sm text-(--text2)">Ajoutez au moins une section.</p>
                </div>

                <div v-else class="space-y-2">
                    <div
                        v-for="(section, index) in draft.sections"
                        :key="`${section.type}-${index}`"
                        draggable="true"
                        @dragstart="dragIndex = index"
                        @dragover.prevent
                        @drop="dropOn(index)"
                    >
                        <SectionCard
                            :model-value="section"
                            @update:model-value="draft.sections[index] = $event"
                            @remove="removeSection(index)"
                        />
                    </div>
                </div>

            </section>

            <!-- OPTIONS D'ENVOI -->
            <section class="space-y-3">
                <h4 class="font-bold text-(--text)">Envoi</h4>

                <div class="p-4 bg-(--bg2) rounded-xl border border-(--border-color) space-y-3">

                    <label class="flex items-start gap-2.5 cursor-pointer">
                        <input type="checkbox" v-model="draft.sendIfEmpty" class="accent-(--primary) mt-0.5" />
                        <span class="min-w-0">
                            <span class="block text-sm text-(--text)">M'envoyer le rapport même s'il est vide</span>
                            <span class="block text-xs text-(--text2)">
                                Décoché, aucun e-mail ne part quand il n'y a rien à signaler.
                            </span>
                        </span>
                    </label>

                    <label class="field">
                        <span class="field-label">Période couverte</span>
                        <select v-model="draft.windowMode" class="input">
                            <option value="WATERMARK">Depuis le dernier envoi</option>
                            <option value="FIXED">Une durée fixe avant chaque envoi</option>
                        </select>
                        <span class="text-xs text-(--text2)">
                            {{ draft.windowMode === 'WATERMARK'
                                ? 'Rien ne passe entre les mailles, même après une interruption.'
                                : 'Toujours la même durée, quitte à laisser un trou si un envoi est manqué.' }}
                        </span>
                    </label>

                    <label class="field">
                        <span class="field-label">Texte d'introduction</span>
                        <textarea
                            :value="draft.introText ?? ''"
                            @input="draft.introText = ($event.target as HTMLTextAreaElement).value || null"
                            class="input resize-none"
                            rows="2"
                            maxlength="1000"
                            placeholder="Optionnel — apparaît en tête de l'e-mail"
                        />
                    </label>

                </div>
            </section>

            <div class="flex flex-wrap items-center gap-3 pt-2">
                <button
                    @click="save"
                    :disabled="saving || draft.sections.length === 0 || !draft.name.trim()"
                    class="px-5 py-2.5 rounded-lg bg-(--primary) text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                    {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
                </button>

                <button
                    v-if="reportId"
                    @click="openPreview"
                    :disabled="previewing"
                    class="px-4 py-2.5 rounded-lg bg-(--text)/5 text-(--text) hover:bg-(--text)/10 transition-colors disabled:opacity-40"
                >
                    <i class="bi bi-eye mr-1.5" />Aperçu
                </button>

                <button
                    v-if="reportId"
                    @click="test"
                    class="px-4 py-2.5 rounded-lg bg-(--text)/5 text-(--text) hover:bg-(--text)/10 transition-colors"
                >
                    <i class="bi bi-send mr-1.5" />M'envoyer un test
                </button>
            </div>

            <p v-if="reportId" class="text-xs text-(--text2)">
                L'aperçu et le test utilisent la version enregistrée — pensez à
                enregistrer vos modifications d'abord.
            </p>

        </template>

        <!-- L'aperçu tient dans une iframe isolée : sans ça, le CSS de l'e-mail
             (qui cible body, table, a) déborderait sur l'application. -->
        <Teleport to="body">
            <div
                v-if="previewHtml"
                class="fixed inset-0 z-[3000] flex items-center justify-center p-4"
                @click.self="previewHtml = null"
            >
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                <div class="relative w-full max-w-3xl h-[85vh] flex flex-col rounded-2xl bg-(--bg2) border border-(--text)/10 shadow-2xl overflow-hidden">
                    <div class="flex items-center justify-between gap-4 p-4 border-b border-(--border-color)">
                        <span class="text-sm font-medium text-(--text) truncate">{{ previewSubject }}</span>
                        <button @click="previewHtml = null" class="p-1.5 rounded-md text-(--text2) hover:text-(--text) hover:bg-(--text)/10">
                            <i class="bi bi-x-lg" />
                        </button>
                    </div>
                    <iframe
                        :srcdoc="previewHtml"
                        sandbox=""
                        class="flex-1 w-full bg-white"
                        title="Aperçu du rapport"
                    />
                </div>
            </div>
        </Teleport>

    </div>

</template>

<script setup lang="ts">

import { ref, reactive, computed, onMounted } from 'vue';
import DropDown from '@/components/DropDown.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import ScheduleBuilder from './ScheduleBuilder.vue';
import SectionCard from './SectionCard.vue';
import { useActivityReports } from '@/composables/useActivityReports';
import { useToast } from '@/composables/useToast';
import {
    SECTION_DEFINITIONS, sectionDef,
    type ActivityReport, type SectionType, type SectionDefinition,
} from '@/types/activityReports';

const props = defineProps<{
    orgId: string;
    /** Absent = création. */
    reportId?: string | null;
    spaces: { id: string; name: string }[];
}>();

const emit = defineEmits<{ (e: 'back'): void }>();

const { reports, fetchReports, createReport, updateReport, previewReport, sendTestReport } = useActivityReports();
const toast = useToast();

type Draft = Omit<ActivityReport, 'id' | 'organizationId' | 'organization' | 'space' | 'nextRunAt' | 'lastSentAt'>;

const draft = reactive<Draft>({
    name: '',
    enabled: true,
    spaceId: null,
    rhythm: 'DAILY',
    sendTimes: [510],
    activeWeekdays: [1, 2, 3, 4, 5],
    intervalHours: null,
    activeFromMinute: null,
    activeUntilMinute: null,
    dayOfMonth: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
    startsAt: null,
    endsAt: null,
    windowMode: 'WATERMARK',
    windowCapDays: 7,
    sendIfEmpty: false,
    minItems: 1,
    introText: null,
    sections: [],
});

const loadingReport = ref<boolean>(false);
const saving = ref<boolean>(false);
const previewing = ref<boolean>(false);
const previewHtml = ref<string | null>(null);
const previewSubject = ref<string>('');
const nextRunAt = ref<string | null>(null);
const dragIndex = ref<number | null>(null);

const families: SectionDefinition['family'][] = ['Tâches', 'Agenda', 'Fichiers', 'Messages', 'Appels', 'Tags'];

const definitionsByFamily = (family: SectionDefinition['family']) =>
    SECTION_DEFINITIONS.filter(d => d.family === family);

const onlyStateSections = computed(() =>
    draft.sections.length > 0
    && draft.sections.every(s => sectionDef(s.type).nature === 'STATE')
);

onMounted(async () => {
    if (!props.reportId) return;

    loadingReport.value = true;
    try {
        if (reports.value.length === 0) await fetchReports();
        const existing = reports.value.find(r => r.id === props.reportId);
        if (!existing) return;

        Object.assign(draft, {
            name: existing.name,
            enabled: existing.enabled,
            spaceId: existing.spaceId ?? null,
            rhythm: existing.rhythm,
            sendTimes: [...existing.sendTimes],
            activeWeekdays: [...existing.activeWeekdays],
            intervalHours: existing.intervalHours ?? null,
            activeFromMinute: existing.activeFromMinute ?? null,
            activeUntilMinute: existing.activeUntilMinute ?? null,
            dayOfMonth: existing.dayOfMonth ?? null,
            timezone: existing.timezone,
            startsAt: existing.startsAt ?? null,
            endsAt: existing.endsAt ?? null,
            windowMode: existing.windowMode,
            windowCapDays: existing.windowCapDays,
            sendIfEmpty: existing.sendIfEmpty,
            minItems: existing.minItems,
            introText: existing.introText ?? null,
            sections: [...existing.sections]
                .sort((a, b) => a.position - b.position)
                .map(s => ({ ...s, filters: { ...s.filters } })),
        });
        nextRunAt.value = existing.nextRunAt ?? null;
    } finally {
        loadingReport.value = false;
    }
});

const addSection = (type: SectionType) => {
    draft.sections.push({
        type,
        position: draft.sections.length,
        enabled: true,
        customTitle: null,
        displayMode: 'DETAILED',
        itemLimit: 10,
        hideWhenEmpty: true,
        filters: type.startsWith('TASKS_') ? { assignee: 'me' } : {},
    });
};

const removeSection = (index: number) => {
    draft.sections.splice(index, 1);
    renumber();
};

/** `position` doit rester contigu et refléter l'ordre du tableau : c'est lui
 *  qui est envoyé à l'API, et il sert d'orderBy à la génération. */
const renumber = () => {
    draft.sections.forEach((section, index) => { section.position = index; });
};

const dropOn = (targetIndex: number) => {
    if (dragIndex.value === null || dragIndex.value === targetIndex) return;

    const [moved] = draft.sections.splice(dragIndex.value, 1);
    if (moved) draft.sections.splice(targetIndex, 0, moved);
    renumber();

    dragIndex.value = null;
};

const save = async () => {
    saving.value = true;
    try {
        const payload = { ...draft, sections: draft.sections.map(s => ({ ...s })) };

        if (props.reportId) {
            const updated = await updateReport(props.reportId, payload);
            nextRunAt.value = updated.nextRunAt ?? null;
        } else {
            await createReport({ ...payload, organizationId: props.orgId });
            emit('back');
        }
    } catch {
        // Le composable a déjà affiché l'erreur.
    } finally {
        saving.value = false;
    }
};

const openPreview = async () => {
    if (!props.reportId) return;
    previewing.value = true;
    try {
        const result = await previewReport(props.reportId);
        previewHtml.value = result.html;
        previewSubject.value = result.subject;
        if (result.totalItems === 0) toast.show('Rien à signaler sur la période — aperçu vide', 'info');
    } catch {
        // Idem.
    } finally {
        previewing.value = false;
    }
};

const test = () => {
    if (!props.reportId) return;
    sendTestReport(props.reportId).catch(() => {});
};

</script>

<style scoped>
@reference "@/style.css";

.field {
    @apply flex flex-col gap-1.5;
}

.field-label {
    @apply text-sm font-medium text-(--text);
}

.input {
    @apply bg-(--bg) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) outline-none focus:border-(--primary)/50 transition-colors;
}

</style>
