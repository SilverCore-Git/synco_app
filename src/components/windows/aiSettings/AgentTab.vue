<template>
    <div class="space-y-2">

        <header class="mb-6">
            <h3 class="text-2xl font-black text-(--text)">Votre agent</h3>
            <p class="text-sm text-(--text2) mt-1 max-w-xl">Où tourne Synco AI, ce qu'il peut faire sans vous et comment il vous prévient. Ces réglages valent pour {{ openedOrg?.name || 'cette organisation' }}.</p>
        </header>

        <section class="row">
            <div class="row-title">
                <h4><i class="bi bi-hdd-network"></i> Où tourne l'agent</h4>
                <p>Sur le runtime, l'agent continue quand vous fermez l'app. Sur cet appareil, il s'arrête avec elle.</p>
            </div>
            <div class="card space-y-4">

                <div class="seg" role="radiogroup" aria-label="Où tourne l'agent">
                    <button type="button" role="radio" :aria-checked="!onRuntime" class="seg-btn" :class="!onRuntime ? 'seg-on' : ''" :disabled="busy" @click="chooseDevice"><i class="bi bi-laptop"></i> Sur cet appareil</button>
                    <button type="button" role="radio" :aria-checked="onRuntime" class="seg-btn" :class="onRuntime ? 'seg-on' : ''" :disabled="busy || !runtimeChoosable" @click="chooseRuntime"><i class="bi bi-hdd-network"></i> Sur le runtime de l'organisation</button>
                </div>

                <p v-if="!admin?.runtime && admin" class="text-sm text-(--text2)">Votre organisation n'a pas de runtime.</p>
                <p v-else-if="runtimeFeature && !runtimeFeature.allowed" class="text-sm text-(--text2)">Votre organisation ne vous autorise pas à utiliser le runtime.</p>

                <template v-if="admin?.runtime">
                    <div v-if="problem" class="p-4 rounded-2xl border space-y-2" :class="problem.severity === 'alert' ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/30'" role="alert">
                        <p class="font-bold text-sm text-(--text)"><i class="bi bi-shield-exclamation mr-1" :class="problem.severity === 'alert' ? 'text-red-500' : 'text-amber-500'"></i>{{ problem.title }}</p>
                        <p class="text-sm text-(--text2) leading-relaxed">{{ problem.detail }}</p>
                        <p v-if="problem.pinnedFingerprint" class="text-xs text-(--text2)">Empreinte épinglée sur cet appareil : <code class="fpr">{{ problem.pinnedFingerprint }}</code></p>
                        <p v-if="problem.fingerprint" class="text-xs text-(--text2)">Empreinte présentée maintenant : <code class="fpr">{{ problem.fingerprint }}</code></p>
                        <button v-if="problem.action === 'confirm_first_seen'" class="primary px-4 py-2 rounded-xl text-sm font-medium" :disabled="busy" @click="runConfirmFirstSeen">Je reconnais cette empreinte</button>
                        <button v-else-if="problem.action === 'accept_new_key' && problem.fingerprint" class="primary px-4 py-2 rounded-xl text-sm font-medium" :disabled="busy" @click="runAcceptKey">J'ai vérifié, accepter la nouvelle clé</button>
                        <button v-else-if="problem.action === 'renew_delegation'" class="primary px-4 py-2 rounded-xl text-sm font-medium" :disabled="busy" @click="chooseRuntime">Renouveler la délégation</button>
                    </div>

                    <div class="flex items-start gap-3">
                        <span class="status shrink-0" :class="admin.runtime.online ? 'status-on' : 'status-off'"><span class="dot"></span>{{ admin.runtime.online ? 'En ligne' : 'Hors ligne' }}</span>
                        <div class="text-sm min-w-0">
                            <p class="font-semibold text-(--text)">Runtime de l'organisation<template v-if="admin.runtime.signerId"> · certifié par {{ personOf(admin.runtime.signerId).name }}</template></p>
                            <p class="text-xs text-(--text2) mt-1">Empreinte de sa clé :
                                <code v-if="admin.runtime.fingerprint" class="fpr">{{ admin.runtime.fingerprint }}</code><template v-else> non vérifiée</template>
                                <template v-if="admin.runtime.pinState === 'match'"> · identique à celle épinglée sur cet appareil</template>
                            </p>
                            <p v-if="!admin.runtime.online" class="text-xs text-(--text2) mt-1">Hors ligne : votre délégation reste en place et reprend dès son retour.</p>
                        </div>
                    </div>

                    <div v-if="delegation && delegation.status === 'active'" class="flex items-center gap-3 pt-3 border-t border-(--border-color)">
                        <div class="flex-1 min-w-0 text-sm">
                            <p class="font-semibold text-(--text)">Vos clés confiées au runtime</p>
                            <p class="text-xs text-(--text2) mt-0.5">Délégation valide jusqu'au {{ formatDate(delegation.expiresAt) }} · renouvelée à chaque ouverture de l'app · {{ entriesText }}</p>
                        </div>
                        <button class="px-4 py-2 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10 hover:bg-red-500/15 shrink-0" :disabled="busy" @click="confirmRevoke = true">Révoquer</button>
                    </div>
                </template>

                <p v-if="loadFailed" class="text-sm text-(--text2) flex items-center gap-3"><i class="bi bi-wifi-off"></i> Impossible de lire l'état du runtime. <button class="text-(--primary) font-semibold" @click="refresh">Réessayer</button></p>
            </div>
        </section>

        <section class="row" :class="featuresFailed || (autoFeature && !autoFeature.allowed) ? 'opacity-60' : ''">
            <div class="row-title">
                <h4><i class="bi bi-lightning-charge"></i> Mode autonome</h4>
                <p>Par défaut, chaque action est un plan que vous validez.<template v-if="autoFeature?.allowed"> Votre organisation vous autorise à activer ce mode.</template></p>
            </div>
            <div class="card space-y-4">
                <div class="flex items-center gap-4">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-(--text)">Laisser Synco AI créer des salons sans me demander</p>
                        <p class="text-xs text-(--text2)">{{ autonomyHint }}</p>
                    </div>
                    <Switch :model-value="autonomyOn || askingAutonomy" @update:model-value="onAutonomyToggle" :class="autonomyToggleBlocked ? 'pointer-events-none opacity-50' : ''" />
                </div>
                <p v-if="featuresFailed" class="text-sm text-(--text2)">Vos droits n'ont pas pu être lus. <button class="text-(--primary) font-semibold" @click="refresh">Réessayer</button></p>
                <p v-else-if="autoFeature && !autoFeature.allowed" class="text-sm text-(--text2)">Votre organisation ne l'autorise pas.</p>
                <AutonomyWarning v-if="askingAutonomy" :busy="busy" @cancel="askingAutonomy = false" @confirm="runEnableAutonomy" />
                <p v-if="autonomyProblem" class="text-sm text-red-500" role="alert">{{ autonomyProblem.title }}. {{ autonomyProblem.detail }}</p>
            </div>
        </section>

        <section v-if="!featuresFailed && (!confirmFeature || confirmFeature.allowed)" class="row">
            <div class="row-title">
                <h4><i class="bi bi-check2-circle"></i> Confirmations</h4>
                <p>Les actions que vous avez choisi de toujours accepter. Jamais possible pour une suppression ou un envoi hors de Synco.</p>
            </div>
            <div class="card">
                <div class="flex flex-wrap gap-2">
                    <span v-for="k in accepted" :key="k" class="pill">
                        <i class="bi" :class="autoAcceptLabel(k).icon"></i>{{ autoAcceptLabel(k).label }}
                        <button type="button" class="pill-x" :aria-label="`Ne plus toujours accepter : ${autoAcceptLabel(k).label}`" @click="removeAccepted(k)"><i class="bi bi-x-lg"></i></button>
                    </span>
                    <span v-if="!accepted.length" class="text-sm text-(--text2)">Aucune action n'est acceptée d'avance.</span>
                </div>
                <p class="text-xs text-(--text2) mt-4 flex items-center gap-2"><i class="bi bi-info-circle"></i> Pour en ajouter une, choisissez « Toujours accepter » quand Synco AI la propose.</p>
            </div>
        </section>

        <AgentAlertsSections @examine="emit('examine')" />

        <ConfirmDelete
            :show="confirmRevoke" :itemName="'la délégation'" itemType="la délégation" title="Révoquer la délégation ?" buttonText="Révoquer" :loading="busy"
            message="Le runtime n'aura plus accès à vos clés. Les conversations qui tournent sur le runtime reviennent en local et l'agent s'arrête quand vous fermez l'app."
            @confirm="runRevoke" @cancel="confirmRevoke = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import Switch from '@/components/common/Switch.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import {
    acceptNewRuntimeKey, createDelegation, disableAutonomousMode, enableAutonomousMode, getDelegationSummary, revokeMyDelegation,
    type DelegationSummary,
} from '@/services/aiRuntime';
import {
    explainRuntimeError, loadRuntimeAdminView, previousPinnedFingerprint, runtimeDeps, type RuntimeAdminView, type RuntimeProblem,
} from '@/services/aiRuntimeUi';
import { autonomyToggleDisabled, redelegateAfterKeyAcceptance } from '@/services/aiAgentRules';
import { fetchMyFeatures, type MyFeature } from '@/services/aiFeaturePolicies';
import { autoAcceptLabel, useAutoAcceptTools } from '@/services/aiAutoAccept';
import { personOf } from '@/views/OrgSpace/views/settings/views/components/policyMembers';
import AutonomyWarning from './AutonomyWarning.vue';
import AgentAlertsSections from './AgentAlertsSections.vue';

