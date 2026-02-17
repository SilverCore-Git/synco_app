<template>

    <button
        @click="$emit('click')"
        :aria-label="label"
        :title="label"
        class="
            relative flex items-center justify-center 
            w-12 h-12 cursor-pointer transition-all duration-300 ease-out
            bg-(--bg) rounded-xl
            border  hover:border-(--primary)/50
            group overflow-hidden 
        "
        :class="active ? 'border-(--primary)/50' : 'border-(--text)/10'"
    >
        <div class="absolute inset-0 bg-(--primary) opacity-0 group-hover:opacity-10 transition-opacity" />

        <img 
            v-if="isHttp" 
            :src="icon" 
            :alt="label"
            class="
                w-full h-full p-2 
                group-active:scale-50 group-hover:scale-110
                transition-all duration-300 ease-out
            "
        />

        <i 
            v-else
            class="
                bi text-3xl relative z-10
                group-hover:text-(--primary)
                group-active:scale-50 group-hover:scale-110
                transition-all duration-300 ease-out    
            "
            :class="[
                active && iconFillOnActive ? icon + '-fill' : icon,
                active ? 'text-(--primary)' : 'text-(--text)'
            ]"
        />

    </button>

</template>

<script lang="ts" setup>
import { computed } from 'vue';

const props = defineProps<{
    icon: string; // bi | http
    label: string;
    active?: boolean;
    iconFillOnActive?: boolean;
}>();

defineEmits<{
    (e: 'click'): void;
}>();

const isHttp = computed(() => props.icon.startsWith('http'));

</script>

<style scoped>
button:hover {
  box-shadow: 0 0 15px -3px rgba(30, 215, 96, 0.2);
}
</style>