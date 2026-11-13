<template>
    <span class="inline-flex items-center gap-2 min-w-0">
        <img v-if="user?.avatarUrl" :src="user.avatarUrl" class="rounded-full object-cover shrink-0" :class="size" alt="">
        <span v-else class="rounded-full bg-(--primary)/15 text-(--primary) flex items-center justify-center text-[9px] font-bold shrink-0" :class="size">
            {{ ($p(user?.name) || '?').substring(0, 2).toUpperCase() }}
        </span>
        <span v-if="!avatarOnly" class="truncate text-(--text)">
            {{ $p(user?.name) || 'Membre' }}<span v-if="isMe" class="text-(--text2)"> (vous)</span>
        </span>
    </span>
</template>

<script setup lang="ts">
import type { StatsUser } from './statsTypes';

withDefaults(defineProps<{ user?: StatsUser; isMe?: boolean; avatarOnly?: boolean; size?: string }>(), {
    user: undefined, isMe: false, avatarOnly: false, size: 'w-6 h-6',
});
</script>
