<template>
  <Window :is-open="isOpen" :hideCloseBtn="true" :z-index="2500" @close="closeViewer">
    <div class="w-full h-full bg-(--bg) overflow-hidden flex flex-col">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-3 min-w-0">
                <i :class="[getFileInfo(file).icon, getFileInfo(file).color]" class="text-xl" />
                <h3 class="text-lg font-semibold text-(--text) truncate" :title="file.originalName">
                  {{ file.originalName }}
                </h3>
              </div>

              <div class="flex items-center gap-2">
                <div v-if="isMarkdown" class="flex items-center rounded-lg bg-(--bg2)/50 p-0.5 mr-1">
                  <button
                    @click="viewMode = 'preview'"
                    class="px-3 py-1.5 text-sm rounded-md transition-colors"
                    :class="viewMode === 'preview' ? 'bg-(--primary) text-white' : 'text-(--text2) hover:text-(--text)'"
                  >
                    Aperçu
                  </button>
                  <button
                    @click="viewMode = 'edit'"
                    class="px-3 py-1.5 text-sm rounded-md transition-colors"
                    :class="viewMode === 'edit' ? 'bg-(--primary) text-white' : 'text-(--text2) hover:text-(--text)'"
                  >
                    Édition
                  </button>
                </div>
                <button
                  v-if="(isTextFile || isMarkdown) && fileContent !== originalFileContent"
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
                  class="p-2 rounded-lg hover:bg-(--text)/5 text-(--text2) hover:text-(--text) active:scale-90 transition-all duration-200 ml-2"
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
                  class="p-2 rounded-lg hover:bg-(--text)/5 text-(--text2) hover:text-(--text) active:scale-90 transition-all duration-200 ml-2"
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

              <template v-else-if="isMarkdown && viewMode === 'preview'">
                <MarkdownDocumentPreview :content="fileContent" />
              </template>

              <template v-else-if="isTextFile || isMarkdown">
                <VueMonacoEditor
                  v-model:value="fileContent"
                  :language="getMonacoLanguage(file.mimeType, file.originalName)"
                  theme="vs-dark"
                  :options="{
                    automaticLayout: true,
                    readOnly: isSaving,
                    minimap: { enabled: false },
                    wordWrap: 'on',
                    fontSize: 14,
                    padding: { top: 16, bottom: 16 }
                  }"
                  class="w-full h-full text-left"
                />
              </template>

              <template v-else>
                <div class="flex flex-col items-center gap-4 p-8 text-center">
                  <i class="bi bi-file-earmark-x text-6xl text-(--text2)" />
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

  <Popup :isOpen="showUnsavedConfirm" :z-index="2600" @close="showUnsavedConfirm = false">
    <template #title>Modifications non enregistrées</template>
    <p class="text-(--text) text-sm">
      Vous avez des modifications non enregistrées sur <strong>{{ file.originalName }}</strong>.
      Si vous fermez maintenant, elles seront perdues.
    </p>
    <template #footer>
      <button @click="showUnsavedConfirm = false" class="default">Annuler</button>
      <button @click="confirmCloseWithoutSaving" class="danger">Fermer sans enregistrer</button>
    </template>
  </Popup>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile, fetchDecryptedFile, fileErrorMessage, type FileMetadata } from '@/assets/utils/downloadFile';
import { replaceFileContent } from '@/assets/uploadFile';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import Window from '@/components/windows/Window.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import Popup from '@/components/Popup.vue';
import MarkdownDocumentPreview from './MarkdownDocumentPreview.vue';
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor';

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

(self as any).MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') {
      return new jsonWorker();
    }
    if (label === 'css' || label === 'scss' || label === 'less') {
      return new cssWorker();
    }
    if (label === 'html' || label === 'handlebars' || label === 'razor') {
      return new htmlWorker();
    }
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  }
};

loader.config({ monaco });

const getMonacoLanguage = (mimeType: string, filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  
  if (mimeType === 'application/json' || ext === 'json') return 'json';
  if (mimeType === 'application/xml' || ext === 'xml') return 'xml';
  if (mimeType === 'application/javascript' || ext === 'js') return 'javascript';
  if (ext === 'ts') return 'typescript';
  if (ext === 'vue' || ext === 'html') return 'html';
  if (ext === 'css') return 'css';
  if (ext === 'scss') return 'scss';
  if (ext === 'py') return 'python';
  if (ext === 'java') return 'java';
  if (ext === 'c' || ext === 'cpp' || ext === 'h') return 'cpp';
  if (ext === 'cs') return 'csharp';
  if (ext === 'php') return 'php';
  if (ext === 'go') return 'go';
  if (ext === 'rs') return 'rust';
  if (ext === 'rb') return 'ruby';
  if (ext === 'sh' || mimeType === 'application/x-sh') return 'shell';
  if (ext === 'sql' || mimeType.includes('sql')) return 'sql';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  
  return 'plaintext';
};

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
const showUnsavedConfirm = ref(false);

