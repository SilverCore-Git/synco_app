<template>
  <Window :is-open="isOpen" :hideCloseBtn="true" @close="closeViewer">
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

              <template v-else-if="isOfficeFile && onlyOfficeEnabled">
                <div v-if="file.isE2EE" class="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                    <i class="bi bi-shield-lock text-6xl text-warning"></i>
                    <h3 class="text-xl font-bold text-slate-200">Fichier chiffré de bout en bout</h3>
                    <p class="text-slate-400 max-w-md">
                        OnlyOffice ne peut pas éditer des fichiers chiffrés de bout en bout car il nécessite un accès en clair au document sur le serveur.
                    </p>
                    <p class="text-slate-400 max-w-md mb-4">
                        Voulez-vous désactiver le chiffrement de bout en bout pour ce fichier afin de pouvoir l'éditer en collaboration ?
                    </p>
                    <button @click="disableE2EE" :disabled="isDisablingE2EE" class="btn btn-primary w-64 mb-2">
                        <span v-if="isDisablingE2EE" class="loading loading-spinner"></span>
                        Oui, désactiver le chiffrement
                    </button>
                    <button @click="downloadFile(file.id)" class="btn btn-outline w-64">
                        Garder chiffré et Télécharger
                    </button>
                </div>
                <div v-else class="w-full h-full relative">
                    <DocumentEditor 
                        v-if="onlyOfficeConfig"
                        id="docxEditor" 
                        documentServerUrl="http://localhost:8080"
                        :config="onlyOfficeConfig"
                    />
                </div>
              </template>

              <template v-else-if="isTextFile">
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
</template>

<script setup lang="ts">
import { ref, shallowRef, computed, watch, onMounted, onUnmounted } from 'vue';
import type { StoredFile } from '@/types/types';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { downloadFile } from '@/assets/utils/downloadFile';
import { kcToken, onlyOfficeEnabled, user } from '@/assets/var';
import { DocumentEditor } from '@onlyoffice/document-editor-vue';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import Window from '@/components/windows/Window.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { getWorkspaceKey } from '@/assets/utils/workspaceCrypto';
import { decryptFileLocal } from '@/assets/utils/crypto';
import { VueMonacoEditor, loader } from '@guolao/vue-monaco-editor';

import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker';
import cssWorker from 'monaco-editor/language/css/css.worker.js?worker';
import htmlWorker from 'monaco-editor/language/html/html.worker.js?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
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
  if (ext === 'md') return 'markdown';
  
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

const fileExtension = computed(() => {
    return props.file.originalName.split('.').pop()?.toLowerCase() || '';
});
const isOfficeFile = computed(() => {
    const ext = fileExtension.value;
    return ['docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt', 'csv', 'txt', 'rtf'].includes(ext);
});

const getDocumentType = (ext: string) => {
    if (['docx', 'doc', 'txt', 'rtf'].includes(ext)) return 'word';
    if (['xlsx', 'xls', 'csv'].includes(ext)) return 'cell';
    if (['pptx', 'ppt'].includes(ext)) return 'slide';
    return 'word';
};

const documentUrlForOnlyOffice = computed(() => {
    return `${(import.meta.env.VITE_API_URL || 'https://localhost:9000').replace('localhost', 'host.docker.internal')}/api/cdn/download/${props.file.id}?kc_token=Bearer ${kcToken.value}`;
});

const callbackUrlForOnlyOffice = computed(() => {
    return `${(import.meta.env.VITE_API_URL || 'https://localhost:9000').replace('localhost', 'host.docker.internal')}/api/cdn/onlyoffice-callback/${props.file.id}`;
});

const onlyOfficeConfig = shallowRef<any>(null);

