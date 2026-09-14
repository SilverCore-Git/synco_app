<template>

    <div 
        v-if="isOpen && filteredUsers.length" 
        class="absolute bottom-full left-0 mb-2 w-64 bg-(--bg) border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 max-h-48 overflow-y-auto p-1 backdrop-blur-3xl"
    >

        <div class="p-2 text-[10px] uppercase font-bold tracking-wider text-(--text2) border-b border-(--border-color)">
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
            <div
                v-if="user.special"
                class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-xs shrink-0"
            >
                <i class="bi" :class="user.special === 'everyone' ? 'bi-megaphone-fill' : 'bi-broadcast'" />
            </div>
            <div v-else class="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center font-bold text-xs shrink-0">
                {{ $p(user.name).charAt(0).toUpperCase() }}
            </div>
            <div class="flex flex-col min-w-0">
                <span class="truncate">{{ $p(user.name) }}</span>
                <span v-if="user.pseudo" class="text-xs text-(--primary) truncate">@{{ user.pseudo }}</span>
            </div>
        </button>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { MentionEntry } from '@/composables/useMentions';

const props = defineProps<{
  isOpen: boolean;
  searchQuery: string;
  users: MentionEntry[];
  activeIndex: number;
}>();

defineEmits(['select']);

const filteredUsers = computed(() => {
    if (!props.searchQuery) return props.users;
    const query = props.searchQuery.toLowerCase();
    return props.users.filter(u =>
        u.name.toLowerCase().includes(query) ||
        (u.pseudo && u.pseudo.toLowerCase().includes(query))
    );
});

</script>