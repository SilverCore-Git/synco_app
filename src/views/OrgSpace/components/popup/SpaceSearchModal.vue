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
        
        <div class="flex items-center px-4 py-3 border-b border-(--border-color)">
            <i class="bi bi-search text-xl text-(--primary) mr-3" />
            <input 
                ref="inputRef"
                v-model="query"
                type="text" 
                placeholder="Rechercher par sens ou mot-clé (Deep search)..."
                class="w-full bg-transparent text-lg text-(--text) placeholder:text-(--text2) focus:outline-none"
                @input="handleInput"
            />
            <button @click="emit('close')" class="ml-2 text-(--text2) hover:text-(--text) p-1">
                <i class="bi bi-x-lg text-xl" />
            </button>
        </div>

        <!-- Filtres -->
        <div class="px-4 py-2 flex items-center gap-2 border-b border-(--border-color) overflow-x-auto scrollbar-hide bg-black/10">
            <button 
                @click="toggleFilter('FILE')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
                :class="activeFilters['FILE'] ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'"
            >
                <i class="bi bi-file-earmark-text"></i> Fichiers
            </button>
            <button 
                @click="toggleFilter('TODO')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
                :class="activeFilters['TODO'] ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'"
            >
                <i class="bi bi-check2-square"></i> Tâches
            </button>
            <button 
                @click="toggleFilter('MESSAGE')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
                :class="activeFilters['MESSAGE'] ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'"
            >
                <i class="bi bi-chat-dots"></i> Messages
            </button>
            <button 
                @click="toggleFilter('THREAD')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
                :class="activeFilters['THREAD'] ? 'bg-(--primary)/20 text-(--primary) border border-(--primary)/30' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'"
            >
                <i class="bi bi-hash"></i> Salons
            </button>
            <button 
                @click="toggleFilter('NOTION')"
                class="px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5"
                :class="activeFilters['NOTION'] ? 'bg-zinc-100 text-black border border-zinc-300' : 'bg-white/5 text-white/40 hover:bg-white/10 border border-transparent'"
            >
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" class="w-3 h-3 object-contain inline-block mr-0.5 filter" :class="activeFilters['NOTION'] ? 'invert' : 'opacity-50'" /> Notion
            </button>
        </div>

        <div class="max-h-[60vh] overflow-y-auto p-2" v-if="query.length > 0">
            <div v-if="loading" class="flex flex-col items-center justify-center py-8 text-(--text2)">
                <i class="bi bi-robot text-4xl mb-3 animate-pulse text-(--primary)" />
                <p>Recherche en cours...</p>
                <p v-if="downloadProgress > 0 && downloadProgress < 100" class="text-xs mt-2 text-(--text2)">Premier démarrage du moteur : {{ downloadProgress }}%</p>
            </div>
            
            <div v-else-if="error" class="flex flex-col items-center justify-center py-8 text-red-400">
                <i class="bi bi-exclamation-triangle text-4xl mb-3" />
                <p>Erreur lors de la recherche :</p>
                <p class="text-xs mt-2 text-red-400/70 text-center max-w-xs">{{ error }}</p>
            </div>

            <div v-else-if="results.length === 0" class="flex flex-col items-center justify-center py-8 text-(--text2)">
                <i class="bi bi-emoji-frown text-4xl mb-3" />
                <p>Aucun résultat trouvé pour "{{ query }}"</p>
            </div>

            <div v-else class="space-y-6 pb-4">
                
                <div v-for="group in ['THREAD', 'FILE', 'TODO', 'MESSAGE', 'NOTION']" :key="group">
                    <div v-if="groupedResults[group] && groupedResults[group].length > 0">
                        <h3 class="text-[10px] font-black tracking-widest uppercase text-(--text2) mb-2 px-2 flex items-center gap-2">
                            <i class="bi" :class="{
                                'bi-hash text-(--primary)': group === 'THREAD',
                                'bi-file-earmark-text text-green-400': group === 'FILE',
                                'bi-check2-square text-orange-400': group === 'TODO',
                                'bi-chat-dots text-blue-400': group === 'MESSAGE'
                            }" v-if="group !== 'NOTION'" />
                            <img v-else src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" class="w-3 h-3 object-contain invert opacity-60" />
                            {{ group === 'THREAD' ? 'Salons' : group === 'FILE' ? 'Fichiers' : group === 'TODO' ? 'Tâches' : group === 'MESSAGE' ? 'Messages' : 'Notion' }}
                            <span class="text-(--text2) font-normal">({{ groupedResults[group].length }})</span>
                        </h3>
                        
                        <div class="space-y-1">
                            <button 
                                v-for="res in groupedResults[group]" 
                                :key="res.id"
                                @click="goToResult(res)"
                                class="w-full text-left p-3 rounded-xl hover:bg-white/5 transition-colors flex items-start gap-3 border border-transparent hover:border-(--border-color) group/btn"
                            >
                                <div class="flex-1 min-w-0">
                                    <div class="flex items-center justify-between mb-1">
                                        <p class="text-sm font-medium text-white line-clamp-1 group-hover/btn:text-(--primary) transition-colors flex items-center gap-2">
                                            <span v-if="group === 'NOTION' && res.metadata?.iconType === 'emoji'" class="text-lg leading-none">{{ res.metadata.icon }}</span>
                                            <img v-else-if="group === 'NOTION' && res.metadata?.icon" :src="res.metadata.icon" alt="icon" class="w-4 h-4 object-contain" />
                                            {{ group === 'FILE' ? (res.metadata?.originalName || res.textContent) : res.textContent }}
                                        </p>
                                        <span v-if="group !== 'NOTION'" class="text-[10px] text-(--primary)/60 font-bold bg-(--primary)/10 px-2 py-0.5 rounded shrink-0 ml-3">
                                            {{ (res.score * 100).toFixed(0) }}%
                                        </span>
                                    </div>
                                    <p v-if="group === 'MESSAGE'" class="text-xs text-(--text2) line-clamp-2 mt-1 font-mono">
                                        {{ res.textContent }}
                                    </p>
                                    <p v-else-if="group === 'NOTION'" class="text-xs text-(--text2) line-clamp-1 mt-0.5">
                                        {{ res.metadata?.object === 'database' ? 'Base de données' : 'Page' }} Notion
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>

            </div>
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { localSearchDB } from '@/services/LocalSearchVectorDB';
import globalVectorWorker from '@/services/GlobalVectorWorker';
import sfetch from '@/assets/utils/sfetch';

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

