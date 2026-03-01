<template>
    
    <Transition name="fade">

        <div v-if="show" class="fixed inset-0 z-100 flex items-center justify-center p-4">

            <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="emit('cancel')" />

            <div 
                class="relative w-full max-w-md transform rounded-2xl bg-(--bg2) p-6 shadow-2xl border border-(--text)/10 transition-all scale-animation"
            >

                <div class="flex items-center gap-4 text-red-500 mb-4">
                    <div class="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
                        <i class="bi bi-exclamation-triangle text-2xl" />
                    </div>
                    <h3 class="text-xl font-bold text-(--text)">Supprimer {{ itemType }} ?</h3>
                </div>

                <p class="text-(--text)/70 text-sm leading-relaxed mb-6">
                    Êtes-vous sûr de vouloir supprimer <strong>{{ itemName }}</strong> ? 
                    Cette action est irréversible et toutes les données associées seront perdues.
                </p>

                <div class="flex flex-col sm:flex-row gap-3 sm:justify-end">

                    <button 
                        @click="emit('cancel')"
                        class="default"
                    >
                        Annuler
                    </button>
                    
                    <button 
                        @click="emit('confirm')"
                        :disabled="loading"
                        class="danger"
                    >
                        <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Supprimer définitivement
                    </button>

                </div>

            </div>
            
        </div>

    </Transition>

</template>

<script setup lang="ts">

defineProps<{
  show: boolean;
  itemName: string;
  itemType?: string; // ex: "le salon", "le workspace"
  loading?: boolean;
}>();

const emit = defineEmits(['confirm', 'cancel']);

</script>

<style scoped>

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.scale-animation {
  animation: modalScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalScale {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

</style>