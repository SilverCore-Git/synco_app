<template>
  <div class="h-full flex flex-col w-full relative">

    <!-- Main Chat Area -->
    <div class="flex-1 flex flex-col relative h-full">

      <!-- Header -->
      <div
        class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-(--border-color) bg-(--bg2) z-10 shrink-0">
        <div class="flex items-center gap-3">
          <MobileBackBtn />
        </div>

        <div class="flex items-center gap-3">
          <span
            v-if="cumulativeUsage.totalTokens > 0"
            class="text-[11px] font-medium text-(--text2) bg-(--text)/5 px-2 py-1 rounded-full"
            title="Total de tokens utilisés dans cette conversation"
          >
            {{ formatTokenCount(cumulativeUsage.totalTokens) }} tokens
          </span>
          <button @click="showUsersBar = !showUsersBar" class="hover:text-(--text) transition-colors ml-2"
            :class="showUsersBar ? 'text-(--text)' : 'text-(--text2)'">
            <i class="bi bi-people-fill text-lg" />
          </button>
        </div>
      </div>

      <!-- Chat Container -->
      <div class="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col w-full max-w-5xl mx-auto" ref="chatContainer"
        @scroll="onChatScroll">

        <!-- Welcome Message -->
        <div v-if="messages.length === 0"
          class="flex-1 flex flex-col items-center justify-center text-center px-4">

          <h3 class="text-2xl font-bold text-(--text) mb-3 tracking-wide">Bonjour, je suis Synco AI.</h3>

          <p class="max-w-md text-sm text-(--text2) leading-relaxed mb-8">
            <template v-if="aiIsLocal">
              Je tourne entièrement en local sur votre machine. Posez-moi vos questions, demandez-moi d'analyser vos
              ressources ou de rédiger des textes, le tout en préservant 100% de votre vie privée.
            </template>
            <template v-else>
              Posez-moi vos questions, demandez-moi d'analyser vos ressources ou de rédiger des textes.
            </template>
          </p>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl">
            <button
              v-for="suggestion in suggestions"
              :key="suggestion.label"
              @click="useSuggestion(suggestion.prompt)"
              class="flex flex-col items-start gap-2 p-4 rounded-2xl text-left bg-(--bg2) border border-(--border-color) hover:border-(--primary)/50 hover:bg-(--primary)/5 transition-all"
            >
              <i class="bi text-lg text-(--primary)" :class="suggestion.icon"></i>
              <span class="text-xs font-medium text-(--text) leading-snug">{{ suggestion.label }}</span>
            </button>
          </div>

        </div>

        <!-- Messages -->
        <div v-for="(msg, index) in messages" :key="index"
          v-show="msg.role !== 'system' && !(msg.role === 'user' && msg.content && msg.content.startsWith('[SYSTEM]'))"
          class="flex w-full" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">

          <!-- User message: light bubble, right-aligned -->
          <div v-if="msg.role === 'user'" class="max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-(--primary)/15 border border-(--primary)/20">
            <div @click="handleLinks" class="prose prose-invert max-w-none prose-sm">
              <MarkdownRender :content="cleanAiContent(msg.content)" mode="chat" />
            </div>
          </div>

          <!-- Assistant turn: new agent loop (OpenAI/Mistral/Gemini) — structured parts, Claude-like -->
          <div v-else-if="msg.viaAgentLoop" class="w-full text-sm leading-relaxed text-(--text)">
            <AgentTurn
              :parts="msg.parts || []"
              :is-generating="isGenerating && index === messages.length - 1"
              @open-task="(t) => selectedTask = t"
            />
            <p v-if="msg.usage" class="text-[11px] text-(--text2)/70 mt-1">
              {{ formatTokenCount(msg.usage.totalTokens) }} tokens<template v-if="msg.usage.reasoningTokens"> (dont {{ formatTokenCount(msg.usage.reasoningTokens) }} de raisonnement)</template>
            </p>
          </div>

          <!-- Assistant turn: legacy path (local/custom, migration pending) -->
          <div v-else class="w-full text-sm leading-relaxed text-(--text)">
            <div v-if="msg.content" @click="handleLinks" class="prose prose-invert max-w-none prose-sm">
              <MarkdownRender :content="cleanAiContent(msg.content)" mode="chat" />
            </div>
            <div v-else-if="isGenerating && !msg.tool_call" class="flex gap-1 py-2">
              <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
              <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
              <div class="w-1.5 h-1.5 bg-(--text2)/60 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
            </div>

            <!-- Tool Call Widget (legacy) -->
            <div v-if="msg.tool_call" class="mt-3 bg-(--bg2)/60 border border-(--text)/10 rounded-xl p-4">
              <div class="flex items-center gap-2 mb-2 text-(--primary) font-bold text-xs uppercase">
                <i class="bi bi-search" v-if="msg.tool_call.name === 'search_messages'"></i>
                <i class="bi bi-book" v-else-if="isDocumentationTool(msg.tool_call.name)"></i>
                <i class="bi bi-check2-square" v-else-if="msg.tool_call.name === 'read_tasks'"></i>
                <i class="bi bi-wrench-adjustable-circle" v-else></i>
                {{ msg.tool_call.name === 'search_messages' ? 'Recherche Globale' :
                  isDocumentationTool(msg.tool_call.name) ? 'Consultation de la documentation' :
                  msg.tool_call.name === 'read_tasks' ? 'Lecture des tâches' : "Demande d'action" }}
              </div>

              <p class="text-sm" v-if="msg.tool_call.name === 'search_messages'">
                Je fouille dans tous vos espaces pour trouver :
                <span class="text-(--text) font-bold inline-block bg-(--text)/10 px-2 py-0.5 rounded ml-1">
                  "{{ getSearchQuery(msg.tool_call.arguments) }}"
                </span>
              </p>
              <p class="text-sm" v-else-if="isDocumentationTool(msg.tool_call.name)">
                Je consulte la documentation officielle de Synco pour vous répondre avec précision.
              </p>
              <p class="text-sm" v-else-if="msg.tool_call.name === 'read_tasks'">
                Je consulte votre liste de tâches et son état d'avancement.
              </p>
              <p class="text-sm" v-else>
                Exécution de <code
                  class="bg-black/50 px-2 py-1 rounded text-(--primary) font-bold">{{ msg.tool_call.name }}</code>
              </p>

              <!-- Confirmation/réponse déplacée dans PendingActionBar, au-dessus de la zone de saisie. -->
              <div class="mt-4 text-(--text2) text-xs font-medium flex items-center gap-2" v-if="msg.tool_call.status === 'pending'">
                <i class="bi bi-hourglass-split"></i>
                En attente de ta confirmation ci-dessous...
              </div>
              <div v-else-if="msg.tool_call.status === 'executing'"
                class="text-(--primary) text-xs font-bold mt-3 flex items-center gap-2">
                <div class="w-3 h-3 border-2 border-(--primary) border-t-transparent rounded-full animate-spin"></div>
                Exécution en cours...
              </div>
              <div v-else-if="msg.tool_call.status === 'accepted'" class="text-green-500 text-xs font-bold mt-3"><i
                  class="bi bi-check-lg mr-1"></i> Action acceptée et exécutée.</div>
              <div v-else-if="msg.tool_call.status === 'rejected'" class="text-red-500 text-xs font-bold mt-3"><i
                  class="bi bi-x-lg mr-1"></i> Action refusée.</div>

              <!-- Tool Results UI Rendering -->
              <div
                v-if="msg.tool_call.status === 'accepted' && messages[index + 1]?.tool_data?.name === 'search_messages' && messages[index + 1]?.tool_data?.results?.length > 0"
                class="mt-4 flex flex-col gap-4 pt-4 border-t border-(--text)/10">
                <div class="text-xs text-(--text)/50 uppercase font-bold tracking-wider">Résultats trouvés :</div>
                <div v-for="res in messages[index + 1]?.tool_data?.results" :key="res.id"
                  class="bg-black/30 border border-(--border-color) rounded-xl overflow-hidden">
                  <div
                    class="px-3 py-2 bg-(--text)/5 border-b border-(--border-color) flex justify-between items-center text-[10px] text-(--text)/50 uppercase font-bold tracking-wider">
                    <div class="flex items-center gap-1.5 truncate pr-2">
                      <i class="bi bi-folder2-open"></i>
                      <span class="truncate">{{ getSpaceAndThreadName(res.workspaceId, res.metadata?.threadId).spaceName
                        }}</span>
                      <i class="bi bi-chevron-right text-[8px] opacity-50"></i>
                      <i class="bi bi-hash"></i>
                      <span class="truncate">{{ getSpaceAndThreadName(res.workspaceId,
                        res.metadata?.threadId).threadName }}</span>
                    </div>
                    <button
                      @click="router.push(`/${openedOrg?.id}/${res.workspaceId}/${res.metadata?.threadId}?select=${res.id}`)"
                      class="text-(--primary) hover:text-(--primary-hover) transition-colors flex items-center shrink-0">
                      <i class="bi bi-box-arrow-up-right mr-1"></i> Se téléporter
                    </button>
                  </div>
                  <ThreadMessage :msg="{
                    id: res.id,
                    content: res.textContent,
                    createdAt: res.metadata?.createdAt ? new Date(res.metadata.createdAt) : new Date(),
                    sender: { name: res.metadata?.senderName || 'Auteur inconnu', avatarUrl: res.metadata?.senderAvatar, id: 'unknown' },
                    threadId: res.metadata?.threadId,
                    reactions: {}
                  } as any" :isReadOnly="true"
                    @select="router.push(`/${openedOrg?.id}/${res.workspaceId}/${res.metadata?.threadId}?select=${res.id}`)" />
                </div>
              </div>

              <!-- Created Task Snippet -->
              <div
                v-if="msg.tool_call.status === 'accepted' && messages[index + 1]?.tool_data?.name === 'create_task' && messages[index + 1]?.tool_data?.results"
                class="mt-4 pt-4 border-t border-(--text)/10">
                <div
                  class="w-full bg-black/30 border border-(--text)/10 p-4 rounded-xl cursor-pointer hover:border-(--primary)/50 transition-all shadow-lg group relative overflow-hidden flex justify-between items-center"
                  @click="selectedTask = messages[index + 1]?.tool_data?.results">
                  <div class="flex items-center gap-3">
                    <i class="bi bi-circle text-gray-400 text-xl"></i>
                    <div>
                      <p class="text-sm font-bold text-(--text) leading-snug">{{
                        messages[index + 1]?.tool_data?.results.title }}</p>
                      <p class="text-xs text-(--text)/40 mt-0.5" v-if="messages[index + 1]?.tool_data?.results.description">
                        {{ messages[index + 1]?.tool_data?.results.description.substring(0, 50) }}{{
                          messages[index + 1]?.tool_data?.results.description.length > 50 ? '...' : '' }}</p>
                    </div>
                  </div>
                  <button
                    class="text-xs bg-(--text)/5 hover:bg-(--text)/10 text-(--text) font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-2 shrink-0">
                    Ouvrir
                    <i class="bi bi-box-arrow-up-right"></i>
                  </button>
                </div>
              </div>

              <!-- Created Space Snippet -->
              <div
                v-if="msg.tool_call.status === 'accepted' && messages[index + 1]?.tool_data?.name === 'create_space' && messages[index + 1]?.tool_data?.results"
                class="mt-4 pt-4 border-t border-(--text)/10">
                <div
                  class="w-full bg-black/30 border border-(--text)/10 p-4 rounded-xl cursor-pointer hover:border-(--primary)/50 transition-all shadow-lg group relative overflow-hidden flex justify-between items-center"
                  @click="router.push(`/${openedOrg?.id}/${messages[index + 1]?.tool_data?.results.id}/`)">
                  <div class="flex items-center gap-3">
                    <img v-if="messages[index + 1]?.tool_data?.results.logo?.startsWith('data:image')"
                      :src="messages[index + 1]?.tool_data?.results.logo" class="w-8 h-8 rounded-md object-cover" />
                    <i v-else class="bi text-xl text-(--primary)"
                      :class="messages[index + 1]?.tool_data?.results.logo || 'bi-folder'"></i>
                    <div>
                      <p class="text-sm font-bold text-(--text) leading-snug">{{
                        messages[index + 1]?.tool_data?.results.name }}</p>
                      <p class="text-xs text-(--text)/40 mt-0.5">Espace de travail</p>
                    </div>
                  </div>
                  <button
                    class="text-xs bg-(--text)/5 hover:bg-(--text)/10 text-(--text) font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-2 shrink-0">
                    Ouvrir
                    <i class="bi bi-box-arrow-up-right"></i>
                  </button>
                </div>
              </div>

              <!-- Created Thread Snippet -->
              <div
                v-if="msg.tool_call.status === 'accepted' && messages[index + 1]?.tool_data?.name === 'create_thread' && messages[index + 1]?.tool_data?.results"
                class="mt-4 pt-4 border-t border-(--text)/10 flex flex-col gap-2">
                <div v-for="th in messages[index + 1]?.tool_data?.results" :key="th.id"
                  class="w-full bg-black/30 border border-(--text)/10 p-4 rounded-xl cursor-pointer hover:border-(--primary)/50 transition-all shadow-lg group relative overflow-hidden flex justify-between items-center"
                  @click="router.push(`/${openedOrg?.id}/${th.workspaceId || 'home'}/${th.id}`)">
                  <div class="flex items-center gap-3">
                    <i class="bi text-xl text-(--primary)"
                      :class="th.type === 'vocal' ? 'bi-volume-up-fill' : 'bi-hash'"></i>
                    <div>
                      <p class="text-sm font-bold text-(--text) leading-snug">{{ th.name }}</p>
                      <p class="text-xs text-(--text)/40 mt-0.5">Salon {{ th.type === 'vocal' ? 'vocal' : 'textuel' }}</p>
                    </div>
                  </div>
                  <button
                    class="text-xs bg-(--text)/5 hover:bg-(--text)/10 text-(--text) font-bold py-1.5 px-3 rounded-lg transition-colors flex items-center gap-2 shrink-0">
                    Rejoindre
                    <i class="bi bi-box-arrow-up-right"></i>
                  </button>
                </div>
              </div>

            </div>

            <p v-if="msg.usage" class="text-[11px] text-(--text2)/70 mt-1">
              {{ formatTokenCount(msg.usage.totalTokens) }} tokens<template v-if="msg.usage.reasoningTokens"> (dont {{ formatTokenCount(msg.usage.reasoningTokens) }} de raisonnement)</template>
            </p>
          </div>
        </div>
      </div>

      <!-- Scroll to bottom -->
      <Transition name="fade">
        <button
          v-if="showScrollToBottom"
          @click="scrollToBottom()"
          class="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 w-9 h-9 rounded-full bg-(--bg2) border border-(--border-color) shadow-lg flex items-center justify-center text-(--text2) hover:text-(--text) hover:border-(--primary)/40 transition-colors"
          title="Aller en bas"
        >
          <i class="bi bi-arrow-down text-sm"></i>
        </button>
      </Transition>

      <LocalModelPanel v-if="aiIsLocal && aiPrefsReady" />

      <div class="p-1 border-t border-(--border-color) shrink-0 relative">

        <Transition name="fade-slide-in-up">
          <div v-if="pendingAction" :key="pendingAction.tool.toolCallId" class="w-full max-w-5xl mx-auto mb-2">
            <PendingActionBar
              :tool="pendingAction.tool"
              @accept="acceptPendingAction()"
              @always-accept="acceptPendingAction(true)"
              @reject="rejectPendingAction()"
              @answer="(value) => acceptPendingAction(false, value)"
              @image="(base64) => acceptPendingAction(false, base64)"
            />
          </div>
        </Transition>

        <AiComposerControls :busy="isGenerating" />

        <form @submit.prevent="sendMessage"
          class="relative w-full max-w-5xl mx-auto flex items-end gap-3 border border-(--text)/10 rounded-xl px-4 py-2 transition-all shadow-2xl"
          :class="(!canType || isGenerating) ? 'bg-black/50 opacity-50 cursor-not-allowed' : 'bg-(--bg) focus-within:border-(--primary)/50'">

          <ThreadTextarea ref="chatInputRef" v-model="inputMsg" placeholder="Demandez-moi n'importe quoi..."
            :disabled="!canType || isGenerating" @send="sendMessage" />

          <button type="button" @click="isGenerating ? stopGeneration() : sendMessage()"
            class="shrink-0 mb-1 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
            :class="isGenerating ? 'text-red-500 hover:text-red-400' : 'text-(--primary) hover:brightness-110'"
            :disabled="!canType || (!inputMsg.trim() && !isGenerating)">
            <i :class="isGenerating ? 'bi-stop-fill text-xl' : 'bi-send-fill text-xl'"></i>
          </button>

        </form>
      </div>

      <TaskDetailsModal :task="selectedTask" :isOpen="!!selectedTask" @close="selectedTask = null" />

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, toRaw, type Ref } from 'vue';
import { localLLM } from '@/services/LocalLLMService';
import { aiService, aiIsLocal, aiIsClientDriven, aiPrefsReady, aiSessionMessages, syncSession, fetchSessions, activeSessionId, setEncryptedSessionTitle, clientAgentTurn, resumeClientAgent } from '@/services/AIService';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import ThreadMessage from '../components/common/ThreadMessage.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import AgentTurn from '../components/ai/AgentTurn.vue';
import PendingActionBar from '../components/ai/PendingActionBar.vue';
import LocalModelPanel from '../components/ai/LocalModelPanel.vue';
import AiComposerControls from '../components/ai/AiComposerControls.vue';
import { recordUsage } from '@/services/aiUsageStats';
import MarkdownRender from './MarkdownRender.vue';
import type { TurnPart, ToolStep } from '../components/ai/agentTypes';
import { useUsersBar } from '@/composables/useUsersBar';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
import sfetch from '@/assets/utils/sfetch';
import globalVectorWorker from '@/services/GlobalVectorWorker';

