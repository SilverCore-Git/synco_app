<script setup lang="ts">
import isDesktopApp from '@/assets/isDesktopApp';
import { openedOrg } from '@/assets/var';

</script>

<template>

    <div v-if="isDesktopApp()" class="w-full bg-(--bg) h-8 flex flex-row justify-between items-center">

        <div></div>

        <div class="flex justify-center items-center flex-row gap-6">

            <img 
                v-if="openedOrg?.logo && openedOrg?.logo.startsWith('http')" 
                :src="openedOrg?.logo" 
                :alt="openedOrg?.name" 
                class="
                    w-4 h-4 transition-all
                    object-cover group-hover:grayscale-0 
                "
            />

            <i
                v-else-if="openedOrg?.logo"
                class="
                    group-hover:opacity-100 transition-all
                    bi text-2xl object-cover opacity-50
                "
                :class="openedOrg?.logo"
            />

            <div v-else class="w-4 h-4 bg-(--bg) flex items-center justify-center">
                <span class="text-xl font-black text-(--primary)">{{ openedOrg?.name.substring(0, 2).toUpperCase() }}</span>
            </div>

            <span>{{ openedOrg?.name }}</span>

        </div>

        <div class="flex h-full">

            <button class="default w-4">
                <i class="bi bi-dash-lg" />
            </button>
            <button class="default w-4">
                <i class="bi bi-square" />
            </button>
            <button class="default w-4 hover:text-red-500!">
                <i class="bi bi-x-lg" />
            </button>

        </div>

    </div>

</template>