const emit = defineEmits<{ examine: [] }>();

const toast = useToast();
const deps = runtimeDeps();
const orgId = computed(() => openedOrg.value?.id ?? '');

const admin = ref<RuntimeAdminView | null>(null);
const delegation = ref<DelegationSummary | null>(null);
const features = ref<MyFeature[]>([]);
const loadFailed = ref(false);
const featuresFailed = ref(false);
const busy = ref(false);
const problem = ref<RuntimeProblem | null>(null);
const autonomyProblem = ref<RuntimeProblem | null>(null);
const askingAutonomy = ref(false);
const confirmRevoke = ref(false);

const featureOf = (f: MyFeature['feature']) => features.value.find(x => x.feature === f);
const runtimeFeature = computed(() => featureOf('runtime_mode'));
const autoFeature = computed(() => featureOf('autonomous_mode'));
const confirmFeature = computed(() => featureOf('tool_auto_accept'));

const onRuntime = computed(() => !!delegation.value && delegation.value.status === 'active');
const runtimeChoosable = computed(() => !!admin.value?.runtime && (runtimeFeature.value?.allowed ?? true));
/** Le mode affiché vient du mandat VÉRIFIÉ (DelegationSummary.autonomous), jamais d'un champ servi. */
const autonomyOn = computed(() => !!delegation.value && delegation.value.status === 'active' && delegation.value.autonomous);

