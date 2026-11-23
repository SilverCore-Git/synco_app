<template>
  <!-- Mode agrandi (PC78) : une grande fenêtre par-dessus l'écran en cours, qui reste visible derrière. -->
  <Teleport to="body">
    <div class="agent-window-scrim" @click.self="dock.restoreOpen(entry.key)" @keydown.esc.stop.prevent="dock.restoreOpen(entry.key)">
      <div ref="win" class="agent-window" role="dialog" aria-modal="true" aria-label="Synco AI, fenêtre agrandie">
        <aside class="flex flex-col min-h-0 border-r border-(--border-color) bg-(--bg2)/40">
          <div class="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <h2 class="text-lg font-extrabold tracking-tight text-(--text)">Synco AI</h2>
            <button type="button" class="new-btn" @click="startNew"><i class="bi bi-plus-lg"></i> Nouvelle</button>
          </div>
          <div class="px-4 pb-2">
            <label class="search">
              <i class="bi bi-search text-(--text2)"></i>
              <input v-model="query" type="search" class="flex-1 bg-transparent outline-none text-sm" placeholder="Rechercher une conversation" aria-label="Rechercher une conversation" />
            </label>
          </div>
          <nav class="flex-1 min-h-0 overflow-y-auto px-2 pb-3" aria-label="Conversations">
            <section v-for="g in groups" :key="g.id" class="mt-3">
              <h3 class="px-2 mb-1 text-xs font-bold text-(--text2)">{{ g.label }} · {{ g.items.length }}</h3>
              <ul class="flex flex-col gap-1">
                <li v-for="s in g.items" :key="s.id">
                  <button type="button" class="row" :class="{ 'is-current': s.id === entry.sessionId }" :aria-current="s.id === entry.sessionId ? 'true' : undefined" @click="select(s)">
                    <span class="flex items-center gap-2 min-w-0">
                      <i class="bi bi-robot text-(--primary)"></i>
                      <span class="flex-1 truncate text-sm font-semibold text-(--text)">{{ s.title || 'Nouvelle conversation' }}</span>
                      <time v-if="s.statusChangedAt" class="text-[11px] text-(--text2) shrink-0">{{ when(s.statusChangedAt) }}</time>
                    </span>
                    <span class="status" :class="`tone-${barState(s.status).tone}`">
                      <span v-if="barState(s.status).live" class="live-dot" aria-hidden="true"></span>{{ barState(s.status).label }}
                    </span>
                  </button>
                </li>
              </ul>
            </section>
            <p v-if="!groups.length" class="px-3 py-6 text-center text-xs italic text-(--text2)">Aucune conversation.</p>
          </nav>
        </aside>
        <div class="min-w-0 min-h-0">
          <AgentDockPanel :key="entry.key" :entry="entry" variant="window" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { chatSessions } from '@/services/AIService';
import { useAgentDock, type AgentDockEntry } from '@/composables/useAgentDock';
import { barState } from '@/services/agentDock/barState';
import { groupSessions, type SessionLike } from '@/services/agentDock/nudges';
import AgentDockPanel from './AgentDockPanel.vue';

const props = defineProps<{ entry: AgentDockEntry }>();
const dock = useAgentDock();
const query = ref('');
const win = ref<HTMLElement | null>(null);

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const all = (chatSessions.value as SessionLike[]).filter(s => !q || (s.title || '').toLowerCase().includes(q));
  const g = groupSessions(all);
  return [
    { id: 'todo', label: 'À traiter', items: g.todo },
    { id: 'running', label: 'En cours', items: g.running },
    { id: 'recent', label: 'Récentes', items: g.recent },
  ].filter(x => x.items.length > 0);
});

function select(s: SessionLike): void {
  const e = dock.openSession(props.entry.orgId, s.id, (s.title || '').trim() || 'Conversation');
  dock.expand(e.key);
}
function startNew(): void { const e = dock.openNew(props.entry.orgId); dock.expand(e.key); }

const fmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return Date.now() - d.getTime() < 86_400_000 ? fmt.format(d) : fmtDay.format(d);
}

onMounted(() => { win.value?.querySelector<HTMLElement>('textarea, input')?.focus(); });
</script>

<style scoped>
.agent-window-scrim { position: fixed; inset: 0; z-index: 1900; display: grid; place-items: center; padding: 3.2rem 2rem 2rem; background: color-mix(in srgb, #000 38%, transparent); }
.agent-window { width: min(78rem, 100%); height: min(46rem, 100%); display: grid; grid-template-columns: 21rem minmax(0, 1fr); background: var(--bg); border: 1px solid var(--border-color); border-radius: 1.4rem; box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5); overflow: hidden; animation: win-in 0.22s ease-out; }
@media (max-width: 960px) { .agent-window { grid-template-columns: 15rem minmax(0, 1fr); } .agent-window-scrim { padding: 1rem; } }
.new-btn { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.85rem; border-radius: 0.8rem; font-size: 0.8rem; font-weight: 700; color: #fff; background: var(--primary); transition: filter 0.15s; }
.new-btn:hover { filter: brightness(1.1); }
.search { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.8rem; background: var(--bg); border: 1px solid var(--border-color); }
.search:focus-within { border-color: color-mix(in srgb, var(--primary) 60%, transparent); }
.row { width: 100%; display: flex; flex-direction: column; gap: 0.3rem; padding: 0.55rem 0.7rem; border-radius: 0.85rem; text-align: left; border: 1px solid transparent; border-left: 3px solid transparent; transition: background-color 0.15s; }
.row:hover { background: color-mix(in srgb, var(--text) 6%, transparent); }
.row.is-current { background: color-mix(in srgb, var(--primary) 10%, transparent); border-left-color: var(--primary); }
.status { display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.72rem; font-weight: 600; color: var(--text2); padding-left: 1.45rem; }
.tone-attention { color: #f59e0b; }
.tone-error { color: #ef4444; }
.tone-done { color: var(--text2); }
.live-dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--primary); animation: win-pulse 1.2s ease-in-out infinite; }
:is(button, input):focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
@keyframes win-in { from { opacity: 0; transform: translateY(10px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes win-pulse { 0%, 100% { opacity: 0.35; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .agent-window { animation: none; } .live-dot { animation: none; } }
</style>