import { localSearchDB } from '@/services/LocalSearchVectorDB';
import { SearchSyncService } from '@/services/SearchSyncService';
import { generateThreadKey, encryptThreadKeyForMember, privateKey } from '@/assets/utils/crypto';
import { resolveRecipientKey } from '@/assets/utils/keyTrust';
import { openedOrg, user } from '@/assets/var';
import { createFolderRequest, createTextFile } from '@/services/fileActions';
import { isDocumentationTool, runDocumentationTool } from '@/services/DocumentationService';

const { showUsersBar } = useUsersBar();

// Le rendu markdown passe par MarkdownRender.vue (partagé avec le chat/les
// tâches) — il ne reste ici que le nettoyage spécifique à l'IA : les blocs
// <tool_call> internes ne doivent jamais apparaître dans le texte affiché.
// <think> est un filet de sécurité pour une balise mal fermée qui aurait
// échappé à l'extraction dédiée (Phase 3) — pas le chemin normal.
const cleanAiContent = (text: string) => text
  .replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '')
  .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '');

const handleLinks = (e: MouseEvent) => {
  const target = (e.target as HTMLElement).closest('a');
  if (target) {
    const href = target.getAttribute('href');
    if (href && href.startsWith('/')) {
      e.preventDefault();
      router.push(href);
    }
  }
};

