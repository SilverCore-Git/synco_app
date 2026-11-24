<template>
    <div class="space-y-8">

        <div>
            <h3 class="text-2xl font-black text-(--text) mb-2">Runtime de l'organisation</h3>
            <p class="text-sm text-(--text2) max-w-2xl">Le runtime est un serveur que vous hébergez : il fait tourner l'agent même quand personne n'a l'app ouverte. Chaque membre décide ensuite de lui confier ses clés ; vous ne voyez jamais le contenu des conversations.</p>
        </div>

        <div v-if="loadFailed" class="p-5 rounded-2xl bg-(--bg2) border border-(--border-color) flex items-center gap-4">
            <i class="bi bi-wifi-off text-xl text-(--text2)"></i>
            <p class="flex-1 text-sm">Le registre du runtime n'a pas pu être lu.</p>
            <button class="default px-4 py-2 rounded-xl text-sm font-medium" @click="load">Réessayer</button>
        </div>
        <div v-else-if="!view" class="h-40 rounded-3xl bg-(--bg2) animate-pulse" aria-busy="true"></div>

        <template v-else>

            <div v-if="view.problem" class="p-5 rounded-2xl border flex items-start gap-4" :class="view.problem.severity === 'alert' ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/30'" role="alert">
                <i class="bi bi-shield-exclamation text-2xl shrink-0" :class="view.problem.severity === 'alert' ? 'text-red-500' : 'text-amber-500'"></i>
                <div class="min-w-0 space-y-1">
                    <h4 class="font-bold text-sm text-(--text)">{{ view.problem.title }}</h4>
                    <p class="text-sm text-(--text2) leading-relaxed">{{ view.problem.detail }}</p>
                    <p v-if="view.problem.pinnedFingerprint" class="text-xs text-(--text2)">Épinglée sur cet appareil : <code class="fpr">{{ view.problem.pinnedFingerprint }}</code></p>
                    <p v-if="view.problem.fingerprint" class="text-xs text-(--text2)">Présentée maintenant : <code class="fpr">{{ view.problem.fingerprint }}</code></p>
                </div>
            </div>

            <section v-if="view.runtime" class="rounded-3xl bg-(--bg2) border border-(--border-color) p-5 sm:p-6 space-y-5">
                <div class="flex items-start gap-4">
                    <div class="w-12 h-12 rounded-2xl bg-(--primary)/15 text-(--primary) flex items-center justify-center shrink-0"><i class="bi bi-hdd-network text-2xl"></i></div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h4 class="text-lg font-black text-(--text) truncate">{{ hostOf(view.runtime.url) }}</h4>
                            <span class="status" :class="view.runtime.online ? 'status-on' : 'status-off'"><span class="dot"></span>{{ view.runtime.online ? 'En ligne' : 'Hors ligne' }}</span>
                        </div>
                        <p class="text-xs text-(--text2) mt-1 truncate">{{ view.runtime.url }}<template v-if="view.runtime.softwareVersion"> · version {{ view.runtime.softwareVersion }}</template></p>
                    </div>
                    <button class="px-4 py-2 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10 hover:bg-red-500/15 shrink-0" @click="confirmUnpair = true">Désappairer</button>
                </div>
                <dl class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                        <dt class="text-xs text-(--text2) mb-1">Empreinte de sa clé</dt>
                        <dd><code v-if="view.runtime.fingerprint" class="fpr">{{ view.runtime.fingerprint }}</code><span v-else class="text-(--text2)">Non vérifiée</span></dd>
                        <dd v-if="view.runtime.pinState === 'match'" class="text-xs text-(--primary) mt-1"><i class="bi bi-check-circle-fill"></i> Identique à celle épinglée sur cet appareil</dd>
                    </div>
                    <div>
                        <dt class="text-xs text-(--text2) mb-1">Certifié par</dt>
                        <dd class="font-medium">{{ view.runtime.signerId ? personOf(view.runtime.signerId).name : 'Inconnu' }}</dd>
                    </div>
                </dl>
            </section>

            <section v-else class="rounded-3xl bg-(--bg2) border border-(--border-color) p-5 sm:p-6 space-y-5">
                <div>
                    <h4 class="text-lg font-black text-(--text)">Appairer un runtime</h4>
                    <p class="text-sm text-(--text2) mt-1">Saisissez l'adresse du runtime et le code d'appairage qu'il affiche au démarrage. Le code est comparé à l'empreinte de sa clé : s'il ne correspond pas, rien n'est enregistré.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label class="block">
                        <span class="text-xs font-semibold text-(--text2)">Adresse</span>
                        <input v-model.trim="pairUrl" type="url" inputmode="url" class="field" placeholder="https://runtime.exemple.fr" :disabled="pairing || !!preview" autocomplete="off" />
                    </label>
                    <label class="block">
                        <span class="text-xs font-semibold text-(--text2)">Code d'appairage</span>
                        <input v-model.trim="pairCode" type="text" class="field font-mono" placeholder="XXXX-XXXX-XXXX" :disabled="pairing || !!preview" autocomplete="off" spellcheck="false" />
                    </label>
                </div>

                <div v-if="preview" class="p-4 rounded-2xl bg-(--primary)/8 border border-(--primary)/30 space-y-2">
                    <p class="text-sm font-bold text-(--text)">Ce runtime présente cette empreinte</p>
                    <code class="fpr block">{{ preview.fingerprint }}</code>
                    <p class="text-xs text-(--text2)">Comparez-la avec celle affichée par le runtime. En appairant, vous certifiez ce runtime pour toute l'organisation avec votre clé de signature.</p>
                </div>

                <p v-if="pairProblem" class="text-sm flex items-start gap-2" :class="pairProblem.severity === 'alert' ? 'text-red-500' : 'text-amber-500'" role="alert">
                    <i class="bi bi-exclamation-triangle-fill mt-0.5"></i><span><strong>{{ pairProblem.title }}.</strong> {{ pairProblem.detail }}</span>
                </p>

                <div class="flex justify-end gap-3">
                    <button v-if="preview" class="default px-5 py-2.5 rounded-xl text-sm font-medium" :disabled="pairing" @click="resetPreview">Modifier</button>
                    <button v-if="!preview" class="primary px-6 py-2.5 rounded-xl text-sm font-medium" :class="pairing ? 'loader' : ''" :disabled="pairing || !pairUrl || !pairCode" @click="runPreview">Vérifier le runtime</button>
                    <button v-else class="primary px-6 py-2.5 rounded-xl text-sm font-medium" :class="pairing ? 'loader' : ''" :disabled="pairing" @click="runPair">Appairer ce runtime</button>
                </div>
            </section>

            <section class="rounded-3xl bg-(--bg2) border border-(--border-color) p-5 sm:p-6 space-y-6">
                <div>
                    <h4 class="text-lg font-black text-(--text)">Politique du runtime</h4>
                    <p class="text-sm text-(--text2) mt-1">Qui peut s'en servir se règle dans l'onglet Sécurité.</p>
                </div>

                <label class="flex items-center gap-4 cursor-pointer">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-(--text)">Autoriser le mode runtime dans l'organisation</p>
                        <p class="text-xs text-(--text2)">Désactivé, aucune conversation ne peut tourner sur le runtime et les délégations sont refusées.</p>
                    </div>
                    <Switch v-model="draft.enabled" />
                </label>

                <div>
                    <p class="text-sm font-semibold text-(--text)">Durée maximale d'une délégation</p>
                    <p class="text-xs text-(--text2) mb-3">Passé ce délai sans ouverture de l'app, le runtime perd l'accès aux clés. Elle se renouvelle à chaque ouverture.</p>
                    <div class="flex flex-wrap gap-2" role="radiogroup" aria-label="Durée maximale d'une délégation">
                        <button v-for="d in DURATIONS" :key="d.days" type="button" role="radio" :aria-checked="draft.maxDelegationDays === d.days" class="dur" :class="draft.maxDelegationDays === d.days ? 'dur-on' : ''" @click="draft.maxDelegationDays = d.days">{{ d.label }}</button>
                    </div>
                </div>

                <div>
                    <p class="text-sm font-semibold text-(--text)">Confirmation par outil, en l'absence de l'utilisateur</p>
                    <p class="text-xs text-(--text2) mb-3">Sans réglage, l'outil demande une confirmation (« Demander »). « Refuser » l'interdit au runtime ; « Automatique » l'exécute sans demander.</p>
                    <div class="flex flex-wrap gap-2 mb-3">
                        <span v-for="name in toolNames" :key="name" class="tool-chip">
                            <span class="font-medium">{{ name }}</span>
                            <select class="tool-select" :value="draft.toolPolicy[name]" :aria-label="`Politique de ${name}`" @change="setTool(name, ($event.target as HTMLSelectElement).value)">
                                <option value="ask">Demander</option><option v-if="!sensitiveTools.has(name)" value="auto">Automatique</option><option value="deny">Refuser</option>
                            </select>
                            <button type="button" class="text-(--text2) hover:text-(--text)" :aria-label="`Retirer ${name}`" @click="dropTool(name)"><i class="bi bi-x-lg text-xs"></i></button>
                        </span>
                        <span v-if="!toolNames.length" class="text-xs text-(--text2)">Aucun réglage : tous les outils demandent confirmation.</span>
                    </div>
                    <div class="relative max-w-sm">
                        <input v-model="toolQuery" type="text" class="field" placeholder="Ajouter un outil (rechercher)" autocomplete="off" @focus="loadTools" />
                        <ul v-if="toolQuery && toolMatches.length" class="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl bg-(--bg) border border-(--border-color) shadow-xl py-1">
                            <li v-for="t in toolMatches" :key="t"><button type="button" class="w-full text-left px-3 py-2 text-sm hover:bg-(--primary)/10" @click="addTool(t)">{{ t }}</button></li>
                        </ul>
                    </div>
                </div>

                <div v-if="policyProblem" class="text-sm text-red-500 flex items-start gap-2" role="alert"><i class="bi bi-exclamation-octagon-fill mt-0.5"></i><span>{{ policyProblem }}</span></div>

                <div class="flex justify-end gap-3" v-if="policyDirty">
                    <button class="default px-5 py-2.5 rounded-xl text-sm font-medium" :disabled="savingPolicy" @click="resetDraft">Annuler</button>
                    <button class="primary px-6 py-2.5 rounded-xl text-sm font-medium" :class="savingPolicy ? 'loader' : ''" :disabled="savingPolicy" @click="savePolicy">Enregistrer</button>
                </div>
            </section>

        </template>

        <ConfirmDelete
            :show="confirmUnpair" :itemName="view?.runtime ? hostOf(view.runtime.url) : ''" itemType="le runtime"
            title="Désappairer le runtime ?" buttonText="Désappairer" :loading="unpairing"
            message="Les conversations qui tournent sur le runtime reviennent en local et toutes les délégations sont révoquées. Chaque membre devra revérifier l'empreinte d'un futur runtime."
            @confirm="runUnpair" @cancel="confirmUnpair = false" />

    </div>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { openedOrg, organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import Switch from '@/components/common/Switch.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { loadToolManifest } from '@/services/agent/clientAgent';
import { pairRuntime, previewPairing, unpairRuntime, type PairingPreview } from '@/services/aiRuntime';
import { explainRuntimeError, runtimeDeps, type RuntimeAdminView, loadRuntimeAdminView, type RuntimeProblem, type ToolPolicyValue } from '@/services/aiRuntimeUi';
import { personOf } from './components/policyMembers';

const toast = useToast();
const deps = runtimeDeps();
const orgId = computed(() => openedOrg.value?.id ?? '');

const view = ref<RuntimeAdminView | null>(null);
const loadFailed = ref(false);
const draft = reactive<{ enabled: boolean; maxDelegationDays: number; toolPolicy: Record<string, ToolPolicyValue> }>({ enabled: false, maxDelegationDays: 7, toolPolicy: {} });

const DURATIONS = [
    { days: 1 / 24, label: '1 heure' },
    { days: 1, label: '1 jour' },
    { days: 7, label: '7 jours' },
    { days: 30, label: '30 jours' },
];

const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return url; } };

