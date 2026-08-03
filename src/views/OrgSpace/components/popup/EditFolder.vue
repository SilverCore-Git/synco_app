<template>

    <Popup :is-open="isOpen" @close="closeModal">

        <template #title>Paramètres du dossier</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">

            <div class="flex gap-2 flex-col">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Nom du dossier
                </label>
                <input 
                    v-model="form.name"
                    type="text" 
                    placeholder="Nom du dossier..."
                    ref="nameInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                />
            </div>

            <div class="flex gap-2 flex-col">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Couleur du dossier
                </label>
                
                <div class="grid grid-cols-6 gap-3 p-4 bg-(--bg2)/20 rounded-xl border border-(--border-color)">
                    <button
                        v-for="color in presetColors"
                        :key="color.value"
                        type="button"
                        @click="form.color = color.value"
                        class="w-full aspect-square rounded-lg border transition-all duration-200 relative flex items-center justify-center cursor-pointer"
                        :class="[
                            color.bg,
                            form.color === color.value 
                                ? 'scale-110 border-white ring-2 ring-(--primary)/30' 
                                : 'border-white/10 hover:scale-105'
                        ]"
                        :title="color.name"
                    >
                        <i 
                            v-if="form.color === color.value" 
                            class="bi bi-check-lg text-xs"
                            :class="color.value === 'white' ? 'text-black' : 'text-(--text)'"
                        />
                    </button>
                </div>
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
                {{ loading ? 'Enregistrement...' : 'Enregistrer les modifications' }}
            </button>
        </template>

    </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import type { Folder } from '@/types/types';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';

const emit = defineEmits([ 'close' ]);

const props = defineProps<{
    folder: Folder; 
    isOpen: boolean
}>();

const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const presetColors = [
    { name: 'Défaut', value: 'yellow', bg: 'bg-yellow-500' },
    { name: 'Bleu', value: 'blue', bg: 'bg-blue-500' },
    { name: 'Rouge', value: 'red', bg: 'bg-red-500' },
    { name: 'Vert', value: 'green', bg: 'bg-green-500' },
    { name: 'Violet', value: 'purple', bg: 'bg-purple-500' },
    { name: 'Rose', value: 'pink', bg: 'bg-pink-500' },
];

const form = reactive({
  name: props.folder.name,
  color: props.folder.color || 'yellow'
});

const isChanged = computed(() => {
    return form.name.trim() !== props.folder.name || form.color !== (props.folder.color || 'yellow');
});

watch(() => props.isOpen, async (val) => {
    if (val) 
    {
        form.name = props.folder.name;
        form.color = props.folder.color || 'yellow';
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
        
        const res = await sfetch(`/api/spaces/${props.folder.workspaceId}/folders/${props.folder.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
                name: form.name,
                color: form.color,
                orgId: props.folder.orgId
            })
        });

        if (!res.ok)
        {
            const errorData = await res.json();
            toast.show(errorData.message || 'Une erreur est survenue lors de la mise à jour.', 'error');
        }
        else
        {
            props.folder.name = form.name;
            props.folder.color = form.color;
        }
    
        closeModal();

    }
    catch (err: any) {
        toast.show('Une erreur est survenue lors de la mise à jour.', 'error');
        console.error('Update error:', err);
    } 
    finally {
        loading.value = false;
    }

};

</script>