<template>
    <div
        v-if="isOpen && (results.length || !ready)"
        class="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] bg-(--bg) border border-(--text)/10 rounded-xl shadow-2xl overflow-hidden z-50 font-['Outfit',sans-serif]"
        @mousedown.prevent
    >
        <div class="flex items-center justify-between gap-2 px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-(--text2) border-b border-(--border-color)">
            <span class="truncate">Emojis · <span class="normal-case font-mono tracking-normal">:{{ query }}</span></span>
            <span class="normal-case tracking-normal font-normal text-(--text)/35 shrink-0">Tab ou Entrée</span>
        </div>

        <div v-if="!ready" class="flex items-center gap-2 px-3 py-3 text-xs text-(--text2)">
            <span class="w-3.5 h-3.5 border-2 border-(--text2)/30 border-t-(--primary) rounded-full animate-spin shrink-0" />
            Chargement des emojis…
        </div>

        <div v-else ref="listRef" class="max-h-64 overflow-y-auto p-1" role="listbox" aria-label="Suggestions d'emojis">
            <button
                v-for="(item, index) in results"
                :key="item.emoji"
                type="button"
                role="option"
                :aria-selected="index === activeIndex"
                class="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left transition-colors text-(--text)"
                :class="index === activeIndex ? 'bg-(--primary)/20' : 'hover:bg-(--text)/5'"
                @mousemove="$emit('hover', index)"
                @click="$emit('select', item)"
            >
                <span class="emoji-glyph text-[1.4rem] w-7 text-center shrink-0">{{ withSkin(item) }}</span>
                <span class="flex flex-col min-w-0 leading-tight">
                    <span class="text-sm truncate first-letter:uppercase" :class="index === activeIndex ? 'text-(--primary) font-medium' : ''">{{ item.label }}</span>
                    <span v-if="item.shortcodes[0]" class="text-[11px] text-(--text2) truncate font-mono">:{{ item.shortcodes[0] }}:</span>
                </span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { nextTick, watch, ref } from 'vue';
import { withSkin, type Emoji } from './emoji/emojiStore';

const props = defineProps<{
    isOpen: boolean;
    query: string;
    results: Emoji[];
    activeIndex: number;
    ready: boolean;
}>();

defineEmits<{
    (e: 'select', emoji: Emoji): void;
    (e: 'hover', index: number): void;
}>();

const listRef = ref<HTMLElement | null>(null);

// Garde l'élément actif visible pendant la navigation au clavier
watch(() => props.activeIndex, (index) => {
    nextTick(() => {
        (listRef.value?.children[index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
    });
});
</script>

<style scoped>
.emoji-glyph {
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "Twemoji Mozilla", "Android Emoji", "EmojiSymbols", sans-serif;
    line-height: 1;
}
</style>
