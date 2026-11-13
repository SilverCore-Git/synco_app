<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { getCurrentWindow } from '@tauri-apps/api/window';
import isDesktopApp, { isMacDesktop } from '@/assets/isDesktopApp';
import { openedOrg } from '@/assets/var';
import useSecurePeer from '@/composables/useSecurePeer';
import useTheme from '@/composables/useTheme';

// Barre de titre de l'app de bureau : remplace celle de l'OS (tauri.conf.json : decorations false).
// Toute la barre déplace la fenêtre (data-tauri-drag-region="deep", double-clic = agrandir/restaurer),
// sauf les boutons, que Tauri exclut d'office. Le redimensionnement par les bords reste natif.

const { isCalling, remoteStreams } = useSecurePeer();
const { resolvedTheme } = useTheme();

const desktop = isDesktopApp();
const mac = isMacDesktop();

const maximized = ref(false);
// Agrandie (ou plein écran) : le cadre arrondi (style.css, html.desktop-frame) laisse place à des angles droits.
watch(maximized, (m) => document.documentElement.classList.toggle('window-maximized', m));
const focused = ref(true);
const unlisteners: Array<() => void> = [];

const appWindow = desktop ? getCurrentWindow() : null;

const minimize = () => appWindow?.minimize();
const toggleMaximize = () => appWindow?.toggleMaximize();
const close = () => appWindow?.close();

onMounted(async () => {
    if (!appWindow) return;
    maximized.value = (await appWindow.isMaximized()) || (await appWindow.isFullscreen());
    focused.value = await appWindow.isFocused();
    unlisteners.push(await appWindow.onResized(async () => {
        maximized.value = (await appWindow.isMaximized()) || (await appWindow.isFullscreen());
    }));
    unlisteners.push(await appWindow.onFocusChanged(({ payload }: { payload: boolean }) => {
        focused.value = payload;
    }));
});

onBeforeUnmount(() => unlisteners.forEach((u) => u()));
</script>

<template>

    <div
        v-if="desktop"
        data-tauri-drag-region="deep"
        class="titlebar w-full h-9 bg-(--bg) grid grid-cols-[1fr_auto_1fr] items-center select-none transition-opacity"
        :class="{ 'opacity-70': !focused }"
    >

        <!-- Gauche : marque (sur macOS, place laissée au feu tricolore natif) -->
        <div class="flex items-center gap-2 h-full min-w-0" :class="mac ? 'pl-20' : 'pl-3'">
            <img
                :src="resolvedTheme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'"
                alt="Synco"
                class="h-3.5 opacity-80"
                draggable="false"
            />
        </div>

        <!-- Centre : organisation ouverte -->
        <div class="flex justify-center items-center gap-2 min-w-0 text-xs text-(--text2) font-semibold">
            <template v-if="openedOrg">
                <img
                    v-if="openedOrg.logo && openedOrg.logo.startsWith('http')"
                    :src="openedOrg.logo"
                    :alt="openedOrg.name"
                    class="w-4 h-4 rounded object-cover"
                    draggable="false"
                />
                <i v-else-if="openedOrg.logo" class="bi text-sm text-(--primary)" :class="openedOrg.logo" />
                <span v-else class="text-[10px] font-black text-(--primary)">{{ openedOrg.name.substring(0, 2).toUpperCase() }}</span>
                <span class="truncate max-w-[40vw]">{{ openedOrg.name }}</span>
            </template>
        </div>

        <!-- Droite : appel en cours + contrôles de fenêtre -->
        <div class="flex h-full items-center justify-end gap-2">

            <button
                v-if="isCalling || remoteStreams.size > 0"
                @click="$router.push({ name: 'OrgThreadChat' })"
                class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-(--primary)/20 border border-(--primary)/30 hover:bg-(--primary)/30 transition-colors"
                title="Appel en cours - Cliquez pour ouvrir"
            >
                <div class="relative">
                    <i class="bi bi-telephone-fill text-(--primary) text-xs" :class="{ 'animate-pulse': isCalling }" />
                    <span v-if="remoteStreams.size > 0" class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-(--primary) rounded-full border border-(--bg)" />
                </div>
                <span v-if="remoteStreams.size > 0" class="text-xs text-(--primary) font-medium">
                    {{ remoteStreams.size }} en appel
                </span>
            </button>

            <div v-if="!mac" class="flex h-full items-center gap-1 pr-1.5">
                <button class="win-btn" title="Réduire" aria-label="Réduire" @click="minimize">
                    <i class="bi bi-dash-lg" />
                </button>
                <button
                    class="win-btn"
                    :title="maximized ? 'Restaurer' : 'Agrandir'"
                    :aria-label="maximized ? 'Restaurer' : 'Agrandir'"
                    @click="toggleMaximize"
                >
                    <i class="bi text-[11px]" :class="maximized ? 'bi-copy' : 'bi-square'" />
                </button>
                <button class="win-btn win-btn-close" title="Fermer" aria-label="Fermer" @click="close">
                    <i class="bi bi-x-lg" />
                </button>
            </div>

        </div>

    </div>

</template>

<style scoped>
@reference "@/style.css";

.win-btn {
    @apply w-9 h-7 flex items-center justify-center rounded-lg text-xs text-(--text2)
        hover:bg-(--text)/10 hover:text-(--text) active:scale-90 transition-all duration-100 cursor-pointer;
}

.win-btn-close {
    @apply hover:bg-red-500/90 hover:text-white;
}
</style>
