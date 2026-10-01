<template>
    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>Ajouter un filigrane</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">
            <div class="flex gap-2 flex-col">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Texte du filigrane
                </label>
                <input 
                    v-model="form.text"
                    type="text" 
                    placeholder="Ex: CONFIDENTIEL - MON ORG"
                    ref="textInput"
                    class="
                        w-full bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text2) 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                />
            </div>
            
            <p class="text-sm text-(--text2) italic">
                Une copie de "{{ file.originalName }}" sera créée avec le filigrane incrusté. Le fichier original ne sera pas modifié.
            </p>
        </form>

        <template #footer>
            <button 
                @click="closeModal" 
                class="default"
                :disabled="loading"
            >
                Annuler
            </button>

            <button 
                @click="handleSubmit"
                class="primary"
                :class="[loading ? 'loader' : '']"
                :disabled="loading || !form.text.trim()"
            >
                {{ loading ? 'Génération...' : 'Créer la copie' }}
            </button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import type { StoredFile } from '@/types/types';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import { watermarkImageLocal, watermarkPDFLocal } from '@/assets/utils/watermark';
import { uploadFiles } from '@/assets/uploadFile';
import { fetchDecryptedFile } from '@/assets/utils/downloadFile';

const emit = defineEmits([ 'close', 'created' ]);

const props = defineProps<{
    file: StoredFile; 
    isOpen: boolean
}>();

const loading = ref<boolean>(false);
const textInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
  text: `CONFIDENTIEL - ${openedOrg.value?.name || 'SYNCO'}`.toUpperCase(),
});

watch(() => props.isOpen, async (val) => {
    if (val) 
    {
        form.text = `CONFIDENTIEL - ${openedOrg.value?.name || 'SYNCO'}`.toUpperCase();
        await nextTick();
        textInput.value?.focus();
    }
});

const closeModal = () => {
    emit('close')
};

const handleSubmit = async () => {
    if (!form.text.trim()) return;

    loading.value = true;

    try {
        // 1. Original, déchiffré localement
        if (!props.file.workspaceId) throw new Error('Le filigrane ne s\'applique qu\'aux fichiers d\'un espace.');
        const { buffer } = await fetchDecryptedFile(props.file.id);

        const blob = new Blob([buffer], { type: props.file.mimeType });
        const originalFile = new File([blob], props.file.originalName, { type: props.file.mimeType });

        // 2. Apply local watermark
        let watermarkedFile: File;
        if (originalFile.type.startsWith('image/')) {
            watermarkedFile = await watermarkImageLocal(originalFile, form.text);
        } else if (originalFile.type === 'application/pdf') {
            watermarkedFile = await watermarkPDFLocal(originalFile, form.text);
        } else {
            throw new Error('Type de fichier non supporté.');
        }

        // 3. Upload new file
        const uploaded = await uploadFiles([watermarkedFile], {
            workspaceId: props.file.workspaceId,
            folderId: props.file.folderId || undefined
        });

        if (uploaded && uploaded.length > 0) {
            toast.show('Copie filigranée créée avec succès', 'success');
            emit('created', uploaded[0]);
            closeModal();
        } else {
            throw new Error('Erreur lors de l\'upload de la copie.');
        }

    }
    catch (err: any) {
        toast.show(err.message || 'Une erreur est survenue lors de la création.', 'error');
        console.error('Watermark error:', err);
    } 
    finally {
        loading.value = false;
    }
};
</script>
