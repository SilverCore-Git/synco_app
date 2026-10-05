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

    <!-- read_documentation (avec docId) : un seul chapitre, carte cliquable vers le rendu markdown -->
    <EntityRow
        v-else-if="tool.name === 'read_documentation' && readDoc"
        icon="bi-book"
        :title="readDoc.titre"
        :subtitle="sectionLabel(readDoc.section)"
        @click="openDoc(readDoc.id, readDoc.titre, readDoc.contenu)"
    />

    <!-- list_documentation, ou read_documentation sans docId : index des chapitres -->
    <div v-else-if="docChapters.length" class="flex flex-col gap-2">
        <EntityRow
            v-for="chap in docChapters" :key="chap.id"
            icon="bi-journals"
            :title="chap.title"
            :subtitle="chap.summary"
            @click="openDoc(chap.id, chap.title)"
        />
    </div>

    <!-- search_documentation : extraits cliquables vers le chapitre complet -->
    <div v-else-if="tool.name === 'search_documentation'" class="flex flex-col gap-2">
        <EntityRow
            v-for="hit in docSearchHits" :key="hit.docId + hit.heading"
            icon="bi-journal-text"
            :title="hit.title"
            :subtitle="hit.heading"
            @click="openDoc(hit.docId, hit.title)"
        />
        <p v-if="docSearchHits.length === 0" class="text-xs text-(--text2)">Aucun extrait trouvé.</p>
    </div>

    <!-- Erreur -->
    <p v-else-if="tool.status === 'error' || tool.result?.error" class="text-xs text-red-400">
        {{ tool.result?.error || 'Erreur lors de l\'exécution.' }}
    </p>

    <!-- Fallback générique -->
    <pre v-else-if="tool.result" class="text-xs text-(--text2) whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{{ prettyResult }}</pre>

    <!-- Documentation ouverte : contenu complet rendu en markdown -->
    <Window :is-open="!!openedDoc" :z-index="2500" @close="openedDoc = null">
        <div class="w-full h-full bg-(--bg) overflow-hidden flex flex-col">
            <div class="px-6 py-4 border-b border-(--bg2)/5 flex items-center gap-3 shrink-0">
                <i class="bi bi-book text-xl text-(--primary)"></i>
                <h3 class="text-lg font-semibold text-(--text) truncate">{{ openedDoc?.title }}</h3>
            </div>
            <div class="flex-1 overflow-hidden relative">
                <div v-if="loadingDocId" class="absolute inset-0 flex items-center justify-center">
                    <div class="w-8 h-8 rounded-full border-2 border-(--primary) border-t-transparent animate-spin"></div>
                </div>
                <MarkdownDocumentPreview v-else-if="openedDoc" :content="openedDoc.content" />
            </div>
        </div>
    </Window>

</template>

<script setup lang="ts">

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ToolStep } from './agentTypes';
import ThreadMessage from '../common/ThreadMessage.vue';
import EntityRow from './EntityRow.vue';
import Window from '@/components/windows/Window.vue';
import MarkdownDocumentPreview from '../popup/MarkdownDocumentPreview.vue';
import { readDocumentation, type DocSection } from '@/services/DocumentationService';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';

const props = defineProps<{ tool: ToolStep }>();
defineEmits(['open-task']);

const route = useRoute();
const router = useRouter();
const orgId = route.params.orgId as string;
const toast = useToast();

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

// read_documentation renvoie soit un chapitre complet (`contenu` présent), soit
// l'index (`chapitres`) quand l'IA n'a pas précisé de `docId`.
const readDoc = computed(() => (props.tool.name === 'read_documentation' && props.tool.result?.contenu ? props.tool.result : null));
const docChapters = computed<any[]>(() => (!readDoc.value && Array.isArray(props.tool.result?.chapitres) ? props.tool.result.chapitres : []));
const docSearchHits = computed<any[]>(() => (props.tool.name === 'search_documentation' ? props.tool.result?.resultats || [] : []));

function sectionLabel(section?: DocSection) {
    return section === 'securite' ? 'Sécurité' : 'Guide';
}

// Carte doc déjà lue par l'agent (contenu fourni) ou juste listée (contenu à
// charger à la demande, au clic) : les deux ouvrent la même fenêtre de lecture.
const openedDoc = ref<{ title: string; content: string } | null>(null);
const loadingDocId = ref<string | null>(null);

async function openDoc(docId: string, title: string, content?: string) {
    if (content) {
        openedDoc.value = { title, content };
        return;
    }
    loadingDocId.value = docId;
    openedDoc.value = { title, content: '' };
    try {
        const doc = await readDocumentation(docId);
        openedDoc.value = { title: doc.title, content: doc.content };
    } catch (err) {
        openedDoc.value = null;
        toast.show(err instanceof Error ? err.message : 'Erreur lors du chargement de la documentation.', 'error');
    } finally {
        loadingDocId.value = null;
    }
}

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
