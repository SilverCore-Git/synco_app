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

// Entrer dans une vue mobile (thread, tâche, fichier, réglages...) se fait
// toujours par un `push` (showView=1 ou changement de route) qui empile une
// entrée d'historique. Revenir en arrière doit donc dépiler avec un vrai
// `router.back()` : c'est ce qui déclenche le geste natif "swipe-back"
// (glissement vers la droite) de la WKWebView sur iOS/Capacitor — un `push`
// vers une destination fixe ne le déclenche jamais, quelle que soit la
// destination. `history.state.back` (posé par Vue Router) vaut null si on
// est arrivé directement sur cette route (lien direct/refresh, pas de page
// précédente dans l'historique de l'app) : dans ce cas seulement, on retombe
// sur un `push` explicite.
const handleClick = () => {
    const fallback = props.to ?? { query: { ...route.query, showView: '0' } };
    if (window.history.state?.back) {
        router.back();
    } else {
        router.push(fallback);
    }
};
</script>
