<template>

    <Teleport to="body">
        
        <Transition name="fade">

            <div v-if="show" class="fixed inset-0 z-1000 flex items-center justify-center p-4">

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

                    <p class="text-(--text) text-sm leading-relaxed mb-6">
                        Êtes-vous sûr de vouloir supprimer <strong>{{ itemName }}</strong> ?
                        Cette action est irréversible et toutes les données associées seront perdues.
                    </p>

                    <div
                        v-if="extraWarning"
                        class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-6"
                    >
                        <i class="bi bi-exclamation-triangle-fill text-amber-500 mt-0.5 shrink-0" />
                        <span class="text-xs text-amber-500 leading-snug">
                            {{ extraWarning }}
                        </span>
                    </div>

                    <label
                        v-if="checkbox"
                        class="flex items-start gap-3 p-3 rounded-lg bg-red-500/5 border border-red-500/10 cursor-pointer group mb-4"
                    >
                        <input 
                            v-model="acknowledge" 
                            type="checkbox" 
                            class="mt-1 accent-red-500 h-4 w-4"
                        />
                        <span class="text-xs text-(--text) leading-snug select-none">
                            Je comprends que cette action supprimera définitivement toutes les données liées à ce contenu.
                        </span>
                    </label>

                    <div 
                        v-if="checktext"
                        class="mb-6" 
                        :class="{ 'opacity-40 pointer-events-none': !acknowledge }"
                    >
                        <label class="text-[11px] text-(--text) mb-2 block lowercase italic">
                            Tapez <span class="text-red-400 font-mono select-all">"{{ itemName }}"</span> pour débloquer :
                        </label>
                        <input 
                            v-model="confirmText"
                            type="text"
                            :disabled="!acknowledge"
                            class="w-full bg-black/20 border border-(--text)/10 rounded-lg px-4 py-2 text-sm text-(--text) focus:border-red-500/50 outline-none transition-all"
                            placeholder="..."
                            @paste.prevent
                        />
                    </div>

                    <div class="flex flex-col sm:flex-row gap-3 sm:justify-end">

                        <button 
                            @click="emit('cancel')"
                            class="default"
                        >
                            Annuler
                        </button>
                        
                        <button 
                            @click="emit('confirm')"
                            :disabled="submitDisabled"
                            class="danger flex items-center justify-center gap-2"
                            :class="submitDisabled || loading ? 'opacity-30 cursor-not-allowed! grayscale active:scale-100!' : ''"
                        >
                            <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                            <span v-else>{{ props.buttonText || "Supprimer définitivement" }}</span>
                        </button>

                    </div>

                </div>
                
            </div>

        </Transition>

    </Teleport>

</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';


const props = defineProps<{
  show: boolean;
  itemName: string;
  buttonText?: string;
  checkbox?: boolean;
  checktext?: boolean;
  itemType?: string; // ex: "le salon", "le workspace"
  loading?: boolean;
  extraWarning?: string; // avertissement complémentaire affiché en encart ambre
}>();

const acknowledge = ref<boolean>(false);
const confirmText = ref<string>('');

// const isFullyConfirmed = computed<boolean>(() => {
//     return acknowledge.value && confirmText.value == props.itemName;
// })
const submitDisabled = computed<boolean>(() => {

    let disabled: boolean = false;

    if (props.checkbox && !acknowledge.value) disabled = true;
    if (props.checktext && confirmText.value !== props.itemName) disabled = true;

    return disabled;

});

const emit = defineEmits(['confirm', 'cancel']);

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('cancel');
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));

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