const fileContent = ref('');
const originalFileContent = ref('');
const viewMode = ref<'edit' | 'preview'>('preview');

// Aperçu (image, PDF) : contenu déchiffré localement, exposé en URL blob:.
const previewUrl = ref<string | null>(null);
const fileUrl = computed(() => previewUrl.value ?? '');
// Métadonnées complètes (clé, contexte de chiffrement) lues au chargement :
// la sauvegarde rechiffre avec la même clé d'espace / de DM / de salon.
const loadedMeta = ref<FileMetadata | null>(null);

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

const fileExtension = computed(() => {
    return props.file.originalName.split('.').pop()?.toLowerCase() || '';
});

// Détection par extension, pas par mimeType : des .md déjà en base avant ce
// fix peuvent avoir un mimeType incorrect (application/octet-stream) — on ne
// veut pas dépendre de ça pour les reconnaître.
const isMarkdown = computed(() => ['md', 'markdown'].includes(fileExtension.value));
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
  if (!isTextFile.value && !isMarkdown.value) return;
  isLoading.value = true;
  try {
    const { buffer, metadata } = await fetchDecryptedFile(props.file.id);
    loadedMeta.value = metadata;
    const text = new TextDecoder().decode(buffer);
    fileContent.value = text;
    originalFileContent.value = text;
  } catch (err) {
    console.error('[FileViewer] lecture du fichier texte', err);
    hasError.value = true;
    toast.show(fileErrorMessage(err, 'Erreur lors du chargement du fichier texte.'), 'error');
  } finally {
    isLoading.value = false;
  }
};

const loadPreview = async () => {
  isLoading.value = true;
  try {
    const { buffer, metadata } = await fetchDecryptedFile(props.file.id);
    loadedMeta.value = metadata;
    previewUrl.value = URL.createObjectURL(new Blob([buffer], { type: props.file.mimeType }));
  } catch (err) {
    console.error('[FileViewer] aperçu', err);
    hasError.value = true;
    toast.show(fileErrorMessage(err, 'Erreur de déchiffrement de l\'aperçu.'), 'error');
  } finally {
    isLoading.value = false;
  }
};

const saveContent = async () => {
  if (fileContent.value === originalFileContent.value || isSaving.value) return;
  const meta = loadedMeta.value;
  if (!meta) return;

  isSaving.value = true;
  const saved = fileContent.value;
  try {
    // Rechiffré côté client (nouvelle DEK) et envoyé au CDN : le clair ne
    // quitte jamais l'appareil. Le fichier garde son identifiant.
    const updatedMetadata = await replaceFileContent(
      props.file.id,
      new Blob([saved], { type: props.file.mimeType }),
      props.file.originalName,
      { workspaceId: meta.workspaceId, dmPeerId: meta.dmPeerId, threadId: meta.threadId },
    );
    loadedMeta.value = { ...meta, ...updatedMetadata };
    originalFileContent.value = saved;
    toast.show('Fichier enregistré avec succès', 'success');
    emit('updated', updatedMetadata);
  } catch (err) {
    console.error('[FileViewer] sauvegarde', err);
    toast.show(err instanceof Error && err.message ? err.message : 'Erreur lors de la sauvegarde.', 'error');
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

const load = () => {
  isLoading.value = true;
  hasError.value = false;
  if (isTextFile.value || isMarkdown.value) {
    fetchTextContent();
  } else if (isImage.value || isPdf.value) {
    loadPreview();
  } else {
    isLoading.value = false; // pas d'aperçu
  }
};

const releasePreview = () => {
  if (previewUrl.value) {
    URL.revokeObjectURL(previewUrl.value);
    previewUrl.value = null;
  }
};

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) load();
  else releasePreview();
});

onMounted(() => {
  if (props.isOpen) load();
  window.addEventListener('keydown', handleKeydown);
});

const closeViewer = () => {
  if ((isTextFile.value || isMarkdown.value) && fileContent.value !== originalFileContent.value) {
    showUnsavedConfirm.value = true;
  } else {
    emit('close');
  }
};

const confirmCloseWithoutSaving = () => {
  showUnsavedConfirm.value = false;
  emit('close');
};

const handleKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') closeViewer();
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveContent();
  }
};

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  releasePreview();
});
</script>
