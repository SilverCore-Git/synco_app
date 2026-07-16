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
                <p>Vectorisation et recherche en cours...</p>
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
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-xs font-black tracking-wider uppercase text-(--text)/40">
                                {{ res.type === 'MESSAGE' ? 'Message' : res.type === 'FILE' ? 'Fichier' : 'Tâche' }}
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
import VectorWorker from '@/workers/vector.worker?worker';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits(['close']);

const route = useRoute();
const router = useRouter();

const inputRef = ref<HTMLInputElement | null>(null);
const query = ref('');
const loading = ref(false);
const results = ref<any[]>([]);

let searchTimeout: any = null;

const vectorWorker = new VectorWorker();

vectorWorker.onmessage = async (e) => {
    const { status, id, vector, type } = e.data;
    
    // We expect the worker to return our query vector with type 'QUERY'
    if (status === 'complete' && type === 'QUERY') {
        const workspaceId = String(route.params.spaceId) || null;
        if (!workspaceId) {
            loading.value = false;
            return;
        }

        try {
            const searchResults = await localSearchDB.searchByVector(vector, workspaceId, 20);
            results.value = searchResults.filter((r: any) => r.score > 0.4); // Threshold
        } catch (err) {
            console.error("Search failed:", err);
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
        return;
    }

    loading.value = true;
    
    searchTimeout = setTimeout(() => {
        vectorWorker.postMessage({
            id: 'query_' + Date.now(),
            text: query.value,
            type: 'QUERY'
        });
    }, 500); // 500ms debounce
};

const goToResult = (res: any) => {
    emit('close');
    
    if (res.type === 'MESSAGE') {
        if (res.metadata?.threadId) {
            router.push({ 
                name: 'SpaceThreadView', 
                params: { orgId: route.params.orgId, spaceId: route.params.spaceId, threadId: res.metadata.threadId },
                query: { select: res.id, showView: '1' }
            });
        }
    } else if (res.type === 'FILE') {
        let queryParams: any = { showView: '1' };
        if (res.metadata?.folderId) {
            // Need to reconstruct path theoretically, but jumping to folder is enough for now
            // We just navigate to SpaceFiles
        }
        router.push({ 
            name: 'SpaceFiles',
            params: { orgId: route.params.orgId, spaceId: route.params.spaceId },
            query: queryParams
        });
    } else if (res.type === 'TODO') {
        router.push({ 
            name: 'TasksSpace',
            params: { orgId: route.params.orgId, spaceId: route.params.spaceId },
            query: { showView: '1' }
        });
    }
};

watch(() => props.show, async (isOpened) => {
    if (isOpened) {
        query.value = '';
        results.value = [];
        await nextTick();
        inputRef.value?.focus();
    }
});
</script>
