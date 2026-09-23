<template>
    <div>
        <div
            v-if="renderedHtml"
            ref="rootRef"
            class="markdown-body text-sm leading-relaxed wrap-break-word"
            v-html="renderedHtml"
            @click="onClick"
        />

        <div v-if="blockRefs.taskIds.length || blockRefs.fileIds.length" class="flex flex-col gap-2 mt-2">

            <template v-for="id in blockRefs.taskIds" :key="'task-' + id">
                <TaskCard
                    v-if="taskCardState(id).status === 'ok'"
                    :task="taskCardState(id).task!"
                    class="cursor-pointer"
                    @click="onTaskCardClick(taskCardState(id).task!)"
                />
                <span v-else class="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/8 text-(--text2)">
                    <i class="bi bi-check2-square"></i>
                    {{ taskCardState(id).status === 'error' ? 'Tâche inaccessible' : 'Chargement…' }}
                </span>
            </template>

            <template v-for="id in blockRefs.fileIds" :key="'file-' + id">
                <FileCard
                    v-if="fileCardState(id).status === 'ok'"
                    :file="fileCardState(id).file!"
                    :dragged-file-id="null"
                />
                <span v-else class="inline-flex w-fit items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-white/8 text-(--text2)">
                    <i class="bi bi-file-earmark-fill"></i>
                    {{ fileCardState(id).status === 'error' ? 'Fichier inaccessible' : 'Chargement…' }}
                </span>
            </template>

        </div>
    </div>
</template>

<script setup lang="ts">

import { computed, ref, reactive, watch, nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { buildMentionLookup, renderMentions, handleMentionClick } from '@/composables/useMentions';
import {
  renderReferences, buildLocalUserResolutions, seedResolveCache, handleReferenceChipClick,
  escapeReferenceTokensForMarkdown, stripBlockReferenceTokens, extractReferenceTokens,
  type ExtractedReference, type ResolvedReference, type ResolveBatchFn,
} from '@/composables/useReferences';
import { navigateToReference } from '@/composables/useReferenceNavigation';
import { renderTimestampTokens } from '@/composables/useTimestampTokens';
import TaskCard from '@/views/OrgSpace/components/SpaceTasks/TaskCard.vue';
import FileCard from '@/views/OrgSpace/components/SpaceFiles/FileCard.vue';
import type { User, Task, StoredFile } from '@/types/types';

const props = withDefaults(defineProps<{
  content: string;
  // 'chat': bulles de message (compact, pas d'images/tableaux). 'document':
  // fichier markdown du file manager (moins restrictif).
  mode?: 'chat' | 'document';
  // Désactive le rendu des chips @/#/!/& et des timestamps <t:...> — utile
  // pour un contenu qui n'en contiendra jamais par construction.
  enableReferences?: boolean;
  // false pour les rendus compacts (aperçu de réponse en line-clamp-1) : les
  // références tâche/fichier restent en chip inline au lieu de la vraie
  // TaskCard/FileCard, bien trop grande pour tenir dans un aperçu.
  showReferenceCards?: boolean;
}>(), {
  mode: 'chat',
  enableReferences: true,
  showReferenceCards: true,
});

const emit = defineEmits<{
  (e: 'user-click', user: User, event: MouseEvent): void;
  (e: 'reference-click', ref: { kind: 'thread' | 'task' | 'file'; id: string; spaceId?: string }, event: MouseEvent): void;
}>();

const router = useRouter();

marked.setOptions({
  breaks: true,
  gfm: true,
});

// Register DOMPurify hook once at module level (not per computed evaluation)
DOMPurify.addHook('afterSanitizeAttributes', function(node) {
    if ('target' in node) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.tagName === 'IMG') {
        node.setAttribute('loading', 'lazy');
        node.setAttribute('decoding', 'async');
    }
});

const CHAT_ALLOWED_TAGS = [
    'p', 'br', 'strong', 'em', 'del', 'code', 'pre',
    'ul', 'ol', 'li', 'blockquote', 'a', 'h1', 'h2', 'h3'
];

// Un document markdown (file manager) a des besoins plus larges qu'un
// message de chat : titres profonds, tableaux, images, séparateurs, cases
// à cocher GFM. Rien qui permette des gestionnaires d'événements ou du CSS.
const DOCUMENT_ALLOWED_TAGS = [
    ...CHAT_ALLOWED_TAGS,
    'h4', 'h5', 'h6', 'hr', 'img', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'input'
];

