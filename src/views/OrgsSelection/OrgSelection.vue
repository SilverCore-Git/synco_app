<script setup lang="ts">

import type { Org } from '@/types/org';


const organizations: Org[] = [
    {
        id: "st-alpha-01",
        name: "SilverTeams Core",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=SilverCore&backgroundColor=1e1e1e&color=1ed760",
        stats: {
            memberCount: 12,
            onlineCount: 8
        },
        config: {
            maxNotesPerSpace: 500,
            maxFileStoragePerSpace: 1024, // 1 Go
            maxUsersPerSpace: 50,
            maxTotalUsers: 100
        }
    },
    {
        id: "st-corp-99",
        name: "Neo-Defense Corp",
        logo: "https://api.dicebear.com/7.x/identicon/svg?seed=NeoDefense&backgroundColor=1e1e1e&color=bfc3c7",
        stats: {
            memberCount: 450,
            onlineCount: 124
        },
        config: {
            maxNotesPerSpace: 2000,
            maxFileStoragePerSpace: 10240, // 10 Go
            maxUsersPerSpace: 200,
            maxTotalUsers: 1000
        }
    }
];



const handleSelect = (org: Org) => {

};

</script>

<template>

    <div class="min-h-screen bg-(--bg2) flex flex-col items-center justify-center p-8 font-sans">
        
        <header class="text-center mb-16 space-y-4">
            <h1 class="uppercase text-4xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-[#1ED760]">organisation</span>
            </h1>
        </header>

        <div class="flex flex-wrap justify-center gap-16 max-w-6xl">

            <div
                v-for="org in organizations"
                :key="org.id"
                class="group relative flex flex-col items-center cursor-pointer"
                @click="handleSelect(org)"
            >

                <div 
                    class="
                        relative w-60 h-60
                        overflow-hidden border-4 border-transparent 
                        transition-all duration-300 transform bg-(--bg)
                        rounded-4xl
                        group-hover:scale-105 group-hover:border-(--primary) shadow-2xl
                    "
                >

                    <img 
                        v-if="org.logo" 
                        :src="org.logo" 
                        :alt="org.name" 
                        class="
                            w-full h-full 
                            object-cover grayscale-[50%] 
                            group-hover:grayscale-0 transition-all
                        "
                    />
                    <div v-else class="w-full h-full bg-[#2A2A2A] flex items-center justify-center">
                        <span class="text-4xl font-black text-[#1ED760]">{{ org.name.substring(0, 2).toUpperCase() }}</span>
                    </div>

                </div>

                <span class="mt-5 text-xl font-medium text-(--text)/60 group-hover:text-(--text) transition-colors">
                    {{ org.name }}
                </span>

            </div>

            <!-- <div class="group flex flex-col items-center cursor-pointer" @click="emit('manage')">
                <div class="w-36 h-36 md:w-44 md:h-44 rounded-lg border-4 border-dashed border-[#BFC3C7]/20 
                            flex items-center justify-center transition-all group-hover:border-[#BFC3C7]/50 group-hover:bg-[#BFC3C7]/5">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-[#BFC3C7]/20 group-hover:text-[#BFC3C7]/50 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                </svg>
                </div>
                <span class="mt-5 text-xl font-medium text-[#BFC3C7]/30 group-hover:text-[#BFC3C7]/60">Nouvelle Org</span>
            </div> -->

        </div>

    </div>

</template>
