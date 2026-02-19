<template>

  <div @click="isOpen = true">
    <slot />
  </div>

  <STPopup :is-open="isOpen" @close="closeModal">

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

      <div v-if="error" class="text-red-400 text-sm flex items-center gap-2">
        <i class="bi bi-exclamation-triangle" />
        {{ error }}
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

  </STPopup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch } from 'vue';
import STPopup from '@/components/popup.vue';
import { useRoute } from 'vue-router';
import IconSelector from '../common/IconSelector.vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { WorkSpace } from '@/types/types';

const route = useRoute();
const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);
const nameInput = ref<HTMLInputElement | null>(null);

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
  error.value = null;
};

const handleSubmit = async () => {

  if (!form.name.trim() || form.logo == '') return;

  loading.value = true;
  error.value = null;

  try {

    const orgId = route.params.orgId as string;
    
    const res = await sfetch(`/api/spaces/org/${orgId}`, {
      method: 'POST',
      body: JSON.stringify(form)
    }).then(res => res.json());

    if (res.error)
    {
      alert(res.error);
      return;
    }

    const space: WorkSpace = res;
    openedOrg.value?.spaces?.push(space);

    closeModal();

  } 
  catch (err: any) {
    error.value = err.response?.data?.error || "Une erreur est survenue lors de la création.";
  } 
  finally {
    loading.value = false;
  }

};

</script>