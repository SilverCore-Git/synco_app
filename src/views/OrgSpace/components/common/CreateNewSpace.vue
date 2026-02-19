<template>

  <div @click="isOpen = true">
    <slot />
  </div>

  <Popup :is-open="isOpen" @close="closeModal">

    <template #title>Créer un Espace de travail</template>

    <form @submit.prevent="handleSubmit" class="space-y-5">

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
          Nom de l'espace
        </label>

        <input 
          v-model="form.name"
          type="text" 
          placeholder="Ex: Marketing, Dev, Général..."
          ref="nameInput"
          class="
            w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
            px-4 py-3 text-(--text) placeholder:text-(--text)/20 
            focus:outline-none focus:border-(--primary)/50 focus:ring-1
            focus:ring-(--primary)/20 transition-all
          "
          :disabled="loading"
        />

      </div>

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
          Icon de l'espace
        </label>

        <IconSelector v-model="form.logo" />

      </div>

    </form>

    <template #footer>

      <button 
        @click="closeModal" 
        class="default"
        :disabled="loading"
      >
        Annuler
      </button>

      <button 
        @click="handleSubmit"
        class="primary"
        :class="[
          loading ? 'loader' : '',
          !form.name.trim() || form.logo == '' ? ' grayscale-100 pointer-events-none opacity-50' : ''
        ]"
        :disabled="loading || !form.name.trim() || form.logo == ''"
      >
        {{ loading ? 'Création...' : 'Créer l\'espace' }}
      </button>

    </template>

  </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { useRoute, useRouter } from 'vue-router';
import IconSelector from '@/components/common/IconSelector.vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { WorkSpace } from '@/types/types';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const router = useRouter();
const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
  name: '',
  logo: ''
});

watch(isOpen, async (val) => {
  if (val) {
    await nextTick();
    nameInput.value?.focus();
  }
});

const closeModal = () => {
  isOpen.value = false;
  form.name = '';
};

const handleSubmit = async () => {

  if (!form.name.trim() || form.logo == '') return;

  loading.value = true;

  try {

    const orgId = route.params.orgId as string;
    
    const res = await sfetch(`/api/spaces/org/${orgId}`, {
      method: 'POST',
      body: JSON.stringify(form)
    }).then(res => res.json());

    if (res.error)
    {
      toast.show('Une erreur est survenue lors de la création.', 'error');
      console.error('Error on space creation : ', res.error);
    }
    else
    {
      const space: WorkSpace = res;
      openedOrg.value?.spaces?.push(space);
      toast.show('Espace de travail créé avec succès.', 'success');
      router.push({ name: 'SpaceView', params: { orgId: route.params.orgId, spaceId: res.id } });
    }

    closeModal();

  } 
  catch (err: any) {
    toast.show('Une erreur est survenue lors de la création.', 'error');
    console.error('Error on space creation : ', err);
  } 
  finally {
    loading.value = false;
  }

};

</script>