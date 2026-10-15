<template>
    <Teleport to="body">
        <Transition name="rl-fade">
            <div v-if="isRateLimited" class="rl-backdrop" role="alertdialog" aria-modal="true"
                aria-labelledby="rl-title">
                <div class="rl-card">
                    <i class="bi bi-speedometer2 rl-icon" />
                    <h2 id="rl-title">Doucement, trop de requêtes</h2>
                    <p>
                        Vous avez envoyé trop de requêtes au serveur. Par sécurité, il faut patienter un instant
                        avant de continuer.
                    </p>
                    <div class="rl-count" aria-live="polite">
                        <span>{{ label }}</span>
                    </div>
                    <div class="rl-bar"><div class="rl-bar-fill" :style="{ width: progress + '%' }" /></div>
                    <button class="rl-btn" :disabled="secondsLeft > 0" @click="onRetry">
                        {{ secondsLeft > 0 ? 'Patientez...' : 'Réessayer' }}
                    </button>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { isRateLimited, secondsLeft, dismissRateLimit } from '@/composables/useRateLimit';

// Durée totale du blocage en cours, pour la barre de progression.
const total = ref(1);
watch(isRateLimited, (on) => { if (on) total.value = Math.max(1, secondsLeft.value); }, { immediate: true });
watch(secondsLeft, (s) => { if (s > total.value) total.value = s; });

const progress = computed(() => Math.min(100, Math.max(0, 100 - (secondsLeft.value / total.value) * 100)));

const label = computed(() => {
    const s = secondsLeft.value;
    if (s <= 0) return 'Vous pouvez réessayer';
    if (s < 60) return `Nouvel essai possible dans ${s} s`;
    return `Nouvel essai possible dans ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
});

// Le compte à rebours masque déjà l'overlay à zéro ; ce bouton ne sert qu'à
// fermer immédiatement si besoin, puis recharge pour relancer les chargements
// restés en suspens.
const onRetry = () => {
    dismissRateLimit();
    window.location.reload();
};
</script>

<style scoped>
.rl-backdrop {
    position: fixed;
    inset: 0;
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    background: color-mix(in srgb, var(--bg1, #000) 70%, transparent);
    backdrop-filter: blur(6px);
}
.rl-card {
    width: min(26rem, 100%);
    padding: 1.75rem 1.5rem;
    border-radius: 1rem;
    text-align: center;
    background: var(--bg2);
    border: 1px solid rgba(234, 179, 8, 0.35);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
}
.rl-icon { font-size: 2.5rem; color: #eab308; }
.rl-card h2 { margin: 0.5rem 0; font-size: 1.15rem; font-weight: 700; }
.rl-card p { margin: 0 0 1rem; font-size: 0.85rem; opacity: 0.8; }
.rl-count { font-weight: 600; font-variant-numeric: tabular-nums; margin-bottom: 0.6rem; color: #eab308; }
.rl-bar { height: 6px; border-radius: 999px; background: rgba(234, 179, 8, 0.2); overflow: hidden; margin-bottom: 1.1rem; }
.rl-bar-fill { height: 100%; background: #eab308; transition: width 0.5s linear; }
.rl-btn {
    padding: 0.5rem 1.25rem;
    border-radius: 999px;
    font-weight: 600;
    background: #eab308;
    color: #1a1a1a;
}
.rl-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.rl-fade-enter-active, .rl-fade-leave-active { transition: opacity 0.25s ease; }
.rl-fade-enter-from, .rl-fade-leave-to { opacity: 0; }
</style>