const getSpaceAndThreadName = (workspaceId: string, threadId: string) => {
  if (!openedOrg.value || !openedOrg.value.spaces) return { spaceName: 'Espace inconnu', threadName: 'Salon inconnu' };
  const space = openedOrg.value.spaces.find((s: any) => s.id === workspaceId);
  const thread = space?.threads?.find((t: any) => t.id === threadId);
  return {
    spaceName: space?.name || 'Espace inconnu',
    threadName: thread?.name || 'Salon inconnu'
  };
};

const getSearchQuery = (argsStr: any) => {
  try {
    if (typeof argsStr === 'object') return argsStr.query || JSON.stringify(argsStr);
    const args = JSON.parse(argsStr);
    return args.query || argsStr;
  } catch {
    return argsStr;
  }
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_call?: {
    toolCallId?: string;
    name: string;
    arguments: string;
    status: 'pending' | 'accepted' | 'rejected' | 'executing' | 'done' | 'error';
    category?: 'server' | 'client';
    mutating?: boolean;
    interactive?: boolean;
    result?: any;
  };
  tool_data?: any;
  /**
   * true si ce message vient de la nouvelle boucle d'agent serveur (providers OpenAI/Mistral/
   * Gemini) plutôt que de l'ancien parseur regex — détermine quel gestionnaire de tool utiliser
   * ET quel rendu appliquer (parts structurées vs. widget tool_call unique historique).
   */
  viaAgentLoop?: boolean;
  /** Uniquement pour viaAgentLoop : texte et tools entrelacés dans l'ordre d'arrivée. */
  parts?: TurnPart[];
  /** Cumul des tokens de ce tour (plusieurs appels provider possibles si des tools s'enchaînent). */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number; reasoningTokens: number };
}

