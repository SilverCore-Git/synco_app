<script setup lang="ts">

import type { Org } from '@/types/org';
import { useRouter } from 'vue-router';

const router = useRouter();

const organizations: Org[] = [
    {
        id: "org-8fec6cfc42a14c09bc7f1291eba954c0",
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
        id: "org-5357410fce6d45959ed4d0bac84595a8",
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
    router.push('/org/' + org.id)
};

</script>

<template>

    <div class="min-h-screen bg-(--bg2) flex flex-col items-center justify-center p-8 font-sans">
        
        <header class="text-center mb-20 space-y-4">
            <h1 class="uppercase text-4xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-[#1ED760]">organisation</span>
            </h1>
        </header>

        <div class="flex flex-wrap justify-center gap-10 md:gap-16 max-w-6xl">

            <a
                v-for="org in organizations"
                :key="org.id"
                class="group relative flex flex-col items-center cursor-pointer"
                :href="`/org/${org.id}`"
                @click.prevent="handleSelect(org)"
            >

                <div 
                    class="
                        relative w-40 h-40 md:w-60 md:h-60
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

            </a>

        </div>

    </div>

</template>
