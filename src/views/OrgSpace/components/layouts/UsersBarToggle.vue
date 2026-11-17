<template>
    <!-- Bouton « Membres » des en-têtes de page : visible seulement quand la
         barre des membres est masquée. Barre affichée, le bouton est dans son
         propre en-tête (UsersBar.vue) et sert à la refermer. -->
    <Transition name="users-bar-toggle">
        <button
            v-if="!showUsersBar"
            v-bind="$attrs"
            type="button"
            @click="showUsersBar = true"
            class="hover:text-(--text) transition-colors"
            title="Afficher les membres"
            aria-label="Afficher les membres"
        >
            <i class="bi bi-people-fill" />
        </button>
    </Transition>
</template>

<script setup lang="ts">
import { useUsersBar } from '@/composables/useUsersBar';

defineOptions({ inheritAttrs: false });

const { showUsersBar } = useUsersBar();
</script>

<style scoped>
/* Le bouton « revient » dans l'en-tête de la page quand la barre se ferme. */
.users-bar-toggle-enter-active {
    transition: opacity 220ms var(--reveal-ease, ease), transform 220ms var(--reveal-ease, ease);
}
.users-bar-toggle-enter-from {
    opacity: 0;
    transform: translateX(10px);
}
@media (prefers-reduced-motion: reduce) {
    .users-bar-toggle-enter-active { transition: none; }
}
</style>
