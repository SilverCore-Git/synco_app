<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="transform scale-95 opacity-0"
    enter-to-class="transform scale-100 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="transform scale-100 opacity-100"
    leave-to-class="transform scale-95 opacity-0"
  >
    <div v-if="show" class="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] bg-black/60 backdrop-blur-md p-4" @click="emit('close')">
      <div class="bg-(--bg) rounded-2xl border border-white/10 shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden" @click.stop>
        
        <div class="flex items-center px-4 py-3 border-b border-white/5">
            <i class="bi bi-search text-xl text-(--primary) mr-3" />
            <input 
                ref="inputRef"
                v-model="query"
                type="text" 
                placeholder="Rechercher par sens ou mot-clé (Ultra Recherche)..."
                class="w-full bg-transparent text-lg text-(--text) placeholder:text-(--text)/30 focus:outline-none"
                @input="handleInput"
            />
            <button @click="emit('close')" class="ml-2 text-(--text)/40 hover:text-(--text) p-1">
                <i class="bi bi-x-lg text-xl" />
            </button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto p-2" v-if="query.length > 0">
            <div v-if="loading" class="flex flex-col items-center justify-center py-8 text-(--text)/40">
                <i class="bi bi-robot text-4xl mb-3 animate-pulse text-(--primary)" />
                <p>Recherche en cours...</p>
                <p v-if="downloadProgress > 0 && downloadProgress < 100" class="text-xs mt-2 text-(--text)/30">Premier démarrage du moteur : {{ downloadProgress }}%</p>
            </div>
            
            <div v-else-if="error" class="flex flex-col items-center justify-center py-8 text-red-400">
                <i class="bi bi-exclamation-triangle text-4xl mb-3" />
                <p>Erreur lors de la recherche :</p>
                <p class="text-xs mt-2 text-red-400/70 text-center max-w-xs">{{ error }}</p>
            </div>

            <div v-else-if="results.length === 0" class="flex flex-col items-center justify-center py-8 text-(--text)/40">
                <i class="bi bi-emoji-frown text-4xl mb-3" />
                <p>Aucun résultat trouvé pour "{{ query }}"</p>
            </div>

            <div v-else class="space-y-2">
                <button 
                    v-for="res in results" 
                    :key="res.id"
                    @click="goToResult(res)"
                    class="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors flex items-start gap-3 border border-transparent hover:border-white/5"
                >
                    <div class="mt-1">
                        <i v-if="res.type === 'MESSAGE'" class="bi bi-chat-dots text-blue-400 text-lg" />
                        <i v-else-if="res.type === 'FILE'" class="bi bi-file-earmark-text text-green-400 text-lg" />
                        <i v-else-if="res.type === 'TODO'" class="bi bi-check2-square text-orange-400 text-lg" />
                        <i v-else-if="res.type === 'THREAD'" class="bi bi-hash text-(--primary) text-lg" />
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs font-black tracking-wider uppercase text-(--text)/40">
                                {{ res.type === 'MESSAGE' ? 'Message' : res.type === 'FILE' ? 'Fichier' : res.type === 'TODO' ? 'Tâche' : 'Salon' }}
                            </span>
                            <span class="text-[10px] text-(--primary)/60 font-bold bg-(--primary)/10 px-2 py-0.5 rounded">{{ (res.score * 100).toFixed(0) }}% certitude</span>
                        </div>
                        <p class="text-sm text-(--text)/90 line-clamp-2">
                            {{ res.textContent }}
                        </p>
                    </div>
                </button>
            </div>
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { localSearchDB } from '@/services/LocalSearchVectorDB';
import globalVectorWorker from '@/services/GlobalVectorWorker';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

const route = useRoute();
const router = useRouter();

const inputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const loading = ref(false);
const error = ref<string | null>(null);
const results = ref<any[]>([]);
const downloadProgress = ref(0);

let searchTimeout: any = null;

globalVectorWorker.onerror = (err: any) => {
    console.error("[SpaceSearchModal] Worker global error:", err);
    error.value = "Erreur fatale du Worker: " + (err.message || "Impossible de charger le moteur IA.");
    loading.value = false;
};

const handleWorkerMessage = async (e: MessageEvent) => {
    const { status, vector, type, text } = e.data;
    
    if (status === 'error') {
        console.error("[SpaceSearchModal] Worker error:", e.data.error);
        error.value = e.data.error || "Erreur interne du Worker de vectorisation";
        loading.value = false;
        return;
    }

    if (status === 'progress') {
        if (e.data.progress && e.data.progress.progress !== undefined) {
            downloadProgress.value = Math.round(e.data.progress.progress);
        }
        return;
    }

    // We expect the worker to return our query vector with type 'QUERY'
    if (status === 'complete' && type === 'QUERY') {
        const workspaceId = String(route.params.spaceId) || null;
        if (!workspaceId) {
            loading.value = false;
            return;
        }

        try {
            const searchResults = await localSearchDB.searchByVector(vector, text, workspaceId, 20);
            results.value = searchResults; // Removing 0.4 threshold because hybrid search scores are different
        } catch (err) {
            console.error("[SpaceSearchModal] Search failed with error:", err);
        } finally {
            loading.value = false;
        }
    }
};

const handleInput = () => {
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (!query.value.trim()) {
        results.value = [];
        loading.value = false;
        error.value = null;
        return;
    }

    loading.value = true;
    error.value = null;
    
    searchTimeout = setTimeout(() => {
        const queryId = 'query_' + Date.now();
        globalVectorWorker.postMessage({
            id: queryId,
            text: query.value,
            type: 'QUERY'
        });
    }, 500); // 500ms debounce
};

const goToResult = (res: any) => {
    emit('close');
    
    if (res.type === 'MESSAGE' || res.type === 'FILE') {
        if (res.metadata?.threadId) {
            router.push({ 
                name: 'SpaceThreadView', 
                params: { orgId: route.params.orgId, spaceId: route.params.spaceId, threadId: res.metadata.threadId },
                query: { showView: '1', messageId: res.id }
            });
        } else if (res.type === 'FILE') {
            router.push({ 
                name: 'SpaceFiles', 
                params: { orgId: route.params.orgId, spaceId: route.params.spaceId },
                query: { showView: '1', path: undefined, folderId: res.metadata?.folderId || 'root', highlightFileId: res.id }
            });
        }
    } else if (res.type === 'TODO') {
        router.push({ 
            name: 'TasksSpace',
            params: { orgId: route.params.orgId, spaceId: route.params.spaceId },
            query: { showView: '1' }
        });
    } else if (res.type === 'THREAD') {
        router.push({ 
            name: 'SpaceThreadView', 
            params: { orgId: route.params.orgId, spaceId: route.params.spaceId, threadId: res.id },
            query: { showView: '1' }
        });
    }
};

import { onMounted, onUnmounted } from 'vue';

onMounted(() => {
    globalVectorWorker.addEventListener('message', handleWorkerMessage);
});

onUnmounted(() => {
    globalVectorWorker.removeEventListener('message', handleWorkerMessage);
});

watch(() => props.show, async (isOpened) => {
    if (isOpened) {
        query.value = '';
        results.value = [];
        error.value = null;
        await nextTick();
        inputRef.value?.focus();
    }
});
</script>
