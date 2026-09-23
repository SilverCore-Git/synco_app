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
        router.push(props.to);
    } else {
        router.push({ query: { ...route.query, showView: '0' } });
    }
};
</script>
