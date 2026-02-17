<template>

    <a
        :key="org.id"
        class="group relative flex flex-col items-center cursor-pointer"
        :href="`/org/${org.id}`"
        @click.prevent="handleClick"
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
                    object-cover grayscale-50
                    group-hover:grayscale-0 transition-all
                "
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

import type { Org } from '@/types/org';
import { useRouter } from 'vue-router';

const props = defineProps<{
    org: Org;
}>();

const router = useRouter();

const handleClick = () => {
    router.push('/org/' + props.org.id)
};

</script>