const resetDraft = () => {
    if (!view.value) return;
    draft.enabled = view.value.policy.enabled;
    draft.maxDelegationDays = view.value.policy.maxDelegationDays;
    draft.toolPolicy = { ...view.value.policy.toolPolicy };
};

const load = async () => {
    if (!orgId.value) return;
    loadFailed.value = false;
    try {
        view.value = await loadRuntimeAdminView(deps, orgId.value);
        resetDraft();
    } catch {
        loadFailed.value = true;
    }
};
onMounted(async () => { await load(); await loadTools(); });
// Changement d'org : les outils et les sensibles de l'org précédente ne valent plus (PC86), on recharge tout.
watch(orgId, async () => {
    view.value = null;
    tools.value = [];
    sensitiveTools.value = new Set();
    toolQuery.value = '';
    await load();
    await loadTools();
});

const policyDirty = computed(() => !!view.value && (
    draft.enabled !== view.value.policy.enabled
    || draft.maxDelegationDays !== view.value.policy.maxDelegationDays
    || JSON.stringify(Object.entries(draft.toolPolicy).sort()) !== JSON.stringify(Object.entries(view.value.policy.toolPolicy).sort())));

// Appairage
const pairUrl = ref('');
const pairCode = ref('');
const pairing = ref(false);
const preview = ref<PairingPreview | null>(null);
const pairProblem = ref<RuntimeProblem | null>(null);

