<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import draggable from 'vuedraggable';
import {
    tabs, activeTabId, canGoBack, canGoForward, goBack, goForward, newTab, switchTab, closeTab,
    closeOtherTabs, duplicateTab, openContextMenu, tabOrg, type AppTab,
} from '@/assets/appTabs';

// Flèches précédent/suivant et onglets de la barre de titre (appTabs.ts). Les onglets portent role="tab" :
// le script de déplacement de fenêtre de Tauri (data-tauri-drag-region="deep" sur la barre) les ignore, le
// vide autour d'eux continue de déplacer la fenêtre.

const stripEl = ref<HTMLElement | null>(null);

// Réordonnancement par glisser-déposer (un ref importé n'est pas assignable depuis le template).
const orderedTabs = computed({ get: () => tabs.value, set: (v: AppTab[]) => { tabs.value = v; } });

const isImg = (logo?: string | null) => !!logo && (logo.startsWith('http') || logo.startsWith('data:'));

const onTabMouseUp = (e: MouseEvent, tab: AppTab) => {
    // Clic molette sur un onglet : le ferme, comme dans un navigateur.
    if (e.button === 1) { e.preventDefault(); closeTab(tab.id); }
};

const onTabContextMenu = (e: MouseEvent, tab: AppTab) => openContextMenu(e, [
    { label: 'Nouvel onglet', icon: 'bi-plus-lg', action: newTab },
    { label: 'Dupliquer', icon: 'bi-copy', action: () => duplicateTab(tab.id) },
    { label: 'Fermer', icon: 'bi-x-lg', separator: true, action: () => closeTab(tab.id) },
    ...(tabs.value.length > 1
        ? [{ label: 'Fermer les autres onglets', icon: 'bi-x-square', danger: true, action: () => closeOtherTabs(tab.id) }]
        : []),
]);

// L'onglet actif reste visible quand la barre défile (beaucoup d'onglets).
watch(activeTabId, async (id) => {
    await nextTick();
    stripEl.value?.querySelector<HTMLElement>(`[data-tab-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
</script>

<template>
    <div class="flex items-center h-full min-w-0 flex-1 gap-1">

        <!-- Précédent / suivant (historique de l'onglet actif) -->
        <div class="flex items-center shrink-0">
            <button
                class="nav-btn"
                :disabled="!canGoBack"
                title="Précédent (Alt+←)"
                aria-label="Précédent"
                @click="goBack"
            >
                <i class="bi bi-arrow-left" />
            </button>
            <button
                class="nav-btn"
                :disabled="!canGoForward"
                title="Suivant (Alt+→)"
                aria-label="Suivant"
                @click="goForward"
            >
                <i class="bi bi-arrow-right" />
            </button>
        </div>

        <div class="w-px h-4 bg-(--text)/15 shrink-0 mx-1" />

        <!-- Onglets -->
        <div ref="stripEl" class="tab-strip flex items-center min-w-0 overflow-x-auto" role="tablist" aria-label="Onglets">
            <draggable
                v-model="orderedTabs"
                item-key="id"
                :animation="150"
                ghost-class="opacity-40"
                class="flex items-center gap-1 min-w-0"
            >
                <template #item="{ element: tab }">
                    <div
                        role="tab"
                        :data-tab-id="tab.id"
                        :aria-selected="tab.id === activeTabId"
                        :title="tabOrg(tab) ? `${tab.title} — ${tabOrg(tab)!.name}` : tab.title"
                        class="tab group"
                        :class="{ 'tab-active': tab.id === activeTabId }"
                        @mousedown.left="switchTab(tab.id)"
                        @mousedown.middle.prevent
                        @mouseup="onTabMouseUp($event, tab)"
                        @contextmenu="onTabContextMenu($event, tab)"
                    >
                        <!-- Organisation de l'onglet, sinon icône de la page -->
                        <span class="w-4 h-4 shrink-0 flex items-center justify-center">
                            <template v-if="tabOrg(tab)">
                                <img
                                    v-if="isImg(tabOrg(tab)!.logo)"
                                    :src="tabOrg(tab)!.logo!"
                                    alt=""
                                    class="w-4 h-4 rounded object-cover"
                                    draggable="false"
                                />
                                <i v-else-if="tabOrg(tab)!.logo" class="bi text-xs text-(--primary)" :class="tabOrg(tab)!.logo!" />
                                <span v-else class="text-[9px] font-black text-(--primary)">{{ tabOrg(tab)!.name.substring(0, 2).toUpperCase() }}</span>
                            </template>
                            <i v-else class="bi text-xs" :class="tab.icon" />
                        </span>

                        <span class="truncate flex-1 min-w-0">{{ tab.title }}</span>

                        <button
                            class="tab-close"
                            title="Fermer l'onglet (Ctrl+W)"
                            aria-label="Fermer l'onglet"
                            @mousedown.stop
                            @click.stop="closeTab(tab.id)"
                        >
                            <i class="bi bi-x" />
                        </button>
                    </div>
                </template>
            </draggable>
        </div>

        <button class="nav-btn" title="Nouvel onglet (Ctrl+T)" aria-label="Nouvel onglet" @click="newTab">
            <i class="bi bi-plus-lg" />
        </button>

    </div>
</template>

<style scoped>
@reference "@/style.css";

.nav-btn {
    @apply w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-xs text-(--text2)
        hover:bg-(--text)/10 hover:text-(--text) active:scale-90 transition-all duration-100 cursor-pointer
        disabled:opacity-30 disabled:pointer-events-none;
}

.tab-strip {
    scrollbar-width: none;
}

.tab {
    @apply relative h-7 w-48 min-w-24 shrink flex items-center gap-1.5 pl-2.5 pr-1 rounded-lg
        text-xs font-medium text-(--text2) cursor-default select-none
        hover:bg-(--text)/7 hover:text-(--text) transition-colors duration-100;
}

.tab-active {
    @apply bg-(--primary)/12 text-(--text) hover:bg-(--primary)/15;
}

.tab-close {
    @apply w-5 h-5 shrink-0 flex items-center justify-center rounded-md text-sm text-(--text2)
        opacity-0 group-hover:opacity-100 hover:bg-(--text)/15 hover:text-(--text) transition-opacity cursor-pointer;
}

.tab-active .tab-close {
    @apply opacity-100;
}
</style>
