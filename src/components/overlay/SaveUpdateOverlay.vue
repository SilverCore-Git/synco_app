<template>

    <Transition name="fade-bottom">

        <div 
            v-if="show" 
            class="
                fixed bottom-14 left-1/2 -translate-x-1/2 w-[min(90%,580px)] z-50
                bg-zinc-900/80 backdrop-blur-md border border-(--text)/10 
                p-2 pl-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] 
                flex items-center justify-between
            "
        >
            
            <div class="flex items-center gap-3">
                <div class="relative flex h-2 w-2">
                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-(--primary) opacity-75" />
                    <span class="relative inline-flex rounded-full h-2 w-2 bg-(--primary)" />
                </div>
                <span class="text-sm font-medium text-(--text)/90 tracking-tight">
                    Modifications non enregistrées
                </span>
            </div>

            <div class="flex items-center gap-2">
                
                <button 
                    @click="emit('close')" 
                    class="default"
                >
                    Réinitialiser
                </button>
                
                <button 
                    @click="emit('save')" 
                    class="primary"
                >
                    Enregistrer
                </button>

            </div>

        </div>

    </Transition>

</template>

<script setup lang="ts">

defineProps<{ show: boolean }>();
const emit = defineEmits(['close', 'save']);

</script>