<template>
    <Teleport to="body">
        <Transition name="scene">
            <div v-if="view" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
                <div class="absolute inset-0 bg-black/45" />

                <!-- Carte sobre : elle dit seulement où regarder. La fenêtre de l'extension, à côté, fait le reste. -->
                <div
                    class="scene-card relative w-full max-w-sm rounded-2xl border border-(--border-color) bg-(--bg2) px-6 py-7 text-center shadow-xl"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ext-scene-title"
                    aria-describedby="ext-scene-text"
                    :data-state="view.state"
                    :style="shift ? { translate: `-${shift}px 0` } : undefined"
                    @keydown.esc.stop.prevent="emit('cancel')"
                >
                    <div class="mark" aria-hidden="true">
                        <span v-if="view.state === 'success'" class="mark-check" />
                        <span v-else class="mark-spin" />
                    </div>

                    <h2 id="ext-scene-title" class="mt-5 text-base font-bold text-(--text)">{{ title }}</h2>
                    <p id="ext-scene-text" class="mt-1.5 text-sm leading-relaxed text-(--text2)" role="status" aria-live="polite">{{ text }}</p>

                    <template v-if="view.state === 'waiting'">
                        <p class="mt-4 text-xs text-(--text2)">Pas de fenêtre ? Elle est peut-être passée derrière celle-ci.</p>
                        <button ref="cancelBtn" class="default mt-5 w-full" @click="emit('cancel')">Annuler</button>
                    </template>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { besideShift, type SceneView } from '@/assets/e2eeV4/extensionScene';

const props = defineProps<{ view: SceneView | null }>();
const emit = defineEmits<{ cancel: [] }>();

const cancelBtn = ref<HTMLButtonElement | null>(null);

// Côte à côte : la carte se pousse à gauche pour que la fenêtre de l'extension s'ouvre à sa droite, à son niveau.
const shift = ref(besideShift(typeof window === 'undefined' ? 0 : window.innerWidth));
const onResize = () => { shift.value = besideShift(window.innerWidth); };
onMounted(() => window.addEventListener('resize', onResize));
onUnmounted(() => window.removeEventListener('resize', onResize));

const title = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return v.mode === 'enroll' ? 'Appareil protégé' : 'Déverrouillé';
    return 'Continuez dans Synco Extension';
});

const text = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return v.mode === 'enroll' ? 'Synco Extension garde désormais la clé de cet appareil.' : 'Vos messages s\'ouvrent.';
    return v.mode === 'enroll'
        ? 'Choisissez votre code PIN dans la fenêtre de l\'extension.'
        : 'Saisissez votre code PIN dans la fenêtre de l\'extension.';
});

// Le focus va au bouton « Annuler » à l'ouverture : Échap et Entrée restent utilisables au clavier.
watch(() => props.view?.state, async (state, before) => {
    if (state === 'waiting' && before !== 'waiting') { await nextTick(); cancelBtn.value?.focus(); }
});
</script>

<style scoped>
.scene-enter-active, .scene-leave-active { transition: opacity 0.2s ease; }
.scene-enter-active .scene-card, .scene-leave-active .scene-card { transition: transform 0.2s ease, opacity 0.2s ease; }
.scene-card { transition: translate 0.3s ease; }
.scene-enter-from, .scene-leave-to { opacity: 0; }
.scene-enter-from .scene-card, .scene-leave-to .scene-card { transform: translateY(6px); opacity: 0; }

/* Marque d'état : un indicateur discret pendant l'attente, une coche à la réussite. */
.mark { display: flex; justify-content: center; height: 2.75rem; align-items: center; }
.mark-spin {
    width: 1.5rem; height: 1.5rem; border-radius: 50%;
    border: 2px solid var(--border-color); border-top-color: var(--text2);
    animation: spin 0.9s linear infinite;
}
.mark-check {
    display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: 50%;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
}
.mark-check::before {
    content: ""; width: 0.65rem; height: 1.15rem; margin-top: -0.25rem;
    border: solid var(--primary); border-width: 0 3px 3px 0; transform: rotate(45deg);
}

@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .mark-spin { animation-duration: 2.5s; }
    .scene-card, .scene-enter-active, .scene-leave-active { transition-duration: 0.01ms !important; }
}
</style>
