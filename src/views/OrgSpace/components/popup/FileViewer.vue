<template>
  <Teleport to="body">
    <Transition name="fade">
      <div 
        v-if="isOpen" 
        class="fixed inset-0 z-[2000] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <Transition name="pop" appear>
          <div 
            v-if="isOpen"
            class="w-full max-w-6xl h-full max-h-[90vh] bg-(--bg) border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          >
            <!-- Header -->
            <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center justify-between shrink-0">
              <div class="flex items-center gap-3 min-w-0">
                <i :class="[getFileInfo(file).icon, getFileInfo(file).color]" class="text-xl" />
                <h3 class="text-lg font-semibold text-(--text) truncate" :title="file.originalName">
                  {{ file.originalName }}
                </h3>
              </div>

              <div class="flex items-center gap-2">
                <button 
                  v-if="isTextFile && fileContent !== originalFileContent"
                  @click="saveContent"
                  class="primary !px-4 !py-2 text-sm gap-2"
                  :class="{ 'loader': isSaving }"
                  :disabled="isSaving"
                >
                  <i class="bi bi-floppy" />
                  Enregistrer
                </button>
                <button 
                  @click="emit('close')"
                  class="p-2 rounded-lg hover:bg-white/5 text-(--text)/40 hover:text-(--text) active:scale-90 transition-all duration-200 ml-2"
                >
                  <i class="bi bi-x-lg text-xl" />
                </button>
              </div>
            </div>

            <!-- Content -->
            <div class="flex-1 overflow-hidden flex items-center justify-center bg-(--bg2)/20 relative">
              
              <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-(--bg)/50 z-10">
                <div class="w-8 h-8 rounded-full border-2 border-(--primary) border-t-transparent animate-spin"></div>
              </div>

              <template v-if="isImage">
                <img :src="fileUrl" class="max-w-full max-h-full object-contain p-4" @load="isLoading = false" @error="handleError" />
              </template>

              <template v-else-if="isPdf">
                <iframe :src="fileUrl" class="w-full h-full border-none bg-white" @load="isLoading = false" @error="handleError"></iframe>
              </template>

              <template v-else-if="isTextFile">
                <textarea 
                  v-model="fileContent"
                  class="w-full h-full resize-none bg-transparent text-(--text) p-6 font-mono text-sm focus:outline-none focus:ring-0 leading-relaxed"
                  placeholder="Contenu du fichier..."
                  :disabled="isSaving"
                  spellcheck="false"
                ></textarea>
              </template>

              <template v-else>
                <div class="flex flex-col items-center gap-4 p-8 text-center">
                  <i class="bi bi-file-earmark-x text-6xl text-(--text)/20" />
                  <p class="text-(--text)/60">L'aperçu n'est pas disponible pour ce type de fichier.</p>
                  <button @click="downloadFile(file.id)" class="default mt-4 gap-2">
                    <i class="bi bi-download" />
                    Télécharger le fichier
                  </button>
                </div>
              </template>

            </div>

            <!-- Footer info -->
            <div class="px-6 py-3 bg-(--bg2)/40 border-t border-(--border-color) flex justify-between items-center shrink-0 text-xs text-(--text)/40 font-semibold uppercase tracking-wider">
              <span>{{ file.mimeType }}</span>
              <span>{{ formatSize(file.size) }}</span>
            </div>

          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import { keycloak } from '@/keycloak';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';

const props = defineProps<{
  file: StoredFile;
  isOpen: boolean;
}>();

const emit = defineEmits(['close', 'updated']);
const toast = useToast();

const isLoading = ref(true);
const isSaving = ref(false);
const hasError = ref(false);

const fileContent = ref('');
const originalFileContent = ref('');

const fileUrl = computed(() => {
  return `${import.meta.env.VITE_API_URL}/cdn/download/${props.file.id}?token=Bearer ${keycloak.token}&inline=true`;
});

const isImage = computed(() => props.file.mimeType.startsWith('image/'));
const isPdf = computed(() => props.file.mimeType === 'application/pdf');
const isTextFile = computed(() => {
  const mime = props.file.mimeType;
  return mime.startsWith('text/') || 
         mime === 'application/json' || 
         mime === 'application/xml' || 
         mime === 'application/javascript' ||
         mime === 'application/x-sh' ||
         mime.includes('sql');
});

const formatSize = (bytes: number | bigint) => {
    if (bytes === 0 || bytes === 0n) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes;
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const handleError = () => {
  isLoading.value = false;
  hasError.value = true;
};

const fetchTextContent = async () => {
  if (!isTextFile.value) return;
  isLoading.value = true;
  try {
    const res = await sfetch(`/api/cdn/download/${props.file.id}`);
    if (res.ok) {
      const text = await res.text();
      fileContent.value = text;
      originalFileContent.value = text;
    } else {
      toast.show('Erreur lors du chargement du fichier texte.', 'error');
    }
  } catch (err) {
    toast.show('Erreur de connexion.', 'error');
  } finally {
    isLoading.value = false;
  }
};

const saveContent = async () => {
  if (fileContent.value === originalFileContent.value) return;
  
  isSaving.value = true;
  try {
    const res = await sfetch(`/api/cdn/content/${props.file.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: fileContent.value
    });
    
    if (res.ok) {
      const updatedMetadata = await res.json();
      originalFileContent.value = fileContent.value;
      toast.show('Fichier enregistré avec succès', 'success');
      emit('updated', updatedMetadata);
    } else {
      const errorData = await res.json();
      toast.show(errorData.error || 'Erreur lors de la sauvegarde.', 'error');
    }
  } catch (err) {
    toast.show('Erreur de connexion.', 'error');
  } finally {
    isSaving.value = false;
  }
};

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    isLoading.value = true;
    hasError.value = false;
    if (isTextFile.value) {
      fetchTextContent();
    } else if (!isImage.value && !isPdf.value) {
      isLoading.value = false; // no preview
    }
  }
});

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') emit('close');
};

onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));
</script>
