<template>
    <Teleport to="body">
        <Transition name="scene">
            <div v-if="view" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                <div
                    class="scene-card relative w-full max-w-sm rounded-3xl border border-(--text)/10 bg-(--bg2) p-7 text-center shadow-2xl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ext-scene-title"
                    aria-describedby="ext-scene-text"
                    :data-state="view.state"
                    @keydown.esc.stop.prevent="emit('cancel')"
                >
                    <!-- Synco  ←→  Synco Extension -->
                    <div class="scene" aria-hidden="true">
                        <div class="node">
                            <img class="app-icon" src="/assets/logo/synco/favicon_synco.svg" alt="" draggable="false" />
                            <span class="node-label">Synco</span>
                        </div>
                        <div class="link">
                            <span class="track" />
                            <span class="packet" style="--i: 0" />
                            <span class="packet" style="--i: 1" />
                            <span class="packet" style="--i: 2" />
                            <span class="link-check"><i class="bi bi-check-lg" /></span>
                        </div>
                        <div class="node">
                            <span class="ext-icon"><i class="bi bi-puzzle-fill" /></span>
                            <span class="node-label">Extension</span>
                        </div>
                    </div>

                    <h2 id="ext-scene-title" class="mt-6 text-xl font-black text-(--text)">{{ title }}</h2>
                    <p id="ext-scene-text" class="mt-2 text-sm leading-relaxed text-(--text2)" role="status" aria-live="polite">{{ text }}</p>

                    <ol class="steps mt-5 text-left" aria-label="Étapes">
                        <li class="step is-done"><span class="step-dot"><i class="bi bi-check-lg" /></span>Synco Extension détectée</li>
                        <li class="step" :class="view.state === 'success' ? 'is-done' : 'is-active'">
                            <span class="step-dot"><i v-if="view.state === 'success'" class="bi bi-check-lg" /><span v-else class="step-spin" /></span>
                            {{ view.state === 'success' ? 'Code PIN validé' : 'Code PIN à saisir dans la fenêtre de l\'extension' }}
                        </li>
                    </ol>

                    <template v-if="view.state === 'waiting'">
                        <p class="mt-4 text-xs leading-relaxed text-(--text2)">
                            <i class="bi bi-shield-lock mr-1" />Le code ne se saisit jamais dans cette page. Fenêtre introuvable ? Elle est peut-être passée derrière une autre.
                        </p>
                        <button ref="cancelBtn" class="default mt-4 w-full" @click="emit('cancel')">Annuler</button>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import type { SceneView } from '@/assets/e2eeV4/extensionScene';

const props = defineProps<{ view: SceneView | null }>();
const emit = defineEmits<{ cancel: [] }>();

const cancelBtn = ref<HTMLButtonElement | null>(null);

const title = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return v.mode === 'enroll' ? 'Appareil protégé' : 'Déverrouillé';
    return v.mode === 'enroll' ? 'Protection de cet appareil' : 'Déverrouillage';
});

const text = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return v.mode === 'enroll' ? 'La clé de cet appareil est protégée par Synco Extension.' : 'Vos messages chiffrés s\'ouvrent.';
    return 'Une fenêtre de Synco Extension vient de s\'ouvrir au centre de votre navigateur. Saisissez-y votre code PIN.';
});

// Le focus va au bouton « Annuler » à l'ouverture : Échap et Entrée restent utilisables au clavier.
watch(() => props.view?.state, async (state, before) => {
    if (state === 'waiting' && before !== 'waiting') { await nextTick(); cancelBtn.value?.focus(); }
});
</script>

<style scoped>
.scene-enter-active, .scene-leave-active { transition: opacity 0.25s ease; }
.scene-enter-active .scene-card { transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease; }
.scene-leave-active .scene-card { transition: transform 0.2s ease-in, opacity 0.2s ease; }
.scene-card { min-height: 31rem; } /* la carte ne change pas de hauteur entre l'attente et la réussite */
.scene-enter-from, .scene-leave-to { opacity: 0; }
.scene-enter-from .scene-card, .scene-leave-to .scene-card { transform: scale(0.9) translateY(12px); opacity: 0; }

