<template>
    <div>
        <section class="row">
            <div class="row-title">
                <h4><i class="bi bi-bell"></i> Notifications</h4>
                <p>Quand l'agent a besoin de vous. Ces choix pilotent la notification, le push et la bulle du dock. Aucune ne montre le contenu d'une conversation.</p>
            </div>
            <div class="card space-y-4">
                <div class="flex items-center gap-4">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-(--text)">Me prévenir quand l'agent a besoin de moi</p>
                        <p class="text-xs text-(--text2)">{{ prefs.enabled ? 'Activé · choisissez les cas ci-dessous.' : 'Désactivé · aucune notification de l\'agent, ni bulle.' }}</p>
                    </div>
                    <Switch :model-value="prefs.enabled" :class="saving ? 'pointer-events-none opacity-50' : ''" @update:model-value="(v: boolean) => save({ enabled: v })" />
                </div>
                <ul class="space-y-1" :class="prefs.enabled ? '' : 'opacity-50 pointer-events-none'">
                    <li v-for="c in cases" :key="c.id" class="flex items-center gap-4 py-2">
                        <span class="flex-1 min-w-0 text-sm font-medium text-(--text)">{{ c.label }}</span>
                        <Switch :model-value="prefs[c.id]" :class="saving ? 'pointer-events-none opacity-50' : ''" @update:model-value="(v: boolean) => save({ [c.id]: v })" />
                    </li>
                </ul>
                <div class="preview" aria-label="Aperçu d'une notification">
                    <span class="preview-ico"><i class="bi bi-stars"></i></span>
                    <div class="min-w-0">
                        <p class="text-sm font-bold text-(--text)">Synco AI</p>
                        <p class="text-sm text-(--text2)">{{ previewText }}</p>
                    </div>
                </div>
                <p v-if="saveFailed" class="text-sm text-red-500" role="alert">Réglage non enregistré. Vérifiez votre connexion.</p>
            </div>
        </section>

        <section class="row">
            <div class="row-title">
                <h4><i class="bi bi-list-check"></i> Plans en attente</h4>
                <p>Les plans d'action que Synco AI vous a proposés et que vous n'avez pas encore validés.</p>
            </div>
            <div class="card">
                <p v-if="summaryFailed && !summary" class="text-sm text-(--text2) flex items-center gap-3"><i class="bi bi-wifi-off"></i> Impossible de lire vos plans. <button type="button" class="text-(--primary) font-semibold" @click="reload">Réessayer</button></p>
                <p v-else-if="!summary" class="text-sm text-(--text2)">Chargement…</p>
                <p v-else-if="!summary.pending.length" class="text-sm text-(--text2)">Aucun plan n'attend votre validation.<template v-if="summary.inProgress"> {{ summary.inProgress }} en cours d'exécution.</template></p>
                <ul v-else class="space-y-2">
                    <li v-for="p in summary.pending" :key="p.id" class="plan">
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-(--text) truncate">{{ titleOf(p.conversationId) }}</p>
                            <p class="text-xs text-(--text2)">{{ p.actionCount }} action{{ p.actionCount > 1 ? 's' : '' }} · expire {{ expiryText(p.expiresAt) }}</p>
                        </div>
                        <button type="button" class="primary px-4 py-2 rounded-xl text-sm font-semibold shrink-0" @click="examine(p.conversationId)">Examiner</button>
                    </li>
                    <li v-if="summary.toValidate > summary.pending.length" class="text-xs text-(--text2)">et {{ summary.toValidate - summary.pending.length }} autre{{ summary.toValidate - summary.pending.length > 1 ? 's' : '' }}</li>
                </ul>
            </div>
        </section>

        <section class="row">
            <div class="row-title">
                <h4><i class="bi bi-shield-check"></i> Vos données</h4>
                <p>Ce que Synco garde sur vous et sur l'agent, pourquoi, jusqu'à quand, et comment l'exporter ou le supprimer.</p>
            </div>
            <div class="card flex items-center gap-4">
                <div class="flex-1 min-w-0 text-sm">
                    <p class="font-semibold text-(--text)">Mes données</p>
                    <p class="text-xs text-(--text2) mt-0.5">Les statistiques de cet écran restent sur cet appareil : rien n'en est envoyé.</p>
                    <p v-if="!MY_DATA_TAB_AVAILABLE" class="text-xs text-(--text2) mt-1">La page « Mes données » arrive bientôt dans Paramètres.</p>
                </div>
                <button type="button" class="px-4 py-2 rounded-xl text-sm font-semibold shrink-0" :class="MY_DATA_TAB_AVAILABLE ? 'primary' : 'opacity-50 cursor-not-allowed bg-(--bg)'" :disabled="!MY_DATA_TAB_AVAILABLE" @click="emit('open-my-data')">Ouvrir</button>
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import Switch from '@/components/common/Switch.vue';
import { chatSessions } from '@/services/AIService';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { useAgentDock } from '@/composables/useAgentDock';
import { AGENT_NOTIF_CASES, readAgentNotifPrefs, type AgentNotifPrefs } from '@/services/aiAgentNotifications';
import { expiryText, plansSummary as summary, plansSummaryFailed as summaryFailed, refreshPlansSummary } from '@/services/aiPlansSummary';

