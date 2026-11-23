<template>
  <section
    class="agent-panel flex flex-col min-h-0 h-full w-full"
    :class="`is-${variant}`"
    :aria-label="`Synco AI : ${title}`"
    @keydown.esc.stop.prevent="dock.minimize(entry.key)"
  >
    <!-- En-tête : titre, régime, état, puis agrandir / réduire / fermer -->
    <header class="flex items-center gap-1.5 pl-4 pr-2 py-2 border-b border-(--border-color) shrink-0">
      <span class="agent-mark" aria-hidden="true"><i class="bi bi-robot"></i></span>
      <h2 class="flex-1 min-w-0 truncate text-sm font-bold text-(--text)" :title="title">{{ title }}</h2>
      <span class="regime-pill" :class="{ 'is-runtime': isRuntime }" :title="isRuntime ? 'Cette conversation tourne sur le runtime de votre organisation' : 'Cette conversation tourne avec le moteur de cet appareil'">
        <i class="bi" :class="isRuntime ? 'bi-hdd-network' : 'bi-pc-display'"></i>{{ isRuntime ? 'Runtime' : 'Appareil' }}
      </span>
      <template v-if="variant === 'dock'">
        <button type="button" class="br-btn" title="Agrandir" aria-label="Agrandir" @click="dock.expand(entry.key)"><i class="bi bi-arrows-angle-expand"></i></button>
        <button type="button" class="br-btn" title="Réduire (Échap)" aria-label="Réduire" @click="dock.minimize(entry.key)"><i class="bi bi-dash-lg"></i></button>
        <button type="button" class="br-btn" title="Fermer" aria-label="Fermer" @click="dock.close(entry.key)"><i class="bi bi-x-lg"></i></button>
      </template>
      <template v-else-if="variant === 'window'">
        <button type="button" class="win-btn" @click="openFullPage"><i class="bi bi-box-arrow-up-right"></i> Ouvrir la page complète</button>
        <button type="button" class="win-btn" @click="dock.restoreOpen(entry.key)"><i class="bi bi-arrows-angle-contract"></i> Réduire dans le dock</button>
        <button type="button" class="br-btn" title="Fermer" aria-label="Fermer" @click="dock.close(entry.key)"><i class="bi bi-x-lg"></i></button>
      </template>
      <template v-else>
        <button type="button" class="br-btn" title="Réduire" aria-label="Réduire" @click="dock.minimize(entry.key)"><i class="bi bi-chevron-down"></i></button>
        <button type="button" class="br-btn" title="Fermer" aria-label="Fermer" @click="dock.close(entry.key)"><i class="bi bi-x-lg"></i></button>
      </template>
    </header>

    <!-- Bandeaux d'état -->
    <p v-if="!online" class="banner banner-info" role="status"><i class="bi bi-wifi-off"></i> Vous êtes hors ligne : lecture possible, écriture et validation désactivées.</p>
    <p v-if="runtimeBanner" class="banner" :class="runtimeBanner.tone === 'info' ? 'banner-info' : runtimeBanner.tone === 'warning' ? 'banner-warn' : 'banner-error'" role="status">
      <i class="bi" :class="runtimeBanner.tone === 'info' ? 'bi-arrow-repeat' : 'bi-cloud-slash'"></i>{{ runtimeBanner.text }}
    </p>
    <p v-if="startError" class="banner banner-warn" role="alert"><i class="bi bi-exclamation-triangle"></i>{{ startError }}</p>
    <p v-if="runtime.error.value && isRuntime" class="banner banner-error" role="alert"><i class="bi bi-exclamation-octagon"></i>{{ runtime.error.value }}</p>

    <!-- Fil -->
    <div ref="scroller" class="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-4" :aria-busy="loading">
      <div v-if="fullPageOpen" class="m-auto text-center text-sm text-(--text2) max-w-[16rem]">
        <i class="bi bi-window-stack text-2xl text-(--primary)"></i>
        <p class="mt-2">Cette conversation est ouverte dans la page complète de Synco AI.</p>
      </div>

      <div v-else-if="loading" class="flex flex-col gap-3" aria-label="Chargement de la conversation">
        <div class="h-10 w-3/4 self-end rounded-2xl bg-(--text)/8 animate-pulse"></div>
        <div class="h-4 w-2/3 rounded bg-(--text)/8 animate-pulse"></div>
        <div class="h-4 w-1/2 rounded bg-(--text)/8 animate-pulse"></div>
      </div>

      <!-- Vide : « Que puis-je faire pour vous ? » + suggestions du module -->
      <div v-else-if="visibleMessages.length === 0" class="flex-1 flex flex-col justify-center gap-4">
        <div>
          <h3 class="text-lg font-bold text-(--text) leading-tight">Que puis-je faire pour vous ?</h3>
          <p v-if="entry.context" class="mt-1 text-xs text-(--text2)">{{ chip?.note }}</p>
        </div>
        <ul class="flex flex-col gap-2">
          <li v-for="s in suggestions" :key="s.label">
            <button type="button" class="suggestion" :disabled="busyStarting || !online" @click="useSuggestion(s.prompt)">
              <i class="bi bi-stars text-(--primary)"></i><span>{{ s.label }}</span>
            </button>
          </li>
        </ul>
      </div>

      <template v-else>
        <template v-for="(msg, index) in visibleMessages" :key="index">
          <div v-if="msg.role === 'user'" class="max-w-[85%] self-end">
            <div class="user-bubble text-sm leading-relaxed">
              <MarkdownRender :content="splitContext(msg.content || '').text" mode="chat" />
              <p v-if="splitContext(msg.content || '').contextLine" class="mt-1 flex items-center gap-1 text-[11px] text-(--text2)"><i class="bi bi-paperclip"></i><span class="truncate">{{ splitContext(msg.content || '').contextLine }}</span></p>
            </div>
            <p v-if="msg.queued" class="mt-1 text-[11px] text-(--text2)"><i class="bi bi-hourglass-split"></i> En file : traité dès que Synco AI a fini.</p>
          </div>
          <div v-else-if="msg.viaAgentLoop" class="w-full text-sm leading-relaxed text-(--text)">
            <AgentTurn :parts="msg.parts || []" :is-generating="uiBusy && index === visibleMessages.length - 1">
              <template #plan="{ toolCallId }">
                <RuntimePlanPanel
                  v-if="entry.sessionId && isRuntime"
                  :org-id="entry.orgId"
                  :session-id="entry.sessionId"
                  :tool-call-id="toolCallId"
                  :offline="planOffline"
                  :queued-message="lastQueuedText"
                />
              </template>
            </AgentTurn>
          </div>
          <div v-else-if="msg.content" class="w-full text-sm leading-relaxed text-(--text)">
            <MarkdownRender :content="msg.content" mode="chat" />
          </div>
        </template>
      </template>
    </div>

    <!-- Conversation locale : lecture seule dans le dock -->
    <div v-if="localReadOnly" class="px-4 py-3 border-t border-(--border-color) shrink-0 flex items-center gap-3 text-xs text-(--text2)">
      <i class="bi bi-pc-display text-base"></i>
      <span class="flex-1">Cette conversation tourne sur cet appareil : elle se poursuit dans la page complète.</span>
      <button type="button" class="win-btn" @click="openFullPage">Continuer</button>
    </div>

    <!-- Pied : validation d'une action, puce de contexte, composeur -->
    <div v-else class="p-2 border-t border-(--border-color) shrink-0 flex flex-col gap-2">
      <PendingActionBar
        v-if="pendingTool"
        :tool="pendingTool"
        @accept="decide(true)"
        @always-accept="decide(true)"
        @reject="decide(false)"
        @answer="(value) => decide(true, value)"
      />

      <div v-if="entry.context && chip" class="ctx-chip" :title="chip.note">
        <i class="bi" :class="chip.mode === 'content' ? 'bi-file-earmark-text' : 'bi-link-45deg'"></i>
        <span class="truncate font-semibold text-(--text)">{{ chip.title }}</span>
        <span class="text-(--text2) truncate">{{ chip.detail }}</span>
        <span class="chip-mode" :class="{ 'is-content': chip.mode === 'content' }">{{ chip.mode === 'content' ? 'contenu joint' : 'référence seule' }}</span>
        <button type="button" class="br-btn ml-auto" aria-label="Retirer le contexte" title="Retirer le contexte" @click="entry.context = null"><i class="bi bi-x-lg"></i></button>
      </div>

      <form class="composer" :class="{ 'is-disabled': composerDisabled }" @submit.prevent="submit">
        <textarea
          ref="input"
          v-model="draft"
          rows="1"
          class="flex-1 resize-none bg-transparent outline-none text-sm py-1.5 max-h-32"
          :placeholder="placeholder"
          :aria-label="placeholder"
          :disabled="composerDisabled"
          @keydown.enter.exact.prevent="submit"
          @input="grow"
        ></textarea>
        <button v-if="showStop" type="button" class="send is-stop" title="Annuler" aria-label="Annuler" @click="runtime.cancel()"><i class="bi bi-stop-fill"></i></button>
        <button v-else type="submit" class="send" title="Envoyer" aria-label="Envoyer" :disabled="composerDisabled || !draft.trim()"><i class="bi bi-send-fill"></i></button>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { useRouter } from 'vue-router';
