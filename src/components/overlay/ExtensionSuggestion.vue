<template>
    <Transition name="ext-suggest">
        <div v-if="state !== 'hidden'" class="ext-suggest" role="status" aria-live="polite">
            <span class="ext-suggest-ico"><i class="bi" :class="state === 'waiting' ? 'bi-hourglass-split' : 'bi-shield-lock-fill'" /></span>

            <div class="flex-1 min-w-0">
                <template v-if="state === 'suggest'">
                    <p class="text-sm font-semibold text-(--text)">Renforcez la protection de cet appareil</p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">Synco Extension garde vos clés hors de la page web.</p>
                    <div class="flex items-center gap-3 mt-3">
                        <button class="primary text-xs" @click="install">Installer (30 s)</button>
                        <button class="text-xs text-(--text2) hover:text-(--text) transition-colors" @click="later">Plus tard</button>
                    </div>
                </template>
                <template v-else>
                    <p class="text-sm font-semibold text-(--text)">En attente de Synco Extension…</p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                        Ajoutez-la dans l'onglet qui vient de s'ouvrir. Cette page se rechargera d'elle-même.
                    </p>
                    <div class="flex items-center gap-3 mt-3">
                        <button class="second text-xs" @click="openStore">Rouvrir la boutique</button>
                        <button class="text-xs text-(--text2) hover:text-(--text) transition-colors" @click="cancel">Annuler</button>
                    </div>
                </template>
            </div>

            <button v-if="state === 'suggest'" class="text-(--text2) hover:text-(--text) transition-colors self-start" aria-label="Fermer" @click="later">
                <i class="bi bi-x-lg text-xs" />
            </button>
        </div>
    </Transition>
</template>

<script setup lang="ts">
/**
 * Suggestion non bloquante de Synco Extension (extensionInstall.ts), seulement quand cet appareil web
 * est protégé par le PIN local et que la boutique du navigateur est connue. Jamais pendant l'inscription.
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { user } from '@/assets/var';
import { detectPlatform, getLocalDevice, idbStore, vaultOfKind, ExtensionVault } from '@/assets/deviceVault';
import {
    clearInstallPending, extensionStoreUrl, isInstallPending, isSuggestionSnoozed, markInstallPending, snoozeSuggestion,
} from '@/assets/deviceVault/extensionInstall';

/** Laisse l'app s'afficher avant de proposer quoi que ce soit. */
const SHOW_DELAY_MS = 4000;

const state = ref<'hidden' | 'suggest' | 'waiting'>('hidden');
let storeUrl: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

async function eligible(userId: string): Promise<boolean> {
    storeUrl = extensionStoreUrl(navigator.userAgent);
    if (!storeUrl) return false;
    if ((await detectPlatform()) !== 'web') return false;
    const record = await getLocalDevice(idbStore, userId);
    if (record?.vaultKind !== 'web-pin') return false;
    const ext = await vaultOfKind('extension');
    // Déjà installée : le changement de verrou se fait dans Paramètres › Appareils, sans boutique.
    return !(ext instanceof ExtensionVault && await ext.detect().catch(() => false));
}

onMounted(() => {
    const userId = user.value?.id;
    if (!userId) return;
    timer = setTimeout(async () => {
        try {
            if (!(await eligible(userId))) return;
            if (isInstallPending(sessionStorage, userId)) state.value = 'waiting';
            else if (!isSuggestionSnoozed(localStorage)) state.value = 'suggest';
        } catch {
            /* suggestion facultative : rien à signaler */
        }
    }, SHOW_DELAY_MS);
});

onUnmounted(() => clearTimeout(timer));

function openStore() {
    if (storeUrl) window.open(storeUrl, '_blank', 'noopener');
}

function install() {
    const userId = user.value?.id;
    if (!userId || !storeUrl) return;
    markInstallPending(sessionStorage, userId);
    openStore();
    state.value = 'waiting';
}

function later() {
    snoozeSuggestion(localStorage);
    state.value = 'hidden';
}

function cancel() {
    clearInstallPending(sessionStorage);
    later();
}
</script>

<style scoped>
.ext-suggest {
    position: fixed; right: 1rem; bottom: 1rem; z-index: 1400;
    width: min(22rem, calc(100vw - 2rem)); display: flex; gap: 0.875rem; padding: 1rem;
    border-radius: 0.9rem; background: var(--bg2); box-shadow: 0 12px 32px rgb(0 0 0 / 0.35);
    border: 1px solid color-mix(in srgb, var(--primary) 40%, var(--border-color));
}

.ext-suggest-ico {
    flex: none; width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; display: grid; place-items: center;
    color: var(--primary); background: color-mix(in srgb, var(--primary) 15%, transparent);
}

.ext-suggest-enter-active, .ext-suggest-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.ext-suggest-enter-from, .ext-suggest-leave-to { opacity: 0; transform: translateY(0.5rem); }
</style>
