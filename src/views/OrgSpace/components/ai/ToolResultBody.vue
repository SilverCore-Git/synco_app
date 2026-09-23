<template>

    <!-- search_messages : vrais composants de message, cliquables pour se téléporter -->
    <div v-if="tool.name === 'search_messages' && searchResults.length" class="flex flex-col gap-3">
        <div v-for="res in searchResults" :key="res.id" class="bg-black/20 border border-(--border-color) rounded-xl overflow-hidden">
            <div class="px-3 py-1.5 bg-(--text)/5 border-b border-(--border-color) flex justify-between items-center text-[10px] text-(--text)/50 uppercase font-bold tracking-wider">
                <div class="flex items-center gap-1.5 truncate pr-2">
                    <i class="bi bi-folder2-open"></i>
                    <span class="truncate">{{ spaceAndThreadName(res.workspaceId, res.metadata?.threadId).spaceName }}</span>
                    <i class="bi bi-chevron-right text-[8px] opacity-50"></i>
                    <i class="bi bi-hash"></i>
                    <span class="truncate">{{ spaceAndThreadName(res.workspaceId, res.metadata?.threadId).threadName }}</span>
                </div>
                <button
                    @click="teleportTo(res)"
                    class="text-(--primary) hover:text-(--primary-hover) transition-colors flex items-center shrink-0"
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

    <!-- create_task : ouvre le détail -->
    <EntityRow
        v-else-if="tool.name === 'create_task' && createdTask"
        icon="bi-circle"
        :title="createdTask.title"
        :subtitle="createdTask.description"
        @click="$emit('open-task', createdTask)"
    />

    <!-- create_space : navigue vers l'espace -->
    <EntityRow
        v-else-if="tool.name === 'create_space' && createdSpace"
        :icon="isImageLogo(createdSpace.logo) ? undefined : (createdSpace.logo || 'bi-folder')"
        :logo="createdSpace.logo"
        :title="createdSpace.name"
        subtitle="Espace de travail"
        @click="router.push(`/${orgId}/${createdSpace.id}/`)"
    />

    <!-- create_thread : une carte par salon créé -->
    <div v-else-if="tool.name === 'create_thread' && createdThreads.length" class="flex flex-col gap-2">
        <EntityRow
            v-for="th in createdThreads" :key="th.id"
            :icon="th.type === 'vocal' ? 'bi-volume-up-fill' : 'bi-hash'"
            :title="th.name"
            :subtitle="th.type === 'vocal' ? 'Salon vocal' : 'Salon textuel'"
            @click="router.push(`/${orgId}/${th.workspaceId || 'home'}/${th.id}`)"
        />
    </div>

    <!-- list_spaces : grille de cartes cliquables -->
    <div v-else-if="tool.name === 'list_spaces'" class="grid grid-cols-2 gap-2">
        <EntityRow
            v-for="space in namedListItems" :key="space.id"
            :icon="isImageLogo(space.logo) ? undefined : (space.logo || 'bi-folder')"
            :logo="space.logo"
            :title="space.name"
            subtitle="Espace de travail"
            @click="router.push(`/${orgId}/${space.id}/`)"
        />
        <p v-if="namedListItems.length === 0" class="text-xs text-(--text2) col-span-2">Aucun espace de travail.</p>
    </div>

    <!-- list_threads : liste de salons cliquables -->
    <div v-else-if="tool.name === 'list_threads'" class="flex flex-col gap-2">
        <EntityRow
            v-for="th in namedListItems" :key="th.id"
            :icon="th.type === 'vocal' ? 'bi-volume-up-fill' : 'bi-hash'"
            :title="th.name"
            :subtitle="th.type === 'vocal' ? 'Salon vocal' : 'Salon textuel'"
            @click="router.push(`/${orgId}/${th.workspaceId || 'home'}/${th.id}`)"
        />
        <p v-if="namedListItems.length === 0" class="text-xs text-(--text2)">Aucun salon.</p>
    </div>

    <!-- list_members : grille de membres, clic = ouvrir la conversation privée -->
    <div v-else-if="tool.name === 'list_members'" class="grid grid-cols-2 gap-2">
        <EntityRow
            v-for="member in namedListItems" :key="member.id"
            :avatar-url="member.avatarUrl"
            :title="member.name"
            @click="router.push(`/${orgId}/chat/${member.id}`)"
        />
        <p v-if="namedListItems.length === 0" class="text-xs text-(--text2) col-span-2">Aucun membre.</p>
    </div>

    <!-- get_task : une seule carte -->
    <EntityRow
        v-else-if="tool.name === 'get_task' && singleTask"
        :icon="statusIcon(singleTask.status)"
        :title="singleTask.title"
        :subtitle="singleTask.description"
        @click="$emit('open-task', singleTask)"
    />

    <!-- read_tasks : toutes les tâches de l'utilisateur, à plat -->
    <div v-else-if="tool.name === 'read_tasks'" class="flex flex-col gap-2">
        <EntityRow
            v-for="task in flattenedTasks" :key="task.id"
            :icon="statusIcon(task.status)"
            :title="task.title"
            :subtitle="task.description"
            @click="$emit('open-task', task)"
        />
        <p v-if="flattenedTasks.length === 0" class="text-xs text-(--text2)">Aucune tâche.</p>
    </div>

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
import EntityRow from './EntityRow.vue';
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
const singleTask = computed(() => (props.tool.name === 'get_task' ? props.tool.result : null));

const namedListItems = computed<any[]>(() =>
    ['list_spaces', 'list_threads', 'list_members'].includes(props.tool.name) && Array.isArray(props.tool.result)
        ? props.tool.result
        : []
);

const flattenedTasks = computed<any[]>(() => {
    if (props.tool.name !== 'read_tasks' || !props.tool.result) return [];
    const { lists = [], unlistedTasks = [] } = props.tool.result;
    return [...unlistedTasks, ...lists.flatMap((l: any) => l.tasks || [])];
});

const prettyResult = computed(() => {
    try {
        return JSON.stringify(props.tool.result, null, 2);
    } catch {
        return String(props.tool.result);
    }
});

function isImageLogo(logo?: string) {
    return !!logo && logo.startsWith('data:image');
}

function statusIcon(status?: string) {
    if (status === 'DONE') return 'bi-check-circle-fill';
    if (status === 'IN_PROGRESS') return 'bi-arrow-repeat';
    return 'bi-circle';
}

function spaceAndThreadName(workspaceId: string, threadId: string) {
    const space = openedOrg.value?.spaces?.find((s) => s.id === workspaceId);
    const thread = space?.threads?.find((t) => t.id === threadId) || openedOrg.value?.home?.threads?.find((t) => t.id === threadId);
    return { spaceName: space?.name || 'Accueil', threadName: thread?.name || '?' };
}

function teleportTo(res: any) {
    router.push(`/${openedOrg.value?.id}/${res.workspaceId || 'home'}/${res.metadata?.threadId}?select=${res.id}`);
}

</script>
