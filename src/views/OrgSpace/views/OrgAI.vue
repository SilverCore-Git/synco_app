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
              @accept="(tool) => handleAgentToolDecision(tool, true, index)"
              @reject="(tool) => handleAgentToolDecision(tool, false, index)"
              @open-task="(t) => selectedTask = t"
              @provide-image="(tool, base64) => {
                const id = 'img_' + Date.now();
                temporaryImages[id] = base64;
                handleAgentToolDecision(tool, true, index, id);
              }"
            />
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

              <div class="mt-4" v-if="msg.tool_call.status === 'pending'">
                <div v-if="msg.tool_call.name === 'request_image_upload'" class="w-full">
                  <IconSelector model-value="" @on-base64="(base64) => {
                    const id = 'img_' + Date.now();
                    temporaryImages[id] = base64;
                    if (msg.tool_call) handleToolCall(msg.tool_call, true, index, id);
                  }" />
                </div>
                <div v-else class="flex gap-2">
                  <button
                    @click="handleToolCall(msg.tool_call!, true, index)"
                    class="bg-green-500/20 text-green-500 border border-green-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-500/30 transition-colors">Accepter</button>
                  <button
                    @click="handleToolCall(msg.tool_call!, false, index)"
                    class="bg-red-500/20 text-red-500 border border-red-500/30 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-500/30 transition-colors">Refuser</button>
                </div>
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

      <!-- Loading / Status Bar / Manual Start -->
      <div v-if="aiIsLocal && !aiIsInitialized"
        class="px-6 py-4 border-t border-(--border-color) bg-black/20 flex flex-col gap-3 shrink-0">

        <!-- WebGPU Non supporté (Erreur bloquante) -->
        <div v-if="!aiHasWebGPU"
          class="flex items-start gap-4 bg-red-950/40 border-l-4 border-red-500 p-5 rounded-r-xl rounded-l-sm mb-5 shadow-lg">
          <div class="bg-red-500/20 p-2 rounded-full shrink-0 mt-1">
            <i class="bi bi-x-circle-fill text-2xl text-red-500"></i>
          </div>
          <div class="flex-1">
            <h4 class="text-red-400 font-black text-base uppercase tracking-wider mb-2">Matériel non compatible</h4>
            <p class="text-sm text-(--text)/90 leading-relaxed mb-4">
              L'agent IA nécessite l'accélération matérielle <strong>WebGPU</strong> pour fonctionner.
              Aucune carte graphique compatible n'a été détectée dans votre navigateur. L'exécution en local est donc
              désactivée.
            </p>

            <div class="bg-black/40 p-4 rounded-lg border border-(--border-color) text-sm text-(--text)/80">
              <p class="font-bold text-red-300 mb-2 flex items-center gap-2"><i class="bi bi-wrench-adjustable"></i>
                Pistes de résolution :</p>
              <ul class="list-disc ml-5 space-y-2">
                <li><strong>Linux :</strong> L'accélération WebGPU est souvent bloquée. Nous recommandons d'utiliser
                  <strong>Chromium ou Chrome sous Windows ou macOS</strong> pour profiter de l'IA locale.</li>
                <li><strong>Pilotes :</strong> Vérifiez que vos pilotes graphiques sont à jour.</li>
                <li v-if="hasNavigatorGpu">WebGPU est activé dans votre navigateur, mais l'accès à la carte graphique a
                  échoué (problème OS/Drivers).</li>
                <li v-else>Assurez-vous d'utiliser une version récente de <strong>Google Chrome, Edge ou Brave</strong>.
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div v-if="initError"
          class="flex items-center gap-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-2">
          <i class="bi bi-x-circle text-2xl text-red-500"></i>
          <div class="flex-1">
            <h4 class="text-red-500 font-bold text-sm">Erreur d'initialisation</h4>
            <p class="text-xs text-red-500/80 mt-1 mb-2">{{ initError }}</p>

            <div v-if="initError.includes('f16')"
              class="bg-black/20 p-3 rounded-lg border border-(--border-color) text-xs text-(--text)/70">
              <strong>Astuce Chrome/Edge :</strong> Il est impossible d'activer cette fonctionnalité automatiquement.
              Cependant, vous pouvez forcer son activation manuellement :
              <ol class="list-decimal ml-4 mt-1 space-y-1">
                <li>Copiez l'URL <code
                    class="bg-black/50 px-1 py-0.5 rounded text-white select-all">chrome://flags/#enable-webgpu-developer-features</code>
                  et collez-la dans la barre d'adresse de votre navigateur.</li>
                <li>Passez l'option <strong>WebGPU Developer Features</strong> de <span
                    class="text-(--text)">Default</span> à <span class="text-green-400 font-bold">Enabled</span>.</li>
                <li>Redémarrez le navigateur et réessayez.</li>
              </ol>
            </div>
          </div>
        </div>

        <!-- Installation classique -->
        <div v-if="!hasStartedInit" class="flex flex-col md:flex-row items-center justify-between gap-4">
          <div class="text-sm">
            <p class="font-bold text-(--text)/80">Téléchargement initial de Synco AI requis</p>
            <p class="text-(--text)/50 text-xs">Modèle sélectionné : <span
                class="font-mono text-(--primary)">{{availableModels.find(m => m.id === selectedModelId)?.name ||
                'Aucun' }}</span></p>
          </div>
          <div class="flex gap-2">
            <button v-if="aiHasWebGPU" @click="startInit"
              class="primary flex items-center gap-2">
              <i class="bi bi-play-fill" v-if="isModelCached"></i>
              <i class="bi bi-cloud-arrow-down-fill" v-else></i>
              {{ isModelCached ? 'Initialiser (GPU)' : 'Télécharger & Initialiser (GPU)' }}
            </button>
          </div>
        </div>

        <div v-else class="flex flex-col gap-2">
          <div class="flex items-center justify-between text-xs text-(--text)/50">
            <span class="flex items-center gap-2">
              <i class="bi"
                :class="[aiDownloadProgress >= 100 ? 'bi-cpu animate-pulse' : 'bi-cloud-arrow-down animate-bounce', 'text-(--primary)']"></i>
              {{ aiDownloadProgress >= 100 ? 'Initialisation en mémoire (cela peut prendre du temps)...' :
              'Téléchargement et initialisation...' }}
            </span>
            <span class="font-mono">{{ aiDownloadProgress }}%</span>
          </div>
          <div class="w-full h-1.5 bg-(--text)/10 rounded-full overflow-hidden">
            <div class="h-full transition-all duration-300 bg-(--primary)" :style="{ width: aiDownloadProgress + '%' }">
            </div>
          </div>
          <p class="text-[10px] text-(--text)/30 text-center mt-1 font-mono truncate">{{ aiDownloadText }}</p>
        </div>

      </div>

      <div class="p-1 border-t border-(--border-color) shrink-0 relative">
        <form @submit.prevent="() => sendMessage()"
          class="relative w-full max-w-5xl mx-auto flex items-end gap-3 border border-(--text)/10 rounded-xl px-4 py-2 transition-all shadow-2xl"
          :class="(!aiIsInitialized || isGenerating) ? 'bg-black/50 opacity-50 cursor-not-allowed' : 'bg-(--bg) focus-within:border-(--primary)/50'">

          <ThreadTextarea ref="chatInputRef" v-model="inputMsg" placeholder="Demandez-moi n'importe quoi..."
            :disabled="!aiIsInitialized || isGenerating" @send="() => sendMessage()" />

          <button type="button" @click="isGenerating ? stopGeneration() : sendMessage()"
            class="shrink-0 mb-1 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
            :class="isGenerating ? 'text-red-500 hover:text-red-400' : 'text-(--primary) hover:brightness-110'"
            :disabled="!aiIsInitialized || (!inputMsg.trim() && !isGenerating)">
            <i :class="isGenerating ? 'bi-stop-fill text-xl' : 'bi-send-fill text-xl'"></i>
          </button>

        </form>
      </div>

      <TaskDetailsModal :task="selectedTask" :isOpen="!!selectedTask" @close="selectedTask = null" />

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, watch, toRaw, type Ref } from 'vue';
import * as webllm from '@mlc-ai/web-llm';
import { localLLM, availableModels } from '@/services/LocalLLMService';
import { aiService, aiIsLocal, aiIsInitialized, aiCurrentModelName, aiHasWebGPU, aiDownloadProgress, aiDownloadText, aiSessionMessages, syncSession, fetchSessions, activeSessionId, selectedModelId, setEncryptedSessionTitle } from '@/services/AIService';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import ThreadMessage from '../components/common/ThreadMessage.vue';
import TaskDetailsModal from '../components/popup/TaskDetailsModal.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';
import IconSelector from '@/components/common/IconSelector.vue';
import AgentTurn from '../components/ai/AgentTurn.vue';
import MarkdownRender from './MarkdownRender.vue';
import type { TurnPart, ToolStep } from '../components/ai/agentTypes';
import { useUsersBar } from '@/composables/useUsersBar';
import useSettingsItem from '@/composables/useSettingsItem';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
import sfetch from '@/assets/utils/sfetch';
import globalVectorWorker from '@/services/GlobalVectorWorker';

