<template>
    <div class="rounded-2xl border border-amber-500/40 bg-amber-500/8 p-4 sm:p-5 space-y-3" role="group" aria-labelledby="autonomy-warning-title">
        <h5 id="autonomy-warning-title" class="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400 text-sm">
            <i class="bi bi-exclamation-triangle-fill"></i> Avant d'activer
        </h5>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Ce que ça fait :</strong> Synco AI crée lui-même les salons chiffrés, avec la clé du runtime, sans plan à valider.</p>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Ce que vous risquez :</strong> un message piégé lu par l'agent peut lui faire créer un salon que vous n'auriez pas voulu.</p>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Pour revenir en arrière :</strong> désactivez ce réglage ; l'agent repasse aussitôt en mode plan.</p>
        <div class="flex items-center justify-between gap-3 flex-wrap pt-1">
            <label class="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-(--text)">
                <input v-model="understood" type="checkbox" class="h-4 w-4 accent-(--primary)" :disabled="busy" />
                J'ai compris
            </label>
            <div class="flex gap-2">
                <button type="button" class="default px-4 py-2 rounded-xl text-sm font-medium" :disabled="busy" @click="emit('cancel')">Annuler</button>
                <button type="button" class="primary px-5 py-2 rounded-xl text-sm font-medium" :class="busy ? 'loader' : ''" :disabled="!understood || busy" @click="emit('confirm')">Activer</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ busy?: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

/** Jamais précochée : chaque ouverture de l'avertissement repart décochée. */
const understood = ref(false);
</script>
