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
                placeholder="Rechercher par sens ou mot-clé..."
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

            <div v-else class="space-y-3 pb-4">
                <button 
                    v-for="res in filteredResults" 
                    :key="res.id"
                    @click="goToResult(res)"
                    class="w-full text-left transition-all relative group/btn block mb-3"
                >
                    <div class="relative pointer-events-none w-full">
                        <!-- File Card -->
                        <FileCard 
                            v-if="res.type === 'FILE'" 
                            :file="({ id: res.id, originalName: res.metadata?.originalName || res.textContent, size: res.metadata?.size || 0, mimeType: res.metadata?.mimeType || '', createdAt: res.metadata?.createdAt || new Date(), _count: {} } as any)" 
                            :draggedFileId="null" 
                        />

                        <!-- Task Card -->
                        <TaskCard 
                            v-else-if="res.type === 'TODO'" 
                            :task="{ 
                                id: res.id, 
                                title: res.textContent, 
                                status: res.metadata?.status || 'TODO', 
                                dueDate: res.metadata?.dueDate, 
                                assignees: res.metadata?.assignees || [], 
                                subtasks: res.metadata?.subtasks || [],
                                parentTask: res.metadata?.parentTask,
                                createdAt: res.metadata?.createdAt
                            }" 
                        />

                        <!-- Thread Card -->
                        <div v-else-if="res.type === 'THREAD'" class="bg-(--bg2)/40 border border-(--border-color) rounded-xl p-2">
                            <ThreadBtn :thread="({ id: res.id, name: res.textContent } as any)" />
                        </div>

                        <!-- Message Card -->
                        <div v-else class="bg-(--bg2)/20 border border-(--border-color) rounded-xl p-2">
                            <ChatMessage 
                                :msg="({ id: res.id, content: res.textContent, sender: res.metadata?.sender || { name: 'Message' }, createdAt: res.metadata?.createdAt || new Date() } as any)" 
                                :isReadOnly="true"
                                :selectedMessage="null"
                                :messages="[]"
                            />
                        </div>
                        
                        <!-- Score overlay -->
                        <div class="absolute top-3 right-3 z-10">
                            <span class="text-[10px] text-(--primary) font-bold bg-(--primary)/20 px-2 py-1 rounded-full shadow-lg backdrop-blur-md">
                                {{ (res.score * 100).toFixed(0) }}% match
                            </span>
                        </div>
                    </div>
                </button>
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
import FileCard from '../SpaceFiles/FileCard.vue';
import TaskCard from '../SpaceTasks/TaskCard.vue';
import ChatMessage from '../common/ChatMessage.vue';
import ThreadBtn from '../CanalBar/ThreadBtn.vue';

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
    MESSAGE: true
});

const toggleFilter = (type: string) => {
    activeFilters.value[type] = !activeFilters.value[type];
    if (query.value.trim()) {
        handleInput();
    }
};

const filteredResults = computed(() => {
    return results.value.filter(res => activeFilters.value[res.type] ?? activeFilters.value['MESSAGE']);
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
            const searchResults = await localSearchDB.searchByVector(vector, text, workspaceId, 50);
            
            // Augment TODO results with live data (assignees, dueDate, etc.)
            if (searchResults.some(r => r.type === 'TODO')) {
                const sfetch = (await import('@/assets/utils/sfetch')).default;
                const tasksRes = await sfetch(`/api/tasks/${route.params.orgId}/spaces/${route.params.spaceId}/lists`);
                if (tasksRes.ok) {
                    const tasksData = await tasksRes.json();
                    const allSpaceTasks = [...(tasksData.unlistedTasks || [])];
                    if (tasksData.lists) {
                        for (const list of tasksData.lists) {
                            if (list.tasks) allSpaceTasks.push(...list.tasks);
                        }
                    }
                    
                    for (const res of searchResults) {
                        if (res.type === 'TODO') {
                            const found = allSpaceTasks.find((t: any) => t.id === res.id);
                            if (found) {
                                res.metadata = {
                                    ...res.metadata,
                                    status: found.status,
                                    dueDate: found.dueDate,
                                    assignees: found.assignees,
                                    subtasks: found.subtasks,
                                    parentTask: found.parentTask,
                                    createdAt: found.createdAt
                                };
                            }
                        }
                    }
                }
            }

            results.value = searchResults;
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
