<template>

  <div class="fixed inset-0 z-100 w-full h-full flex flex-col items-center justify-center bg-(--bg3) p-6 select-none">

    <div class="flex flex-col items-center text-center max-w-md">

      <div class="banned-icon">
        <i class="bi bi-slash-circle" />
      </div>

      <h2 class="text-xl font-bold text-(--text) mt-6">
        Cette organisation a été bannie
      </h2>

      <p class="text-sm text-(--text2) mt-3 leading-relaxed">
        Un administrateur l'a bannie : personne ne peut plus l'ouvrir, y écrire
        ou la modifier, pas même son propriétaire.
      </p>

      <div v-if="reason" class="mt-6 w-full text-left bg-(--bg) border border-(--text)/10 rounded-2xl p-4">
        <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Motif</p>
        <SimpleMarkdown :content="reason" class="text-sm text-(--text) mt-1.5 leading-relaxed break-words" />
      </div>

      <p v-if="formattedDate" class="text-xs text-(--text2) mt-5">
        Bannie le {{ formattedDate }}
      </p>

      <p class="text-xs text-(--text2) mt-6 leading-relaxed">
        Vos autres organisations restent accessibles normalement.
      </p>

      <button @click="goHome" class="default mt-8">
        <i class="bi bi-arrow-left mr-2" />
        <span class="font-bold">Revenir à mes organisations</span>
      </button>

    </div>

  </div>

</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import SimpleMarkdown from '@/components/common/SimpleMarkdown.vue';

const props = defineProps<{
  reason: string | null;
  bannedAt: string | null;
}>();

const router = useRouter();

const formattedDate = computed(() => {
  if (!props.bannedAt) return '';
  const date = new Date(props.bannedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

const goHome = () => {
  router.push('/');
};
</script>

<style scoped>

.banned-icon {
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
}

</style>
