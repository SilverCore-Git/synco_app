<template>

    <div class="flex flex-col h-full relative overflow-hidden w-full">

        <header
            class="h-14 flex items-center px-4 border-b border-white/5 bg-(--bg2) backdrop-blur-md z-10"
        >

            <div class="flex items-center gap-2">
                <i class="bi bi-file-earmark text-xl text-(--text)/40" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    Fichiers
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-bell-fill" />
                </button>
                <button 
                    @click="showUsersBar = !showUsersBar"
                    class="hover:text-(--text) transition-colors"
                    :class="showUsersBar ? 'text-(--text)' : ''"
                >
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>



    </div>

</template>
<script lang="ts" setup>

import useSettingsItem from '@/composables/useSettingsItem';

const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);

</script>