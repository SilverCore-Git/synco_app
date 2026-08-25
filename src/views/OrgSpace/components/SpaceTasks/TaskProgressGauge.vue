<template>
    <div class="flex items-center gap-3 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5 hidden md:flex" v-if="totalTasks > 0">
        <div class="flex items-center gap-3 text-[10px] font-bold tracking-widest uppercase mr-2">
            <div class="flex items-center gap-1.5" title="À faire">
                <div class="w-2 h-2 rounded-full bg-gray-400 shadow-[0_0_8px_rgba(156,163,175,0.5)]"></div>
                <span class="text-gray-400">{{ todoCount }}</span>
            </div>
            <div class="flex items-center gap-1.5" title="En cours">
                <div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                <span class="text-blue-400">{{ inProgressCount }}</span>
            </div>
            <div class="flex items-center gap-1.5" title="Terminées">
                <div class="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                <span class="text-green-500">{{ doneCount }}</span>
            </div>
        </div>
        <div class="w-40 h-2 bg-black/40 rounded-full flex overflow-hidden">
            <div class="h-full bg-gray-400 transition-all duration-1000" :style="{ width: todoPercent + '%' }"></div>
            <div class="h-full bg-blue-500 transition-all duration-1000" :style="{ width: inProgressPercent + '%' }"></div>
            <div class="h-full bg-green-500 transition-all duration-1000" :style="{ width: donePercent + '%' }"></div>
        </div>
        <div class="text-[10px] font-bold text-white/50 w-8 text-right ml-1">
            {{ Math.round(donePercent) }}%
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
