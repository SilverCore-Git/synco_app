<template>

    <Popup :is-open="isOpen" @close="closeModal">

        <template #title>Renommer le fichier</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">

            <div class="flex gap-2 flex-col">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Nom du fichier
                </label>
                <input 
                    v-model="form.name"
                    type="text" 
                    placeholder="Nom du fichier..."
                    ref="nameInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text2) 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                />
            </div>

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
                :class="[
                    loading ? 'loader' : ''
                ]"
                :disabled="loading || !form.name.trim() || !isChanged"
            >
                {{ loading ? 'Enregistrement...' : 'Renommer' }}
            </button>
        </template>

    </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import type { StoredFile } from '@/types/types';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';

const emit = defineEmits([ 'close', 'updated' ]);

const props = defineProps<{
    file: StoredFile; 
    isOpen: boolean
}>();

const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
  name: props.file.originalName,
});

const isChanged = computed(() => {
    return form.name.trim() !== props.file.originalName;
});

watch(() => props.isOpen, async (val) => {
    if (val) 
    {
        form.name = props.file.originalName;
        await nextTick();
        nameInput.value?.focus();
    }
});

const closeModal = () => {
    emit('close')
};

const handleSubmit = async () => {

    if (!form.name.trim() || !isChanged.value) return;

    loading.value = true;

    try {
        
        const res = await sfetch(`/api/cdn/meta/${props.file.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                update: { originalName: form.name }
            })
        });

        if (!res.ok)
        {
            const errorData = await res.json();
            toast.show(errorData.message || 'Une erreur est survenue.', 'error');
        }
        else
        {
            props.file.originalName = form.name;
            toast.show('Fichier renommé avec succès', 'success');
            emit('updated', props.file);
        }
    
        closeModal();

    }
    catch (err: any) {
        toast.show('Une erreur est survenue.', 'error');
        console.error('Update error:', err);
    } 
    finally {
        loading.value = false;
    }

};

</script>
