<template>

    <Popup :is-open="isOpen" @close="emit('close')">
        
        <template #title>
            <div class="flex items-center gap-2">
                <i class="bi bi-pencil-square text-(--primary)" />
                <span>Modifier le message</span>
            </div>
        </template>

        <div class="space-y-4">

            <div class="relative">

                <textarea
                    v-model="editedContent"
                    ref="textareaRef"
                    rows="4"
                    class="
                        w-full bg-(--bg2) text-(--text) text-sm rounded-xl p-4
                        border border-white/5 focus:border-(--primary)/50
                        outline-none resize-none transition-all duration-200
                        placeholder:text-(--text)/20
                    "
                    placeholder="Votre message..."
                    @keydown.ctrl.enter="handleSave"
                ></textarea>
                
                <div class="absolute bottom-3 right-3 text-[10px] text-(--text)/30">
                    ctrl + Enter pour valider
                </div>

            </div>

        </div>

        <template #footer>
            
            <button 
                @click="emit('close')"
                class="default"
            >
                Annuler
            </button>

            <button 
                @click="handleSave"
                :disabled="!isChanged"
                class="primary"
            >
                Enregistrer
            </button>

        </template>

    </Popup>

</template>

<script setup lang="ts">

import Popup from '@/components/Popup.vue';
import { ref, watch, computed, nextTick } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  initialContent: string;
}>();

const emit = defineEmits(['close', 'save']);

const editedContent = ref<string>('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(() => props.isOpen, (newVal) => {
    if (newVal) 
    {
        editedContent.value = props.initialContent;
        nextTick(() => {
            textareaRef.value?.focus();
        });
    }
});

const isChanged = computed(() => {
  return editedContent.value.trim() !== props.initialContent.trim() && editedContent.value.length > 0;
});

const handleSave = () => {
    if (isChanged.value) 
    {
        emit('save', editedContent.value);
        emit('close');
    }
};

</script>
