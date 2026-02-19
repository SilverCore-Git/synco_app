<script setup lang="ts">

import { organizations } from '@/assets/var';
import OrgBtn from './components/OrgBtn.vue';


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