const selectedTask = ref<any>(null);
const isGenerating = ref(false);
// Par outil (façon Claude Code "don't ask again for this tool"), pas global : autoriser
// create_task sans redemander ne doit pas dispenser de confirmation pour delete_task. Volontairement
// non persisté — remis à zéro au rechargement, une autorisation en masse est une décision ponctuelle.
const autoAcceptTools = ref<Set<string>>(new Set());
const inputMsg = ref('');
const chatInputRef = ref<any>(null);

const suggestions = [
  { icon: 'bi-file-earmark-text', label: 'Résumer un document partagé dans ce workspace', prompt: 'Peux-tu me résumer ' },
  { icon: 'bi-list-check', label: 'Faire le point sur les tâches en retard', prompt: 'Quelles sont mes tâches en retard ou qui arrivent bientôt à échéance ?' },
  { icon: 'bi-pencil-square', label: 'Rédiger un message professionnel', prompt: 'Rédige-moi un message pour ' },
];

const useSuggestion = async (prompt: string) => {
  inputMsg.value = prompt;
  await nextTick();
  chatInputRef.value?.textarea?.focus();
};

watch(activeSessionId, async () => {
  await nextTick();
  if (chatInputRef.value?.textarea) {
    chatInputRef.value.textarea.focus();
  }
});
const messages = aiSessionMessages as unknown as Ref<ChatMessage[]>;

