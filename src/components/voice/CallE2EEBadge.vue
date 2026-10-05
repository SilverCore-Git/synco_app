<template>
    <div class="relative">
        <button
            type="button"
            @click="open = !open"
            class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors"
            :class="encrypted
                ? 'bg-green-500/10 text-green-500 border-green-500/20'
                : 'bg-amber-500/10 text-amber-500 border-amber-500/20'"
        >
            <i class="bi" :class="encrypted ? 'bi-shield-lock-fill' : 'bi-shield-exclamation'" />
            {{ encrypted ? 'Chiffré de bout en bout' : 'Non chiffré' }}
        </button>
        <div
            v-if="open"
            class="absolute z-20 mt-2 w-72 p-3 rounded-xl bg-(--bg2) border border-(--text)/10 shadow-2xl text-xs text-(--text) leading-relaxed"
        >
            <template v-if="encrypted">
                L'audio, la vidéo et les partages d'écran sont chiffrés sur votre appareil avec la clé du salon :
                le serveur d'appels ne voit que des données chiffrées.
            </template>
            <template v-else>
                Cet appel n'est pas chiffré de bout en bout : le serveur d'appels peut techniquement voir et
                entendre son contenu. Évitez d'y partager des informations sensibles.
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ encrypted: boolean }>();
const open = ref(false);
</script>