const loadOnlyOfficeConfig = async () => {
    const configObj = {
        document: {
            fileType: fileExtension.value,
            key: props.file.id.substring(0, 20) + '_' + new Date(props.file.updatedAt).getTime(),
            title: props.file.originalName,
            url: documentUrlForOnlyOffice.value
        },
        documentType: getDocumentType(fileExtension.value),
        editorConfig: {
            user: {
                id: user.value?.id || 'unknown',
                name: user.value?.name || 'Utilisateur inconnu'
            },
            callbackUrl: callbackUrlForOnlyOffice.value,
            lang: 'fr',
            mode: 'edit'
        }
    };

    try {
        const res = await sfetch(`/api/cdn/onlyoffice-config`, {
            method: 'POST',
            body: JSON.stringify(configObj)
        });
        if (res.ok) {
            const data = await res.json();
            onlyOfficeConfig.value = {
                ...configObj,
                token: data.token
            };
        } else {
            hasError.value = true;
            toast.show("Erreur token OnlyOffice", "error");
        }
    } catch (err) {
        hasError.value = true;
    } finally {
        isLoading.value = false;
    }
};

const isDisablingE2EE = ref(false);

const disableE2EE = async () => {
    isDisablingE2EE.value = true;
    try {
        const res = await sfetch(`/api/cdn/download/${props.file.id}`);
        if (!res.ok) throw new Error("Erreur de téléchargement");
        
        const buffer = await res.arrayBuffer();
        const { key: spaceKey } = await getWorkspaceKey(props.file.workspaceId!);
        const decryptedBuffer = await decryptFileLocal(
            buffer, 
            props.file.encryptedFileKey!, 
            props.file.iv!, 
            spaceKey
        );
        
        const blob = new Blob([decryptedBuffer], { type: props.file.mimeType });
        const formData = new FormData();
        formData.append('file', blob, props.file.originalName);

        const updateRes = await sfetch(`/api/cdn/disable-e2ee/${props.file.id}`, {
            method: 'POST',
            body: formData
        });
        
        if (updateRes.ok) {
            const newMeta = await updateRes.json();
            toast.show('Chiffrement désactivé, chargement de l\'éditeur...', 'success');
            props.file.isE2EE = false;
            emit('updated', newMeta);
            await loadOnlyOfficeConfig();
        } else {
            const err = await updateRes.json();
            toast.show(err.error || 'Erreur lors de la désactivation.', 'error');
        }
    } catch (err) {
        toast.show('Erreur lors de l\'opération.', 'error');
    } finally {
        isDisablingE2EE.value = false;
    }
};

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

watch(() => props.isOpen, async (isOpen) => {
  if (isOpen) {
    isLoading.value = true;
    hasError.value = false;
    e2eeObjectUrl.value = null;
    onlyOfficeConfig.value = null;
    
    if (props.file.isE2EE && !isTextFile.value && (isImage.value || isPdf.value)) {
        loadE2EEPreview();
    } else if (isOfficeFile.value && onlyOfficeEnabled.value && !props.file.isE2EE) {
        await loadOnlyOfficeConfig();
    } else if (isTextFile.value) {
      fetchTextContent();
    } else if (!isImage.value && !isPdf.value) {
      isLoading.value = false; // no preview
    } else {
        isLoading.value = false;
    }
  } else {
    if (e2eeObjectUrl.value) {
        URL.revokeObjectURL(e2eeObjectUrl.value);
        e2eeObjectUrl.value = null;
    }
  }
});

onMounted(async () => {
    if (props.isOpen) {
        isLoading.value = true;
        if (props.file.isE2EE && !isTextFile.value && (isImage.value || isPdf.value)) {
            loadE2EEPreview();
        } else if (isOfficeFile.value && onlyOfficeEnabled.value && !props.file.isE2EE) {
            await loadOnlyOfficeConfig();
        } else if (isTextFile.value) {
            fetchTextContent();
        } else {
            isLoading.value = false;
        }
    }
    window.addEventListener('keydown', handleKeydown);
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

onUnmounted(() => window.removeEventListener('keydown', handleKeydown));
</script>
