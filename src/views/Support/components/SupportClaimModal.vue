<template>

    <!-- Prise en charge : l'urgence est obligatoire (SUPPORT_FEATURE.md §5
         POST /claim), donc un petit modal plutôt qu'une action directe. -->

    <Popup :is-open="isOpen" @close="emit('close')">
        <template #title>Prendre en charge le ticket</template>

        <div class="flex flex-col gap-4">
            <p class="text-sm text-(--text2)">Choisissez l'urgence de ce ticket pour le prendre en charge.</p>
            <!-- :z-index supérieur à celui de la Popup (2000 par défaut) :
                 sans lui, le DropDown (z-index 1000 par défaut, inférieur à
                 la Popup) s'ouvrait sous elle — visible sous le fond assombri
                 ou pas du tout, en tout cas inerte au clic. -->
            <SupportSearchSelect v-model="priority" :options="priorityOptions" placeholder="Choisir une urgence..." :z-index="2100" />
        </div>

        <template #footer>
            <button class="default" @click="emit('close')">Annuler</button>
            <button class="primary" :disabled="!priority || busy" @click="confirm">
                <span v-if="busy"><i class="bi bi-arrow-repeat animate-spin mr-1" /> Prise en charge...</span>
                <span v-else>Prendre en charge</span>
            </button>
        </template>
    </Popup>

</template>

<script lang="ts" setup>

import { ref, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import SupportSearchSelect from '@/components/support/SupportSearchSelect.vue';
import type { SupportTicketPriority } from '@/types/support';
import { PRIORITY_OPTIONS } from '../supportLabels';

const props = defineProps<{ isOpen: boolean; busy?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'confirm', priority: SupportTicketPriority): void }>();

const priority = ref<SupportTicketPriority | null>(null);
const priorityOptions = PRIORITY_OPTIONS;

watch(() => props.isOpen, (open) => { if (open) priority.value = null; });

const confirm = () => {
    if (!priority.value) return;
    emit('confirm', priority.value);
};

</script>
