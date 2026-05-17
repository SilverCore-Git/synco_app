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
        
        <button @click="triggerFileSelect()" class="primary">Sélectionner une photo</button>

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
import { openedOrg, user } from '@/assets/var';

const imageSrc = ref<string | null>(null);
const cropperRef = ref<any>(null);
const loading = ref<boolean>(false);
const fileInput = ref<HTMLInputElement | null>(null);


const triggerFileSelect = () => {
  fileInput.value?.click();
};

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

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        
        try {

            loading.value = true;


            const orgUser = openedOrg.value?.members?.find(member => 
                String(member.user?.id) === String(user.value?.id)
            );


            if (!user.value || !orgUser || !orgUser.user) return;
            user.value.avatarUrl = compressedBase64;
            orgUser.user.avatarUrl = compressedBase64;

            await sfetch('/api/users/me', {
                method: 'PATCH',
                body: JSON.stringify(user.value)
            });

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