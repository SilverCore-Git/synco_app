<template>

  <div class="relative p-2 bg-(--bg2) rounded-2xl z-110 w-full flex flex-col gap-2 border border-white/5" v-if="!loading">

        <input 
            type="file" 
            ref="fileInput" 
            accept="image/*" 
            @change="onFileChange" 
            style="display: none"
        />
        
        <button @click.stop="triggerFileSelect()" type="button" class="primary">Sélectionner une photo</button>

        <div v-if="imageSrc" class="flex flex-col gap-3 mt-2">
            <div class="h-[200px] sm:h-[250px] w-full overflow-hidden rounded-xl relative bg-black/20 flex items-center justify-center">
                <cropper
                    ref="cropperRef"
                    class="w-full h-full"
                    :src="imageSrc"
                    :stencil-component="type === 'square' ? undefined : CircleStencil"
                    :stencil-props="{
                        aspectRatio: 1
                    }"
                    image-restriction="stencil"
                />
            </div>
            
            <button @click.stop="cropAndUpload" :disabled="loading" type="button" class="primary">
                {{ loading ? 'Envoi...' : 'Valider le recadrage' }}
            </button>

        </div>

  </div>

</template>

<script setup lang="ts">

import { Cropper, CircleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import { ref } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  type?: 'circle' | 'square';
}>(), {
  type: 'circle'
});

const emit = defineEmits(['update:modelValue', 'onBase64']);

const imageSrc = ref<string | null>(null);
const cropperRef = ref<any>(null);
const loading = ref<boolean>(false);
const fileInput = ref<HTMLInputElement | null>(null);

const triggerFileSelect = () => {
  fileInput.value?.click();
};

const onFileChange = (event: any) => {
    const file = event.target.files[0];
    if (file) 
    {
        imageSrc.value = URL.createObjectURL(file);
    }
};


const cropAndUpload = async () => {

    const { canvas } = cropperRef.value.getResult();

    if (canvas) 
    {

        loading.value = true;

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        emit('onBase64', compressedBase64);

    }

};

const triggerEnter = () => {
    if (!imageSrc.value) {
        triggerFileSelect();
    } else if (!loading.value) {
        cropAndUpload();
    }
};

defineExpose({ triggerEnter });

</script>
