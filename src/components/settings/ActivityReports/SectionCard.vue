<template>

    <div
        class="rounded-xl border transition-all"
        :class="section.enabled
            ? 'bg-(--bg2) border-(--border-color)'
            : 'bg-(--bg2)/50 border-(--border-color) opacity-60'"
    >

        <div class="flex items-center gap-3 p-4">

            <button
                class="cursor-grab text-(--text2) hover:text-(--text) transition-colors shrink-0"
                title="Glisser pour réordonner"
                @mousedown="emit('dragStart')"
            >
                <i class="bi bi-grip-vertical" />
            </button>

            <button class="min-w-0 flex-1 text-left" @click="expanded = !expanded">
                <div class="flex items-center gap-2">
                    <i :class="def.icon" class="text-(--primary) shrink-0" />
                    <span class="font-semibold text-(--text) truncate">
                        {{ section.customTitle?.trim() || def.label }}
                    </span>
                    <!-- Le badge rend visible la distinction période/état, sans
                         laquelle un rapport horaire « tâches en retard » envoie
                         24 e-mails identiques par jour. -->
                    <span
                        class="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0"
                        :class="def.nature === 'STATE'
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-(--primary)/15 text-(--primary)'"
                        :title="def.nature === 'STATE'
                            ? 'Décrit la situation au moment de l\'envoi'
                            : 'Couvre ce qui s\'est passé depuis le dernier envoi'"
                    >
                        {{ def.nature === 'STATE' ? 'état' : 'période' }}
                    </span>
                </div>
                <p class="text-xs text-(--text2) mt-0.5 truncate">{{ filterSummary }}</p>
            </button>

            <div
                @click="section.enabled = !section.enabled"
                class="w-10 h-5 shrink-0 rounded-full relative cursor-pointer transition-colors duration-300"
                :class="section.enabled ? 'bg-(--primary)' : 'bg-(--text)/15'"
                role="switch"
                :aria-checked="section.enabled"
            >
                <div
                    class="w-4 h-4 bg-white rounded-full absolute top-0.5 shadow-sm transition-all duration-300"
                    :class="section.enabled ? 'right-0.5' : 'left-0.5 opacity-50'"
                />
            </div>

            <button
                @click="emit('remove')"
                class="p-1.5 shrink-0 rounded-md text-(--text2) hover:text-red-500 hover:bg-red-500/10 transition-all"
                title="Retirer cette section"
            >
                <i class="bi bi-x-lg text-sm" />
            </button>

        </div>

        <div v-if="expanded" class="px-4 pb-4 pt-0 space-y-3 border-t border-(--border-color)/60 mt-0">

            <p
                v-if="!def.available"
                class="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-amber-500/10 text-xs text-amber-600 leading-snug"
            >
                <i class="bi bi-cone-striped mt-0.5 shrink-0" />
                Cette section est configurable mais pas encore collectée : elle
                s'affichera « rien à signaler » en attendant.
            </p>

            <label class="field mt-3">
                <span class="field-label">Intitulé dans l'e-mail</span>
                <input
                    type="text"
                    class="input"
                    :placeholder="def.label"
                    :value="section.customTitle ?? ''"
                    @input="section.customTitle = ($event.target as HTMLInputElement).value || null"
                    maxlength="80"
                />
            </label>

            <div class="grid grid-cols-2 gap-3">
                <label class="field">
                    <span class="field-label">Affichage</span>
                    <select v-model="section.displayMode" class="input">
                        <option value="DETAILED">Liste détaillée</option>
                        <option value="COMPACT">Liste compacte</option>
                        <option value="COUNT_ONLY">Compteur seul</option>
                    </select>
                </label>

                <label class="field">
                    <span class="field-label">Éléments affichés</span>
                    <select v-model.number="section.itemLimit" class="input">
                        <option v-for="n in [5, 10, 15, 20, 30, 50]" :key="n" :value="n">{{ n }} maximum</option>
                    </select>
                </label>
            </div>

            <label v-if="hasAssigneeFilter" class="field">
                <span class="field-label">Portée</span>
                <select
                    :value="section.filters.assignee ?? 'me'"
                    @change="section.filters.assignee = ($event.target as HTMLSelectElement).value as 'me' | 'anyone'"
                    class="input"
                >
                    <option value="me">Seulement ce qui me concerne</option>
                    <option value="anyone">Tout ce que je peux voir</option>
                </select>
            </label>

            <label v-if="section.type === 'TASKS_DUE_SOON'" class="field">
                <span class="field-label">Horizon</span>
                <select
                    :value="section.filters.withinDays ?? 7"
                    @change="section.filters.withinDays = Number(($event.target as HTMLSelectElement).value)"
                    class="input"
                >
                    <option v-for="d in [1, 3, 7, 14, 30]" :key="d" :value="d">
                        {{ d === 1 ? 'Demain' : `Les ${d} prochains jours` }}
                    </option>
                </select>
            </label>

            <label class="flex items-center gap-2.5 cursor-pointer">
                <input type="checkbox" v-model="section.hideWhenEmpty" class="accent-(--primary)" />
                <span class="text-sm text-(--text)">Masquer cette section quand elle est vide</span>
            </label>

        </div>

    </div>

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import { sectionDef, type ReportSection } from '@/types/activityReports';

const section = defineModel<ReportSection>({ required: true });

const emit = defineEmits<{
    (e: 'remove'): void;
    (e: 'dragStart'): void;
}>();

const expanded = ref<boolean>(false);

const def = computed(() => sectionDef(section.value.type));

/** Les sections de tâches acceptent toutes le filtre « moi / tout le monde ». */
const hasAssigneeFilter = computed(() => section.value.type.startsWith('TASKS_'));

/** Résumé d'une ligne affiché sur la carte repliée. */
const filterSummary = computed(() => {
    const parts: string[] = [];

    if (hasAssigneeFilter.value) {
        parts.push(section.value.filters.assignee === 'anyone' ? 'Tout ce que je vois' : 'Ce qui me concerne');
    }
    if (section.value.type === 'TASKS_DUE_SOON') {
        const days = section.value.filters.withinDays ?? 7;
        parts.push(days === 1 ? 'demain' : `${days} jours`);
    }
    if (section.value.filters.tagIds?.length) {
        parts.push(`${section.value.filters.tagIds.length} tag(s)`);
    }

    const mode = { DETAILED: 'détaillé', COMPACT: 'compact', COUNT_ONLY: 'compteur' }[section.value.displayMode];
    parts.push(`${mode}, ${section.value.itemLimit} max`);

    return parts.join(' · ');
});

</script>

<style scoped>

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
