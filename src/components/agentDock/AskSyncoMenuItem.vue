<template>
  <template v-if="aiEnabled">
    <div class="my-1 h-px bg-(--border-color)" role="separator"></div>
    <button
      type="button"
      class="dropdown-item-annimate dropdown-item-style gap-2 w-full"
      :disabled="!online"
      :title="online ? undefined : 'Indisponible hors ligne'"
      @click="ask"
    >
      <i class="bi bi-stars text-(--primary)"></i>
      Demander à Synco AI
      <kbd v-if="!isLittleScreen" class="ml-auto text-[10px] font-semibold text-(--text2) rounded border border-(--border-color) px-1.5 py-0.5">Ctrl J</kbd>
    </button>
  </template>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { aiEnabled, isLittleScreen } from '@/assets/var';
import { askSynco } from '@/composables/useAskSynco';
import type { AgentContext } from '@/services/agentDock/context';

/**
 * « Demander à Synco AI » (C3 §1.2) : entrée séparée du menu contextuel d'un élément. Ouvre le dock sur une
 * nouvelle conversation avec l'élément en contexte. Le contenu n'est joint que si l'appelant l'a déjà en clair
 * (`context.content`) ; sinon c'est la référence seule.
 */
const props = defineProps<{ context: AgentContext }>();

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const sync = () => { online.value = navigator.onLine; };
onMounted(() => { window.addEventListener('online', sync); window.addEventListener('offline', sync); });
onBeforeUnmount(() => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); });

function ask(): void {
  if (online.value) askSynco(props.context);
}
</script>
