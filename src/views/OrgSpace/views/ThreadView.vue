<template>

    <div class="flex flex-col h-full bg-(--bg) relative overflow-hidden">
        
        <header 
            v-if="thread" 
            class="
                h-14 flex items-center px-4
                border-b border-white/5 
                bg-(--bg)/80 backdrop-blur-md z-10
            "
        >

            <div class="flex items-center gap-2">
                <i v-if="thread.type === 'text'" class="bi bi-hash text-2xl text-(--text)/40" />
                <i v-else class="bi bi-volume-up-fill text-xl text-(--text)/40" />
                <h2 class="font-bold text-(--text) tracking-wide lowercase">
                    {{ thread.name }}
                </h2>
            </div>
            
            <div class="ml-auto flex items-center gap-4 text-(--text)/40">
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-bell-fill" />
                </button>
                <button class="hover:text-(--text) transition-colors">
                    <i class="bi bi-people-fill" />
                </button>
            </div>

        </header>

        <main class="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div v-if="thread" class="flex flex-col justify-end min-h-full">
                
                <div class="mb-8">
                <div class="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                    <i class="bi bi-hash text-4xl text-(--text)/60"></i>
                </div>
                <h1 class="text-3xl font-black text-white mb-2">Bienvenue dans #{{ thread.name }} !</h1>
                <p class="text-(--text)/50">C'est le début de l'histoire de ce salon.</p>
                </div>

                <div class="space-y-4">
                </div>
            </div>

            <div v-else class="h-full flex flex-col items-center justify-center gap-4">
                <div class="text-6xl opacity-20">🛡️</div>
                <p class="text-(--text)/40 italic font-medium">Thread introuvable ou accès refusé.</p>
            </div>
        </main>

        <footer v-if="thread" class="p-4 bg-transparent">
            <div class="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-4 py-3 focus-within:border-(--primary)/50 transition-all shadow-2xl">
                <button class="mr-3 text-(--text)/40 hover:text-(--primary) transition-colors">
                <i class="bi bi-plus-circle-fill text-xl"></i>
                </button>
                
                <input 
                type="text" 
                :placeholder="'Envoyer un message dans #' + thread.name"
                class="bg-transparent border-none outline-none flex-1 text-sm text-(--text) placeholder:text-(--text)/20"
                />

                <div class="flex gap-3 ml-3 text-(--text)/40">
                <button class="hover:text-yellow-500 transition-colors"><i class="bi bi-emoji-smile-fill"></i></button>
                <button class="hover:text-(--primary) transition-colors"><i class="bi bi-send-fill"></i></button>
                </div>
            </div>
        </footer>

    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import organizations, { workSpaces } from '@/organizations';
import type { Thread, WorkSpace } from '@/types/workSpace';
import type { Org } from '@/types/org';

const route = useRoute();

const thread = computed(() => {

    let allThreads: Thread[] = [];

    const space = workSpaces.find((s: WorkSpace) => s.id === route.params.spaceId);
    if (space) 
    {
        allThreads = [...allThreads, ...space.threads];
    }

    const org = organizations.find((o: Org) => o.id === route.params.orgId);
    if (org && org.home) 
    {
        allThreads = [...allThreads, ...org.home.threads];
    }

    return allThreads.find((t: Thread) => t.id === route.params.threadId);

});

</script>