const refresh = async () => {
    if (!orgId.value) return;
    loadFailed.value = false;
    featuresFailed.value = false;
    await Promise.all([
        loadRuntimeAdminView(deps, orgId.value).then(v => { admin.value = v; problem.value = v.problem; }).catch(() => { loadFailed.value = true; }),
        getDelegationSummary(deps, orgId.value).then(d => { delegation.value = d; }).catch(() => { delegation.value = null; }),
        fetchMyFeatures(deps.api, orgId.value).then(f => { features.value = f; }).catch(() => { featuresFailed.value = true; }),
    ]);
};
onMounted(refresh);
watch(orgId, () => { admin.value = null; delegation.value = null; void refresh(); });

const formatDate = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const entriesText = computed(() => {
    const d = delegation.value;
    if (!d) return '';
    if (d.threadCount !== null && d.spaceCount !== null) return `${d.threadCount} salon${d.threadCount > 1 ? 's' : ''} et ${d.spaceCount} espace${d.spaceCount > 1 ? 's' : ''}`;
    return `${d.entryCount} clé${d.entryCount > 1 ? 's' : ''} confiée${d.entryCount > 1 ? 's' : ''}`;
});

/** Exécute une action du runtime ; toute erreur typée devient un bandeau expliqué. */
const run = async (fn: () => Promise<void>, target: 'runtime' | 'autonomy' = 'runtime'): Promise<boolean> => {
    busy.value = true;
    try {
        await fn();
        return true;
    } catch (e) {
        const p = explainRuntimeError(e, { pinnedFingerprint: await previousPinnedFingerprint(deps, orgId.value).catch(() => undefined) });
        if (target === 'autonomy') autonomyProblem.value = p; else problem.value = p;
        return false;
    } finally {
        busy.value = false;
    }
};

