<template>

    <div
        ref="windowRef"
        class="fixed z-50 overflow-hidden "
        :style="{ top: y + 'px', left: x + 'px', width: width, height: height }"
    >

        <div
            class="cursor-grab active:cursor-grabbing select-none"
            @mousedown="startDrag"
        >
            <slot name="header"></slot>
        </div>

        <div class="flex-1 overflow-auto p-4">
            <slot></slot>
        </div>

    </div>

</template>

<script setup lang="ts">

import { ref, onUnmounted } from 'vue';

const props = defineProps({
    active: { type: Boolean, default: true },
    initialX: { type: Number, default: 100 },
    initialY: { type: Number, default: 100 },
    width: { type: String, default: '400px' },
    height: { type: String, default: 'auto' }
});

const x = ref(props.initialX);
const y = ref(props.initialY);
const windowRef = ref<HTMLElement | null>(null);

let isDragging = false;
let startMouseX = 0;
let startMouseY = 0;
let startWindowX = 0;
let startWindowY = 0;

const startDrag = (e: MouseEvent) => {

    if (windowRef.value === null || !props.active) return;

    isDragging = true;
    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startWindowX = x.value;
    startWindowY = y.value;

    window.addEventListener('mousemove', onDrag);
    window.addEventListener('mouseup', stopDrag);

};

const onDrag = (e: MouseEvent) => {
    
    if (!isDragging || !windowRef.value) return;

    const deltaX = e.clientX - startMouseX;
    const deltaY = e.clientY - startMouseY;

    let newX = startWindowX + deltaX;
    let newY = startWindowY + deltaY;

    const rect = windowRef.value.getBoundingClientRect();
    
    const maxX = window.innerWidth - rect.width;
    x.value = Math.max(0, Math.min(newX, maxX));

    const maxY = window.innerHeight - rect.height;
    y.value = Math.max(0, Math.min(newY, maxY));

};

const stopDrag = () => {
    isDragging = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
};

onUnmounted(() => {
    stopDrag();
});

</script>