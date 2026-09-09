<template>

    <!-- search_messages : vrais composants de message, cliquables pour se téléporter -->
    <div v-if="tool.name === 'search_messages' && searchResults.length" class="flex flex-col gap-3">
        <div v-for="res in searchResults" :key="res.id" class="bg-black/20 border border-(--border-color) rounded-xl overflow-hidden">
            <div class="px-3 py-1.5 bg-white/5 border-b border-(--border-color) flex justify-between items-center text-[10px] text-white/50 uppercase font-bold tracking-wider">
                <div class="flex items-center gap-1.5 truncate pr-2">
                    <i class="bi bi-folder2-open"></i>
                    <span class="truncate">{{ spaceAndThreadName(res.workspaceId, res.metadata?.threadId).spaceName }}</span>
                    <i class="bi bi-chevron-right text-[8px] opacity-50"></i>
                    <i class="bi bi-hash"></i>
                    <span class="truncate">{{ spaceAndThreadName(res.workspaceId, res.metadata?.threadId).threadName }}</span>
                </div>
                <button
                    @click="teleportTo(res)"
                    class="text-(--primary) hover:text-white transition-colors flex items-center shrink-0"
                >
                    <i class="bi bi-box-arrow-up-right mr-1"></i> Se téléporter
                </button>
            </div>
            <ThreadMessage
                :msg="{
                    id: res.id,
                    content: res.textContent,
                    createdAt: res.metadata?.createdAt ? new Date(res.metadata.createdAt) : new Date(),
                    sender: { name: res.metadata?.senderName || 'Auteur inconnu', avatarUrl: res.metadata?.senderAvatar, id: 'unknown' },
                    threadId: res.metadata?.threadId,
                    reactions: {}
                } as any"
                :isReadOnly="true"
                @select="teleportTo(res)"
            />
        </div>
    </div>
    <p v-else-if="tool.name === 'search_messages'" class="text-xs text-(--text2)">Aucun résultat trouvé.</p>

    <!-- create_task : carte cliquable qui ouvre le détail -->
    <div
        v-else-if="tool.name === 'create_task' && createdTask"
        class="bg-black/20 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-(--primary)/40 transition-colors flex justify-between items-center gap-3"
        @click="$emit('open-task', createdTask)"
    >
        <div class="flex items-center gap-3 min-w-0">
            <i class="bi bi-circle text-(--text2)"></i>
            <div class="min-w-0">
                <p class="text-sm font-medium text-(--text) truncate">{{ createdTask.title }}</p>
                <p v-if="createdTask.description" class="text-xs text-(--text2) truncate">{{ createdTask.description }}</p>
            </div>
        </div>
        <i class="bi bi-box-arrow-up-right text-(--text2) shrink-0"></i>
    </div>

    <!-- create_space : carte cliquable qui navigue -->
    <div
        v-else-if="tool.name === 'create_space' && createdSpace"
        class="bg-black/20 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-(--primary)/40 transition-colors flex justify-between items-center gap-3"
        @click="router.push(`/${orgId}/${createdSpace.id}/`)"
    >
        <div class="flex items-center gap-3 min-w-0">
            <i class="bi text-(--primary)" :class="createdSpace.logo || 'bi-folder'"></i>
            <p class="text-sm font-medium text-(--text) truncate">{{ createdSpace.name }}</p>
        </div>
        <i class="bi bi-box-arrow-up-right text-(--text2) shrink-0"></i>
    </div>

    <!-- create_thread : une carte par salon créé -->
    <div v-else-if="tool.name === 'create_thread' && createdThreads.length" class="flex flex-col gap-2">
        <div
            v-for="th in createdThreads" :key="th.id"
            class="bg-black/20 border border-white/10 p-3 rounded-xl cursor-pointer hover:border-(--primary)/40 transition-colors flex justify-between items-center gap-3"
            @click="router.push(`/${orgId}/${th.workspaceId || 'home'}/${th.id}`)"
        >
            <div class="flex items-center gap-3 min-w-0">
                <i class="bi text-(--primary)" :class="th.type === 'vocal' ? 'bi-volume-up-fill' : 'bi-hash'"></i>
                <p class="text-sm font-medium text-(--text) truncate">{{ th.name }}</p>
            </div>
            <i class="bi bi-box-arrow-up-right text-(--text2) shrink-0"></i>
        </div>
    </div>

    <!-- list_spaces / list_threads / list_members : liste simple -->
    <ul v-else-if="isNamedList" class="flex flex-col gap-1 text-sm text-(--text)">
        <li v-for="item in namedListItems" :key="item.id" class="flex items-center gap-2">
            <i class="bi bi-dot text-(--text2)"></i>
            {{ item.name }}
        </li>
        <li v-if="namedListItems.length === 0" class="text-(--text2) text-xs">Aucun résultat.</li>
    </ul>

    <!-- Erreur -->
    <p v-else-if="tool.status === 'error' || tool.result?.error" class="text-xs text-red-400">
        {{ tool.result?.error || 'Erreur lors de l\'exécution.' }}
    </p>

    <!-- Fallback générique -->
    <pre v-else-if="tool.result" class="text-xs text-(--text2) whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{{ prettyResult }}</pre>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ToolStep } from './agentTypes';
import ThreadMessage from '../common/ThreadMessage.vue';
import { openedOrg } from '@/assets/var';

const props = defineProps<{ tool: ToolStep }>();
defineEmits(['open-task']);

const route = useRoute();
const router = useRouter();
const orgId = route.params.orgId as string;

const searchResults = computed<any[]>(() => props.tool.result?.results || []);
const createdTask = computed(() => (props.tool.name === 'create_task' ? props.tool.result : null));
const createdSpace = computed(() => (props.tool.name === 'create_space' ? props.tool.result : null));
const createdThreads = computed<any[]>(() => (props.tool.name === 'create_thread' ? (props.tool.result?.threads || []) : []));

const isNamedList = computed(() => ['list_spaces', 'list_threads', 'list_members'].includes(props.tool.name));
const namedListItems = computed<any[]>(() => Array.isArray(props.tool.result) ? props.tool.result : []);

const prettyResult = computed(() => {
    try {
        return JSON.stringify(props.tool.result, null, 2);
    } catch {
        return String(props.tool.result);
    }
});

function spaceAndThreadName(workspaceId: string, threadId: string) {
    const space = openedOrg.value?.spaces?.find((s) => s.id === workspaceId);
    const thread = space?.threads?.find((t) => t.id === threadId) || openedOrg.value?.home?.threads?.find((t) => t.id === threadId);
    return { spaceName: space?.name || 'Accueil', threadName: thread?.name || '?' };
}

function teleportTo(res: any) {
    router.push(`/${openedOrg.value?.id}/${res.workspaceId || 'home'}/${res.metadata?.threadId}?select=${res.id}`);
}

</script>
