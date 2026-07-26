<template>

    <div 
        v-if="isOpen && filteredUsers.length" 
        class="absolute bottom-full left-0 mb-2 w-64 bg-(--bg) border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto p-1 backdrop-blur-3xl"
    >

        <div class="p-2 text-[10px] uppercase font-bold tracking-wider text-(--text)/40 border-b border-(--border-color)">
            Membres du salon
        </div>

        <button
            v-for="(user, index) in filteredUsers"
            :key="user.id"
            @click="$emit('select', user)"
            :class="[
                'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg text-left transition-colors text-white',
                index === activeIndex ? 'bg-(--primary)/20 text-(--primary)' : 'hover:bg-white/5'
            ]"
        >
            <div class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs">
                {{ user.name.charAt(0).toUpperCase() }}
            </div>
            <span class="truncate">{{ user.name }}</span>
        </button>
        
    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';

const props = defineProps<{
  isOpen: boolean;
  searchQuery: string;
  users: Array<{ id: string; name: string }>;
  activeIndex: number;
}>();

defineEmits(['select']);

const filteredUsers = computed(() => {
    if (!props.searchQuery) return props.users;
    return props.users.filter(u => 
        u.name.toLowerCase().includes(props.searchQuery.toLowerCase())
    );
});

</script>