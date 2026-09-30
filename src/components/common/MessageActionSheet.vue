<template>

    <Teleport to="body">

        <Transition name="sheet-backdrop">
            <div
                v-if="show"
                class="fixed inset-0 z-[2900] bg-black/50 touch-none"
                @click="emit('close')"
            />
        </Transition>

        <Transition name="sheet">
            <div
                v-if="show"
                class="sheet fixed inset-x-0 bottom-0 z-[2901] max-h-[85vh] flex flex-col rounded-t-2xl bg-(--bg2) border-t border-(--text)/10 shadow-2xl"
                :style="dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined"
                role="dialog"
                aria-modal="true"
            >

                <!-- Zone de préhension : glisser vers le bas pour fermer,
                     comme sur les sheets natifs iOS/Android. -->
                <div
                    class="shrink-0 pt-2.5 pb-3 px-4 touch-none"
                    @touchstart.passive="onDragStart"
                    @touchmove.passive="onDragMove"
                    @touchend="onDragEnd"
                    @touchcancel="onDragEnd"
                >
                    <div class="mx-auto w-10 h-1 rounded-full bg-(--text)/25" />

                    <div v-if="previewName || previewContent" class="mt-3 flex items-baseline gap-2 min-w-0">
                        <span v-if="previewName" class="text-xs font-bold text-(--primary) shrink-0">{{ previewName }}</span>
                        <span class="text-xs text-(--text2) truncate">{{ previewContent }}</span>
                    </div>
                </div>

                <div class="overflow-y-auto overscroll-contain px-3 sheet-bottom-inset">

                    <div v-if="quickReactions?.length" class="flex items-center justify-between gap-1 px-1 pb-3">
                        <button
                            v-for="emoji in quickReactions"
                            :key="emoji"
                            class="w-11 h-11 flex items-center justify-center rounded-full bg-(--text)/5 active:scale-90 active:bg-(--text)/15 transition-transform text-2xl"
                            @click="emit('react', emoji)"
                        >
                            {{ emoji }}
                        </button>
                        <button
                            class="w-11 h-11 flex items-center justify-center rounded-full bg-(--text)/5 active:scale-90 active:bg-(--text)/15 transition-transform text-(--text2)"
                            aria-label="Plus de réactions"
                            @click="emit('more-reactions')"
                        >
                            <i class="bi bi-emoji-smile text-xl" />
                        </button>
                    </div>

                    <div class="rounded-xl bg-(--text)/5 overflow-hidden divide-y divide-(--text)/5">
                        <button
                            v-for="action in actions"
                            :key="action.label"
                            class="w-full flex items-center gap-4 px-4 py-3.5 text-left text-[15px] active:bg-(--text)/10 transition-colors"
                            :class="action.danger ? 'text-red-400' : 'text-(--text)'"
                            @click="action.onClick()"
                        >
                            <i class="bi text-lg w-5 text-center" :class="[action.icon, action.danger ? '' : 'text-(--text2)']" />
                            <span>{{ action.label }}</span>
                        </button>
                    </div>

                    <button
                        class="w-full mt-2 mb-3 py-3.5 rounded-xl bg-(--text)/5 text-[15px] font-semibold text-(--text) active:bg-(--text)/10 transition-colors"
                        @click="emit('close')"
                    >
                        Annuler
                    </button>

                </div>

            </div>
        </Transition>

    </Teleport>

</template>

<script setup lang="ts">

import { ref, watch } from 'vue';

export interface SheetAction {
    icon: string;
    label: string;
    onClick: () => void;
    danger?: boolean;
}

const props = defineProps<{
    show: boolean;
    actions: SheetAction[];
    previewName?: string;
    previewContent?: string;
    quickReactions?: string[];
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'react', emoji: string): void;
    (e: 'more-reactions'): void;
}>();

// Au-delà de ce déplacement vers le bas, relâcher ferme le sheet ; en deçà
// il revient en place.
const DISMISS_THRESHOLD = 80;

const dragY = ref<number>(0);
let dragStartY: number | null = null;

watch(() => props.show, () => { dragY.value = 0; dragStartY = null; });

const onDragStart = (e: TouchEvent) => {
    dragStartY = e.touches[0]?.clientY ?? null;
};

const onDragMove = (e: TouchEvent) => {
    if (dragStartY === null) return;
    const y = e.touches[0]?.clientY;
    if (y === undefined) return;
    dragY.value = Math.max(0, y - dragStartY);
};

const onDragEnd = () => {
    if (dragStartY === null) return;
    dragStartY = null;
    if (dragY.value > DISMISS_THRESHOLD) emit('close');
    else dragY.value = 0;
};

</script>

<style scoped>

.sheet {
    transition: transform 0.25s ease;
}

.sheet-bottom-inset {
    padding-bottom: env(safe-area-inset-bottom);
}

.sheet-enter-active {
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
}
.sheet-leave-active {
    transition: transform 0.2s ease-in;
}
.sheet-enter-from,
.sheet-leave-to {
    transform: translateY(100%);
}

.sheet-backdrop-enter-active,
.sheet-backdrop-leave-active {
    transition: opacity 0.25s ease;
}
.sheet-backdrop-enter-from,
.sheet-backdrop-leave-to {
    opacity: 0;
}

</style>