const activeFilters = ref<Record<string, boolean>>({
    THREAD: true,
    FILE: true,
    TODO: true,
    MESSAGE: true,
    NOTION: true
});

const toggleFilter = (type: string) => {
    activeFilters.value[type] = !activeFilters.value[type];
    if (query.value.trim()) {
        handleInput();
    }
};

const groupedResults = computed(() => {
    const groups: Record<string, any[]> = {
        'THREAD': [],
        'FILE': [],
        'TODO': [],
        'MESSAGE': [],
        'NOTION': []
    };
    for (const res of results.value) {
        if (!activeFilters.value[res.type]) continue;
        if (groups[res.type]) groups[res.type]!.push(res);
        else groups['MESSAGE']!.push(res);
    }
    return groups;
});

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
            // 1. Fetch Local AI results
            const searchResults = await localSearchDB.searchByVector(vector, text, workspaceId, 50);
            
            // 2. Fetch Notion results if active
            if (activeFilters.value['NOTION']) {
                try {
                    const encodedQ = encodeURIComponent(text);
                    const response = await sfetch(`/api/integrations/notion/search?q=${encodedQ}`);
                    if (response.ok) {
                        const notionData = await response.json();
                        const notionResults = notionData.results.map((n: any) => ({
                            id: n.id,
                            type: 'NOTION',
                            score: 1.0, // Sort on top or blend in
                            textContent: n.title,
                            metadata: {
                                url: n.url,
                                icon: n.icon,
                                iconType: n.iconType,
                                object: n.object,
                                lastEdited: n.lastEdited
                            }
                        }));
                        // Merge and sort loosely by score (Notion results have artificial 1.0)
                        results.value = [...notionResults, ...searchResults].sort((a, b) => (b.score || 0) - (a.score || 0));
                    } else {
                        results.value = searchResults;
                    }
                } catch(e) {
                    console.error("[Notion] Search failed:", e);
                    results.value = searchResults;
                }
            } else {
                results.value = searchResults;
            }

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
    }, 250); // 250ms debounce for much faster feeling
};

const goToResult = (res: any) => {
    if (res.type === 'NOTION' && res.metadata?.url) {
        window.open(res.metadata.url, '_blank', 'noopener,noreferrer');
        emit('close');
        return;
    }

    emit('close');
    
    if (res.type === 'MESSAGE' || res.type === 'FILE') {
        if (res.metadata?.threadId) {
            router.push({ 
                name: 'SpaceThreadView', 
                params: { orgId: route.params.orgId, spaceId: route.params.spaceId, threadId: res.metadata.threadId },
                query: { showView: '1', select: res.id }
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
            query: { showView: '1', select: res.id }
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
