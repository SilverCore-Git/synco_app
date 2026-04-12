<template>

    <div class="group relative ">

        <button
            @click="$emit('click')"
            :aria-label="label"
            class="
                relative flex items-center justify-center 
                w-12 h-12 cursor-pointer transition-all duration-300 ease-out
                bg-(--bg2)/50 rounded-xl overflow-hidden border  
            "
            :class="[
                active ? 'border-(--primary)/50' : 'border-(--text)/10',
                redhover ? 'hover:border-red-500/50' : 'hover:border-(--primary)/50'
            ]"
        >

            <div 
                class="
                    absolute inset-0
                    opacity-0 group-hover:opacity-10 
                    transition-opacity
                " 
                :class="redhover ? 'bg-red-500' : 'bg-(--primary)'"
            />

            <img 
                v-if="icon && isHttp" 
                :src="icon" 
                :alt="label"
                class="
                    w-[30px] h-[30px] rounded-md object-cover
                    group-active:scale-50 group-hover:scale-110
                    transition-all duration-300 ease-out 
                "
            />

            <i 
                v-else-if="icon"
                class="
                    bi text-[28px] relative z-10
                    group-active:scale-50 group-hover:scale-110
                    transition-all duration-300 ease-out     
                "
                :class="[
                    active && iconFillOnActive ? icon + '-fill' : icon,
                    active ? 'text-(--primary)' : 'text-(--text)',
                    redhover ? 'group-hover:text-red-500' : 'group-hover:text-(--primary)'
                ]"
            />

        </button>

        <div
            class="
                absolute left-14 top-1/2 -translate-y-1/2
                hidden group-hover:flex z-50 pointer-events-none
            "
        >
            <span
                class="
                    bg-(--bg2) text-(--text) text-xs font-bold
                    px-3 py-1.5 rounded-lg border relative
                    shadow-xl shadow-black/50 whitespace-nowrap
                    animate-silver-load 
                "
                :class="redhover ? 'border-red-500/30' : 'border-(--primary)/30'"
            >
                {{ label }}
            
                <div 
                    class="
                        absolute -left-1 top-1/2 
                        -translate-y-1/2 w-2 h-2 
                        border-l border-b
                        rotate-45 bg-(--bg2) 
                    "
                    :class="redhover ? 'border-red-500/30' : 'border-(--primary)/30'"
                />

            </span>

        </div>

    </div>

</template>

<script lang="ts" setup>

import { computed } from 'vue';

const props = defineProps<{
    icon: string; // bi | http
    label: string;
    active?: boolean;
    iconFillOnActive?: boolean;
    redhover?: boolean;
}>();

defineEmits<{
    (e: 'click'): void;
}>();

const isHttp = computed(() => props.icon.startsWith('http'));

</script>

<style scoped>

button:hover {
  box-shadow: 0 0 15px -3px rgba(30, 215, 96, 0.2);
}


@keyframes silver-bounce {
  0% { transform: scale(0.8); opacity: 0; }
  50% { transform: scale(1.01); opacity: 1; }
  70% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

.animate-silver-load {
  animation: silver-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

</style>