import { localSearchDB } from '@/services/LocalSearchVectorDB';
import { SearchSyncService } from '@/services/SearchSyncService';
import { generateThreadKey, encryptThreadKeyForMember, privateKey } from '@/assets/utils/crypto';
import { openedOrg, user } from '@/assets/var';
import { getSystemPrompt } from '@/services/AITools';
import { isDocumentationTool, runDocumentationTool } from '@/services/DocumentationService';

const { showUsersBar } = useUsersBar();
const { Item: savedModelId, isLoaded: savedModelLoaded } = useSettingsItem('ai_selected_model', '');

// Le rendu markdown passe par MarkdownRender.vue (partagé avec le chat/les
// tâches) — il ne reste ici que le nettoyage spécifique à l'IA : les blocs
// <tool_call> internes ne doivent jamais apparaître dans le texte affiché.
const cleanAiContent = (text: string) => text.replace(/<tool_call>[\s\S]*?(?:<\/tool_call>|$)/g, '');

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
}

const recommendedModelId = ref<string>('');
const selectedTask = ref<any>(null);
const isGenerating = ref(false);
const hasStartedInit = ref(false);
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
const chatContainer = ref<HTMLElement | null>(null);
const hasNavigatorGpu = typeof navigator !== 'undefined' && !!(navigator as any).gpu;
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