import AgentTurn from '@/views/OrgSpace/components/ai/AgentTurn.vue';
import PendingActionBar from '@/views/OrgSpace/components/ai/PendingActionBar.vue';
import RuntimePlanPanel from '@/views/OrgSpace/components/ai/RuntimePlanPanel.vue';
import MarkdownRender from '@/views/OrgSpace/views/MarkdownRender.vue';
import type { ToolStep, TurnPart } from '@/views/OrgSpace/components/ai/agentTypes';
import { activeSessionId, activeSessionIsRuntime, aiSessionMessages, chatSessions, convertStoredMessagesToChatMessages, fetchSessions, loadSession } from '@/services/AIService';
import { useRuntimeConversation } from '@/services/aiRuntime/conversation/useRuntimeConversation';
import { connectRuntimeConversation } from '@/services/aiRuntime/conversation/connect';
import { linkBanner, isBusyStatus } from '@/services/aiRuntime/conversation/status';
import type { TranscriptMessage } from '@/services/aiRuntime/conversation/transcript';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { recordRuntimeUsage } from '@/services/aiUsageStats';
import { composeFirstMessage, contextChip, contextSuggestions, GENERIC_SUGGESTIONS, splitContext } from '@/services/agentDock/context';
import { startRuntimeConversation } from '@/services/agentDock/newConversation';
import { newConversationIo } from '@/services/agentDock/newConversationIo';
import { useAgentDock, type AgentDockEntry } from '@/composables/useAgentDock';

