<template>
    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>Inspecter un fichier externe</template>

        <div class="space-y-5">
            <p class="text-sm text-(--text)/60">
                Glissez-déposez un fichier ici ou cliquez pour sélectionner un fichier afin de vérifier s'il contient un filigrane Synco invisible.
            </p>

            <div 
                class="w-full h-32 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300"
                :class="[
                    isDragging ? 'border-(--primary) bg-(--primary)/10' : 'border-white/10 bg-(--bg2)/30 hover:border-(--primary)/50',
                    loading ? 'opacity-50 pointer-events-none' : ''
                ]"
                @dragover.prevent="isDragging = true"
                @dragleave.prevent="isDragging = false"
                @drop.prevent="handleDrop"
                @click="triggerFileInput"
            >
                <input 
                    type="file" 
                    ref="fileInput" 
                    class="hidden" 
                    @change="handleFileSelect"
                />
                
                <template v-if="loading">
                    <i class="bi bi-arrow-repeat animate-spin text-3xl text-(--primary) mb-2" />
                    <span class="text-sm font-semibold text-(--primary)">Analyse en cours...</span>
                </template>
                <template v-else>
                    <i class="bi bi-shield-check text-3xl text-(--text)/40 mb-2" />
                    <span class="text-sm font-semibold text-(--text)/60">Déposer un fichier à inspecter</span>
                </template>
            </div>

            <!-- Result Box -->
            <div 
                v-if="result" 
                class="w-full p-4 rounded-xl border flex items-start gap-3 transition-all duration-500 animate-in fade-in slide-in-from-bottom-2"
                :class="result.found ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'"
            >
                <i 
                    class="text-2xl mt-0.5" 
                    :class="result.found ? 'bi bi-check-circle-fill text-green-400' : 'bi bi-x-circle-fill text-red-400'"
                />
                <div>
                    <h4 class="font-bold mb-1" :class="result.found ? 'text-green-400' : 'text-red-400'">
                        {{ result.found ? 'Filigrane Détecté' : 'Aucun Filigrane' }}
                    </h4>
                    <p class="text-sm text-(--text)/80">
                        <template v-if="result.found">
                            Ce fichier contient une signature sécurisée : <br/>
                            <span class="font-mono bg-black/30 px-2 py-1 rounded text-green-300 inline-block mt-2 font-bold">{{ result.text }}</span>
                        </template>
                        <template v-else>
                            Le fichier scanné ne contient aucune signature binaire Synco.
                        </template>
                    </p>
                </div>
            </div>
        </div>

        <template #footer>
            <button 
                @click="closeModal" 
                class="default w-full"
                :disabled="loading"
            >
                Fermer
            </button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import Popup from '@/components/Popup.vue';
import { useToast } from '@/composables/useToast';
import { verifyWatermarkLocal } from '@/assets/utils/watermark';

const props = defineProps<{
    isOpen: boolean
}>();

const emit = defineEmits([ 'close' ]);

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref(false);
const loading = ref(false);
const result = ref<{ found: boolean, text?: string } | null>(null);
const toast = useToast();

const closeModal = () => {
    emit('close');
    setTimeout(() => {
        result.value = null;
        isDragging.value = false;
    }, 300);
};

const triggerFileInput = () => {
    fileInput.value?.click();
};

const handleDrop = (e: DragEvent) => {
    isDragging.value = false;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        verifyFile(e.dataTransfer.files[0]!);
    }
};

const handleFileSelect = (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
        verifyFile(target.files[0]!);
    }
    // Reset input
    if (fileInput.value) fileInput.value.value = '';
};

const verifyFile = async (file: File) => {
    loading.value = true;
    result.value = null;

    try {
        const resultData = await verifyWatermarkLocal(file);
        result.value = resultData;

    } catch (err: any) {
        toast.show("Erreur lors de l'analyse.", "error");
        console.error(err);
    } finally {
        loading.value = false;
    }
};
</script>