const initError = ref('');

// @ts-ignore
const loadModel = async () => {
  if (!selectedModelId.value && aiIsLocal.value) return;
  savedModelId.value = selectedModelId.value; // Save selection to DB

  if (!aiIsLocal.value) {
    // Les API distantes n'ont pas besoin de téléchargement WebGPU
    hasStartedInit.value = true;
    initError.value = '';
    return;
  }

  // On vérifie d'abord l'état du cache pour ce nouveau modèle
  await checkCacheStatus();

  if (isModelCached.value) {
    initError.value = '';
    hasStartedInit.value = true;
    try {
      await localLLM.init(selectedModelId.value);
    } catch (e: any) {
      console.error("Impossible de charger le modèle", e);
      initError.value = "Erreur WebGPU: " + (e.message || String(e));
      hasStartedInit.value = false;
    }
  } else {
    // Si le modèle n'est pas en cache, on force l'utilisateur à voir l'écran de téléchargement
    // On coupe l'éventuel modèle précédent
    if (localLLM.engine) {
      localLLM.engine.unload();
      localLLM.engine = null;
    }
    hasStartedInit.value = false;
    localLLM.isInitialized.value = false;
  }
};

const isModelCached = ref(false);

const checkCacheStatus = async () => {
  if (selectedModelId.value) {
    try {
      isModelCached.value = await webllm.hasModelInCache(selectedModelId.value);
      if (isModelCached.value && localLLM.currentModel.value?.id !== selectedModelId.value && !hasStartedInit.value) {
        // Auto-initialiser silencieusement si c'est déjà en cache
        startInit();
      }
    } catch (e) {
      isModelCached.value = false;
    }
  }
};

watch(selectedModelId, () => {
  loadModel();
});

const startInit = async () => {
  if (!selectedModelId.value) return;
  hasStartedInit.value = true;
  initError.value = '';
  try {
    await localLLM.init(selectedModelId.value);
  } catch (e: any) {
    console.error("Impossible d'initialiser le modèle", e);
    initError.value = "Le modèle graphique (WebGPU) n'est pas supporté par votre carte graphique ou navigateur.";
    hasStartedInit.value = false;
  }
};

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
      const encryptedKey = await encryptThreadKeyForMember(newThreadKey, member.publicKey);
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

