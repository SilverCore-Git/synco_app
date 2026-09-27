<template>

    <a
        :key="org.id"
        class="group relative flex flex-col w-full h-[180px] bg-(--bg) border border-(--border-color) rounded-2xl overflow-hidden transition-all duration-300 transform cursor-pointer hover:-translate-y-1 hover:border-(--primary)/50 hover:shadow-[0_8px_30px_var(--shadow-elevated)] active:scale-95"
        :href="isCreate ? '#' : `/${org.id}`"
        @click.prevent="isCreate ? null : handleClick()"
    >
        <!-- For Create Button -->
        <div v-if="isCreate" class="absolute inset-0 w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-(--text)/10 hover:border-(--primary)/50 bg-(--text)/5 group-hover:bg-(--primary)/5 transition-colors gap-3">
            <div class="w-12 h-12 rounded-full bg-(--text)/10 flex items-center justify-center text-(--text)/50 group-hover:bg-(--primary) group-hover:text-white transition-all shadow-md">
                <i class="bi bi-plus-lg text-2xl"></i>
            </div>
            <span class="font-bold text-sm text-(--text2) group-hover:text-(--primary) transition-colors">{{ org.name }}</span>
        </div>

        <!-- Normal Card -->
        <div v-else class="w-full h-full flex flex-col">
            <!-- Banner / Logo area -->
            <div class="h-28 w-full relative overflow-hidden bg-gradient-to-br from-(--text)/5 to-transparent flex items-center justify-center border-b border-(--border-color)">
                <div v-if="loader" class="absolute inset-0 animate-pulse bg-(--text)/10"></div>
                <img 
                    v-if="org.logo && org.logo.startsWith('data:') && !loader" 
                    :src="org.logo" 
                    :alt="org.name" 
                    class="absolute w-full h-full object-cover opacity-20 blur-xl group-hover:opacity-40 transition-opacity"
                />
                
                <div class="z-10 w-[72px] h-[72px] rounded-xl overflow-hidden shadow-xl border border-(--text)/10 bg-(--bg) flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <img 
                        v-if="org.logo && org.logo.startsWith('data:')" 
                        :src="org.logo" 
                        :alt="org.name" 
                        class="w-full h-full object-cover"
                        :class="loader ? 'grayscale' : ''"
                    />
                    <span v-else class="text-2xl font-black text-(--primary)">{{ org.name.substring(0, 2).toUpperCase() }}</span>
                </div>
            </div>

            <!-- Footer area -->
            <div class="p-4 flex-1 flex flex-col justify-center items-center">
                <span v-if="!loader" class="text-base font-bold text-(--text) truncate w-full text-center group-hover:text-(--primary) transition-colors">
                    {{ org.name }}
                </span>
                <span v-else class="h-4 w-24 bg-(--text)/10 rounded animate-pulse mx-auto"></span>
            </div>
        </div>
    </a>

</template>

<script lang="ts" setup>

import { useRouter } from 'vue-router';

const props = defineProps<{
    org: any;
    loader?: boolean;
    isCreate?: boolean;
}>();

const router = useRouter();

const handleClick = () => {
    if (props.isCreate) return;

    // On ouvre sur le contenu de l'accueil, pas sur les barres ; la flèche de
    // retour les révèle ensuite (showView=0). `showView=1` est écrit
    // explicitement plutôt que laissé au défaut de OrgLayout — même raison
    // qu'au démarrage à froid dans init.ts : la destination ne dépend alors
    // plus de la valeur par défaut choisie ailleurs.
    router.push(`/${props.org.id}?showView=1`);
};

</script>