const runPreview = async () => {
    pairing.value = true;
    pairProblem.value = null;
    try {
        preview.value = await previewPairing(deps, orgId.value, pairUrl.value, pairCode.value);
    } catch (e) {
        pairProblem.value = explainRuntimeError(e);
    } finally {
        pairing.value = false;
    }
};
/** Les champs sont figés pendant l'aperçu : « Modifier » efface l'aperçu, et seulement lui. */
const resetPreview = () => { preview.value = null; pairProblem.value = null; };
const runPair = async () => {
    const shown = preview.value?.fingerprint;
    if (!shown) return;
    pairing.value = true;
    pairProblem.value = null;
    try {
        // L'admin certifie l'empreinte qu'il vient de comparer : si le runtime en présente une autre, rien n'est signé.
        await pairRuntime(deps, orgId.value, pairUrl.value, pairCode.value, shown);
        toast.show('Runtime appairé.', 'success');
        preview.value = null;
        pairUrl.value = '';
        pairCode.value = '';
        await load();
    } catch (e) {
        pairProblem.value = explainRuntimeError(e);
    } finally {
        pairing.value = false;
    }
};

// Désappairage
const confirmUnpair = ref(false);
const unpairing = ref(false);
const runUnpair = async () => {
    unpairing.value = true;
    try {
        const { sessions } = await unpairRuntime(deps, orgId.value);
        toast.show(sessions ? `Runtime désappairé ; ${sessions} conversation${sessions > 1 ? 's sont revenues' : ' est revenue'} en local.` : 'Runtime désappairé.', 'success');
        confirmUnpair.value = false;
        await load();
    } catch (e) {
        toast.show(explainRuntimeError(e).detail, 'error');
    } finally {
        unpairing.value = false;
    }
};