interface PanelMessage { role: string; content?: string; viaAgentLoop?: boolean; parts?: TurnPart[]; queued?: boolean }

const props = defineProps<{ entry: AgentDockEntry; variant: 'dock' | 'window' | 'sheet' }>();

const dock = useAgentDock();
const { fullPageOpen } = dock;
const router = useRouter();

const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const setOnline = () => { online.value = navigator.onLine; };
onMounted(() => { window.addEventListener('online', setOnline); window.addEventListener('offline', setOnline); });
onBeforeUnmount(() => { window.removeEventListener('online', setOnline); window.removeEventListener('offline', setOnline); });

const messages = aiSessionMessages as unknown as Ref<PanelMessage[]>;
const scroller = ref<HTMLElement | null>(null);
const input = ref<HTMLTextAreaElement | null>(null);
const draft = ref(props.entry.prompt);
const loading = ref(false);
const busyStarting = ref(false);
const startError = ref('');
/** Premier message d'une conversation neuve : part dès que le flux du runtime est ouvert. */
let firstToSend: string | null = null;

const session = computed(() => chatSessions.value.find((s: { id: string }) => s.id === props.entry.sessionId));
const title = computed(() => (session.value?.title as string | undefined) || props.entry.title);
watch(() => session.value?.title as string | undefined, t => { if (t) dock.setTitle(props.entry.key, t); });

/** Le panneau lit la conversation active de l'app : il ne la touche pas tant que la page complète l'affiche. */
const ready = computed(() => !!props.entry.sessionId && activeSessionId.value === props.entry.sessionId && !fullPageOpen.value);
const isRuntime = computed(() => ready.value && activeSessionIsRuntime.value);
const visibleMessages = computed(() => (ready.value ? messages.value : []).filter(m => m.role !== 'system' && !(m.role === 'user' && m.content?.startsWith('[SYSTEM]'))));
const localReadOnly = computed(() => ready.value && !loading.value && !activeSessionIsRuntime.value && !!props.entry.sessionId);

const runtime = useRuntimeConversation({
  messages: messages as unknown as Ref<TranscriptMessage[]>,
  connect: (orgId, sessionId, hooks) => connectRuntimeConversation(runtimeDeps(), orgId, sessionId, hooks),
  recordUsage: (sessionId, frame) => { recordRuntimeUsage(sessionId, frame); },
  reloadHistory: async (sessionId) => { await loadSession(sessionId); },
  fromSnapshot: (raw) => convertStoredMessagesToChatMessages(raw),
  afterEvent: () => { void scrollToBottom(); },
});
const runtimeBanner = computed(() => (isRuntime.value ? linkBanner(runtime.link.value) : null));
const planOffline = computed(() => !online.value || !!runtimeBanner.value?.readOnly);
const uiBusy = computed(() => isRuntime.value && isBusyStatus(runtime.status.value));
const showStop = computed(() => uiBusy.value && !draft.value.trim());
const lastQueuedText = computed(() => [...messages.value].reverse().find(m => m.role === 'user' && m.queued)?.content);

