<template>
    <section class="bg-(--bg2) border border-(--border-color) rounded-2xl p-5 flex flex-col gap-4 min-w-0">
        <header class="flex items-start justify-between gap-3 min-w-0">
            <div class="min-w-0">
                <h4 class="text-sm font-black text-(--text) flex items-center gap-2">
                    <i v-if="icon" class="bi text-(--primary)" :class="icon" />
                    {{ title }}
                </h4>
                <p v-if="subtitle" class="text-xs text-(--text2) mt-1">{{ subtitle }}</p>
            </div>
            <slot name="actions" />
        </header>
        <slot />
    </section>
</template>

<script setup lang="ts">
defineProps<{ title: string; subtitle?: string; icon?: string }>();
</script>
