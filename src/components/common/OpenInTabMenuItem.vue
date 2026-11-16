<script setup lang="ts">
import { openInNewTab, tabsEnabled } from '@/assets/appTabs';

// Entrée « Ouvrir dans un nouvel onglet » des menus clic droit qui existent déjà (DropDown click="right") :
// ils remplacent le menu de liens global d'appTabs.ts, qui leur cède la place. App de bureau seulement.

defineProps<{ to: string; separator?: boolean }>();
</script>

<template>
    <template v-if="tabsEnabled">
        <button class="dropdown-item-annimate dropdown-item-style" @click="openInNewTab(to)">
            <i class="bi bi-window-plus mr-2" />
            Ouvrir dans un nouvel onglet
        </button>
        <hr v-if="separator" class="my-1 border-(--border-color)" />
    </template>
</template>
