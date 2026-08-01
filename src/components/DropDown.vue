<template>

    <div class="relative inline-block text-left ">

        <div 
            ref="triggerRef"
            @click="click !== 'right' ? toggleDropdown($event) : console.log" 
            @contextmenu.prevent="click == 'right' ? toggleDropdown($event) : console.log" 
            :class="click !== 'right' ? 'cursor-pointer' : ''"
            class="h-full w-full"
        >
            <slot name="trigger" />
        </div>

        <Teleport to="body">
            <transition
                enter-active-class="transition duration-100 ease-out"
                enter-from-class="transform scale-95 opacity-0"
                enter-to-class="transform scale-100 opacity-100"
                leave-active-class="transition duration-75 ease-in"
                leave-from-class="transform scale-100 opacity-100"
                leave-to-class="transform scale-95 opacity-0"
            >
                <div
                    v-if="isOpen || show"
                    ref="dropdownContentRef"
                    class="
                        fixed z-[1000] mt-2 w-56 rounded-xl border border-(--border-color)
                        bg-(--bg) shadow-xl ring-1 ring-white/5 focus:outline-none
                    "
                    :class="props.contentInerTW || ''"
                    :style="getDropdownPosition()"
                >
                    <div class="p-1.5 sdropdown" @click="closeDropdown">
                        <slot name="content" />
                    </div>
                </div>
            </transition>
        </Teleport>

    </div>

</template>

<script setup lang="ts">

import { ref, onMounted, onUnmounted, reactive, watchEffect } from 'vue';

const props = defineProps<{
  align?: 'left' | 'right' | 'mouse' | 'top';
  click?: 'right' | 'left';
  show?: boolean;
  contentInerTW?: string;
}>();

const triggerRef = ref<HTMLElement | null>(null);
const dropdownContentRef = ref<HTMLElement | null>(null);
const isOpen = ref<boolean>(false);
const pos = reactive({ x: 0, y: 0 });

const emit = defineEmits(['toggled']);

const toggleDropdown = (e?: MouseEvent) => {
    isOpen.value = !isOpen.value
    if (e && props.align === 'mouse') 
    {
        pos.x = e.clientX;
        pos.y = e.clientY;
    }
    emit('toggled', isOpen.value);
};

const getDropdownPosition = () => {
    if (!triggerRef.value) return {};
    
    const triggerRect = triggerRef.value.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const dropdownHeight = 200; // Approximate height
    
    let left = triggerRect.left + window.scrollX;
    
    if (props.align === 'top') {
        return {
            bottom: `${viewportHeight - triggerRect.top + 8}px`,
            left: `${left}px`,
            minWidth: `${triggerRect.width}px`
        };
    }
    
    let top = triggerRect.bottom + window.scrollY + 8;
    
    // Vérifier si le dropdown dépasse en bas
    if (top + dropdownHeight > viewportHeight + window.scrollY) {
        top = triggerRect.top + window.scrollY - dropdownHeight - 8;
    }

    // Alignement à droite
    if (props.align === 'right') {
        return {
            top: `${top}px`,
            right: `${window.innerWidth - triggerRect.right - window.scrollX}px`
        };
    } else if (props.align === 'mouse') {
        top = pos.y - 10 + window.scrollY;
        left = pos.x - 70 + window.scrollX;
    }
    
    return {
        top: `${top}px`,
        left: `${left}px`,
        minWidth: `${triggerRect.width}px`
    };
};

const closeDropdown = () => {
    if (isOpen.value) {
        isOpen.value = false;
        emit('toggled', false);
    }
};

// Recalculate position when dropdown opens or window resizes
watchEffect(() => {
    if (isOpen.value || props.show) {
        getDropdownPosition();
    }
});

const handleClickOutside = (event: MouseEvent) => {
    if (!isOpen.value && !props.show) return;

    const target = event.target as Node;
    
    // Check if click is inside the trigger
    const isInTrigger = triggerRef.value?.contains(target);
    
    // Check if click is inside the dropdown content
    const isInDropdownContent = dropdownContentRef.value?.contains(target);
    
    // Close only if click is outside both trigger and dropdown content
    if (!isInTrigger && !isInDropdownContent) {
        closeDropdown();
    }
};


onMounted(() => {
    window.addEventListener('click', handleClickOutside, true);
    window.addEventListener('contextmenu', handleClickOutside, true);
});
onUnmounted(() => {
    window.removeEventListener('click', handleClickOutside, true);
    window.removeEventListener('contextmenu', handleClickOutside, true);
});


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
    @apply w-full flex items-center justify-start px-3 py-2 text-sm rounded-md transition-all duration-300
            hover:bg-(--primary)/20 text-(--text)/80 hover:text-(--text) active:scale-90;
}

</style>