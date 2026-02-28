<template>

    <a
        :key="org.id"
        class="group relative flex flex-col items-center cursor-pointer"
        :href="`/${org.id}`"
        @click.prevent="handleClick"
    >

        <div 
            class="
                relative w-40 h-40 md:w-60 md:h-60
                overflow-hidden border-4 border-transparent 
                transition-all duration-300 transform bg-(--bg)
                rounded-4xl group-active:scale-90 shadow-2xl
                flex items-center justify-center border-white/5
                group-hover:scale-105 group-hover:border-(--primary) 
            "
        >

            <img 
                v-if="org.logo && org.logo.startsWith('http')" 
                :src="org.logo" 
                :alt="org.name" 
                class="
                    w-full h-full 
                    object-cover grayscale-50
                    group-hover:grayscale-0 transition-all
                "
            />

            <i
                v-else-if="org.logo"
                class="
                    group-hover:opacity-100 transition-all
                    bi text-9xl object-cover opacity-50
                "
                :class="org.logo"
            />

            <div v-else class="w-full h-full bg-(--bg) flex items-center justify-center">
                <span class="text-4xl font-black text-(--primary)">{{ org.name.substring(0, 2).toUpperCase() }}</span>
            </div>

        </div>

        <span class="mt-5 text-xl font-medium text-(--text)/60 group-hover:text-(--text) transition-colors">
            {{ org.name }}
        </span>

    </a>

</template>

<script lang="ts" setup>

import type { Org, OrgLittle } from '@/types/types';
import { useRouter } from 'vue-router';

const props = defineProps<{
    org: Org | OrgLittle;
}>();

const router = useRouter();

const handleClick = () => {
    router.push(`/${props.org.id}`)
};

</script>