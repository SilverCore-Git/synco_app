<template>
    <!-- Ordinateur : le picker s'affiche sur place (le parent le positionne)
         et apparaît en « ressort » depuis son point d'ancrage. -->
    <Transition v-if="!compact" name="emoji-pop" :css="animationsEnabled">
        <div v-if="show" class="emoji-pop" :style="{ transformOrigin: origin }">
            <EmojiPicker @select="emit('select', $event)" @close="emit('close')" />
        </div>
    </Transition>

    <!-- Mobile : bottom sheet téléportée, fond assombri, poignée à glisser
         vers le bas pour fermer (même grammaire que MessageActionSheet). -->
    <Teleport v-else to="body">
        <Transition name="emoji-sheet-backdrop" :css="animationsEnabled">
            <div v-if="show" class="fixed inset-0 z-[2950] bg-black/50 touch-none" @click.stop="emit('close')" />
        </Transition>

        <Transition name="emoji-sheet" :css="animationsEnabled">
            <div
                v-if="show"
                class="emoji-sheet fixed inset-x-0 bottom-0 z-[2951] flex flex-col rounded-t-3xl bg-(--bg) border-t border-(--text)/10 shadow-2xl overflow-hidden"
                :class="{ 'is-dragging': dragging }"
                :style="dragY ? { transform: `translateY(${dragY}px)` } : undefined"
                role="dialog"
                aria-modal="true"
                aria-label="Choisir un emoji"
                @click.stop
            >
                <div
                    class="shrink-0 pt-2.5 pb-1 flex justify-center touch-none cursor-grab"
                    @touchstart.passive="onDragStart"
                    @touchmove.passive="onDragMove"
                    @touchend="onDragEnd"
                    @touchcancel="onDragEnd"
                >
                    <div class="w-10 h-1 rounded-full bg-(--text)/25" />
                </div>
                <EmojiPicker variant="sheet" @select="emit('select', $event)" @close="emit('close')" />
            </div>
        </Transition>
    </Teleport>
</template>

<script lang="ts">
import { ref } from 'vue';

// Mode compact = écran étroit, ou tactile sans souris jusqu'à la taille
// tablette : un popover de 20rem y serait trop petit pour le doigt.
// Partagé au niveau du module : MessageReactions monte une instance par
// message, inutile d'avoir un écouteur matchMedia pour chacune.
const COMPACT_QUERY = '(max-width: 640px), (hover: none) and (pointer: coarse) and (max-width: 1024px)';
const mql = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(COMPACT_QUERY) : null;
const compact = ref<boolean>(mql?.matches ?? false);
mql?.addEventListener('change', (e) => { compact.value = e.matches; });

/** true quand le picker s'affiche en bottom sheet (mobile). */
export const isCompactPicker = compact;
</script>

<script setup lang="ts">
import { watch } from 'vue';
import EmojiPicker from './EmojiPicker.vue';
import useMotion from '@/composables/useMotion';

const props = withDefaults(defineProps<{
    show: boolean;
    /** Point d'où le picker « pousse » sur ordinateur (transform-origin). */
    origin?: string;
}>(), {
    origin: 'bottom right',
});

const emit = defineEmits<{
    (e: 'select', emoji: string): void;
    (e: 'close'): void;
}>();

const { animationsEnabled } = useMotion();

// --- Glisser pour fermer -------------------------------------------------
const DISMISS_THRESHOLD = 90;
const dragY = ref<number>(0);
const dragging = ref<boolean>(false);
let dragStartY: number | null = null;

// Remise à zéro à l'ouverture seulement : à la fermeture, la sheet doit
// partir de là où le doigt l'a laissée.
watch(() => props.show, (open) => {
    if (open) { dragY.value = 0; dragging.value = false; dragStartY = null; }
});

const onDragStart = (e: TouchEvent) => {
    dragStartY = e.touches[0]?.clientY ?? null;
    dragging.value = dragStartY !== null;
};
const onDragMove = (e: TouchEvent) => {
    if (dragStartY === null) return;
    const y = e.touches[0]?.clientY;
    if (y !== undefined) dragY.value = Math.max(0, y - dragStartY);
};
const onDragEnd = () => {
    if (dragStartY === null) return;
    dragStartY = null;
    dragging.value = false;
    // Au-delà du seuil : la sheet file vers le bas depuis la position du
    // doigt (le style inline primerait sur la classe de sortie, d'où la
    // position finale posée ici), sinon elle revient en place.
    if (dragY.value > DISMISS_THRESHOLD) {
        dragY.value = window.innerHeight;
        emit('close');
    } else {
        dragY.value = 0;
    }
};
</script>

<style scoped>
/* --- Popover ordinateur ------------------------------------------------- */
.emoji-pop-enter-active {
    transition: opacity 160ms ease-out, transform 280ms cubic-bezier(0.34, 1.45, 0.64, 1);
}
.emoji-pop-leave-active {
    transition: opacity 120ms ease-in, transform 140ms ease-in;
}
.emoji-pop-enter-from {
    opacity: 0;
    transform: translateY(10px) scale(0.9);
}
.emoji-pop-leave-to {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
}

/* --- Sheet mobile ------------------------------------------------------- */
.emoji-sheet {
    padding-bottom: env(safe-area-inset-bottom);
    transition: transform 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
.emoji-sheet.is-dragging {
    transition: none;
}
.emoji-sheet-enter-active {
    transition: transform 0.34s cubic-bezier(0.32, 0.72, 0, 1);
}
.emoji-sheet-leave-active {
    transition: transform 0.22s ease-in;
}
.emoji-sheet-enter-from,
.emoji-sheet-leave-to {
    transform: translateY(100%);
}

.emoji-sheet-backdrop-enter-active,
.emoji-sheet-backdrop-leave-active {
    transition: opacity 0.25s ease;
}
.emoji-sheet-backdrop-enter-from,
.emoji-sheet-backdrop-leave-to {
    opacity: 0;
}
</style>