// Recalculé à la volée depuis les messages en mémoire — pas de stockage dédié, cf. plan.
const cumulativeUsage = computed(() => messages.value.reduce((acc, m) => {
  if (m.usage) acc.totalTokens += m.usage.totalTokens || 0;
  return acc;
}, { totalTokens: 0 }));

function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n / 1000) + 'k';
}

const chatContainer = ref<HTMLElement | null>(null);
const temporaryImages = ref<Record<string, string>>({});

const scrollToBottom = async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
  showScrollToBottom.value = false;
};

const showScrollToBottom = ref(false);

const onChatScroll = () => {
  const el = chatContainer.value;
  if (!el) return;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  showScrollToBottom.value = distanceFromBottom > 200;
};

// Pendant le téléchargement/chargement on laisse écrire : localLLM.chat() attend que le modèle soit prêt.
const canType = computed(() => !aiIsLocal.value || ['ready', 'loading', 'downloading'].includes(localLLM.status.value));

const stopGeneration = () => {
  if (isGenerating.value) {
    aiService.interrupt();
    isGenerating.value = false;
  }
};

// newSession logic is now handled in ThreadsBar.vue via AIService

const createThreadHelper = async (orgId: string, spaceId: string | undefined, name: string, type: string) => {
  const isHome = !spaceId || spaceId === 'home';
  const space = spaceId ? openedOrg.value?.spaces?.find((s: any) => s.id === spaceId || s.name.toLowerCase() === spaceId.toLowerCase()) : null;

  if (!isHome && !space) {
    throw new Error(`L'espace '${spaceId}' n'existe pas.`);
  }
  const actualSpaceId = space ? space.id : undefined;

  let members = actualSpaceId && space
    ? openedOrg.value?.members?.filter((m: any) => space.membersId.includes(m.userId)).map((m: any) => m!.user!) || []
    : openedOrg.value?.members?.map((m: any) => m.user!) || [];

  const currentUser = user.value;
  if (currentUser && !members.some(m => m.id === currentUser.id)) {
    members = [...members, currentUser];
  }

  if (currentUser && !members.some((m: any) => m.id === currentUser.id)) {
    members = [...members, currentUser];
  }

  const newThreadKey = await generateThreadKey();
  let encryptedKeysPayload = [];
  for (const member of members) {
    if (member.publicKey && typeof member.publicKey === 'string' && member.publicKey.trim().startsWith('{')) {
      // Clé épinglée (audit FC1) : un membre dont la clé a changé est écarté.
      let trustedKey: string;
      try { trustedKey = await resolveRecipientKey(member.id, member.publicKey); }
      catch { continue; }
      const encryptedKey = await encryptThreadKeyForMember(newThreadKey, trustedKey);
      encryptedKeysPayload.push({ userId: member.id, encryptedKey });
    }
  }

  if (encryptedKeysPayload.length === 0) throw new Error("Aucun membre avec clé E2EE valide.");

  let categoryId = isHome ? openedOrg.value?.home?.categories?.[0]?.id : space?.categories?.[0]?.id;
  if (!categoryId) throw new Error("Aucune catégorie disponible.");

  const payload = { name, type: type || 'text', keys: encryptedKeysPayload, index: 0, categoryId };

  const endpoint = isHome ? `/api/threads/org/${orgId}` : `/api/threads/space/${actualSpaceId}`;
  const res = await sfetch(endpoint, { method: 'POST', body: JSON.stringify(payload) });
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  if (!isHome && actualSpaceId) data.workspaceId = actualSpaceId;
  if (isHome) {
    if (!openedOrg.value?.home?.threads) { if (openedOrg.value && openedOrg.value.home) openedOrg.value.home.threads = []; }
    openedOrg.value?.home?.threads?.push(data);
  } else if (space) {
    if (!space.threads) space.threads = [];
    space.threads.push(data);
  }
  return data;
};

