<template>

    <popup :isOpen="show" @close="emit('close')" class="profile-uploader">

        <template #title>
            Changer l'avatar
        </template>

        <input 
            type="file" 
            ref="fileInput" 
            accept="image/*" 
            @change="onFileChange" 
            style="display: none"
        />
        
        <button @click="$refs.fileInput.click()" class="primary">Sélectionner une photo</button>

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
            
            <button @click="cropAndUpload" :disabled="loading" class="primary">
                {{ loading ? 'Envoi...' : 'Valider le recadrage' }}
            </button>

        </div>

    </popup>

</template>

<script lang="ts" setup>

import { ref } from 'vue';
import { Cropper, CircleStencil } from 'vue-advanced-cropper';
import 'vue-advanced-cropper/dist/style.css';
import Popup from '../Popup.vue';
import sfetch from '@/assets/utils/sfetch';

const imageSrc = ref<string | null>(null);
const cropperRef = ref<any>(null);
const loading = ref<boolean>(false);

defineProps<{
    show: boolean;
}>();

const emit = defineEmits([
    'close'
])

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
        
        canvas.toBlob(async (blob: Blob) => {

            try {

                loading.value = true;

                const formData = new FormData();

                formData.append('file', blob, `${localStorage.getItem('userId')}.jpg`);

                await sfetch(`/api/cdn/upload/avatar`, {
                    method: "POST",
                    body: formData
                })

                if (imageSrc.value) 
                {
                    URL.revokeObjectURL(imageSrc.value);
                    imageSrc.value = null;
                }
                
                loading.value = false;
                emit('close');

            } 
            catch (err) 
            {
                console.error("Erreur upload", err);
            } 
            finally 
            {
                loading.value = false;
            }

        }, 'image/jpeg');

    }

};

</script>

<style scoped>

.cropper-wrapper {
  max-width: 500px;
  margin-top: 20px;
}

.cropper {
  height: 400px;
  background: #222;
}

</style>