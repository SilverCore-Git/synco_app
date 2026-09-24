<template>

    <button
        type="button"
        class="w-full flex items-start gap-4 p-4 rounded-xl border transition-colors text-left"
        :class="[
            modelValue ? 'border-(--primary)/40 bg-(--primary)/5' : 'border-(--border-color) bg-(--bg)',
            disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-(--text)/20 cursor-pointer'
        ]"
        :disabled="disabled"
        @click="emit('update:modelValue', !modelValue)"
    >

        <div
            class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors"
            :class="modelValue ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg3) text-(--text2)'"
        >
            <i class="bi" :class="icon" />
        </div>

        <div class="flex-1 min-w-0">
            <p class="text-sm font-bold text-(--text)">{{ label }}</p>
            <p class="text-xs text-(--text2) mt-0.5 leading-snug">{{ description }}</p>
        </div>

        <span class="relative inline-flex items-center shrink-0 mt-0.5">
            <span
                class="w-11 h-6 rounded-full border transition-colors block"
                :class="modelValue ? 'bg-(--primary) border-(--primary)' : 'bg-black/20 border-(--border-color)'"
            />
            <span
                class="absolute top-[2px] left-[2px] h-5 w-5 rounded-full bg-white border border-gray-300 transition-transform"
                :class="modelValue ? 'translate-x-5' : 'translate-x-0'"
            />
        </span>

    </button>

</template>

<script lang="ts" setup>

defineProps<{
    modelValue: boolean;
    label: string;
    description: string;
    icon: string;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
}>();

</script>