const ALLOWED_URI_REGEXP = /^(?:(?:https?|mailto):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

const sanitizeOptions = computed(() => props.mode === 'document' ? {
    ALLOWED_TAGS: DOCUMENT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'class', 'rel', 'src', 'alt', 'title', 'type', 'checked', 'disabled', 'align'],
    ALLOWED_URI_REGEXP
} : {
    ALLOWED_TAGS: CHAT_ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'target', 'class', 'rel'],
    ALLOWED_URI_REGEXP
});

// task/file sont affichés à part, via les vrais TaskCard.vue/FileCard.vue
// (v-for plus bas), pas inline dans le texte — trop riches pour tenir dans
// un flux de paragraphe. On les retire donc du markdown source avant de le
// passer à `marked` (uniquement quand showReferenceCards, sinon — aperçus
// compacts — ils restent en place pour finir en chip). Puis, dans tous les
// cas, on échappe ce qui reste (@/#/role, + task/file quand ils n'ont pas
// été retirés) : `marked` (CommonMark) prend <scheme:...> pour un autolink
// dès que le "scheme" fait ≥2 lettres — vrai pour "task"/"file"/"role", pas
// pour "@"/"#" — et le transforme en <a href="task:id"> avant même que
// renderReferences ait pu voir le token. Oublier cette 2e passe après le
// strip est exactement le bug qui faisait ressortir <role:id> en lien brut.
const textSourceContent = computed(() => {
  if (!props.enableReferences) return props.content;
  const withoutBlocks = props.showReferenceCards ? stripBlockReferenceTokens(props.content) : props.content;
  return escapeReferenceTokensForMarkdown(withoutBlocks);
});

const blockRefs = computed(() => {
  if (!props.enableReferences || !props.showReferenceCards) return { taskIds: [] as string[], fileIds: [] as string[] };
  const refs = extractReferenceTokens(props.content);
  const taskIds: string[] = [];
  const fileIds: string[] = [];
  for (const r of refs) {
    if (r.type === 'task') taskIds.push(r.id);
    else if (r.type === 'file') fileIds.push(r.id);
  }
  return { taskIds, fileIds };
});

// Simple cache to avoid re-parsing identical markdown content, namespaced by
// mode so a 'chat' render of some text can't be reused for 'document' (and
// vice versa) even if the raw content string happens to match.
const htmlCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

const renderedHtml = computed(() => {

    const source = textSourceContent.value;
    if (!source) return '';

    const cacheKey = `${props.mode}:${props.showReferenceCards}:${source}`;
    const cached = htmlCache.get(cacheKey);
    if (cached) return cached;

    const rawHtml = marked.parse(source) as string;
    const sanitized = DOMPurify.sanitize(rawHtml, sanitizeOptions.value);

    // Evict oldest entries if cache grows too large
    if (htmlCache.size >= MAX_CACHE_SIZE) {
        const firstKey = htmlCache.keys().next().value;
        if (firstKey) htmlCache.delete(firstKey);
    }
    htmlCache.set(cacheKey, sanitized);

    return sanitized;
});

const rootRef = ref<HTMLElement | null>(null);
const mentionLookup = computed(() => buildMentionLookup(openedOrg.value?.members));

const resolveBatch: ResolveBatchFn = async (items: ExtractedReference[]) => {
  const orgId = openedOrg.value?.id;
  const map = new Map<string, ResolvedReference>();
  if (!orgId || items.length === 0) return map;

  try {
    const res = await sfetch('/api/mentions/resolve', {
      method: 'POST',
      body: JSON.stringify({ orgId, items }),
    });
    if (!res.ok) return map;
    const data = await res.json();
    for (const item of data.items || []) {
      // Le backend n'envoie jamais `label` quand ok=false (anti-fuite : rien
      // sur la ressource à un lecteur sans accès) — retomber sur `item.id`
      // affichait l'UUID brut dans le chip restreint au lieu d'un message
      // clair signalant l'absence d'accès.
      map.set(`${item.type}:${item.id}`, {
        label: item.ok ? (item.label ?? item.id) : 'Accès refusé',
        ok: !!item.ok,
        spaceId: item.spaceId,
      });
    }
  } catch (err) {
    console.error('[MarkdownRender] Failed to resolve references:', err);
  }

  return map;
};

