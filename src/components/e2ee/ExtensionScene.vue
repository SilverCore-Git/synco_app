<template>
    <Teleport to="body">
        <Transition name="scene">
            <div v-if="view" class="scene-root" @keydown.esc.stop.prevent="view.state === 'waiting' && emit('cancel')">
                <div class="scene-backdrop" />

                <!-- Barre d'attente ancrée en bas : elle ne dépend pas de l'endroit où s'ouvre la fenêtre de l'extension
                     (le gestionnaire de fenêtres peut ignorer la position demandée), et ne la masque jamais. -->
                <div
                    class="scene-bar"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ext-scene-title"
                    aria-describedby="ext-scene-text"
                    :data-state="view.state"
                >
                    <div class="scene-main">
                        <span class="scene-mark" aria-hidden="true">
                            <span v-if="view.state === 'success'" class="mark-check" />
                            <span v-else class="mark-spin" />
                        </span>

                        <div class="scene-text">
                            <p id="ext-scene-title" class="scene-title">{{ title }}</p>
                            <p id="ext-scene-text" class="scene-sub" role="status" aria-live="polite">{{ text }}</p>
                        </div>

                        <button v-if="view.state === 'waiting'" ref="cancelBtn" class="default scene-cancel" @click="emit('cancel')">
                            Annuler
                        </button>
                    </div>

                    <div v-if="view.state === 'waiting'" class="scene-help">
                        <button
                            type="button"
                            class="scene-help-toggle"
                            :aria-expanded="helpOpen"
                            aria-controls="ext-scene-help"
                            @click="helpOpen = !helpOpen"
                        >
                            Je ne vois pas la fenêtre
                            <i class="bi" :class="helpOpen ? 'bi-chevron-up' : 'bi-chevron-down'" aria-hidden="true" />
                        </button>
                        <p v-show="helpOpen" id="ext-scene-help" class="scene-help-text">
                            Elle s'est sans doute ouverte derrière le navigateur : cherchez « Synco Extension » dans la barre
                            des tâches. Si elle a été fermée, annulez puis recommencez.
                        </p>
                    </div>
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
const helpOpen = ref(false);

const title = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return SUCCESS[v.mode].title;
    return 'Répondez dans Synco Extension';
});

const SUCCESS = {
    enroll: { title: 'Appareil protégé', text: 'Synco Extension garde désormais la clé de cet appareil.' },
    unlock: { title: 'Déverrouillé', text: 'Vos messages s\'ouvrent.' },
    confirm: { title: 'Autorisé', text: 'L\'opération continue.' },
} as const;
const PURPOSE = { enroll: 'protéger cet appareil', unlock: 'ouvrir vos messages', confirm: 'confirmer l\'opération' } as const;

const text = computed(() => {
    const v = props.view;
    if (!v) return '';
    if (v.state === 'success') return SUCCESS[v.mode].text;
    return `Cliquez sur « Autoriser » dans sa fenêtre pour ${PURPOSE[v.mode]}.`;
});

// Le focus va au bouton « Annuler » à l'ouverture : Échap et Entrée restent utilisables au clavier.
watch(() => props.view?.state, async (state, before) => {
    if (state === 'waiting' && before !== 'waiting') {
        helpOpen.value = false;
        await nextTick();
        cancelBtn.value?.focus();
    }
});
</script>

<style scoped>
/* Au-dessus des Popup (2000-2200) et de ConfirmDelete (3000) : l'attente peut venir de n'importe quelle fenêtre. */
.scene-root { position: fixed; inset: 0; z-index: 3100; }
.scene-backdrop { position: absolute; inset: 0; background: rgb(0 0 0 / 0.4); }

.scene-bar {
    position: absolute; left: 50%; bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
    width: min(34rem, calc(100% - 2rem)); translate: -50% 0;
    padding: 1rem 1.25rem; border-radius: 1rem;
    background: var(--bg); border: 1px solid var(--border-color);
    /* Elle flotte vraiment au-dessus de la page : une ombre, et rien d'autre. */
    box-shadow: 0 18px 40px -16px rgb(0 0 0 / 0.55);
}
.scene-main { display: flex; align-items: center; gap: 0.875rem; }
.scene-mark { flex: none; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; }
.scene-text { flex: 1; min-width: 0; }
.scene-title { font-size: 0.95rem; font-weight: 600; color: var(--text); }
.scene-sub { margin-top: 0.125rem; font-size: 0.85rem; line-height: 1.4; color: var(--text2); }
.scene-cancel { flex: none; padding: 0.55em 1.2em; font-size: 0.9rem; }

.scene-help { margin-top: 0.625rem; padding-left: calc(2.25rem + 0.875rem); }
.scene-help-toggle {
    display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.8rem; color: var(--text2);
    border-radius: 0.375rem; transition: color 0.15s ease;
}
.scene-help-toggle:hover { color: var(--text); }
.scene-help-toggle i { font-size: 0.7rem; }
.scene-help-text { margin-top: 0.375rem; font-size: 0.8rem; line-height: 1.45; color: var(--text2); }

/* Marque d'état : un indicateur discret pendant l'attente, une coche à la réussite. */
.mark-spin {
    width: 1.375rem; height: 1.375rem; border-radius: 50%;
    border: 2px solid var(--border-color); border-top-color: var(--primary);
    animation: spin 0.9s linear infinite;
}
.mark-check {
    display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%;
    background: color-mix(in srgb, var(--primary) 14%, transparent);
}
.mark-check::before {
    content: ""; width: 0.5rem; height: 0.9rem; margin-top: -0.2rem;
    border: solid var(--primary); border-width: 0 2.5px 2.5px 0; transform: rotate(45deg);
}

/* Téléphone ou fenêtre étroite : la barre devient une feuille en bas, le bouton passe dessous. */
@media (max-width: 30rem) {
    .scene-bar { bottom: 0; width: 100%; border-radius: 1rem 1rem 0 0; padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); }
    .scene-main { flex-wrap: wrap; }
    .scene-cancel { width: 100%; margin-top: 0.25rem; }
    .scene-help { padding-left: 0; }
}

.scene-enter-active, .scene-leave-active { transition: opacity 0.2s ease; }
.scene-enter-active .scene-bar, .scene-leave-active .scene-bar { transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1); }
.scene-enter-from, .scene-leave-to { opacity: 0; }
.scene-enter-from .scene-bar, .scene-leave-to .scene-bar { transform: translateY(12px); }

@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
    .mark-spin { animation-duration: 2.5s; }
    .scene-enter-active, .scene-leave-active, .scene-enter-active .scene-bar, .scene-leave-active .scene-bar { transition-duration: 0.01ms !important; }
}
</style>
