<template>
    <Transition name="app-update">
        <div v-if="state !== 'idle'" class="app-update" role="status" aria-live="polite">
            <span class="app-update-ico">
                <i class="bi" :class="state === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-arrow-repeat'" :data-spin="busy || undefined" />
            </span>

            <div class="flex-1 min-w-0">
                <template v-if="state === 'available'">
                    <p class="text-sm font-semibold text-(--text)">Synco {{ version }} est disponible</p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                        Vous utilisez la {{ currentVersion }}. L'app redémarrera une fois la mise à jour installée.
                    </p>
                    <div class="flex items-center gap-3 mt-3">
                        <button class="primary text-xs" @click="install">Mettre à jour</button>
                        <button class="text-xs text-(--text2) hover:text-(--text) transition-colors" @click="later">Plus tard</button>
                    </div>
                </template>

                <template v-else-if="busy">
                    <p class="text-sm font-semibold text-(--text)">
                        {{ state === 'installing' ? 'Installation…' : 'Téléchargement de la mise à jour…' }}
                    </p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">Synco {{ version }} · l'app va redémarrer d'elle-même.</p>
                    <div class="app-update-bar mt-3" :data-indeterminate="progress === null || state === 'installing' || undefined">
                        <span :style="{ width: progress === null ? undefined : `${Math.round(progress * 100)}%` }" />
                    </div>
                </template>

                <template v-else>
                    <p class="text-sm font-semibold text-(--text)">La mise à jour a échoué</p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">Vérifiez votre connexion, puis réessayez.</p>
                    <div class="flex items-center gap-3 mt-3">
                        <button class="primary text-xs" @click="install">Réessayer</button>
                        <button class="text-xs text-(--text2) hover:text-(--text) transition-colors" @click="later">Plus tard</button>
                    </div>
                </template>
            </div>

            <button v-if="!busy" class="text-(--text2) hover:text-(--text) transition-colors self-start" aria-label="Fermer" @click="later">
                <i class="bi bi-x-lg text-xs" />
            </button>
        </div>
    </Transition>
</template>

<script setup lang="ts">
/** Proposition de mise à jour de l'app desktop (useAppUpdater.ts). Ne s'affiche jamais hors Tauri. */
import { computed, onMounted } from 'vue';
import useAppUpdater from '@/composables/useAppUpdater';

const { state, version, currentVersion, progress, start, install, later } = useAppUpdater();
const busy = computed(() => state.value === 'downloading' || state.value === 'installing');

onMounted(start);
</script>

<style scoped>
.app-update {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 1400;
    width: min(22rem, calc(100vw - 2rem)); display: flex; gap: 0.875rem; padding: 1rem;
    border-radius: 0.9rem; background: var(--bg2); box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, var(--border-color));
}

.app-update-ico {
    flex: none; width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; display: grid; place-items: center;
    color: var(--primary); background: color-mix(in srgb, var(--primary) 15%, transparent);
}
.app-update-ico [data-spin] { animation: app-update-spin 1.1s linear infinite; }

.app-update-bar {
    position: relative; height: 0.375rem; border-radius: 999px; overflow: hidden;
    background: color-mix(in srgb, var(--primary) 15%, transparent);
}
.app-update-bar span {
    position: absolute; inset: 0 auto 0 0; border-radius: inherit; background: var(--primary);
    transition: width 0.2s ease;
}
.app-update-bar[data-indeterminate] span { width: 35%; animation: app-update-slide 1.2s ease-in-out infinite; }

@keyframes app-update-spin { to { transform: rotate(360deg); } }
@keyframes app-update-slide { from { left: -35%; } to { left: 100%; } }

.app-update-enter-active, .app-update-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.app-update-enter-from, .app-update-leave-to { opacity: 0; transform: translateY(0.5rem); }

@media (prefers-reduced-motion: reduce) {
    .app-update-ico [data-spin], .app-update-bar[data-indeterminate] span { animation: none; }
}
</style>
