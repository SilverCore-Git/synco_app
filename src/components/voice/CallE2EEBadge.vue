<template>
    <div class="relative">
        <button
            type="button"
            @click="open = !open"
            class="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors"
            :class="encrypted
                ? 'bg-green-500/10 text-green-500/80 border-green-500/15'
                : 'bg-amber-500/15 text-amber-500 border-amber-500/30'"
        >
            <i class="bi text-[10px]" :class="encrypted ? 'bi-shield-lock-fill' : 'bi-shield-exclamation'" />
            {{ encrypted ? 'Chiffré' : 'Non chiffré' }}
        </button>
        <div
            v-if="open"
            class="absolute z-20 mt-1.5 w-56 p-2 rounded-lg bg-(--bg2) border shadow-xl text-[11px] leading-snug"
            :class="encrypted ? 'border-(--text)/10 text-(--text2)' : 'border-amber-500/30 text-amber-500/90 font-medium'"
        >
            <template v-if="encrypted">
                Audio, vidéo et partage d'écran sont chiffrés sur votre appareil ; le serveur ne voit que des données chiffrées.
            </template>
            <template v-else>
                Cet appel n'est pas chiffré de bout en bout : le serveur peut techniquement en voir le contenu.
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

defineProps<{ encrypted: boolean }>();
const open = ref(false);
</script>