const composerDisabled = computed(() => !online.value || busyStarting.value || fullPageOpen.value || loading.value || (isRuntime.value && !!runtimeBanner.value?.readOnly));
const placeholder = computed(() => !online.value ? 'Hors ligne' : isRuntime.value && uiBusy.value ? 'Votre message sera mis en file…' : 'Demandez-moi n\'importe quoi…');

const chip = computed(() => (props.entry.context ? contextChip(props.entry.context) : null));
const suggestions = computed(() => (props.entry.context ? contextSuggestions(props.entry.context.kind) : GENERIC_SUGGESTIONS));

// Action en attente d'une décision (même règle qu'OrgAI.vue : dernier tour de l'agent, outil « pending »).
const pendingTool = computed<ToolStep | null>(() => {
  if (!isRuntime.value) return null;
  let idx = messages.value.length - 1;
  while (idx > 0 && messages.value[idx]?.role === 'user') idx--;
  const msg = messages.value[idx];
  if (!msg?.viaAgentLoop) return null;
  const part = (msg.parts || []).find(p => p.type === 'tool' && p.tool.status === 'pending');
  return part && part.type === 'tool' ? part.tool : null;
});

function decide(accept: boolean, value?: string): void {
  const tool = pendingTool.value;
  if (!tool || !online.value) return;
  // L'envoi d'image n'est pas pris en charge avec le runtime : on ne confirme pas à l'aveugle.
  if (tool.name === 'request_image_upload') { runtime.error.value = "L'envoi d'image n'est pas encore pris en charge avec le runtime."; return; }
  tool.status = accept ? 'executing' : 'rejected';
  if (tool.name === 'ask_question') void runtime.answer(tool.toolCallId, accept ? (value ?? '') : '');
  else void runtime.confirm(tool.toolCallId, accept);
}

async function scrollToBottom(): Promise<void> {
  await nextTick();
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight;
}
watch(() => messages.value.length, () => { void scrollToBottom(); });

function grow(): void {
  const el = input.value;
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
}

// Charge la conversation de l'entrée quand elle devient la conversation active de l'app.
watch([() => props.entry.sessionId, fullPageOpen], async ([id, full]) => {
  if (!id || full || activeSessionId.value === id) return;
  loading.value = true;
  try { await loadSession(id); } finally { loading.value = false; }
}, { immediate: true });

watch([isRuntime, () => props.entry.sessionId, () => props.entry.orgId], async ([rt, id, orgId]) => {
  if (!rt || !id) { runtime.close(); return; }
  await runtime.open(orgId, id);
  if (firstToSend) {
    const text = firstToSend;
    firstToSend = null;
    if (!(await runtime.send(text))) draft.value = text;
  }
}, { immediate: true });
onBeforeUnmount(() => runtime.close());

onMounted(async () => {
  await nextTick();
  grow();
  if (!fullPageOpen.value && window.matchMedia?.('(hover: hover)').matches) input.value?.focus();
});

const useSuggestion = (prompt: string) => { draft.value = prompt; void submit(); };

async function submit(): Promise<void> {
  const text = draft.value.trim();
  if (!text || composerDisabled.value) return;
  if (!props.entry.sessionId) { await startNew(text); return; }
  if (!isRuntime.value) return;
  draft.value = '';
  grow();
  if (!(await runtime.send(text))) draft.value = text;
  await scrollToBottom();
}

/** Nouvelle conversation : créée en local puis basculée aussitôt sur le runtime, en un seul geste. */
async function startNew(text: string): Promise<void> {
  busyStarting.value = true;
  startError.value = '';
  try {
    // Titre neutre côté serveur : la demande ne part jamais en clair (E2EE). L'aperçu reste local.
    const result = await startRuntimeConversation(newConversationIo, props.entry.orgId);
    if (!result.ok) {
      startError.value = result.message;
      if (result.sessionId) {
        // Elle existe, en local : on la garde dans le dock, lisible, à poursuivre dans la page complète.
        dock.bindSession(props.entry.key, result.sessionId, text.slice(0, 30));
        await fetchSessions();
        await loadSession(result.sessionId);
        dock.setPendingPrompt(text);
      }
      return;
    }
    firstToSend = composeFirstMessage(text, props.entry.context);
    draft.value = '';
    dock.bindSession(props.entry.key, result.sessionId, text.slice(0, 30));
    props.entry.context = null;
    await fetchSessions();
    await loadSession(result.sessionId);
  } finally {
    busyStarting.value = false;
  }
}

