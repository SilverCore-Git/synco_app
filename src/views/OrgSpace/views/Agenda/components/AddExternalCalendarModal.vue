<template>
    <Popup :is-open="isOpen" @close="close">
        <template #title>{{ isEditing ? 'Modifier le lien du calendrier' : 'Ajouter un calendrier externe' }}</template>

        <div class="space-y-4">
            <div v-if="!isEditing" class="tab-row">
                <button type="button" class="tab" :class="{ 'is-active': tab === 'url' }" @click="tab = 'url'">
                    <i class="bi bi-link-45deg"></i> Lien (URL)
                </button>
                <button type="button" class="tab" :class="{ 'is-active': tab === 'file' }" @click="tab = 'file'">
                    <i class="bi bi-file-earmark-text"></i> Fichier .ics
                </button>
                <button type="button" class="tab" :class="{ 'is-active': tab === 'google' }" @click="tab = 'google'">
                    <i class="bi bi-google"></i> Google
                </button>
            </div>

            <!-- Lien ICS/webcal -->
            <div v-if="tab === 'url'" class="space-y-3">
                <p class="hint">
                    <template v-if="isEditing">
                        Remplace le lien suivi par ce calendrier. Les événements de l'ancien lien qui
                        n'existent pas dans le nouveau seront retirés de ton agenda.
                    </template>
                    <template v-else>
                        Colle le lien ICS (ou webcal) de n'importe quel agenda — Google, Outlook, Apple,
                        ou tout autre service qui en propose un. Il sera resynchronisé automatiquement
                        (environ une fois par heure).
                    </template>
                </p>
                <div class="field">
                    <label class="field-label">{{ isEditing ? 'Nouveau lien' : 'Lien du calendrier' }}</label>
                    <input v-model.trim="urlValue" type="url" placeholder="https://…/calendar.ics" class="field-input" :disabled="submitting" />
                </div>
                <div class="field">
                    <label class="field-label">Nom affiché (optionnel)</label>
                    <input v-model.trim="labelValue" type="text" maxlength="200" placeholder="Ex. Calendrier de l'équipe" class="field-input" :disabled="submitting" />
                </div>
                <div class="color-swatch-panel">
                    <button
                        v-for="c in colorPresets"
                        :key="c"
                        type="button"
                        class="color-swatch"
                        :class="{ 'is-active': colorValue === c }"
                        :style="{ background: c }"
                        :disabled="submitting"
                        @click="colorValue = c"
                    ></button>
                    <button type="button" class="color-swatch color-swatch-none" :class="{ 'is-active': !colorValue }" :disabled="submitting" @click="colorValue = null">
                        <i class="bi bi-slash-lg"></i>
                    </button>
                </div>
                <button type="button" class="primary w-full justify-center" :disabled="!urlValue || submitting" @click="submitUrl">
                    <i v-if="submitting" class="bi bi-arrow-repeat animate-spin"></i>
                    <i v-else :class="isEditing ? 'bi bi-check-lg' : 'bi bi-plus-lg'"></i>
                    {{ isEditing ? 'Mettre à jour le lien' : 'Ajouter ce calendrier' }}
                </button>
            </div>

            <!-- Fichier .ics -->
            <div v-else-if="tab === 'file'" class="space-y-3">
                <p class="hint">
                    Importe un fichier <code>.ics</code> exporté depuis un autre agenda. L'import est
                    ponctuel — pour le mettre à jour plus tard, reviens ici remplacer le fichier.
                </p>
                <div class="field">
                    <label class="field-label">Fichier .ics</label>
                    <input ref="fileInputEl" type="file" accept=".ics,text/calendar" class="field-input-file" :disabled="submitting" @change="onFileChange" />
                </div>
                <div class="field">
                    <label class="field-label">Nom affiché (optionnel)</label>
                    <input v-model.trim="labelValue" type="text" maxlength="200" placeholder="Ex. Agenda perso" class="field-input" :disabled="submitting" />
                </div>
                <div class="color-swatch-panel">
                    <button
                        v-for="c in colorPresets"
                        :key="c"
                        type="button"
                        class="color-swatch"
                        :class="{ 'is-active': colorValue === c }"
                        :style="{ background: c }"
                        :disabled="submitting"
                        @click="colorValue = c"
                    ></button>
                    <button type="button" class="color-swatch color-swatch-none" :class="{ 'is-active': !colorValue }" :disabled="submitting" @click="colorValue = null">
                        <i class="bi bi-slash-lg"></i>
                    </button>
                </div>
                <button type="button" class="primary w-full justify-center" :disabled="!fileValue || submitting" @click="submitFile">
                    <i v-if="submitting" class="bi bi-arrow-repeat animate-spin"></i>
                    <i v-else class="bi bi-upload"></i>
                    Importer ce fichier
                </button>
            </div>

            <!-- Google Calendar -->
            <div v-else class="space-y-3">
                <p class="hint">
                    Connecte ton compte Google pour une synchronisation à double sens : les événements
                    créés dans Synco apparaissent aussi dans Google Calendar, et inversement.
                </p>
                <button type="button" class="primary w-full justify-center" :disabled="submitting" @click="submitGoogle">
                    <i class="bi bi-google"></i>
                    Continuer avec Google
                </button>
            </div>
        </div>
    </Popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { useExternalCalendars } from '@/composables/useExternalCalendars';
