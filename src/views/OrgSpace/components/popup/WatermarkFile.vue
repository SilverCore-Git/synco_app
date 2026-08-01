<template>
    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>Ajouter un filigrane</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">
            <div class="flex gap-2 flex-col">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Texte du filigrane
                </label>
                <input 
                    v-model="form.text"
                    type="text" 
                    placeholder="Ex: CONFIDENTIEL - MON ORG"
                    ref="textInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                />
            </div>
            
            <p class="text-sm text-(--text)/60 italic">
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
import sfetch from '@/assets/utils/sfetch';
import { openedOrg } from '@/assets/var';

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
        const res = await sfetch(`/api/cdn/watermark/${props.file.id}`, {
            method: 'POST',
            body: JSON.stringify({
                text: form.text
            })
        });

        if (!res.ok)
        {
            const errorData = await res.json();
            toast.show(errorData.error || 'Une erreur est survenue.', 'error');
        }
        else
        {
            const newFile = await res.json();
            toast.show('Copie filigranée créée avec succès', 'success');
            emit('created', newFile);
            closeModal();
        }
    }
    catch (err: any) {
        toast.show('Une erreur est survenue lors de la connexion.', 'error');
        console.error('Watermark error:', err);
    } 
    finally {
        loading.value = false;
    }
};
</script>
