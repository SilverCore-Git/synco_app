<template>
    <div class="space-y-6">
        <header class="flex flex-wrap items-end justify-between gap-4">
            <div>
                <h3 class="text-2xl font-black text-(--text)">Ce que consomme votre agent</h3>
                <p class="text-sm text-(--text2) mt-1 max-w-xl">En tokens. Ces chiffres sont comptés sur cet appareil, à partir de ce qui n'est pas chiffré.</p>
            </div>
            <button class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1" :disabled="!usageEvents.length" @click="showReset = true">
                <i class="bi bi-trash"></i> Réinitialiser
            </button>
        </header>

        <div class="flex flex-wrap gap-x-6 gap-y-3">
            <div class="flex gap-1" role="group" aria-label="Période">
                <button v-for="p in periods" :key="p.id" class="chip" :class="period === p.id ? 'chip-active' : ''" @click="period = p.id">{{ p.label }}</button>
            </div>
            <div class="flex gap-1" role="group" aria-label="Source">
                <button v-for="s in sources" :key="s.id" class="chip" :class="source === s.id ? 'chip-active' : ''" @click="source = s.id">{{ s.label }}</button>
            </div>
        </div>

        <div v-if="plansFailed" class="banner" role="status"><i class="bi bi-wifi-off"></i> Statistiques des plans indisponibles.
            <button type="button" class="text-(--primary) font-semibold" @click="reloadPlans">Réessayer</button></div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div v-for="c in cards" :key="c.label" class="kpi">
                <p class="text-xs font-semibold text-(--text2)">{{ c.label }}</p>
                <p class="text-3xl font-black mt-1 text-(--text)">{{ c.value }}</p>
                <p class="text-xs text-(--text2) mt-1">{{ c.hint }}</p>
            </div>
        </div>

        <div>
            <h4 class="section-title">Tokens par jour</h4>
            <div class="card !p-3">
                <div class="flex items-end gap-px h-28">
                    <div v-for="d in daily" :key="d.day" class="flex-1 min-w-0 h-full flex items-end" :title="`${d.day} : ${d.tokens.toLocaleString('fr-FR')} tokens`">
                        <div class="w-full rounded-t bg-(--primary)" :style="{ height: d.tokens ? Math.max(4, d.tokens / dailyMax * 100) + '%' : '2px', opacity: d.tokens ? 1 : 0.2 }"></div>
                    </div>
                </div>
                <p class="text-xs text-(--text2) mt-2">Pic : {{ fmt(dailyMax > 1 ? dailyMax : 0) }} tokens en un jour</p>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
                <h4 class="section-title">Par conversation</h4>
                <div class="card !p-0 overflow-hidden">
                    <p v-if="!conversations.length" class="empty">Aucune conversation sur la période.</p>
                    <div v-for="c in conversations" :key="c.sessionId" class="line">
                        <span class="flex-1 min-w-0 truncate font-medium">{{ titleOf(c.sessionId) }}</span>
                        <span class="text-(--text2) w-20 text-right hidden sm:block">{{ c.source === 'runtime' ? 'runtime' : 'appareil' }}</span>
                        <span class="text-(--text2) w-16 text-right">{{ c.tools }} outil{{ c.tools > 1 ? 's' : '' }}</span>
                        <span class="w-16 text-right font-bold">{{ fmt(c.tokens) }}</span>
                    </div>
                </div>
            </div>

            <div>
                <h4 class="section-title">Par outil</h4>
                <div class="card !p-0 overflow-hidden">
                    <p v-if="!tools.length" class="empty">Aucun appel d'outil sur la période.</p>
                    <div v-for="t in tools" :key="t.tool" class="line">
                        <span class="w-40 min-w-0 truncate font-medium">{{ toolLabel(t.tool) }}</span>
                        <span class="flex-1 h-1.5 rounded-full bg-(--bg)"><span class="block h-full rounded-full bg-(--primary)" :style="{ width: Math.max(4, t.calls / toolMax * 100) + '%' }"></span></span>
                        <span class="w-10 text-right font-bold">{{ t.calls }}</span>
                    </div>
                </div>
            </div>

            <div>
                <h4 class="section-title">Par modèle</h4>
                <div class="card !p-0 overflow-hidden">
                    <p v-if="!models.length" class="empty">Aucun modèle utilisé sur la période.</p>
                    <div v-for="m in models" :key="m.key" class="line">
                        <span class="flex-1 min-w-0 truncate font-medium">{{ m.key }}</span>
                        <span class="text-(--text2) w-16 text-right">{{ m.requests }} req.</span>
                        <span class="text-(--text2) w-12 text-right">{{ share(m.totalTokens) }}</span>
                        <span class="w-16 text-right font-bold">{{ fmt(m.totalTokens) }}</span>
                    </div>
                </div>
            </div>

            <div>
                <h4 class="section-title">Plans d'action</h4>
                <div class="card">
                    <p v-if="!plans" class="text-sm text-(--text2)">{{ plansFailed ? 'Indisponible pour le moment.' : 'Chargement…' }}</p>
                    <dl v-else class="grid grid-cols-2 gap-3">
                        <div><dt class="text-xs text-(--text2)">À valider</dt><dd class="text-2xl font-black">{{ plans.toValidate }}</dd></div>
                        <div><dt class="text-xs text-(--text2)">En cours</dt><dd class="text-2xl font-black">{{ plans.inProgress }}</dd></div>
                    </dl>
                </div>
            </div>
        </div>

        <p class="text-[11px] text-(--text2)">Ces chiffres viennent seulement de ce qui n'est pas chiffré : jamais le contenu de vos conversations. Ils ne quittent pas cet appareil.</p>

        <ConfirmDelete :show="showReset" itemName="les statistiques" itemType="les statistiques" title="Réinitialiser les statistiques ?" buttonText="Réinitialiser"
            message="Les compteurs de cet appareil repartent de zéro. Rien n'est supprimé côté serveur." @confirm="doReset" @cancel="showReset = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { chatSessions } from '@/services/AIService';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { plansSummary as plans, plansSummaryFailed as plansFailed, refreshPlansSummary } from '@/services/aiPlansSummary';
