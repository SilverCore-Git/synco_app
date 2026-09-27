<template>

  <Popup :is-open="show" @close="emit('close')">

    <template #title>Créer un fichier</template>

    <form @submit.prevent="submit" class="space-y-5">

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
          Nom du fichier
        </label>

        <div class="flex items-stretch gap-2">

          <input 
            v-model="form.name"
            type="text" 
            placeholder="Ex: compte-rendu, notes, budget..."
            ref="inputRef"
            class="
              flex-1 min-w-0 bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
              px-4 py-3 text-(--text) placeholder:text-(--text2) 
              focus:outline-none focus:border-(--primary)/50 focus:ring-1
              focus:ring-(--primary)/20 transition-all
            "
          />

          <select
            v-model="form.ext"
            class="
              shrink-0 bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
              px-3 py-3 text-(--text) max-w-40
              focus:outline-none focus:border-(--primary)/50 focus:ring-1
              focus:ring-(--primary)/20 transition-all
            "
          >
            <optgroup v-for="group in TEXT_FILE_GROUPS" :key="group.group" :label="group.group">
              <option v-for="format in group.formats" :key="format.ext" :value="format.ext">
                .{{ format.ext }} — {{ format.label }}
              </option>
            </optgroup>
          </select>

        </div>

        <p class="text-[11px] text-(--text2)">
          <i class="bi bi-info-circle mr-1" />
          Fichiers texte UTF-8 uniquement, modifiables ensuite dans l'aperçu.
          Sera créé sous le nom <span class="font-mono text-(--text)">{{ previewName }}</span>.
        </p>

      </div>

      <div class="flex gap-2 flex-col">

        <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
          Contenu initial <span class="normal-case font-medium">(optionnel)</span>
        </label>

        <textarea
          v-model="form.content"
          rows="7"
          spellcheck="false"
          placeholder="Laisser vide pour créer un fichier vierge..."
          class="
            w-full bg-(--bg2)/30 border border-(--text)/10 rounded-xl 
            px-4 py-3 text-sm font-mono text-(--text) placeholder:text-(--text2) 
            focus:outline-none focus:border-(--primary)/50 focus:ring-1
            focus:ring-(--primary)/20 transition-all resize-y
          "
        ></textarea>

      </div>

    </form>

    <template #footer>

      <button @click="emit('close')" class="default">
        Annuler
      </button>

      <button 
        @click="submit"
        class="primary"
        :class="[ !canSubmit ? 'grayscale-100 pointer-events-none opacity-50' : '' ]"
        :disabled="!canSubmit"
      >
        Créer le fichier
      </button>

    </template>

  </Popup>

</template>

<script setup lang="ts">

import { computed, nextTick, reactive, ref, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { TEXT_FILE_GROUPS, buildFileName } from '@/assets/utils/textFileFormats';

const inputRef = ref<HTMLInputElement | null>(null);

const props = defineProps<{
  show: boolean
}>();

const emit = defineEmits(['close', 'save']);

const form = reactive({
  name: '',
  ext: 'txt',
  content: ''
});

const canSubmit = computed<boolean>(() => form.name.trim().length > 0);

const previewName = computed<string>(() => buildFileName(form.name.trim() || 'sans-nom', form.ext));

const submit = () => {
  if (!canSubmit.value) return;
  emit('save', { name: form.name.trim(), ext: form.ext, content: form.content });
};

watch(() => props.show, async (isOpened) => {
  if (isOpened) {
    await nextTick();
    setTimeout(() => inputRef.value?.focus(), 50);
  } else {
    form.name = '';
    form.ext = 'txt';
    form.content = '';
  }
});

</script>