// Deux passes indépendantes : l'ancien format @pseudo texte brut (compat
// historique, jamais bloquant) puis les nouveaux tokens <@:id>/<#:id> + <t:...>
// (task/file sont retirés du texte plus haut, gérés par blockRefs). Les
// tokens du nouveau format n'ont jamais la forme "@mot" seule donc les deux
// passes ne peuvent pas se marcher dessus.
const applyPostProcessing = async () => {
  const root = rootRef.value;
  if (!root) return;

  renderMentions(root, mentionLookup.value);

  if (!props.enableReferences) return;

  seedResolveCache(buildLocalUserResolutions(openedOrg.value?.members));
  await renderReferences(root, resolveBatch);
  renderTimestampTokens(root);
};

const onClick = (event: MouseEvent) => {
  handleMentionClick(event, mentionLookup.value, (user, e) => emit('user-click', user, e));

  const chip = handleReferenceChipClick(event);
  if (!chip) return;

  if (chip.kind === 'user') {
    const user = mentionLookup.value.usersById.get(chip.id);
    if (user) emit('user-click', user, event);
    return;
  }

  // Une référence de rôle (<role:id>) n'a pas de destination de navigation
  // (pas une entité comme thread/task/file, cf. useReferenceNavigation.ts) —
  // rien à faire au clic. Check positif (plutôt qu'exclure 'user'/'role')
  // pour que TS narrowe chip.kind exactement à la forme attendue par l'event.
  if (chip.kind !== 'thread' && chip.kind !== 'task' && chip.kind !== 'file') return;

  // Reconstruire l'objet plutôt que de passer `chip` tel quel : narrower
  // `chip.kind` sur les lectures ci-dessus ne narrowe pas le type de `chip`
  // dans son ensemble (kind n'est pas le discriminant d'une union de formes,
  // juste une propriété union sur une forme unique) — TS le voit donc encore
  // comme `ReferenceKind` complet si on lui passe `chip` directement.
  emit('reference-click', { kind: chip.kind, id: chip.id, spaceId: chip.spaceId }, event);
};

watch(() => renderedHtml.value, () => {
  nextTick(() => applyPostProcessing());
});

onMounted(() => {
  nextTick(() => applyPostProcessing());
});

// --- Cartes bloc tâche/fichier : vrais TaskCard.vue/FileCard.vue, pas une
// reconstruction en HTML/CSS. Il leur faut l'objet complet (tags, assignees,
// _count... pour Task ; _count.filePermissions... pour StoredFile), pas le
// {label, spaceId} léger de /mentions/resolve — d'où les fetchs dédiés
// ci-dessous plutôt que resolveBatch. Cache mémoire partagé entre instances
// (même principe que resolveCache dans useReferences.ts) pour ne pas
// refetcher la même tâche/fichier à chaque message qui la référence.
type CardStatus = 'loading' | 'ok' | 'error';
const taskCardCache = new Map<string, Task>();
const fileCardCache = new Map<string, StoredFile>();
const taskStates = reactive(new Map<string, { status: CardStatus; task?: Task }>());
const fileStates = reactive(new Map<string, { status: CardStatus; file?: StoredFile }>());

const taskCardState = (id: string) => taskStates.get(id) ?? { status: 'loading' as CardStatus };
const fileCardState = (id: string) => fileStates.get(id) ?? { status: 'loading' as CardStatus };

const loadTaskCard = async (id: string) => {
  if (taskStates.has(id)) return;
  const cached = taskCardCache.get(id);
  if (cached) { taskStates.set(id, { status: 'ok', task: cached }); return; }

  const orgId = openedOrg.value?.id;
  if (!orgId) return;

  taskStates.set(id, { status: 'loading' });
  try {
    const res = await sfetch(`/api/tasks/${orgId}/tasks/${id}`);
    if (!res.ok) { taskStates.set(id, { status: 'error' }); return; }
    const task: Task = await res.json();
    taskCardCache.set(id, task);
    taskStates.set(id, { status: 'ok', task });
  } catch (err) {
    console.error('[MarkdownRender] Failed to load task card:', err);
    taskStates.set(id, { status: 'error' });
  }
};