// Politique
const savingPolicy = ref(false);
const policyProblem = ref('');
const savePolicy = async () => {
    const org = openedOrg.value;
    if (!org) return;
    savingPolicy.value = true;
    policyProblem.value = '';
    try {
        const aiConfig = (org.activeModules?.aiConfig ?? {}) as Record<string, unknown>;
        const currentRuntime = (typeof aiConfig.runtime === 'object' && aiConfig.runtime !== null ? aiConfig.runtime : {}) as Record<string, unknown>;
        const runtime = { members: 'all', ...currentRuntime, enabled: draft.enabled, maxDelegationDays: draft.maxDelegationDays, toolPolicy: { ...draft.toolPolicy } };
        const activeModules = { ...(org.activeModules || {}), aiConfig: { ...aiConfig, runtime } };
        const res = await sfetch(`/api/orgs/${org.id}`, { method: 'PATCH', body: JSON.stringify({ activeModules }) }).then(r => r.json());
        if (res.error) { policyProblem.value = String(res.error); return; }
        const saved = res.activeModules || activeModules;
        org.activeModules = saved;
        const listed = organizations.value.find(o => o.id === org.id);
        if (listed) listed.activeModules = saved;
        toast.show('Politique du runtime enregistrée.', 'success');
        await load();
    } catch {
        policyProblem.value = "L'enregistrement a échoué. Réessayez.";
    } finally {
        savingPolicy.value = false;
    }
};

