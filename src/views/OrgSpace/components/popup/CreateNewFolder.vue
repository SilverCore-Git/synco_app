<template>

  <div @click="show = true">
    <slot />
  </div>

  <Popup :is-open="show" @close="emit('close')">

    <template #title>Créer un dossier</template>

    <form @submit.prevent="emit('save', form.name)" class="space-y-5">

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
          Nom du dossier
        </label>

        <input 
          v-model="form.name"
          type="text" 
          placeholder="Ex: Marketing, Dev, Général..."
          ref="inputRef"
          class="
            w-full bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
            px-4 py-3 text-(--text) placeholder:text-(--text2) 
            focus:outline-none focus:border-(--primary)/50 focus:ring-1
            focus:ring-(--primary)/20 transition-all
          "
        />

      </div>

    </form>

    <template #footer>

      <button 
        @click="emit('close')" 
        class="default"
      >
        Annuler
      </button>

      <button 
        @click="emit('save', form.name)"
        class="primary"
        :class="[
          !form.name.trim() ? ' grayscale-100 pointer-events-none opacity-50' : ''
        ]"
        :disabled="!form.name.trim()"
      >
        Créer le dossier
      </button>

    </template>

  </Popup>

</template>

<script setup lang="ts">

import { nextTick, reactive, ref, watch} from 'vue';
import Popup from '@/components/Popup.vue';

const inputRef = ref<HTMLInputElement | null>(null);

const props = defineProps<{
  show: boolean
}>();

const emit = defineEmits([
  'close',
  'save'
])

const form = reactive({
  name: ''
});

watch(() => props.show, async (isOpened) => {
  if (isOpened) {
    await nextTick();
    setTimeout(() => {
      inputRef.value?.focus();
    }, 50);
  } else {
    form.name = '';
  }
});

</script>