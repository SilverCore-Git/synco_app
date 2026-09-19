<template>
    <Teleport to="body">
        <Transition name="slide-down">
            <div v-if="showBanner" class="connection-banner" role="status">
                <span class="spinner" />
                <span>{{ label }}</span>
            </div>
        </Transition>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { isConnected, connectionAttempted } from '@/composables/useWSocket';

// Le simple fait d'être `!isConnected` pendant quelques centaines de ms (le
// temps normal d'un handshake) ne mérite pas d'alerter l'utilisateur — la
// bannière n'apparaît que si la coupure dure vraiment, pour ne pas clignoter
// à chaque micro-reconnexion invisible sinon (déjà gérées en silence ailleurs
// dans l'app, cf. le rejoin silencieux de ThreadView.vue/ChatView.vue).
const SHOW_DELAY_MS = 1500;

const showBanner = ref(false);
let showTimeout: ReturnType<typeof setTimeout> | null = null;

watch([isConnected, connectionAttempted], ([connected, attempted]) => {
    if (showTimeout) {
        clearTimeout(showTimeout);
        showTimeout = null;
    }

    if (!attempted || connected) {
        showBanner.value = false;
        return;
    }

    showTimeout = setTimeout(() => {
        showBanner.value = true;
    }, SHOW_DELAY_MS);
}, { immediate: true });

const label = computed(() => 'Connexion au serveur perdue — reconnexion en cours…');
</script>

<style scoped>
.connection-banner {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 0.75rem;
    z-index: 2000;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.5rem 1rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg2) 92%, transparent);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(234, 179, 8, 0.35);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    font-size: 0.8rem;
    font-weight: 600;
    color: #eab308;
    pointer-events: none;
}

.spinner {
    width: 0.85rem;
    height: 0.85rem;
    border-radius: 999px;
    border: 2px solid rgba(234, 179, 8, 0.3);
    border-top-color: #eab308;
    animation: connection-spin 0.7s linear infinite;
    flex-shrink: 0;
}

@keyframes connection-spin {
    to { transform: rotate(360deg); }
}

.slide-down-enter-active,
.slide-down-leave-active {
    transition: opacity 0.25s ease, transform 0.25s ease;
}
.slide-down-enter-from,
.slide-down-leave-to {
    opacity: 0;
    transform: translate(-50%, -12px);
}
</style>
