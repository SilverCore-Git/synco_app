<template>
  <!-- Colonne bas-droite : barres réduites des conversations Synco AI, puis le panneau déplié. Rien n'est
       rendu quand aucune conversation n'est ouverte (PC75) : pas de bouton permanent. -->
  <div v-if="!isLittleScreen && dock.visible.value" class="agent-dock" data-br-agent-dock>
    <Transition name="close-all">
      <button v-if="entries.length >= 2" type="button" class="close-all" title="Fermer toutes les conversations Synco AI" @click="dock.closeAll()">
        <span class="text-(--text2) font-medium">{{ entries.length }} ouverts</span>
        <span class="close-all-sep"></span>
        <i class="bi bi-x-lg text-[10px]"></i> Tout fermer
      </button>
    </Transition>

    <TransitionGroup v-if="dock.bars.value.length" name="agent-bar" tag="div" class="agent-bars">
      <div
        v-for="e in dock.bars.value"
        :key="e.key"
        class="br-bar agent-bar touch-pan-y"
        :class="{ 'is-amber': stateOf(e).amber }"
        @pointerdown="onBarPointerDown($event, e.key)"
      >
        <button type="button" class="flex-1 min-w-0 h-full flex items-center gap-2 pl-3 text-left" :title="`Déplier : ${e.title}`" @click="dock.restoreOpen(e.key)">
          <span class="agent-mark" aria-hidden="true"><i class="bi bi-robot"></i></span>
          <span class="flex-1 min-w-0 truncate text-sm font-semibold text-(--text)">{{ e.title }}</span>
          <span class="state" :class="`tone-${stateOf(e).tone}`">
            <span v-if="stateOf(e).live" class="live-dot" aria-hidden="true"></span>
            {{ stateOf(e).label }}
          </span>
          <span class="regime" :class="{ 'is-runtime': regimeOf(e) === 'runtime' }" :title="regimeOf(e) === 'runtime' ? 'Runtime' : 'Appareil'">
            <i class="bi" :class="regimeOf(e) === 'runtime' ? 'bi-hdd-network' : 'bi-pc-display'"></i>
          </span>
        </button>
        <button type="button" class="br-btn mr-1" :aria-label="`Fermer : ${e.title}`" title="Fermer" @click="dock.close(e.key)"><i class="bi bi-x-lg"></i></button>
      </div>
    </TransitionGroup>

    <Transition name="agent-panel">
      <div v-if="dock.shown.value && dock.shown.value.state === 'open'" :key="dock.shown.value.key" class="agent-card br-card" role="dialog">
        <AgentDockPanel :entry="dock.shown.value" variant="dock" />
      </div>
    </Transition>
  </div>

  <!-- Petit écran : la conversation s'ouvre en plein écran (pas de barres, pas de mode agrandi). -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isLittleScreen && dock.shown.value" class="fixed inset-0 z-2000 bg-(--bg) flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]" role="dialog" aria-modal="true">
        <AgentDockPanel :key="dock.shown.value.key" :entry="dock.shown.value" variant="sheet" />
      </div>
    </Transition>
  </Teleport>

  <AgentWindow v-if="!isLittleScreen && dock.shown.value && dock.shown.value.state === 'full'" :entry="dock.shown.value" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { aiEnabled, isLittleScreen, openedOrg, user } from '@/assets/var';
import { chatSessions, fetchSessions } from '@/services/AIService';
import useNotifications from '@/composables/useNotifications';
import { useAgentDock, type AgentDockEntry } from '@/composables/useAgentDock';
import { agentShortcutAction } from '@/services/agentDock/shortcut';
import { barState } from '@/services/agentDock/barState';
import { pendingNudges } from '@/services/agentDock/nudges';
import { nudgeAllowed, readAgentNotifPrefs } from '@/services/aiAgentNotifications';
import AgentDockPanel from './AgentDockPanel.vue';
import AgentWindow from './AgentWindow.vue';

const dock = useAgentDock();
const { entries } = dock;
const { notifications, notify, remove } = useNotifications();

const orgId = computed(() => openedOrg.value?.id ?? null);
const sessionOf = (e: AgentDockEntry) => chatSessions.value.find((s: { id: string }) => s.id === e.sessionId);
const stateOf = (e: AgentDockEntry) => barState(sessionOf(e)?.status, undefined);
const regimeOf = (e: AgentDockEntry) => (sessionOf(e)?.regime === 'runtime' ? 'runtime' : 'device') as 'runtime' | 'device';

// Les conversations sont propres à une organisation ; au retour, les barres reviennent réduites.
watch(orgId, id => {
  if (!id) return;
  dock.resetForOrg(id);
  dock.restore(id);
}, { immediate: true });

// ── Synchro des conversations (statuts) et bulles PC80 ────────────────────
const POLL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | null = null;
const poll = () => { if (aiEnabled.value && orgId.value && document.visibilityState === 'visible') void fetchSessions(); };

/** Préférences « Agent IA » (PC25) : un cas désactivé n'allume pas de bulle. */
const agentPrefs = computed(() => readAgentNotifPrefs(user.value?.notificationPreferences));

/** key de bulle -> id de la notification affichée. */
const shown = new Map<string, number>();

