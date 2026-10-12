<template>

    <!-- Création d'un ticket : titre facultatif, description obligatoire,
         captures (glisser-déposer + collage + bouton, comme la zone d'envoi
         de ChatTimeline) et organisation concernée (liste déroulante avec
         recherche + « Aucune », jamais une rangée de boutons). -->

    <form
        class="flex flex-col gap-4"
        @submit.prevent="submit"
        @dragover.prevent="isDragging = true"
        @dragleave.prevent="isDragging = false"
        @drop.prevent="handleDrop"
        @paste="handlePaste"
    >

        <div>
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wide mb-1.5 block">Titre (facultatif)</label>
            <input
                v-model="title"
                type="text"
                maxlength="200"
                placeholder="Résumé en quelques mots..."
                class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm text-(--text) outline-none focus:border-(--primary)/50"
            />
        </div>

        <div>
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wide mb-1.5 block">Description <span class="text-red-500">*</span></label>
            <textarea
                v-model="description"
                required
                rows="6"
                placeholder="Décrivez votre problème aussi précisément que possible..."
                class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm text-(--text) outline-none focus:border-(--primary)/50 resize-none"
            />
        </div>

        <div>
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wide mb-1.5 block">Organisation concernée</label>
            <SupportSearchSelect
                v-model="organizationId"
                :options="orgOptions"
                none-label="Aucune"
                placeholder="Aucune"
                search-placeholder="Rechercher une organisation..."
            />
        </div>

        <div>
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wide mb-1.5 block">Captures d'écran</label>

            <div
                class="relative border-2 border-dashed rounded-xl p-4 transition-colors"
                :class="isDragging ? 'border-(--primary) bg-(--primary)/5' : 'border-(--border-color)'"
            >
                <input ref="fileInputRef" type="file" multiple accept="image/*,video/*,.pdf" class="hidden" @change="onFileInput" />

                <div v-if="files.length === 0" class="flex flex-col items-center justify-center gap-2 py-4 text-center">
                    <i class="bi bi-cloud-arrow-up text-2xl text-(--text2)" />
                    <p class="text-xs text-(--text2)">
                        Glissez-déposez, collez (Ctrl+V) ou
                        <button type="button" class="text-(--primary) font-bold" @click="fileInputRef?.click()">choisissez un fichier</button>
                    </p>
                </div>

                <div v-else class="flex flex-wrap gap-2">
                    <div
                        v-for="(file, index) in files"
                        :key="index"
                        class="relative group bg-(--bg) border border-(--border-color) rounded-lg px-3 py-1.5 flex items-center gap-2 max-w-full"
                    >
                        <i class="bi text-lg" :class="[getFileInfo({ originalName: file.name, mimeType: file.type }).color, getFileInfo({ originalName: file.name, mimeType: file.type }).icon]" />
                        <span class="text-xs truncate max-w-40">{{ file.name }}</span>
                        <button type="button" class="text-red-400 hover:text-red-500" @click="files.splice(index, 1)">
                            <i class="bi bi-x-circle-fill" />
                        </button>
                    </div>
                    <button type="button" class="text-xs text-(--primary) font-bold px-2" @click="fileInputRef?.click()">
                        + Ajouter
                    </button>
                </div>
            </div>
        </div>

        <div v-if="submitting" class="w-full h-1.5 bg-(--text)/5 rounded-full overflow-hidden">
            <div class="h-full bg-(--primary) transition-all" :style="{ width: uploadPercent + '%' }" />
        </div>

        <div class="flex justify-end gap-3 mt-2">
            <button type="button" class="default" @click="emit('cancel')" :disabled="submitting">Annuler</button>
            <button type="submit" class="primary" :disabled="submitting || !description.trim()">
                <span v-if="submitting"><i class="bi bi-arrow-repeat animate-spin mr-1" /> Envoi...</span>
                <span v-else>Créer le ticket</span>
            </button>
        </div>

    </form>

</template>

<script lang="ts" setup>

import { computed, ref } from 'vue';
import { organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { createSupportTicket, type CreateSupportTicketResult } from '@/services/support/tickets';
import { SupportLockedError, SupportNotConfiguredError } from '@/services/support/keys';
import SupportSearchSelect from '@/components/support/SupportSearchSelect.vue';

const emit = defineEmits<{
    (e: 'created', result: CreateSupportTicketResult): void;
    (e: 'cancel'): void;
}>();

const toast = useToast();

const title = ref('');
const description = ref('');
const organizationId = ref<string | null>(null);
const files = ref<File[]>([]);
const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const submitting = ref(false);
const uploadPercent = ref(0);

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const orgOptions = computed(() => organizations.value.map((o: any) => ({ id: o.id, label: o.name })));

const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    isDragging.value = false;
    for (const f of Array.from(list)) {
        if (f.size > MAX_FILE_BYTES) {
            toast.show(`« ${f.name} » dépasse 25 Mo.`, 'warning');
            continue;
        }
        files.value.push(f);
    }
};

const onFileInput = (e: Event) => {
    addFiles((e.target as HTMLInputElement).files);
    if (fileInputRef.value) fileInputRef.value.value = '';
};

const handleDrop = (e: DragEvent) => addFiles(e.dataTransfer?.files ?? null);

const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
        if (item.kind === 'file') {
            const f = item.getAsFile();
            if (f) addFiles([f]);
        }
    }
};

const submit = async () => {
    if (!description.value.trim() || submitting.value) return;
    submitting.value = true;
    uploadPercent.value = 0;
    try {
        const result = await createSupportTicket({
            title: title.value.trim() || null,
            description: description.value,
            organizationId: organizationId.value,
            files: files.value,
            onUploadProgress: (p) => { uploadPercent.value = p; },
        });
        if (result.attachmentError) {
            toast.show(`Ticket créé, mais les pièces jointes n'ont pas pu être envoyées : ${result.attachmentError.message}`, 'warning', 6000);
        } else {
            toast.show('Ticket créé.', 'success');
        }
        emit('created', result);
    } catch (e) {
        if (e instanceof SupportLockedError) {
            toast.show(e.message, 'warning', 6000);
        } else if (e instanceof SupportNotConfiguredError) {
            toast.show(e.message, 'error', 6000);
        } else {
            toast.show((e as Error).message || 'Impossible de créer le ticket.', 'error');
        }
    } finally {
        submitting.value = false;
    }
};

</script>
