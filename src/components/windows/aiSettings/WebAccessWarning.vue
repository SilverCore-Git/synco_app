<template>
    <div class="rounded-2xl border border-sky-500/40 bg-sky-500/8 p-4 sm:p-5 space-y-3" role="group" aria-labelledby="web-warning-title">
        <h5 id="web-warning-title" class="flex items-center gap-2 font-bold text-sky-600 dark:text-sky-400 text-sm">
            <i class="bi bi-globe2"></i> Avant d'activer
        </h5>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Où partent vos recherches :</strong> chez {{ providerName }}. Les pages lues voient l'adresse du serveur de votre organisation, pas la vôtre.</p>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Ce qui est vérifié :</strong> avant chaque envoi, l'agent essaie de repérer ce qui viendrait de Synco (un passage d'un message, un nom de collègue, une adresse e-mail, un numéro) et vous demande alors votre accord, en montrant le texte exact. Il fait de même pour une adresse qui ne vient ni d'une recherche ni de vous.</p>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Ce qui peut échapper :</strong> ce repérage n'est pas infaillible ; une information reformulée peut passer sans être reconnue. N'activez l'accès web que si cela vous convient.</p>
        <p class="text-sm text-(--text) leading-relaxed"><strong>Pour revenir en arrière :</strong> désactivez ce réglage ; l'agent perd aussitôt l'accès à internet.</p>
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

/** Avertissement de l'accès web (12 §11.3, PC92) : `providerName` vient de `webProviderLabel`, jamais d'une valeur brute. */
defineProps<{ providerName: string; busy?: boolean }>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

/** Jamais précochée : chaque ouverture de l'avertissement repart décochée. */
const understood = ref(false);
</script>
