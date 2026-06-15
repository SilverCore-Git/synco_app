<template>

  <div class="relative p-2 bg-(--bg2) rounded-2xl z-110 w-100 h-100 flex flex-col gap-2 border border-white/5" v-if="!loading">

        <input 
            type="file" 
            ref="fileInput" 
            accept="image/*" 
            @change="onFileChange" 
            style="display: none"
        />
        
        <button @click.stop="triggerFileSelect()" type="button" class="primary">Sélectionner une photo</button>

        <div v-if="imageSrc" class="cropper-wrapper">

            <cropper
                ref="cropperRef"
                class="cropper"
                :src="imageSrc"
                :stencil-component="CircleStencil"
                :stencil-props="{
                    aspectRatio: 1
                }"
            />
            
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

const props = defineProps<{
  modelValue: string
}>();

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

</script>