/** « Mes données » (PC50, C2 §8) n'a pas encore d'onglet dans UserSettings : la cible reste désactivée tant qu'il n'existe pas. */
const MY_DATA_TAB_AVAILABLE = false;

const emit = defineEmits<{ examine: []; 'open-my-data': [] }>();
const dock = useAgentDock();
const cases = AGENT_NOTIF_CASES;
const orgId = computed(() => openedOrg.value?.id ?? '');

const prefs = ref<AgentNotifPrefs>(readAgentNotifPrefs(user.value?.notificationPreferences));
watch(() => user.value?.notificationPreferences, (raw) => { prefs.value = readAgentNotifPrefs(raw); });
const saving = ref(false);
const saveFailed = ref(false);

/** Aperçu : le texte réel de la notification du premier cas actif, jamais de contenu de conversation. */
const previewText = computed(() => (cases.find(c => prefs.value[c.id]) ?? cases[0]!).sample);

const save = async (patch: Partial<AgentNotifPrefs>) => {
    const previous = prefs.value;
    const next = { ...previous, ...patch };
    prefs.value = next;
    saving.value = true;
    saveFailed.value = false;
    try {
        // Le serveur fusionne avec l'existant (salons muets, push, e-mail) ; l'objet `agent` est remplacé en entier.
        const response = await sfetch('/api/users/me', { method: 'PATCH', body: JSON.stringify({ notificationPreferences: { agent: next } }) });
        if (!response.ok) throw new Error(String(response.status));
        const updated = await response.json();
        user.value = { ...user.value, ...updated };
    } catch {
        prefs.value = previous;
        saveFailed.value = true;
    } finally {
        saving.value = false;
    }
};

const reload = () => { if (orgId.value) void refreshPlansSummary(runtimeDeps().api, orgId.value); };
onMounted(reload);
watch(orgId, reload);

const titleOf = (id: string) => {
    const s = (chatSessions.value as Array<{ id: string; title?: string | null }>).find(x => x.id === id);
    return (s?.title || '').trim() || 'Conversation';
};
const examine = (id: string) => {
    const e = dock.openSession(orgId.value, id, titleOf(id));
    dock.expand(e.key);
    emit('examine');
};
</script>

<style scoped>
.row { display: grid; grid-template-columns: 1fr; gap: 1rem; padding: 1.75rem 0; border-top: 1px solid var(--border-color); }
@media (min-width: 768px) { .row { grid-template-columns: 14rem 1fr; gap: 2rem; } }
.row-title h4 { font-weight: 800; font-size: 1rem; color: var(--text); display: flex; align-items: center; gap: 0.5rem; }
.row-title h4 i { color: var(--primary); }
.row-title p { font-size: 0.8rem; color: var(--text2); line-height: 1.5; margin-top: 0.4rem; }
.card { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 1.25rem; padding: 1.1rem 1.25rem; }
.preview { display: flex; align-items: center; gap: 0.75rem; padding: 0.8rem 1rem; border-radius: 1rem; background: var(--bg); border: 1px dashed var(--border-color); }
.preview-ico { width: 2.25rem; height: 2.25rem; border-radius: 0.8rem; display: grid; place-items: center; flex-shrink: 0; color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); }
.plan { display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.9rem; border-radius: 1rem; background: var(--bg); border: 1px solid var(--border-color); }
</style>