/** Ajoute du texte au dernier segment 'text' de la turn, ou en ouvre un nouveau si le dernier segment est un tool. */
const appendTextPart = (idx: number, delta: string) => {
  const parts = messages.value[idx]!.parts!;
  const last = parts[parts.length - 1];
  if (last && last.type === 'text') last.text += delta;
  else parts.push({ type: 'text', text: delta });
};

/** Même logique qu'appendTextPart, pour le raisonnement du modèle — rendu par ThinkingStepItem. */
const appendThinkingPart = (idx: number, delta: string) => {
  const parts = messages.value[idx]!.parts!;
  const last = parts[parts.length - 1];
  if (last && last.type === 'thinking') last.text += delta;
  else parts.push({ type: 'thinking', text: delta });
};

/** Met à jour le tool_call déjà présent dans la turn (par id), ou en ajoute un nouveau segment. */
const upsertToolPart = (idx: number, toolCallId: string, patch: Partial<ToolStep> & { name: string }) => {
  const parts = messages.value[idx]!.parts!;
  const existing = parts.find((p) => p.type === 'tool' && p.tool.toolCallId === toolCallId) as { type: 'tool'; tool: ToolStep } | undefined;
  if (existing) {
    Object.assign(existing.tool, patch);
  } else {
    parts.push({ type: 'tool', tool: { toolCallId, status: 'pending', ...patch } });
  }
};

/**
 * Consomme le flux SSE de la nouvelle boucle d'agent serveur (chatAgentTurn/resumeAgentTurn) et
 * alimente les parts (texte + tools entrelacés) de la turn en cours. getIndex pointe toujours
 * vers LA MÊME turn : contrairement à l'ancien modèle une bulle par tool, tout le tour
 * (texte + tools + texte...) reste dans un seul message, comme le fait réellement Claude.
 */
const consumeAgentStream = async (
  generator: AsyncGenerator<any, void, unknown>,
  getIndex: () => number,
  newSessionTitleSource?: string
) => {
  for await (const ev of generator) {
    if (!isGenerating.value) break;
    const idx = getIndex();
    if (!messages.value[idx]) break;

    if (ev.type === 'session') {
      if (activeSessionId.value !== ev.sessionId) {
        const isNewSession = !activeSessionId.value;
        activeSessionId.value = ev.sessionId;
        fetchSessions();

        // Titre chiffré côté client pour le tout premier message d'une nouvelle session 'gateway' —
        // synco_api ne peut plus le dériver lui-même une fois le content opaque pour lui (E2EE_PLAN.md §4.4).
        // Fire-and-forget : ne doit jamais bloquer/faire échouer l'envoi du message.
        if (isNewSession && newSessionTitleSource && aiService.config.provider === 'gateway') {
          const orgId = route.params.orgId as string;
          setEncryptedSessionTitle(orgId, ev.sessionId, newSessionTitleSource);
        }
      }
    } else if (ev.type === 'text') {
      appendTextPart(idx, ev.delta);
    } else if (ev.type === 'thinking') {
      appendThinkingPart(idx, ev.delta);
    } else if (ev.type === 'usage') {
      recordUsage(aiService.config.provider, aiService.currentModelName, ev);
      // Un tour peut enchaîner plusieurs appels provider (texte -> tool -> texte...), chacun avec
      // son propre usage : on cumule pour obtenir le total réel du tour, pas juste le dernier appel.
      const m = messages.value[idx]!;
      const acc = m.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, reasoningTokens: 0 };
      m.usage = {
        promptTokens: acc.promptTokens + (ev.promptTokens || 0),
        completionTokens: acc.completionTokens + (ev.completionTokens || 0),
        totalTokens: acc.totalTokens + (ev.totalTokens || 0),
        reasoningTokens: acc.reasoningTokens + (ev.reasoningTokens || 0),
      };
    } else if (ev.type === 'tool_call_result') {
      upsertToolPart(idx, ev.toolCallId, { name: ev.name, status: 'done', category: 'server', mutating: false, result: ev.result, ...(ev.args !== undefined && { args: ev.args }) });
      // create_space est exécuté côté serveur (category 'server') dans cette boucle, contrairement
      // à create_thread (category 'client', exécuté par executeClientTool qui pousse déjà dans
      // space.threads via createThreadHelper) : sans ce push, le nouvel espace ne rejoint jamais
      // openedOrg.value.spaces, que SpaceBar.vue observe — il resterait invisible dans la barre
      // latérale jusqu'au prochain refetch complet de l'org (ex: F5).
      if (ev.name === 'create_space' && ev.result?.id && openedOrg.value?.spaces && !openedOrg.value.spaces.some((s: any) => s.id === ev.result.id)) {
        openedOrg.value.spaces.push(ev.result);
      }
    } else if (ev.type === 'tool_call_pending') {
      upsertToolPart(idx, ev.toolCallId, { name: ev.name, args: ev.args, status: 'pending', category: 'server', mutating: true });
      if (autoAcceptTools.value.has(ev.name)) {
        const parts = messages.value[idx]!.parts!;
        const tool = (parts.find((p) => p.type === 'tool' && p.tool.toolCallId === ev.toolCallId) as { type: 'tool'; tool: ToolStep }).tool;
        await handleAgentToolDecision(tool, true, idx);
        return;
      }
    } else if (ev.type === 'tool_call_client_required') {
      upsertToolPart(idx, ev.toolCallId, {
        name: ev.name, args: ev.args,
        status: (ev.mutating || ev.interactive) ? 'pending' : 'executing',
        category: 'client', mutating: ev.mutating, interactive: ev.interactive,
      });
      // Tool client non-mutant (ex: search_messages) : toujours auto-exécuté, confirmation ou pas —
      // "interactive" (ex: ask_question, upload d'image) reste exclu, même avec autoAcceptTools :
      // il n'y a aucune valeur à fournir automatiquement à la place de l'utilisateur.
      if ((!ev.mutating && !ev.interactive) || (ev.mutating && !ev.interactive && autoAcceptTools.value.has(ev.name))) {
        const parts = messages.value[idx]!.parts!;
        const tool = (parts.find((p) => p.type === 'tool' && p.tool.toolCallId === ev.toolCallId) as { type: 'tool'; tool: ToolStep }).tool;
        await handleAgentToolDecision(tool, true, idx);
        return;
      }
    } else if (ev.type === 'done') {
      isGenerating.value = false;
    } else if (ev.type === 'error') {
      appendTextPart(idx, `\n\n**Erreur:** ${ev.error}`);
      isGenerating.value = false;
    }

    await scrollToBottom();
  }
};

