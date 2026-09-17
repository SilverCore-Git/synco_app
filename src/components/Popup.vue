<template>

  <Teleport to="body">

    <Transition name="fade">

      <div
        v-if="isOpen"
        class="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
        @click.self="emit('close')"
      >

        <Transition name="popup-card" appear>

          <div
            v-if="isOpen"
            class="w-full sm:max-w-md bg-(--bg) border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:!h-auto sm:!max-h-[90vh]"
            :class="[
              isExpanded ? 'h-[100dvh] max-h-none' : 'max-h-[90vh]',
              isDragging ? '' : 'transition-[height,max-height] duration-300 ease-out'
            ]"
            :style="dragStyle"
          >

            <!-- Poignée : mobile uniquement — on la glisse vers le haut pour ouvrir
                 la feuille en plein écran, vers le bas pour la refermer/fermer. -->
            <div
              class="flex justify-center pt-2 pb-1 shrink-0 sm:hidden cursor-grab active:cursor-grabbing touch-none select-none"
              @pointerdown="onHandlePointerDown"
              @pointermove="onHandlePointerMove"
              @pointerup="onHandlePointerUp"
              @pointercancel="onHandlePointerUp"
            >
              <div class="w-10 h-1.5 rounded-full bg-white/15"></div>
            </div>

            <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center justify-between shrink-0">

              <h3 class="text-lg font-semibold text-(--text)">
                <slot name="title">Titre par défaut</slot>
              </h3>

              <button
                @click="emit('close')"
                class="
                  p-2 rounded-lg hover:bg-white/5
                  text-(--text2) hover:text-(--text)
                  active:scale-90 transition-all duration-200
                "
              >
                <i class="bi bi-x-lg" />
              </button>

            </div>

            <div class="p-6 overflow-y-auto flex-1 min-h-0">
              <slot />
            </div>

            <div
              v-if="$slots.footer"
              class="px-6 py-4 bg-(--bg)/70 border-t border-(--border-color) flex justify-end gap-3 shrink-0"
            >
              <slot name="footer" />
            </div>

          </div>

        </Transition>

      </div>

    </Transition>

  </Teleport>

</template>

<script setup lang="ts">

import { onMounted, onUnmounted, ref, computed, watch } from 'vue';

const props = defineProps<{
  isOpen: boolean;
}>();

const emit = defineEmits(['close']);

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));

// ── Feuille mobile : glisser la poignée déplie/replie/ferme ────────────
// Deux hauteurs seulement (repliée ~contenu, dépliée plein écran) : pas
// besoin de mesurer le contenu, juste basculer entre deux classes de
// hauteur fixes, ce qui reste proprement animable en CSS (contrairement
// à une transition vers/depuis `height: auto`).
const isExpanded = ref(false);
const isDragging = ref(false);
const isSnapping = ref(false);
const isClosing = ref(false);
const dragDeltaY = ref(0);
let dragStartY = 0;
let dragStartExpanded = false;
let snapTimeout: ReturnType<typeof setTimeout> | null = null;
let closeTimeout: ReturnType<typeof setTimeout> | null = null;

const CLOSE_THRESHOLD = 120;
const TOGGLE_THRESHOLD = 60;

const onHandlePointerDown = (e: PointerEvent) => {
  isDragging.value = true;
  dragStartY = e.clientY;
  dragStartExpanded = isExpanded.value;
  dragDeltaY.value = 0;
  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
};

const onHandlePointerMove = (e: PointerEvent) => {
  if (!isDragging.value) return;
  // On laisse suivre le doigt librement vers le bas ; vers le haut, un
  // léger tiraison suffit à signaler l'intention sans avoir à mesurer
  // l'espace réellement disponible avant le plein écran.
  const delta = e.clientY - dragStartY;
  dragDeltaY.value = Math.max(delta, -40);
};

const onHandlePointerUp = () => {
  if (!isDragging.value) return;
  isDragging.value = false;
  const delta = dragDeltaY.value;
  dragDeltaY.value = 0;

  if (!dragStartExpanded && delta > CLOSE_THRESHOLD) {
    // On termine nous-mêmes la glissade jusqu'en bas (même easing que la
    // transition de sortie) avant de prévenir le parent : sinon l'inline
    // style (spécificité plus forte que la classe de sortie) figerait la
    // feuille à sa position de lâcher au lieu de continuer jusqu'en bas.
    isClosing.value = true;
    if (closeTimeout) clearTimeout(closeTimeout);
    closeTimeout = setTimeout(() => emit('close'), 250);
    return;
  }

  if (!dragStartExpanded && delta < -TOGGLE_THRESHOLD) {
    isExpanded.value = true;
  } else if (dragStartExpanded && delta > TOGGLE_THRESHOLD) {
    isExpanded.value = false;
  }

  isSnapping.value = true;
  if (snapTimeout) clearTimeout(snapTimeout);
  snapTimeout = setTimeout(() => { isSnapping.value = false; }, 320);
};

const dragStyle = computed(() => {
  if (isDragging.value) {
    return { transform: `translateY(${dragDeltaY.value}px)`, transition: 'none' };
  }
  if (isClosing.value) {
    return { transform: 'translateY(100%)', transition: 'transform 0.25s cubic-bezier(0.32, 0, 0.67, 0)' };
  }
  if (isSnapping.value) {
    // Retour à 0 avec transition : évite un saut instantané depuis la
    // position glissée quand on reste ouvert (repli/dépli).
    return { transform: 'translateY(0)', transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)' };
  }
  return {};
});

watch(() => props.isOpen, (open) => {
  if (!open) {
    isExpanded.value = false;
    isDragging.value = false;
    isSnapping.value = false;
    isClosing.value = false;
    dragDeltaY.value = 0;
    if (snapTimeout) { clearTimeout(snapTimeout); snapTimeout = null; }
    if (closeTimeout) { clearTimeout(closeTimeout); closeTimeout = null; }
  }
});

onUnmounted(() => {
  if (snapTimeout) clearTimeout(snapTimeout);
  if (closeTimeout) clearTimeout(closeTimeout);
});

</script>

<style scoped>

/* Feuille qui glisse depuis le bas sur mobile — courbe "smooth deceleration"
   (type feuille iOS), pas de rebond. Le pop centré + rebond reste réservé au
   bureau (media query ci-dessous). Transition dédiée à ce composant (pas la
   classe globale .pop, partagée par plein d'autres composants). */
.popup-card-enter-active,
.popup-card-leave-active {
  will-change: transform;
}

.popup-card-enter-active {
  transition: transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.35s ease;
}

.popup-card-leave-active {
  transition: transform 0.25s cubic-bezier(0.32, 0, 0.67, 0), opacity 0.25s ease;
}

.popup-card-enter-from,
.popup-card-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.popup-card-enter-to,
.popup-card-leave-from {
  transform: translateY(0);
  opacity: 1;
}

@media (min-width: 640px) {
  .popup-card-enter-active {
    transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease;
  }

  .popup-card-leave-active {
    transition: transform 0.2s ease-in, opacity 0.2s ease;
  }

  .popup-card-enter-from,
  .popup-card-leave-to {
    transform: scale(0.9) translateY(10px);
  }
}

</style>