function syncNudges(): void {
  const wanted = aiEnabled.value
    ? pendingNudges(chatSessions.value, dock.openIds.value, dock.dismissedNudges.value, w => nudgeAllowed(agentPrefs.value, w))
    : [];
  const wantedKeys = new Set(wanted.map(n => n.key));
  // Bulle fermée à la croix : la même attente ne revient pas. Bulle devenue sans objet : retirée sans bruit.
  for (const [key, id] of [...shown]) {
    const still = notifications.value.some(n => n.id === id);
    if (!still) { shown.delete(key); if (wantedKeys.has(key)) dock.dismissNudge(key); }
    else if (!wantedKeys.has(key)) { shown.delete(key); remove(id); }
  }
  for (const n of wanted) {
    if (shown.has(n.key) || dock.dismissedNudges.value.has(n.key)) continue;
    shown.set(n.key, notify('notif:agent', { sessionId: n.sessionId, title: n.title, label: n.label, key: n.key }, -1));
  }
}
watch([chatSessions, dock.openIds, dock.dismissedNudges, notifications, aiEnabled, agentPrefs], syncNudges, { deep: true });

// ── Raccourci Ctrl/Cmd+J : ouvre ou ferme ; jamais d'ouverture sans ce geste ──
function onKeydown(e: KeyboardEvent): void {
  if (!orgId.value || !aiEnabled.value || isLittleScreen.value) return;
  const action = agentShortcutAction(e, e.target);
  if (action === 'ignore') return;
  e.preventDefault();
  const waiting = pendingNudges(chatSessions.value, new Set(), new Set())[0] ?? null;
  const waitingOpen = !waiting
    ? entries.value.find(x => ['awaiting_confirmation', 'awaiting_user', 'awaiting_input'].includes(String(sessionOf(x)?.status)) && x.sessionId)
    : null;
  dock.toggleShortcut(
    orgId.value,
    waiting ? { sessionId: waiting.sessionId, title: waiting.title } : waitingOpen?.sessionId ? { sessionId: waitingOpen.sessionId, title: waitingOpen.title } : null,
  );
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  timer = setInterval(poll, POLL_MS);
  poll();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  if (timer) clearInterval(timer);
});

// ── Glisser une barre vers la droite la ferme ─────────────────────────────
function onBarPointerDown(ev: PointerEvent, key: string): void {
  if (ev.button !== 0 || (ev.target as HTMLElement).closest('.br-btn')) return;
  const bar = ev.currentTarget as HTMLElement;
  const startX = ev.clientX;
  let dx = 0;
  let dragging = false;
  const move = (m: PointerEvent) => {
    dx = Math.max(0, m.clientX - startX);
    if (!dragging && dx > 8) { dragging = true; bar.setPointerCapture?.(m.pointerId); }
    if (dragging) { bar.style.transform = `translateX(${dx}px)`; bar.style.opacity = String(1 - Math.min(dx / 260, 0.75)); }
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (dragging && dx > 90) { dock.close(key); return; }
    bar.style.transform = '';
    bar.style.opacity = '';
    if (dragging) {
      // Un glisser n'est pas un clic : on avale le clic qui suit.
      const swallow = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
      bar.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => bar.removeEventListener('click', swallow, true), 0);
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
</script>

<style scoped>
.agent-dock { display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; min-height: 0; max-width: calc(100vw - 2rem); pointer-events: none; }
.agent-bars { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0.5rem; width: var(--br-width, 25rem); max-width: 100%; flex-shrink: 0; }
.agent-bar { position: relative; }
.agent-bar.is-amber { border-color: #f59e0b; box-shadow: 0 0 0 1px color-mix(in srgb, #f59e0b 35%, transparent), 0 8px 24px rgba(0, 0, 0, 0.22); }
.agent-card { width: var(--br-width, 25rem); max-width: 100%; height: min(34.75rem, calc(100dvh - 7rem)); display: flex; flex-direction: column; min-height: 0; transform-origin: bottom right; }
.agent-mark { display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 0.6rem; background: color-mix(in srgb, var(--primary) 16%, transparent); color: var(--primary); font-size: 0.85rem; flex-shrink: 0; }
.state { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.7rem; font-weight: 600; white-space: nowrap; color: var(--text2); }
.tone-attention { color: #f59e0b; }
.tone-error { color: #ef4444; }
.tone-done { color: var(--primary); }
.live-dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--primary); animation: agent-pulse 1.2s ease-in-out infinite; }
.regime { display: grid; place-items: center; width: 1.4rem; height: 1.4rem; border-radius: 0.5rem; font-size: 0.7rem; color: var(--text2); background: color-mix(in srgb, var(--text) 7%, transparent); }
.regime.is-runtime { color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); }
:is(button):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.close-all { pointer-events: auto; flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.4rem; height: 1.9rem; padding: 0 0.8rem; border-radius: 999px; background: var(--bg); border: 1px solid var(--border-color); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.2); font-size: 0.75rem; font-weight: 600; color: var(--text); transition: border-color 0.15s; }
.close-all:hover { border-color: color-mix(in srgb, var(--primary) 50%, transparent); }
.close-all-sep { width: 1px; height: 0.9rem; background: var(--border-color); }
.close-all-enter-active, .close-all-leave-active, .agent-bar-enter-active, .agent-bar-leave-active, .agent-panel-enter-active, .agent-panel-leave-active { transition: opacity 0.2s, transform 0.2s; }
.close-all-enter-from, .close-all-leave-to { opacity: 0; transform: translateY(6px) scale(0.95); }
.agent-bar-enter-from, .agent-bar-leave-to { opacity: 0; transform: translateX(24px); }
.agent-bar-leave-active { position: absolute; width: 100%; }
.agent-panel-enter-from, .agent-panel-leave-to { opacity: 0; transform: translateY(14px) scale(0.96); }
@keyframes agent-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .live-dot { animation: none; }
  .close-all-enter-active, .close-all-leave-active, .agent-bar-enter-active, .agent-bar-leave-active, .agent-panel-enter-active, .agent-panel-leave-active { transition: none; }
}
</style>