const handleToolCall = async (toolCall: NonNullable<ChatMessage['tool_call']>, accept: boolean, _assistantMsgIndex: number, imageId?: string) => {
  if (!accept) {
    toolCall.status = 'rejected';
    messages.value.push({
      role: 'user',
      content: `[SYSTEM] L'action '${toolCall.name}' a été REFUSÉE par l'utilisateur.`
    });
    sendMessage("J'ai refusé cette action. Ne la relance pas. Demande-moi plutôt pourquoi ou propose une alternative.");
    return;
  }

  toolCall.status = 'executing';

  let result = "";
  let toolData: any = null;
  try {
    const args = typeof toolCall.arguments === 'string' ? JSON.parse(toolCall.arguments) : toolCall.arguments;
    const orgId = route.params.orgId as string;

    if (toolCall.name === 'create_space') {
      if (args.logo && args.logo.startsWith('img_') && temporaryImages.value[args.logo]) {
        args.logo = temporaryImages.value[args.logo];
      }
      const res = await sfetch(`/api/spaces/org/${orgId}`, {
        method: 'POST',
        body: JSON.stringify({ name: args.name, logo: args.logo, membersId: [] })
      });
      const spaceData = await res.json();
      if (spaceData.error) throw new Error(spaceData.error);

      if (openedOrg.value && openedOrg.value.spaces) {
        openedOrg.value.spaces.push(spaceData);
      }
      toolData = spaceData;
      result = `Espace '${args.name}' créé avec succès.`;

      if (args.threads && Array.isArray(args.threads) && args.threads.length > 0) {
        let threadsCreated = [];
        for (const t of args.threads) {
          try {
            const tData = await createThreadHelper(orgId, spaceData.id, t.name, t.type);
            threadsCreated.push(tData);
          } catch (e) {
            console.error("Erreur lors de la création d'un salon rattaché:", e);
          }
        }
        toolData.threads = threadsCreated;
        result += ` ${threadsCreated.length} salons y ont été créés.`;
      }

    } else if (toolCall.name === 'create_task') {
      const payload = {
        title: args.title,
        description: args.description || null,
        dueDate: null,
        spaceId: null,
        assigneeIds: user.value?.id ? [user.value.id] : [],
        parentTaskId: null,
        status: 'TODO'
      };
      const res = await sfetch(`/api/tasks/${orgId}/tasks`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Erreur serveur");
      result = `Tâche '${args.title}' créée avec succès.`;
      toolData = data;

    } else if (toolCall.name === 'search_messages') {
      // Load all workspaces indices dynamically before searching
      const org = openedOrg.value;
      if (org && org.spaces && privateKey.value) {
        for (const space of org.spaces) {
          await SearchSyncService.restoreWorkspaceIndexes(space.id, toRaw(privateKey.value));
        }
      }

      const query = args.query;
      const workerId = Date.now().toString();

      const vectorPromise = new Promise<number[]>((resolve, reject) => {
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
      });

      globalVectorWorker.postMessage({ id: workerId, text: query, type: 'SEARCH' });
      const vector = await vectorPromise;
      const searchResults = await localSearchDB.searchByVector(vector, query, undefined, 5);

      if (searchResults.length === 0) {
        result = `Aucun résultat trouvé dans la base sémantique pour "${query}".`;
      } else {
        result = `Résultats de recherche pour "${query}" :\n\n` + searchResults.map((r: any, i) => `[Résultat ${i + 1}]\nType: ${r.type}\nContenu: ${r.textContent}`).join('\n\n');
        toolData = searchResults;
      }

    } else if (toolCall.name === 'create_thread') {
      const threads = args.threads || [];
      if (threads.length === 0) throw new Error("Aucun salon spécifié.");

      let created = [];
      for (const t of threads) {
        try {
          const tData = await createThreadHelper(orgId, t.spaceId, t.name, t.type);
          created.push(tData);
        } catch (e: any) {
          console.error("Erreur création salon:", e);
          throw new Error(`Erreur lors de la création du salon '${t.name}': ${e.message}`);
        }
      }
      toolData = created;
      result = `${created.length} salon(s) créé(s) avec succès. Les clés E2EE ont été générées et distribuées.`;

    } else if (isDocumentationTool(toolCall.name)) {
      const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args || '{}') : (toolCall.args || {});
      const docResult = await runDocumentationTool(toolCall.name, args);

      toolData = docResult;
      result = JSON.stringify(docResult, null, 2);

    } else if (toolCall.name === 'request_image_upload') {
      toolData = { id: imageId };
      result = `L'utilisateur a fourni une image. Identifiant de l'image : '${imageId}'. Utilise EXACTEMENT cette valeur '${imageId}' pour le paramètre 'logo' de 'create_space'.`;

    } else if (toolCall.name === 'read_tasks') {
      const res = await sfetch(`/api/tasks/${orgId}/lists/me`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Erreur serveur");
      result = "Voici les tâches de l'utilisateur :\n" + JSON.stringify(data, null, 2);
      toolData = data;

    } else {
      result = "Erreur: Outil inconnu.";
    }
  } catch (e: any) {
    result = "Erreur technique lors de l'exécution : " + e.message;
  }

  toolCall.status = 'accepted';

  messages.value.push({
    role: 'user',
    content: `[SYSTEM] Résultat de l'action '${toolCall.name}' :\n${result}`,
    tool_data: {
      name: toolCall.name,
      results: toolData
    }
  });

  if (['create_task', 'create_space', 'create_thread'].includes(toolCall.name)) {
    sendMessage("L'action a été effectuée avec succès. Réponds très brièvement en une seule phrase pour confirmer à l'utilisateur.");
  } else if (['search_messages', 'read_tasks'].includes(toolCall.name) || isDocumentationTool(toolCall.name)) {
    sendMessage("Voici les informations demandées. Réponds à la question de l'utilisateur en te basant sur ces résultats.");
  }
};

/** Ajoute du texte au dernier segment 'text' de la turn, ou en ouvre un nouveau si le dernier segment est un tool. */
const appendTextPart = (idx: number, delta: string) => {
  const parts = messages.value[idx]!.parts!;
  const last = parts[parts.length - 1];
  if (last && last.type === 'text') last.text += delta;
  else parts.push({ type: 'text', text: delta });
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
    } else if (ev.type === 'tool_call_result') {
      upsertToolPart(idx, ev.toolCallId, { name: ev.name, status: 'done', category: 'server', mutating: false, result: ev.result });
    } else if (ev.type === 'tool_call_pending') {
      upsertToolPart(idx, ev.toolCallId, { name: ev.name, args: ev.args, status: 'pending', category: 'server', mutating: true });
    } else if (ev.type === 'tool_call_client_required') {
      upsertToolPart(idx, ev.toolCallId, {
        name: ev.name, args: ev.args,
        status: (ev.mutating || ev.interactive) ? 'pending' : 'executing',
        category: 'client', mutating: ev.mutating, interactive: ev.interactive,
      });
      if (!ev.mutating && !ev.interactive) {
        // Tool client non-mutant (ex: search_messages) : exécution immédiate, sans confirmation.
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
const executeClientTool = async (name: string, args: any, imageId?: string): Promise<any> => {
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
    return { query, results: searchResults };
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

  if (name === 'request_image_upload') {
    return { id: imageId, note: `Utilise EXACTEMENT '${imageId}' pour le paramètre 'logo' de create_space.` };
  }

  throw new Error(`Outil client inconnu: ${name}`);
};

/** Accepte/refuse un tool posé par la nouvelle boucle d'agent serveur, puis reprend le flux. */
const handleAgentToolDecision = async (
  toolCall: ToolStep,
  accept: boolean,
  assistantMsgIndex: number,
  imageId?: string
) => {
  const orgId = route.params.orgId as string;
  const sessionId = activeSessionId.value;
  if (!sessionId || !toolCall.toolCallId) return;

  toolCall.status = 'executing';

  let decision: { accepted?: boolean; clientResult?: any };

  if (toolCall.category === 'client') {
    if (!accept) {
      decision = { clientResult: { error: "Action refusée par l'utilisateur." } };
    } else {
      try {
        const args = typeof toolCall.args === 'string' ? JSON.parse(toolCall.args || '{}') : toolCall.args;
        decision = { clientResult: await executeClientTool(toolCall.name, args, imageId) };
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
    const generator = aiService.resumeAgentTurn(orgId, sessionId, decision);
    await consumeAgentStream(generator, () => idx);
  } catch (e: any) {
    if (messages.value[assistantMsgIndex]) appendTextPart(assistantMsgIndex, `\n\n**Erreur:** ${e.message}`);
  } finally {
    isGenerating.value = false;
  }
};

/** Providers OpenAI/Mistral/Gemini : la conversation passe entièrement par la boucle d'agent serveur. */
const sendMessageViaAgent = async (text: string) => {
  const orgId = route.params.orgId as string;
  messages.value.push({ role: 'user', content: text });
  const assistantMsgIndex = messages.value.length;
  messages.value.push({ role: 'assistant', content: '', viaAgentLoop: true, parts: [] });

  isGenerating.value = true;
  await scrollToBottom();

  try {
    const idx = assistantMsgIndex;
    const generator = aiService.chatAgentTurn(orgId, activeSessionId.value, text);
    await consumeAgentStream(generator, () => idx, text);
  } catch (error: any) {
    if (error.message !== 'USER_STOPPED' && !String(error).includes('USER_STOPPED')) {
      appendTextPart(assistantMsgIndex, `\n\n**Erreur:** ${error.message}`);
    }
  } finally {
    isGenerating.value = false;
  }
};

const sendMessage = async (hiddenPrompt?: string) => {
  if (isGenerating.value) {
    stopGeneration();
    return;
  }

  const text = hiddenPrompt || inputMsg.value.trim();
  if (!text && !hiddenPrompt) return;

  if (!hiddenPrompt) {
    inputMsg.value = '';
  }

  if (!hiddenPrompt && ['openai', 'mistral', 'gemini', 'gateway'].includes(aiService.config.provider)) {
    await sendMessageViaAgent(text);
    return;
  }

  if (!hiddenPrompt) {
    messages.value.push({ role: 'user', content: text });
  }

  const assistantMsgIndex = messages.value.length;
  messages.value.push({ role: 'assistant', content: '' });

  isGenerating.value = true;
  await scrollToBottom();

  try {

    const chatContext = [
      { role: 'system', content: getSystemPrompt() },
      ...messages.value.slice(0, -1).map(m => ({ role: m.role, content: m.content }))
    ];

    const generator = await aiService.chat(chatContext as any); // On envoie l'historique avec le prompt système

    for await (const chunk of generator) {
      if (!isGenerating.value) break;
      if (typeof chunk === 'object' && chunk.type === 'tool_call') {
        messages.value[assistantMsgIndex]!.tool_call = {
          name: chunk.name,
          arguments: chunk.arguments,
          status: 'pending'
        };
      } else {
        messages.value[assistantMsgIndex]!.content += chunk;
      }
      await scrollToBottom();
    }

    const tCall = messages.value[assistantMsgIndex]?.tool_call;
    if (tCall?.status === 'pending' && isDocumentationTool(tCall.name)) {
      setTimeout(() => {
        handleToolCall(tCall, true, assistantMsgIndex);
      }, 50);
    }
  } catch (error: any) {
    if (error.message !== "USER_STOPPED" && !String(error).includes("USER_STOPPED")) {
      messages.value[assistantMsgIndex]!.content += `\n\n**Erreur:** ${error.message}`;
    }
  } finally {
    isGenerating.value = false;
    await syncSession(text);
  }
};

// syncSession is handled in AIService

onMounted(async () => {
  const recommended = await localLLM.getRecommendedModel();
  recommendedModelId.value = recommended.id;

  await nextTick();
  chatInputRef.value?.textarea?.focus();
});

watch(() => openedOrg.value, async (newVal) => {
  if (newVal) {
    await fetchSessions();
  }
}, { immediate: true });

watch(savedModelLoaded, async (loaded) => {
  if (!loaded) return;

  if (!aiIsInitialized.value) {
    if (savedModelId.value) {
      selectedModelId.value = savedModelId.value;
    } else {
      selectedModelId.value = recommendedModelId.value;
      savedModelId.value = recommendedModelId.value;
    }
  } else {
    hasStartedInit.value = true;
    selectedModelId.value = aiCurrentModelName.value || '';
  }
  await checkCacheStatus();
}, { immediate: true });
</script>