const loadFileCard = async (id: string) => {
  if (fileStates.has(id)) return;
  const cached = fileCardCache.get(id);
  if (cached) { fileStates.set(id, { status: 'ok', file: cached }); return; }

  const orgId = openedOrg.value?.id;
  if (!orgId) return;

  fileStates.set(id, { status: 'loading' });
  try {
    const res = await sfetch(`/api/mentions/file/${id}?orgId=${orgId}`);
    if (!res.ok) { fileStates.set(id, { status: 'error' }); return; }
    const file: StoredFile = await res.json();
    fileCardCache.set(id, file);
    fileStates.set(id, { status: 'ok', file });
  } catch (err) {
    console.error('[MarkdownRender] Failed to load file card:', err);
    fileStates.set(id, { status: 'error' });
  }
};

watch(blockRefs, (refs) => {
  refs.taskIds.forEach(loadTaskCard);
  refs.fileIds.forEach(loadFileCard);
}, { immediate: true });

// TaskCard n'a pas de comportement de clic propre (voir son template, c'est
// un composant d'affichage pur) — même destination que le chip précédent :
// la page où vit la tâche. FileCard, lui, gère déjà son propre clic (ouvre
// son FileViewer interne), donc rien à wire ici pour les fichiers.
const onTaskCardClick = (task: Task) => {
  navigateToReference(router, { kind: 'task', id: task.id, spaceId: task.spaceId ?? undefined });
};

</script>

<style scoped>

.markdown-body :deep(p) {
  margin-bottom: 0.5rem;
}
.markdown-body :deep(p:last-child) {
  margin-bottom: 0;
}

.markdown-body :deep(code:not(pre code)) {
  background-color: rgba(255, 255, 255, 0.08);
  color: #ff79c6;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  font-family: monospace;
  font-size: 85%;
}

.markdown-body :deep(pre) {
  background-color: rgba(0, 0, 0, 0.3);
  border: 1px border;
  border-color: rgba(255, 255, 255, 0.05);
  padding: 0.75rem;
  border-radius: 8px;
  overflow-x: auto;
  font-family: monospace;
  margin: 0.5rem 0;
}

.markdown-body :deep(pre code) {
  color: #e2e8f0;
  font-size: 0.875rem;
  background: none;
  padding: 0;
}

.markdown-body :deep(a) {
  color: var(--primary, #3b82f6);
  text-decoration: underline;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
}
.markdown-body :deep(ol) {
  list-style-type: decimal;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--primary, #3b82f6);
  background-color: rgba(255, 255, 255, 0.03);
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
  color: rgba(255, 255, 255, 0.7);
  border-radius: 0 4px 4px 0;
}

.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3) {
  color: #ffffff;
  font-weight: 800;
  line-height: 1.3;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(h1) {
  font-size: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 0.3rem;
}

.markdown-body :deep(h2) {
  font-size: 1.25rem;
}

.markdown-body :deep(h3) {
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
}

.markdown-body :deep(h1:first-child),
.markdown-body :deep(h2:first-child),
.markdown-body :deep(h3:first-child) {
  margin-top: 0;
}

.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  line-height: 1.3;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin: 1rem 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  border-radius: 8px;
  margin: 0.5rem 0;
}

.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.5rem 0;
  font-size: 0.9em;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.4rem 0.6rem;
  text-align: left;
}

.markdown-body :deep(th) {
  background-color: rgba(255, 255, 255, 0.05);
  font-weight: 700;
}

.markdown-body :deep(.reference-chip) {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.4rem;
  margin: 0 0.1rem;
  border-radius: 0.375rem;
  font-weight: 600;
  background-color: var(--primary-dark);
  color: white;
  cursor: pointer;
  transition: filter 0.2s;
}

.markdown-body :deep(.reference-chip:hover) {
  filter: brightness(1.2);
}

.markdown-body :deep(.reference-chip--restricted) {
  background-color: rgba(255, 255, 255, 0.08);
  color: var(--text2, rgba(255, 255, 255, 0.6));
  cursor: default;
}

.markdown-body :deep(.reference-chip--restricted:hover) {
  filter: none;
}

.markdown-body :deep(.timestamp-token) {
  font-weight: 600;
  color: var(--primary, #3b82f6);
  border-bottom: 1px dotted currentColor;
  cursor: default;
}

</style>
