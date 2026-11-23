<template>
    <header class="flex items-start gap-3 px-5 py-4 border-b border-(--text)/10 bg-(--bg2) text-(--text)" :class="draggable ? 'cursor-grab active:cursor-grabbing select-none rounded-t-2xl' : ''">
        <div class="h-11 w-11 shrink-0 rounded-xl bg-(--primary)/15 text-(--primary) flex items-center justify-center text-xl"><i class="bi bi-diagram-3" /></div>
        <div class="min-w-0 flex-1">
            <h2 class="text-lg font-bold leading-tight break-words">{{ title }}</h2>
            <p class="mt-0.5 text-xs text-(--text2) flex flex-wrap gap-x-4 gap-y-0.5">
                <span v-if="expiry"><i class="bi bi-clock" /> {{ expiry }}</span>
                <span v-if="reassure"><i class="bi bi-shield-check" /> Rien n'est fait avant votre accord</span>
                <span v-if="scope"><i class="bi bi-people" /> {{ scope }}</span>
            </p>
        </div>
        <button type="button" class="p-2 rounded-lg hover:bg-(--text)/10" aria-label="Fermer" @mousedown.stop @click="emit('close')"><i class="bi bi-x-lg" /></button>
    </header>
</template>

<script setup lang="ts">
defineProps<{ title: string; expiry?: string; scope?: string; reassure?: boolean; draggable?: boolean }>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>