const delegate = async (confirmFirstSeen: boolean, confirmedFingerprint?: string) => {
    const ok = await run(async () => { delegation.value = await createDelegation(deps, orgId.value, { mode: autonomyOn.value ? 'auto' : 'plan', confirmFirstSeen, confirmedFingerprint }); });
    if (ok) problem.value = null;
    return ok;
};
const chooseRuntime = () => { if (!onRuntime.value || problem.value?.action === 'renew_delegation') void delegate(false); };
// Seule l'empreinte AFFICHÉE est confirmée : si le runtime en présente une autre entre-temps, L10 refuse.
const runConfirmFirstSeen = () => { void delegate(true, problem.value?.fingerprint ?? ''); };
const runAcceptKey = async () => {
    const fp = problem.value?.fingerprint;
    if (!fp) return;
    const wasActive = onRuntime.value;
    const ok = await run(async () => { await acceptNewRuntimeKey(deps, orgId.value, fp); });
    if (ok && redelegateAfterKeyAcceptance(wasActive)) await delegate(false);
    await refresh();
};
const chooseDevice = () => { if (onRuntime.value) confirmRevoke.value = true; };
const runRevoke = async () => {
    const ok = await run(async () => { await revokeMyDelegation(deps, orgId.value); delegation.value = null; });
    confirmRevoke.value = false;
    if (ok) { toast.show('Délégation révoquée : l\'agent tourne de nouveau sur cet appareil.', 'success'); await refresh(); }
};

const autonomyToggleBlocked = computed(() => autonomyToggleDisabled({
    busy: busy.value, featuresFailed: featuresFailed.value, allowed: !!autoFeature.value?.allowed, autonomyOn: autonomyOn.value, onRuntime: onRuntime.value,
}));
const autonomyHint = computed(() => {
    if (autonomyOn.value) return 'Activé · l\'agent crée les salons sans plan à valider. Les autres actions passent toujours par un plan.';
    if (!onRuntime.value) return 'Disponible quand l\'agent tourne sur le runtime de l\'organisation.';
    return 'Désactivé · les autres actions passent toujours par un plan.';
});
const onAutonomyToggle = async (value: boolean) => {
    if (autonomyToggleBlocked.value) return;
    autonomyProblem.value = null;
    if (value) { askingAutonomy.value = true; return; }
    askingAutonomy.value = false;
    const ok = await run(async () => { delegation.value = await disableAutonomousMode(deps, orgId.value); }, 'autonomy');
    if (ok) { toast.show('Mode autonome désactivé : l\'agent repasse en mode plan.', 'success'); await refresh(); }
};
const runEnableAutonomy = async () => {
    const version = autoFeature.value?.warningVersion;
    if (version === null || version === undefined) { autonomyProblem.value = explainRuntimeError(null); return; }
    const ok = await run(async () => { delegation.value = await enableAutonomousMode(deps, orgId.value, version); }, 'autonomy');
    if (ok) { askingAutonomy.value = false; toast.show('Mode autonome activé.', 'success'); await refresh(); }
};

const { list: accepted, remove: removeAccepted } = useAutoAcceptTools(() => orgId.value);
</script>

<style scoped>
.row { display: grid; grid-template-columns: 1fr; gap: 1rem; padding: 1.75rem 0; border-top: 1px solid var(--border-color); }
.row:first-of-type { border-top: none; padding-top: 0; }
@media (min-width: 768px) { .row { grid-template-columns: 14rem 1fr; gap: 2rem; } }
.row-title h4 { font-weight: 800; font-size: 1rem; color: var(--text); display: flex; align-items: center; gap: 0.5rem; }
.row-title h4 i { color: var(--primary); }
.row-title p { font-size: 0.8rem; color: var(--text2); line-height: 1.5; margin-top: 0.4rem; }
.card { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 1.25rem; padding: 1.1rem 1.25rem; }
.seg { display: flex; flex-wrap: wrap; gap: 0.35rem; padding: 0.3rem; border-radius: 1rem; background: color-mix(in srgb, var(--text) 6%, transparent); }
.seg-btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.55rem 1rem; border-radius: 0.8rem; font-size: 0.85rem; font-weight: 600; color: var(--text2); border: 1px solid transparent; transition: all 0.15s; }
.seg-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.seg-on { background: var(--bg); color: var(--text); border-color: var(--primary); }
.fpr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; padding: 0.1rem 0.4rem; border-radius: 0.4rem; background: var(--bg); border: 1px solid var(--border-color); word-break: break-all; }
.status { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
.status-on { color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.status-off { color: var(--text2); background: color-mix(in srgb, var(--text) 8%, transparent); }
.dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: currentColor; }
.pill { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem 0.35rem 0.8rem; border-radius: 999px; font-size: 0.8rem; font-weight: 500; background: var(--bg); border: 1px solid var(--border-color); color: var(--text); }
.pill i:first-child { color: var(--primary); }
.pill-x { color: var(--text2); font-size: 0.7rem; padding: 0.2rem; border-radius: 999px; }
.pill-x:hover { color: var(--text); background: color-mix(in srgb, var(--text) 10%, transparent); }
</style>
