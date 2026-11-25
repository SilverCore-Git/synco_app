<template>
    <Transition name="min-version">
        <div v-if="visible" class="min-version" role="status" aria-live="polite">
            <span class="min-version-ico"><i class="bi bi-arrow-up-circle-fill" /></span>
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-(--text)">Mettez Synco à jour</p>
                <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                    Cette version ({{ currentVersion }}) est trop ancienne pour afficher certains messages de l'agent : ils apparaissent en texte simple.
                </p>
                <div v-if="canReload" class="mt-3">
                    <button class="primary text-xs" @click="reload">Recharger l'app</button>
                </div>
            </div>
            <button class="text-(--text2) hover:text-(--text) transition-colors self-start" aria-label="Fermer" @click="dismiss">
                <i class="bi bi-x-lg text-xs" />
            </button>
        </div>
    </Transition>
</template>

<script setup lang="ts">
/** Bandeau de version minimale (PC107) : non bloquant, refermable pour la session. Monté une fois, dans App.vue. */
import { Capacitor } from '@capacitor/core';
import { onMounted } from 'vue';
import isDesktopApp from '@/assets/isDesktopApp';
import useMinAppVersion from '@/composables/useMinAppVersion';

const { visible, currentVersion, load, dismiss } = useMinAppVersion();
// Sur le web, recharger suffit à obtenir la dernière version ; sur desktop et mobile, la mise à jour passe par le magasin ou l'updater.
const canReload = !isDesktopApp() && !Capacitor.isNativePlatform();
const reload = () => window.location.reload();

onMounted(load);
</script>

<style scoped>
.min-version {
    position: fixed; left: 50%; top: 1rem; z-index: 1390; transform: translateX(-50%);
    width: min(30rem, calc(100vw - 2rem)); display: flex; gap: 0.875rem; padding: 1rem;
    border-radius: 0.9rem; background: var(--bg2); box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, var(--border-color));
}
.min-version-ico {
    flex: none; width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; display: grid; place-items: center;
    color: var(--primary); background: color-mix(in srgb, var(--primary) 15%, transparent);
}
.min-version-enter-active, .min-version-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.min-version-enter-from, .min-version-leave-to { opacity: 0; transform: translate(-50%, -0.5rem); }
@media (prefers-reduced-motion: reduce) {
    .min-version-enter-active, .min-version-leave-active { transition: opacity 0.2s ease; }
    .min-version-enter-from, .min-version-leave-to { transform: translateX(-50%); }
}
</style>
