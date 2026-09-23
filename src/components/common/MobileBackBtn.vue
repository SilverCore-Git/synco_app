<template>
    <button v-if="isLittleScreen || alwaysVisible" @click="handleClick" class="mr-3">
        <i class="bi bi-arrow-left text-2xl text-(--text)" />
    </button>
</template>

<script setup lang="ts">
import { isLittleScreen } from '@/assets/var';
import { useRouter, useRoute } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';

// `to` + `alwaysVisible` couvrent le cas d'une vraie sous-route (ex: tâches
// archivées) où la flèche doit aussi naviguer en arrière sur desktop, et pas
// seulement basculer le panneau mobile via `showView`.
const props = defineProps<{
    to?: RouteLocationRaw;
    alwaysVisible?: boolean;
}>();

const router = useRouter();
const route = useRoute();

const handleClick = () => {
    if (props.to) {
        // Vrai `router.back()` plutôt qu'un `push` vers `to` : c'est ce qui
        // déclenche le geste natif "swipe-back" (glissement vers la droite)
        // de la WKWebView sur iOS/Capacitor. `history.state.back` (posé par
        // Vue Router) vaut null si on est arrivé directement sur cette route
        // (lien direct/refresh, pas de page précédente dans l'historique de
        // l'app) — dans ce cas, `to` sert de repli.
        if (window.history.state?.back) {
            router.back();
        } else {
            router.push(props.to);
        }
    } else {
        router.push({ query: { ...route.query, showView: '0' } });
    }
};
</script>