/** Exécute côté client les tools de catégorie 'client' (contenu E2EE réel ou cérémonie de clé). */
// Un hit brut de l'index contient l'embedding (384 flottants) et, pour un PDF,
// tout le texte extrait : envoyé tel quel au LLM, on dépasse le million de
// tokens. On ne transmet que le strict nécessaire, texte tronqué.
const SEARCH_HIT_MAX_CHARS = 1000;
const SEARCH_HIT_METADATA_KEYS = ['threadId', 'senderName', 'createdAt', 'originalName', 'folderId', 'status', 'dueDate'];

const toLlmSearchHit = (hit: any) => {
  const text: string = hit.textContent || '';
  const meta: Record<string, any> = {};
  for (const key of SEARCH_HIT_METADATA_KEYS) {
    if (hit.metadata?.[key] != null) meta[key] = hit.metadata[key];
  }
  return {
    id: hit.id,
    type: hit.type,
    spaceId: hit.workspaceId,
    excerpt: text.length > SEARCH_HIT_MAX_CHARS ? text.slice(0, SEARCH_HIT_MAX_CHARS) + '…[tronqué]' : text,
    ...meta,
  };
};

const executeClientTool = async (name: string, args: any, clientValue?: string): Promise<any> => {
  const orgId = route.params.orgId as string;

  if (name === 'search_messages') {
    const org = openedOrg.value;
    if (org && org.spaces && privateKey.value) {
      for (const space of org.spaces) {
        await SearchSyncService.restoreWorkspaceIndexes(space.id, toRaw(privateKey.value));
      }
    }
    const query = args.query;
    const workerId = Date.now().toString();
    const vector = await new Promise<number[]>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        if (e.data.id === workerId && e.data.status === 'complete') {
          globalVectorWorker.removeEventListener('message', handler);
          resolve(e.data.vector);
        } else if (e.data.id === workerId && e.data.status === 'error') {
          globalVectorWorker.removeEventListener('message', handler);
          reject(new Error(e.data.error));
        }
      };
      globalVectorWorker.addEventListener('message', handler);
      globalVectorWorker.postMessage({ id: workerId, text: query, type: 'SEARCH' });
    });
    const searchResults = await localSearchDB.searchByVector(vector, query, undefined, 5);
    return { query, results: searchResults.map(toLlmSearchHit) };
  }

  if (name === 'create_thread') {
    const threads = args.threads || [];
    if (threads.length === 0) throw new Error('Aucun salon spécifié.');
    const created = [];
    for (const t of threads) {
      created.push(await createThreadHelper(orgId, t.spaceId, t.name, t.type));
    }
    return { threads: created };
  }

  if (isDocumentationTool(name)) {
    return await runDocumentationTool(name, args);
  }

  if (name === 'create_folder') {
    const folder = await createFolderRequest(args.spaceId, orgId, args.name, args.parentFolderId);
    return { id: folder.id, name: folder.name, spaceId: args.spaceId };
  }

  if (name === 'create_file') {
    const file = await createTextFile({
      spaceId: args.spaceId,
      name: args.name,
      content: args.content ?? '',
      folderId: args.folderId,
    });
    return {
      id: file.id,
      name: file.originalName,
      spaceId: args.spaceId,
      // Le jeton est renvoyé tel quel pour que le modèle n'ait qu'à le recopier :
      // MarkdownRender.vue le transforme en carte fichier cliquable.
      reference: `<file:${file.id}>`,
      note: `Cite ce fichier dans ta réponse en écrivant <file:${file.id}>.`,
    };
  }

  if (name === 'request_image_upload') {
    return { id: clientValue, note: `Utilise EXACTEMENT '${clientValue}' pour le paramètre 'logo' de create_space.` };
  }

  if (name === 'ask_question') {
    return { answer: clientValue ?? '' };
  }

  throw new Error(`Outil client inconnu: ${name}`);
};