import {
    dailyTokens, filterUsage, groupUsage, resetUsageStats, summarizeUsage, tokenEvents, toolUsage, topConversations, usageEvents, type UsageSource,
} from '@/services/aiUsageStats';

const periods = [{ id: 7, label: '7 jours' }, { id: 30, label: '30 jours' }, { id: 0, label: 'Tout' }];
const sources: Array<{ id: UsageSource; label: string }> = [{ id: 'all', label: 'Tout' }, { id: 'device', label: 'Appareil' }, { id: 'runtime', label: 'Runtime' }];
const period = ref(30);
const source = ref<UsageSource>('all');
const showReset = ref(false);

const events = computed(() => filterUsage(usageEvents.value, { days: period.value, source: source.value }));
const summary = computed(() => summarizeUsage(events.value));

const fmt = (n: number) => n < 1000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k' : (n / 1e6).toFixed(1) + 'M';

const cards = computed(() => [
    { label: 'Tokens', value: fmt(summary.value.tokens), hint: `${summary.value.requests} requête${summary.value.requests > 1 ? 's' : ''}` },
    { label: 'Conversations', value: String(summary.value.conversations.total), hint: `${summary.value.conversations.runtime} runtime · ${summary.value.conversations.device} appareil` },
    { label: 'Appels d\'outils', value: String(summary.value.toolCalls), hint: 'comptés sur le runtime' },
    { label: 'Plans', value: plans.value ? String(plans.value.toValidate + plans.value.inProgress) : '0', hint: plans.value ? `${plans.value.toValidate} à valider · ${plans.value.inProgress} en cours` : 'à valider ou en cours' },
]);

const daily = computed(() => dailyTokens(tokenEvents(events.value), Math.min(period.value || 30, 30)));
const dailyMax = computed(() => Math.max(1, ...daily.value.map(d => d.tokens)));
const conversations = computed(() => topConversations(events.value, 5));
const tools = computed(() => toolUsage(events.value).slice(0, 8));
const toolMax = computed(() => Math.max(1, ...tools.value.map(t => t.calls)));
const models = computed(() => groupUsage(tokenEvents(events.value), e => e.model));
const share = (n: number) => summary.value.tokens ? Math.round(n / summary.value.tokens * 100) + ' %' : '0 %';

const titleOf = (id: string) => {
    const s = (chatSessions.value as Array<{ id: string; title?: string | null }>).find(x => x.id === id);
    return (s?.title || '').trim() || 'Conversation';
};
/** Nom lisible d'un outil : `create_task` devient « create task ». */
const toolLabel = (name: string) => name.replace(/_/g, ' ');

const reloadPlans = () => { if (openedOrg.value?.id) void refreshPlansSummary(runtimeDeps().api, openedOrg.value.id); };
onMounted(reloadPlans);
watch(() => openedOrg.value?.id, reloadPlans);

const doReset = () => { resetUsageStats(); showReset.value = false; };
</script>

<style scoped>
.chip { padding: 0.35rem 0.85rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; color: var(--text2); background: color-mix(in srgb, var(--text) 6%, transparent); }
.chip-active { color: var(--bg); background: var(--primary); }
.card { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 1.25rem; padding: 1.1rem 1.25rem; }
.kpi { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 1.25rem; padding: 1rem 1.1rem; }
.section-title { font-weight: 800; font-size: 0.95rem; color: var(--text); margin-bottom: 0.6rem; }
.line { display: flex; align-items: center; gap: 0.75rem; padding: 0.6rem 1rem; border-bottom: 1px solid var(--border-color); font-size: 0.8rem; }
.line:last-child { border-bottom: none; }
.empty { padding: 1rem; font-size: 0.8rem; color: var(--text2); }
.banner { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; padding: 0.7rem 1rem; border-radius: 1rem; font-size: 0.85rem; color: var(--text); background: color-mix(in srgb, #f59e0b 12%, transparent); border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent); }
</style>
