<template>

  <div @click.stop="isOpen = true; $emit('opened')">
    <slot />
  </div>

  <Popup :is-open="isOpen" @close="closeModal">

    <template #title>Créer une catégorie</template>

    <form @submit.prevent="handleSubmit" class="space-y-5">

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
          Nom de la catégorie
        </label>

        <input 
          v-model="form.name"
          type="text" 
          placeholder="Ex: Marketing, Dev, Général..."
          ref="nameInput"
          class="
            w-full bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
            px-4 py-3 text-(--text) placeholder:text-(--text2) 
            focus:outline-none focus:border-(--primary)/50 focus:ring-1
            focus:ring-(--primary)/20 transition-all
          "
          :disabled="loading"
        />

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
          !form.name.trim() ? ' grayscale-100 pointer-events-none opacity-50' : ''
        ]"
        :disabled="loading || !form.name.trim()"
      >
        {{ loading ? 'Création...' : 'Créer la catégorie' }}
      </button>

    </template>

  </Popup>

</template>

<script setup lang="ts">

import { ref, reactive, nextTick, watch, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import { useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import type { Category } from '@/types/types';
import { useToast } from '@/composables/useToast';

const route = useRoute();
const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const nameInput = ref<HTMLInputElement | null>(null);
const toast = useToast();
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');

const props = defineProps<{
  index: number;
}>();

const form = reactive({
  name: ''
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

  if (!form.name.trim()) return;

  loading.value = true;

  try {

    const spaceId = route.params.spaceId as string;
    
    const res = await sfetch(`/api/categories/${isHome.value ? 'org' : 'space'}/${isHome.value ? route.params.orgId : spaceId}`, {
      method: 'POST',
      body: JSON.stringify({
        ...form,
        index: props.index
      })
    }).then(res => res.json());

    if (res.error)
    {
      toast.show('Une erreur est survenue lors de la création de la catégorie.', 'error');
      console.error('Error on category creation : ', res.error);
    }
    else
    {

      if (isHome.value)
      {
        const category: Category = res;
        openedOrg.value?.home?.categories?.push(category);
      }
      else
      {
        const category: Category = res;
        const space = openedOrg.value?.spaces?.find(s => s.id === route.params.spaceId);
        space?.categories?.push(category);
      }

      toast.show('Catégorie créé avec succès.', 'success');

    }

    closeModal();

  } 
  catch (err: any) {
    toast.show('Une erreur est survenue lors de la création de la catégorie.', 'error');
    console.error('Error on category creation : ', err);
  } 
  finally {
    loading.value = false;
  }

};

</script>