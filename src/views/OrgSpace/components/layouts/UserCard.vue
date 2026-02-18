<script setup lang="ts">

import { UserButton, useUser } from '@clerk/vue';

const { user } = useUser();

</script>

<template>

    <div
        class="
            absolute bottom-0 left-0 
            w-77 h-14 bg-(--bg2) 
            border-t border-(--primary)/5 
            px-2 flex items-center
        "
    >
        <div
            class="
                flex items-center 
                w-full gap-2 p-1
                rounded-lg hover:bg-(--primary)/5 
                transition-colors group cursor-pointer
            "
        >

            <div class="relative flex items-center justify-center">
                <UserButton after-sign-out-url="/" />
                <div class="absolute bottom-0 right-0 w-3 h-3 bg-(--primary) border-2 border-(--bg2) rounded-full" />
            </div>

            <div class="flex flex-col min-w-0 flex-1 leading-tight">
                <span class="text-sm font-semibold text-(--text) truncate">
                    {{ user?.username || user?.firstName }}
                </span>
                <span class="text-[11px] text-(--text)/50 truncate font-medium">
                    #{{ user?.id.slice(-4) || '0001' }}
                </span>
            </div>

            <div class="flex items-center gap-0.5">
                <button class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/70 hover:text-(--text) transition-all">
                    <i class="bi bi-mic-fill text-sm" />
                </button>
                <button class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/70 hover:text-(--text) transition-all">
                    <i class="bi bi-headphones text-sm" />
                </button>
                <button class="p-1.5 rounded-md hover:bg-(--primary)/10 active:scale-90 text-(--text)/70 hover:text-(--text) transition-all">
                    <i class="bi bi-gear-fill text-sm hover:rotate-45 transition-all" />
                </button>
            </div>

        </div>

    </div>

</template>

<style scoped>

:deep(.cl-userButtonTrigger) {
  @apply focus:shadow-none focus:outline-none;
}

:deep(.cl-avatarBox) {
  width: 32px;
  height: 32px;
}

</style>