import type { ExternalCalendarConnectionSummary } from '@/types/agenda';

const props = defineProps<{ isOpen: boolean; orgId: string; editConnection?: ExternalCalendarConnectionSummary | null }>();
const emit = defineEmits<{ close: [] }>();

const { addIcsUrl, addIcsFile, updateIcsUrl, connectGoogle } = useExternalCalendars();

const isEditing = computed(() => !!props.editConnection);

// Mêmes teintes que EventPanel.vue::colorPresets — cohérence visuelle entre
// la couleur d'un événement et celle d'un calendrier superposé.
const colorPresets = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6', '#64748b'];

const tab = ref<'url' | 'file' | 'google'>('url');
const urlValue = ref('');
const labelValue = ref('');
const colorValue = ref<string | null>(null);
const fileValue = ref<File | null>(null);
const fileInputEl = ref<HTMLInputElement | null>(null);
const submitting = ref(false);

function resetForm() {
    tab.value = 'url';
    // En édition, le lien lui-même n'est jamais renvoyé au client (traité
    // comme un secret côté API) — seuls nom/couleur peuvent être pré-remplis,
    // l'utilisateur doit retaper le nouveau lien.
    urlValue.value = '';
    labelValue.value = props.editConnection?.label || '';
    colorValue.value = props.editConnection?.color || null;
    fileValue.value = null;
    if (fileInputEl.value) fileInputEl.value.value = '';
}

watch(() => props.isOpen, (open) => {
    if (open) resetForm();
});

function close() {
    emit('close');
}

function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    fileValue.value = input.files?.[0] || null;
}

async function submitUrl() {
    if (!urlValue.value || submitting.value) return;
    submitting.value = true;
    const okResult = isEditing.value && props.editConnection
        ? await updateIcsUrl(props.orgId, props.editConnection.id, urlValue.value, labelValue.value || null, colorValue.value)
        : await addIcsUrl(props.orgId, urlValue.value, labelValue.value || null, colorValue.value);
    submitting.value = false;
    if (okResult) close();
}

async function submitFile() {
    if (!fileValue.value || submitting.value) return;
    submitting.value = true;
    const okResult = await addIcsFile(props.orgId, fileValue.value, labelValue.value || null, colorValue.value);
    submitting.value = false;
    if (okResult) close();
}

async function submitGoogle() {
    if (submitting.value) return;
    submitting.value = true;
    // Redirection pleine page — le modal disparaît avec la navigation, pas
    // besoin d'appeler close() ici (voir useExternalCalendars::connectGoogle).
    await connectGoogle(props.orgId);
    submitting.value = false;
}
</script>

<style scoped>
.tab-row {
    display: flex;
    gap: 6px;
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 10px;
}

.tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
    background: transparent;
}

.tab:hover {
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
}

.tab.is-active {
    background: var(--primary);
    color: white;
}

.hint {
    font-size: 12px;
    color: var(--text2);
    line-height: 1.5;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.field-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--text2);
}

.field-input {
    background: var(--bg2);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 8px 10px;
    font-size: 13px;
    color: var(--text);
    outline: none;
}

.field-input:focus {
    border-color: var(--primary);
}

.field-input-file {
    font-size: 12px;
    color: var(--text2);
}

.color-swatch-panel {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0 2px;
}

.color-swatch {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid transparent;
    transition: transform 0.1s ease;
}
.color-swatch:hover {
    transform: scale(1.12);
}
.color-swatch.is-active {
    border-color: var(--text);
}

.color-swatch-none {
    background: transparent;
    border: 1.5px dashed var(--text2);
    color: var(--text2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
}
</style>
