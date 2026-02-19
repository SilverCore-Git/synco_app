<template>

    <div class="relative inline-block text-left" ref="dropdownRef">

        <div @click="toggleDropdown" class="cursor-pointer">
            <slot name="trigger" />
        </div>

        <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
        >

            <div
                v-if="isOpen"
                class="
                    absolute z-50 mt-2 w-56 rounded-xl border border-(--text)/10
                    bg-(--bg2) shadow-xl ring-1 ring-white/5 focus:outline-none
                "
                :class="align === 'right' ? 'right-0' : 'left-0'"
            >

                <div class="p-1.5 sdropdown">
                    <slot name="content" />
                </div>

            </div>

        </transition>

    </div>

</template>

<script setup lang="ts">

import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  align?: 'left' | 'right';
}>();

const isOpen = ref(false);
const dropdownRef = ref<HTMLElement | null>(null);

const toggleDropdown = () => (isOpen.value = !isOpen.value);
const closeDropdown = () => (isOpen.value = false);


const handleClickOutside = (event: MouseEvent) => {
    if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) 
    {
        closeDropdown();
    }
};


onMounted(() => window.addEventListener('click', handleClickOutside));
onUnmounted(() => window.removeEventListener('click', handleClickOutside));


defineExpose({ closeDropdown });

</script>

<style>

@import '../style.css';

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.sdropdown .dropdown-item-annimate {
  animation: slideIn 0.2s ease-out forwards;
  opacity: 0;
}

.sdropdown .dropdown-item-style {
    @apply w-full flex items-center px-3 py-2 text-sm rounded-md transition-all duration-300
            hover:bg-(--primary)/20 text-(--text)/80 hover:text-(--text) active:scale-90;
}

</style>