<template>

    <button
        class="
        w-full flex items-center gap-2 px-2 py-1.5 rounded-md
        transition-all duration-200 group cursor-pointer
        hover:bg-white/5 active:bg-white/10
        text-(--text)/60 hover:text-(--text)
        "
        :class="{ 'bg-white/10 text-white': active }"
    >

        <div class="flex items-center justify-center w-5 h-5">
            <i 
                v-if="thread.type === 'text'" 
                class="bi bi-hash text-xl opacity-40 group-hover:opacity-100"
            ></i>
            <i 
                v-else 
                class="bi bi-volume-up-fill text-lg opacity-40 group-hover:opacity-100"
            ></i>
        </div>

        <span class="text-sm font-medium truncate lowercase tracking-wide">
            {{ thread.name }}
        </span>

        <div 
            v-if="hasUnread" 
            class="
                ml-auto w-2 h-2
                rounded-full bg-(--primary) 
                shadow-[0_0_8px_var(--primary)]
            "
        />

    </button>

</template>

<script lang="ts" setup>

import type { Thread } from '@/types/workSpace';

interface Props {
  thread: Thread;
  active?: boolean;
  hasUnread?: boolean;
}

defineProps<Props>();

</script>