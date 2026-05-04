<template>

    <Popup :is-open="isOpen" @close="closeModal">

        <template #title>Paramètres du salon</template>

        <form @submit.prevent="handleSubmit" class="space-y-5">

        <div class="flex gap-2 flex-col opacity-80">
            <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                Type de salon
            </label>
            <div class="flex items-center gap-3 p-3 bg-(--bg2)/20 rounded-xl border border-white/5 text-white/50">
                <i class="bi" :class="form.type == 'text' ? 'bi-hash' : 'bi-volume-up-fill'" />
                <span class="capitalize">{{ form.type === 'text' ? 'Salon textuel' : 'Salon vocal' }}</span>
                <i class="bi bi-lock-fill ml-auto text-xs" />
            </div>
        </div>

        <div class="flex gap-2 flex-col">
            <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                Nom du salon
            </label>
            <input 
                v-model="form.name"
                type="text" 
                placeholder="Nom du salon..."
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
import type { Thread } from '@/types/types';
import { useToast } from '@/composables/useToast';
import useWSocket from '@/composables/useWSocket';
import { openedOrg } from '@/assets/var';

const emit = defineEmits([ 'close' ]);

const props = defineProps<{
    thread: Thread;
    isOpen: boolean
}>();

const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
  name: props.thread.name,
  type: props.thread.type
});

const isChanged = computed(() => form.name.trim() !== props.thread.name);

watch(() => props.isOpen, async (val) => {
    if (val) 
    {
        form.name = props.thread.name;
        form.type = props.thread.type;
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
        
        const socket = await useWSocket();
        socket.value?.emit('thread:update', ({ orgId: openedOrg.value?.id, threadId: props.thread.id, name: form.name }));

        toast.show('Salon modifié avec succès.', 'success');
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