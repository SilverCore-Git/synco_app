<template>
  <div class="my-2 max-w-md w-full border border-(--border-color) bg-(--bg2) rounded-xl overflow-hidden shadow-sm hover:border-white/20 hover:bg-white/5 transition-all">
    <a 
      v-if="!loading && previewData" 
      :href="previewData.url" 
      target="_blank" 
      rel="noopener noreferrer"
      class="p-3 flex items-start gap-3"
    >
      <div class="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center shrink-0 border border-(--border-color)">
        <span v-if="previewData.iconType === 'emoji'" class="text-xl">{{ previewData.icon }}</span>
        <img v-else-if="previewData.icon" :src="previewData.icon" alt="Icon" class="w-6 h-6 object-contain" />
        <img v-else src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" class="w-6 h-6 object-contain" />
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-center h-10">
        <h4 class="font-bold text-(--text) text-sm truncate leading-tight">{{ previewData.title }}</h4>
        <p class="text-[11px] text-(--text2) truncate mt-0.5">Notion Page • {{ formattedDate }}</p>
      </div>
    </a>
    
    <div v-else-if="loading" class="p-3 flex items-center gap-3">
      <div class="w-10 h-10 bg-white/5 rounded-lg flex items-center justify-center animate-pulse shrink-0"></div>
      <div class="flex-1 space-y-2">
        <div class="h-3 bg-white/5 rounded w-3/4 animate-pulse"></div>
        <div class="h-2 bg-white/5 rounded w-1/2 animate-pulse"></div>
      </div>
    </div>

    <div v-else class="p-3 flex items-center gap-3">
      <div class="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0 border border-red-500/20 text-red-500">
        <i class="bi bi-exclamation-triangle"></i>
      </div>
      <div class="flex-1 min-w-0 flex flex-col justify-center h-10">
        <h4 class="font-bold text-(--text) text-sm truncate leading-tight">Lien Notion</h4>
        <p class="text-[11px] text-red-400 truncate mt-0.5">Impossible de charger l'aperçu (Jeton invalide ou page introuvable)</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';

const props = defineProps<{
  url: string;
}>();

const loading = ref(true);
const previewData = ref<any>(null);
const error = ref(false);

const formattedDate = computed(() => {
  if (!previewData.value?.lastEdited) return 'Récemment';
  const date = new Date(previewData.value.lastEdited);
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
});

const loadPreview = async () => {
  loading.value = true;
  error.value = false;
  try {
    const encodedUrl = encodeURIComponent(props.url);
    const response = await sfetch(`/api/integrations/notion/preview?url=${encodedUrl}`);
    if (response.ok) {
      previewData.value = await response.json();
    } else {
      error.value = true;
    }
  } catch (e) {
    console.error(e);
    error.value = true;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  loadPreview();
});
</script>
