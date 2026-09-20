<template>
    <div class="flex-1 max-w-xs mx-4 hidden md:flex" v-if="totalTasks > 0">
        <div class="w-full h-2.5 bg-black/40 rounded-full flex overflow-hidden border border-(--text)/5 shadow-inner" title="Progression des tâches">
            <div class="h-full bg-gray-400 transition-all duration-1000" :style="{ width: todoPercent + '%' }" title="À faire"></div>
            <div class="h-full bg-blue-500 transition-all duration-1000" :style="{ width: inProgressPercent + '%' }" title="En cours"></div>
            <div class="h-full bg-green-500 transition-all duration-1000" :style="{ width: donePercent + '%' }" title="Terminées"></div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
    tasks: any[]
}>();

const todoCount = computed(() => props.tasks.filter(t => !t.status || t.status === 'TODO').length);
const inProgressCount = computed(() => props.tasks.filter(t => t.status === 'IN_PROGRESS').length);
const doneCount = computed(() => props.tasks.filter(t => t.status === 'DONE').length);
const totalTasks = computed(() => todoCount.value + inProgressCount.value + doneCount.value);

const todoPercent = computed(() => totalTasks.value === 0 ? 0 : (todoCount.value / totalTasks.value) * 100);
const inProgressPercent = computed(() => totalTasks.value === 0 ? 0 : (inProgressCount.value / totalTasks.value) * 100);
const donePercent = computed(() => totalTasks.value === 0 ? 0 : (doneCount.value / totalTasks.value) * 100);
</script>
