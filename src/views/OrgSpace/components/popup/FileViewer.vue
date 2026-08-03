<template>
  <Window :is-open="isOpen" :hideCloseBtn="true" @close="closeViewer">
    <div class="w-full h-full max-h-[90vh] bg-(--bg) overflow-hidden flex flex-col">
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
                  @click="downloadFile(file.id)"
                  class="p-2 rounded-lg hover:bg-white/5 text-(--text2) hover:text-(--text) active:scale-90 transition-all duration-200 ml-2"
                  title="Télécharger"
                >
                  <i class="bi bi-download text-lg" />
                </button>

                <button 
                  @click="showDeleteConfirm = true"
                  class="p-2 rounded-lg hover:bg-red-500/10 text-(--text2) hover:text-red-500 active:scale-90 transition-all duration-200"
                  title="Supprimer"
                >
                  <i class="bi bi-trash3 text-lg" />
                </button>

                <button 
                  @click="closeViewer"
                  class="p-2 rounded-lg hover:bg-white/5 text-(--text2) hover:text-(--text) active:scale-90 transition-all duration-200 ml-2"
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
                  <p class="text-(--text2)">L'aperçu n'est pas disponible pour ce type de fichier.</p>
                  <button @click="downloadFile(file.id)" class="default mt-4 gap-2">
                    <i class="bi bi-download" />
                    Télécharger le fichier
                  </button>
                </div>
              </template>

            </div>

            <!-- Footer info -->
            <div class="px-6 py-3 bg-(--bg2)/40 border-t border-(--border-color) flex justify-between items-center shrink-0 text-xs text-(--text2) font-semibold uppercase tracking-wider">
              <span>{{ file.mimeType }}</span>
              <span>{{ formatSize(file.size) }}</span>
            </div>

    </div>
  </Window>

  <ConfirmDelete
      :show="showDeleteConfirm" 
      @confirm="confirmDeleteFile" 
      @cancel="showDeleteConfirm = false"
      :itemName="file.originalName"
      itemType="le fichier"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import { kcToken } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import Window from '@/components/windows/Window.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { getWorkspaceKey } from '@/assets/utils/workspaceCrypto';
import { decryptFileLocal } from '@/assets/utils/crypto';

const props = defineProps<{
  file: StoredFile;
  isOpen: boolean;
}>();

const emit = defineEmits(['close', 'updated', 'deleted']);
const toast = useToast();

const isLoading = ref(true);
const isSaving = ref(false);
const hasError = ref(false);
const showDeleteConfirm = ref(false);

const fileContent = ref('');
const originalFileContent = ref('');

const e2eeObjectUrl = ref<string | null>(null);

const fileUrl = computed(() => {
  if (props.file.isE2EE && e2eeObjectUrl.value) {
    return e2eeObjectUrl.value;
  }
  return `${import.meta.env.VITE_API_URL}/api/cdn/download/${props.file.id}?token=Bearer ${kcToken.value}&inline=true`;
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
      if (props.file.isE2EE && props.file.workspaceId && props.file.encryptedFileKey && props.file.iv) {
        const buffer = await res.arrayBuffer();
        const { key: spaceKey } = await getWorkspaceKey(props.file.workspaceId);
        const decryptedBuffer = await decryptFileLocal(buffer, props.file.encryptedFileKey, props.file.iv, spaceKey);
        const text = new TextDecoder().decode(decryptedBuffer);
        fileContent.value = text;
        originalFileContent.value = text;
      } else {
        const text = await res.text();
        fileContent.value = text;
        originalFileContent.value = text;
      }
    } else {
      toast.show('Erreur lors du chargement du fichier texte.', 'error');
    }
  } catch (err) {
    toast.show('Erreur de connexion.', 'error');
  } finally {
    isLoading.value = false;
  }
};

const loadE2EEPreview = async () => {
  if (!props.file.isE2EE || !props.file.workspaceId) return;
  isLoading.value = true;
  try {
    const res = await sfetch(`/api/cdn/download/${props.file.id}`);
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      const { key: spaceKey } = await getWorkspaceKey(props.file.workspaceId);
      const decryptedBuffer = await decryptFileLocal(
        buffer, 
        props.file.encryptedFileKey!, 
        props.file.iv!, 
        spaceKey
      );
      const blob = new Blob([decryptedBuffer], { type: props.file.mimeType });
      e2eeObjectUrl.value = URL.createObjectURL(blob);
    }
  } catch (err) {
    hasError.value = true;
    toast.show('Erreur de déchiffrement de l\'aperçu.', 'error');
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

const confirmDeleteFile = async () => {
  showDeleteConfirm.value = false;
  try {
    const res = await sfetch(`/api/cdn/${props.file.id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.show('Fichier supprimé', 'success');
      emit('deleted', props.file.id);
      emit('close');
    } else {
      const errorData = await res.json();
      toast.show(errorData.error || 'Erreur lors de la suppression', 'error');
    }
  } catch (err) {
    toast.show('Erreur de connexion.', 'error');
  }
};

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    isLoading.value = true;
    hasError.value = false;
    
    if (props.file.isE2EE && !isTextFile.value && (isImage.value || isPdf.value)) {
        loadE2EEPreview();
    } else if (isTextFile.value) {
      fetchTextContent();
    } else if (!isImage.value && !isPdf.value) {
      isLoading.value = false; // no preview
    }
  } else {
    if (e2eeObjectUrl.value) {
        URL.revokeObjectURL(e2eeObjectUrl.value);
        e2eeObjectUrl.value = null;
    }
  }
});

const closeViewer = () => {
  if (isTextFile.value && fileContent.value !== originalFileContent.value) {
    if (confirm("Vous avez des modifications non enregistrées. Êtes-vous sûr de vouloir fermer sans enregistrer ?")) {
      emit('close');
    }
  } else {
    emit('close');
  }
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeViewer();
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveContent();
  }
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
