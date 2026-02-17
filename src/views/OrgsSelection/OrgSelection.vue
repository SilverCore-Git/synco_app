<script setup lang="ts">

import type { Org } from '@/types/org';
import OrgBtn from './components/OrgBtn.vue';


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


</script>

<template>

    <div class="min-h-screen bg-(--bg2) flex flex-col items-center justify-center p-8 font-sans">
        
        <header class="text-center mb-20 space-y-4">
            <h1 class="uppercase text-4xl md:text-5xl font-bold tracking-tight">
                SÉLECTIONNEZ VOTRE <span class="text-[#1ED760]">organisation</span>
            </h1>
        </header>

        <div class="flex flex-wrap justify-center gap-10 md:gap-16 max-w-6xl">

            <OrgBtn
                v-for="org in organizations"
                :key="org.id"
                :org="org"
            />

        </div>

    </div>

</template>