/* ---------- les deux nœuds et le lien ---------- */
.scene { display: flex; align-items: flex-start; justify-content: center; }
.node { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; width: 5rem; }
.node-label { font-size: 0.72rem; font-weight: 700; letter-spacing: 0.04em; color: var(--text2); transition: color 0.3s ease; }
.app-icon, .ext-icon { width: 4rem; height: 4rem; border-radius: 1.2rem; transition: box-shadow 0.4s ease, background-color 0.4s ease; }
.app-icon { box-shadow: 0 8px 22px -8px color-mix(in srgb, var(--primary) 65%, transparent); user-select: none; }
.ext-icon {
    position: relative; display: grid; place-items: center; font-size: 1.8rem; color: var(--primary);
    background: color-mix(in srgb, var(--primary) 14%, var(--bg)); border: 1px solid color-mix(in srgb, var(--primary) 40%, transparent);
}
.ext-icon::after { content: ""; position: absolute; inset: -6px; border-radius: 1.5rem; border: 2px solid var(--primary); opacity: 0; }

.link { position: relative; width: 6rem; height: 4rem; flex: none; }
.track { position: absolute; left: 0.4rem; right: 0.4rem; top: 50%; border-top: 2px dashed color-mix(in srgb, var(--text) 25%, transparent); transition: border-color 0.4s ease; }
.packet {
    position: absolute; top: 50%; left: 0; width: 0.55rem; height: 0.55rem; margin-top: -0.275rem; border-radius: 50%;
    background: var(--primary); box-shadow: 0 0 12px color-mix(in srgb, var(--primary) 85%, transparent); opacity: 0;
    animation: flow 2.4s ease-in-out infinite; animation-delay: calc(var(--i) * 0.8s);
}
.link-check {
    position: absolute; left: 50%; top: 50%; display: grid; place-items: center; width: 2rem; height: 2rem; margin: -1rem 0 0 -1rem;
    border-radius: 50%; background: var(--primary); color: #fff; font-size: 1.1rem; transform: scale(0);
}

[data-state="waiting"] .ext-icon::after { animation: ring 1.8s ease-out infinite; }
[data-state="success"] .packet { animation: none; }
[data-state="success"] .track { border-top-style: solid; border-top-color: var(--primary); }
[data-state="success"] .link-check { animation: pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
[data-state="success"] .ext-icon { box-shadow: 0 0 0 5px color-mix(in srgb, var(--primary) 22%, transparent), 0 0 30px color-mix(in srgb, var(--primary) 55%, transparent); }
[data-state="success"] .node-label { color: var(--primary); }

/* ---------- étapes ---------- */
.steps { display: grid; gap: 0.6rem; }
.step { display: flex; align-items: center; gap: 0.7rem; font-size: 0.85rem; color: var(--text2); transition: color 0.3s ease; }
.step.is-done, .step.is-active { color: var(--text); }
.step-dot {
    flex: none; display: grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 50%; font-size: 0.8rem;
    color: var(--text2); background: color-mix(in srgb, var(--text) 9%, transparent); transition: background-color 0.3s ease, color 0.3s ease;
}
.is-done .step-dot { color: #fff; background: var(--primary); }
.step-spin { width: 0.8rem; height: 0.8rem; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--primary) 30%, transparent); border-top-color: var(--primary); animation: spin 0.8s linear infinite; }

@keyframes flow { 0% { left: 0; opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { left: calc(100% - 0.55rem); opacity: 0; } }
@keyframes ring { 0% { transform: scale(0.92); opacity: 0.7; } 100% { transform: scale(1.2); opacity: 0; } }
@keyframes pop { 0% { transform: scale(0); } 70% { transform: scale(1.18); } 100% { transform: scale(1); } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .packet, .ext-icon::after, .step-spin { animation: none !important; }
    .packet { opacity: 0.6; left: 40%; }
    [data-state="success"] .link-check { animation: none; transform: scale(1); }
    .scene-card, .scene-enter-active, .scene-leave-active { transition-duration: 0.01ms !important; }
}
</style>
