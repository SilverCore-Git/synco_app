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
                        fixed mt-2 w-56 rounded-xl border border-(--border-color)
                        bg-(--bg) shadow-xl ring-1 ring-(--text)/5 focus:outline-none
                    "
                    :class="props.contentInerTW || ''"
                    :style="{ ...getDropdownPosition(), zIndex: props.zIndex ?? 1000 }"
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

import { ref, onMounted, onUnmounted, reactive, watch, watchEffect } from 'vue';

const props = defineProps<{
  align?: 'left' | 'right' | 'mouse' | 'top';
  click?: 'right' | 'left';
  show?: boolean;
  contentInerTW?: string;
  // En style inline (jamais en classe Tailwind z-*) : une Popup.vue ouverte
  // au-dessus (z-index 2000 par défaut) rend ce DropDown invisible/inerte
  // en dessous sinon — cf. project_synco_scale_ux. À passer explicitement
  // (ex. 2100) quand ce DropDown s'ouvre depuis l'intérieur d'une Popup.
  zIndex?: number;
}>();

const triggerRef = ref<HTMLElement | null>(null);
const dropdownContentRef = ref<HTMLElement | null>(null);
const isOpen = ref<boolean>(false);
const pos = reactive({ x: 0, y: 0 });

// Hauteur réelle du menu une fois rendu : une estimation fixe (200px)
// laissait déborder sous la fenêtre les menus plus hauts (ex. grille
// d'icônes de liens du profil) au lieu de les ouvrir vers le haut.
const contentHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

watch(dropdownContentRef, (el) => {
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (!el) return;
    contentHeight.value = el.offsetHeight;
    resizeObserver = new ResizeObserver(() => { contentHeight.value = el.offsetHeight; });
    resizeObserver.observe(el);
}, { flush: 'post' });

const MARGIN = 8;

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
    const dropdownHeight = contentHeight.value || 200; // estimation avant le premier rendu
    
    let left = triggerRect.left + window.scrollX;
    
    if (props.align === 'top') {
        return {
            bottom: `${viewportHeight - triggerRect.top + 8}px`,
            left: `${left}px`,
            minWidth: `${triggerRect.width}px`
        };
    }
    
    let top = triggerRect.bottom + window.scrollY + 8;
    
    // Vérifier si le dropdown dépasse en bas : on l'ouvre alors vers le
    // haut, et s'il ne tient d'aucun côté on le garde dans la fenêtre.
    if (top + dropdownHeight > viewportHeight + window.scrollY - MARGIN) {
        const above = triggerRect.top + window.scrollY - dropdownHeight - 8;
        top = above >= window.scrollY + MARGIN
            ? above
            : Math.max(window.scrollY + MARGIN, viewportHeight + window.scrollY - dropdownHeight - MARGIN);
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
        const maxTop = viewportHeight + window.scrollY - dropdownHeight - MARGIN;
        if (top > maxTop) top = Math.max(window.scrollY + MARGIN, maxTop);
    }
    
    return {
        top: `${top}px`,
        left: `${left}px`,
        ...(props.align !== 'mouse' ? { minWidth: `${triggerRect.width}px` } : {})
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
    resizeObserver?.disconnect();
    window.removeEventListener('click', handleClickOutside, true);
    window.removeEventListener('contextmenu', handleClickOutside, true);
});


defineExpose({ closeDropdown, toggleDropdown });

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
            hover:bg-(--primary)/20 text-(--text) hover:text-(--text) active:scale-90;
}

</style>