// Outils
const tools = ref<string[]>([]);
/** Outils sensibles (R3, R4, RP) : jamais « Automatique » (PC86), l'API refuse de l'enregistrer. */
const sensitiveTools = ref<Set<string>>(new Set());
const toolQuery = ref('');
const toolNames = computed(() => Object.keys(draft.toolPolicy).sort());
const loadTools = async () => {
    if (tools.value.length || !orgId.value) return;
    try {
        const asked = orgId.value;
        const manifest = await loadToolManifest(asked);
        if (asked !== orgId.value) return; // l'org a changé pendant le chargement : réponse périmée
        tools.value = manifest.map(t => t.name).sort();
        sensitiveTools.value = new Set(manifest.filter(t => t.sensitive).map(t => t.name));
        for (const name of Object.keys(draft.toolPolicy)) if (sensitiveTools.value.has(name) && draft.toolPolicy[name] === 'auto') draft.toolPolicy = { ...draft.toolPolicy, [name]: 'ask' };
    } catch { tools.value = []; }
};
const toolMatches = computed(() => {
    const q = toolQuery.value.trim().toLowerCase();
    return tools.value.filter(t => !(t in draft.toolPolicy) && t.toLowerCase().includes(q)).slice(0, 12);
});
const addTool = (name: string) => { draft.toolPolicy = { ...draft.toolPolicy, [name]: 'ask' }; toolQuery.value = ''; };
const setTool = (name: string, v: string) => { if (v === 'auto' && sensitiveTools.value.has(name)) return; if (v === 'auto' || v === 'ask' || v === 'deny') draft.toolPolicy = { ...draft.toolPolicy, [name]: v }; };
const dropTool = (name: string) => { const next = { ...draft.toolPolicy }; delete next[name]; draft.toolPolicy = next; };
</script>

<style scoped>
.fpr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; padding: 0.15rem 0.5rem; border-radius: 0.5rem; background: var(--bg); border: 1px solid var(--border-color); word-break: break-all; }
.field { width: 100%; margin-top: 0.35rem; padding: 0.65rem 0.9rem; font-size: 0.875rem; border-radius: 0.75rem; background: var(--bg); border: 1px solid var(--border-color); color: var(--text); outline: none; }
.field:focus { border-color: var(--primary); }
.status { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; }
.status-on { color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.status-off { color: var(--text2); background: color-mix(in srgb, var(--text) 8%, transparent); }
.dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: currentColor; }
.dur { padding: 0.5rem 1rem; border-radius: 0.8rem; font-size: 0.85rem; font-weight: 600; border: 1px solid var(--border-color); background: var(--bg); color: var(--text); }
.dur-on { border-color: var(--primary); color: var(--primary); background: color-mix(in srgb, var(--primary) 8%, var(--bg)); }
.tool-chip { display: inline-flex; align-items: center; gap: 0.6rem; padding: 0.3rem 0.7rem; border-radius: 999px; font-size: 0.8rem; background: var(--bg); border: 1px solid var(--border-color); }
.tool-select { font-size: 0.75rem; background: transparent; color: var(--text2); border: none; outline: none; }
</style>