/** « Ouvrir la page complète » : la conversation active devient celle de la page, le dock se replie. */
function openFullPage(): void {
  const text = draft.value.trim();
  if (text) dock.setPendingPrompt(text);
  else if (!props.entry.sessionId && props.entry.prompt) dock.setPendingPrompt(props.entry.prompt);
  dock.minimize(props.entry.key);
  void router.push({ name: 'OrgAI', params: { orgId: props.entry.orgId } });
}
</script>

<style scoped>
.agent-mark { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 0.6rem; background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: 0.85rem; flex-shrink: 0; }
.regime-pill { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.5rem; border-radius: 999px; font-size: 0.68rem; font-weight: 700; color: var(--text2); background: color-mix(in srgb, var(--text) 7%, transparent); white-space: nowrap; }
.regime-pill.is-runtime { color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); }
.win-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.4rem 0.7rem; border-radius: 0.7rem; font-size: 0.78rem; font-weight: 600; color: var(--text); background: color-mix(in srgb, var(--text) 6%, transparent); white-space: nowrap; transition: background-color 0.15s; }
.win-btn:hover { background: color-mix(in srgb, var(--text) 12%, transparent); }
.banner { display: flex; align-items: center; gap: 0.5rem; padding: 0.4rem 1rem; font-size: 0.72rem; border-bottom: 1px solid var(--border-color); }
.banner-info { color: var(--text2); background: color-mix(in srgb, var(--text) 5%, transparent); }
.banner-warn { color: #f59e0b; background: color-mix(in srgb, #f59e0b 10%, transparent); }
.banner-error { color: #ef4444; background: color-mix(in srgb, #ef4444 10%, transparent); }
.user-bubble { padding: 0.55rem 0.85rem; border-radius: 1rem; background: color-mix(in srgb, var(--primary) 15%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 22%, transparent); }
.suggestion { width: 100%; display: flex; align-items: center; gap: 0.6rem; padding: 0.65rem 0.85rem; border-radius: 0.9rem; text-align: left; font-size: 0.8rem; font-weight: 600; color: var(--text); background: var(--bg2); border: 1px solid var(--border-color); transition: border-color 0.15s, background-color 0.15s, transform 0.15s; }
.suggestion:hover:not(:disabled) { border-color: color-mix(in srgb, var(--primary) 55%, transparent); background: color-mix(in srgb, var(--primary) 7%, transparent); transform: translateX(2px); }
.suggestion:disabled { opacity: 0.5; cursor: not-allowed; }
.ctx-chip { display: flex; align-items: center; gap: 0.45rem; padding: 0.25rem 0.3rem 0.25rem 0.65rem; border-radius: 0.8rem; font-size: 0.72rem; background: color-mix(in srgb, var(--primary) 8%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 25%, transparent); min-width: 0; }
.chip-mode { flex-shrink: 0; padding: 0.05rem 0.4rem; border-radius: 999px; font-size: 0.62rem; font-weight: 700; color: var(--text2); background: color-mix(in srgb, var(--text) 8%, transparent); }
.chip-mode.is-content { color: var(--primary); background: color-mix(in srgb, var(--primary) 16%, transparent); }
.composer { display: flex; align-items: flex-end; gap: 0.5rem; padding: 0.3rem 0.4rem 0.3rem 0.8rem; border-radius: 0.95rem; background: var(--bg2); border: 1px solid var(--border-color); transition: border-color 0.15s; }
.composer:focus-within { border-color: color-mix(in srgb, var(--primary) 60%, transparent); }
.composer.is-disabled { opacity: 0.55; }
.send { width: 2rem; height: 2rem; flex-shrink: 0; display: grid; place-items: center; border-radius: 0.7rem; color: #fff; background: var(--primary); transition: filter 0.15s, opacity 0.15s; }
.send:hover:not(:disabled) { filter: brightness(1.1); }
.send:disabled { opacity: 0.4; cursor: not-allowed; }
.send.is-stop { background: #ef4444; }
:is(button, textarea, a):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
</style>