/** Accepte/refuse un tool posé par la nouvelle boucle d'agent serveur, puis reprend le flux. */
const handleAgentToolDecision = async (
  toolCall: ToolStep,
  accept: boolean,
  assistantMsgIndex: number,
  clientValue?: string
) => {
  const orgId = route.params.orgId as string;
  const sessionId = activeSessionId.value;
  const clientDriven = aiIsClientDriven.value;
  // Moteur piloté par le navigateur : la conversation n'existe côté serveur qu'après sa première synchro.
  if (!toolCall.toolCallId || (!clientDriven && !sessionId)) return;

  toolCall.status = 'executing';

  let decision: { accepted?: boolean; clientResult?: any };

  if (toolCall.category === 'client') {
    if (!accept) {
      decision = { clientResult: { error: "Action refusée par l'utilisateur." } };
    } else {
      try {
        const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args || '{}') : toolCall.args;
        decision = { clientResult: await executeClientTool(toolCall.name, args, clientValue) };
      } catch (e: any) {
        decision = { clientResult: { error: e.message || 'Erreur technique.' } };
      }
    }
  } else {
    decision = { accepted: accept };
  }

  isGenerating.value = true;
  await scrollToBottom();
  try {
    const idx = assistantMsgIndex;
    const generator = clientDriven
      ? resumeClientAgent(orgId, { toolCallId: toolCall.toolCallId, name: toolCall.name, args: toolCall.args, category: toolCall.category }, decision)
      : aiService.resumeAgentTurn(orgId, sessionId!, decision);
    await consumeAgentStream(generator, () => idx);
  } catch (e: any) {
    if (messages.value[assistantMsgIndex]) appendTextPart(assistantMsgIndex, `\n\n**Erreur:** ${e.message}`);
  } finally {
    isGenerating.value = false;
    if (clientDriven) await syncSession('');
  }
};

/**
 * L'action en attente d'une décision utilisateur — au plus une à la fois, puisque runLoop côté
 * serveur (synco_api) s'arrête dès qu'un tool mutant/client a besoin d'être confirmé/exécuté
 * ailleurs. Couvre les deux boucles : viaAgentLoop (parts structurées) et legacy (tool_call unique),
 * pour que PendingActionBar s'affiche de façon identique quel que soit le provider.
 */
const pendingAction = computed<{ idx: number; tool: ToolStep } | null>(() => {
  const idx = messages.value.length - 1;
  const msg = messages.value[idx];
  if (!msg) return null;

  if (!msg.viaAgentLoop) return null;
  const toolPart = (msg.parts || []).find((p) => p.type === 'tool' && p.tool.status === 'pending') as { type: 'tool'; tool: ToolStep } | undefined;
  return toolPart ? { idx, tool: toolPart.tool } : null;
});

function acceptPendingAction(always = false, value?: string) {
  const pending = pendingAction.value;
  if (!pending) return;

  if (always) autoAcceptTools.value.add(pending.tool.name);

  // PendingActionBar renvoie directement le base64 pour request_image_upload : c'est ici, au
  // moment de la décision, qu'on lui attribue un id temporaire — comme le faisait l'ancien
  // callback IconSelector inline, juste déplacé hors du template.
  if (pending.tool.name === 'request_image_upload' && value) {
    const id = 'img_' + Date.now();
    temporaryImages.value[id] = value;
    value = id;
  }

  handleAgentToolDecision(pending.tool, true, pending.idx, value);
}

function rejectPendingAction() {
  const pending = pendingAction.value;
  if (!pending) return;

  handleAgentToolDecision(pending.tool, false, pending.idx);
}

/**
 * Tous les fournisseurs passent par la même boucle d'agent et le même flux d'événements : côté serveur
 * (OpenAI/Mistral/Gemini/passerelle) ou dans le navigateur (WebGPU local, serveur custom).
 */
const sendMessage = async () => {
  if (isGenerating.value) {
    stopGeneration();
    return;
  }

  const text = inputMsg.value.trim();
  if (!text) return;
  inputMsg.value = '';

  const orgId = route.params.orgId as string;
  const clientDriven = aiIsClientDriven.value;
  messages.value.push({ role: 'user', content: text });
  const assistantMsgIndex = messages.value.length;
  messages.value.push({ role: 'assistant', content: '', viaAgentLoop: true, parts: [] });

  isGenerating.value = true;
  await scrollToBottom();

  try {
    const idx = assistantMsgIndex;
    const generator = clientDriven ? clientAgentTurn(orgId) : aiService.chatAgentTurn(orgId, activeSessionId.value, text);
    await consumeAgentStream(generator, () => idx, text);
  } catch (error: any) {
    if (error.message !== 'USER_STOPPED' && !String(error).includes('USER_STOPPED')) {
      appendTextPart(assistantMsgIndex, `\n\n**Erreur:** ${error.message}`);
    }
  } finally {
    isGenerating.value = false;
    // Une conversation pilotée par le navigateur est stockée (chiffrée) par le client lui-même.
    if (clientDriven) await syncSession(text);
  }
};

// syncSession is handled in AIService

// Attend la lecture du choix de l'utilisateur : avant, aiIsLocal reflète seulement le défaut de l'org.
watch([aiIsLocal, aiPrefsReady], ([isLocal, ready]) => {
  if (isLocal && ready) localLLM.autoLoadIfCached();
}, { immediate: true });

onMounted(async () => {
  await nextTick();
  chatInputRef.value?.textarea?.focus();
});

watch(() => openedOrg.value, async (newVal) => {
  if (newVal) {
    await fetchSessions();
  }
}, { immediate: true });
</script>
