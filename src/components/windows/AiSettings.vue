<template>

    <Window :isOpen="show" @close="emit('close')">

        <div class="flex flex-col sm:flex-row w-full h-full bg-(--bg) text-(--text) rounded-xl overflow-hidden shadow-2xl relative">

            <aside class="w-full sm:w-64 bg-(--bg2) border-b sm:border-b-0 sm:border-r border-(--border-color) p-2 sm:p-4 pr-14 sm:pr-4 flex flex-row sm:flex-col gap-2 shrink-0 overflow-x-auto hide-scrollbar">

                <h2 class="hidden sm:block text-xl font-black text-(--text) mb-4 px-3 pt-2">Synco AI</h2>

                <button
                    v-for="t in tabs"
                    :key="t.id"
                    @click="tab = t.id"
                    class="tab whitespace-nowrap shrink-0 sm:w-full"
                    :class="tab === t.id ? 'active' : ''"
                >
                    <i :class="[t.icon, 'text-lg']" />
                    {{ t.label }}
                    <span v-if="t.id === 'agent' && pendingPlans > 0" class="badge" :aria-label="`${pendingPlans} plan${pendingPlans > 1 ? 's' : ''} en attente`">{{ pendingPlans }}</span>
                </button>

            </aside>

            <main class="flex-1 min-h-0 bg-(--bg) relative overflow-y-auto p-4 sm:p-8 space-y-6">


                        <AgentTab v-if="tab === 'agent'" @examine="emit('close')" />

                        <StatsTab v-else-if="tab === 'stats'" />

                        <!-- Modèles locaux -->
                        <template v-else-if="tab === 'local'">
                            <div class="card flex items-center gap-4">
                                <i class="bi bi-gpu-card text-2xl text-(--primary)"></i>
                                <div class="flex-1 min-w-0">
                                    <p class="text-sm font-semibold">Mémoire graphique</p>
                                    <p class="text-xs text-(--text2)">{{ gpuStateLabel }}</p>
                                </div>
                                <button class="default shrink-0" :disabled="!gpuInUse" @click="unloadGpu">
                                    <i class="bi bi-eject-fill mr-1"></i> Décharger le GPU
                                </button>
                            </div>

                            <div>
                                <p class="section-title">Modèles téléchargés dans le navigateur</p>
                                <p v-if="localLLM.status.value === 'unsupported'" class="text-xs text-(--text2) mb-2">WebGPU n'est pas disponible ici, mais des poids déjà présents peuvent être supprimés.</p>
                                <div class="card !p-0 overflow-hidden">
                                    <div v-for="row in disk" :key="row.model.id" class="flex items-center gap-3 px-3 py-3 border-b border-(--border-color) last:border-0">
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium truncate">
                                                {{ row.model.name }}
                                                <span v-if="localLLM.currentModel.value?.id === row.model.id" class="badge">Chargé en GPU</span>
                                            </p>
                                            <p class="text-[11px] text-(--text2)">Tier {{ row.model.tier }} · {{ row.model.params }} ·
                                                {{ row.cachedBytes ? fmtBytes(row.cachedBytes) + ' sur le disque' : 'non téléchargé' }}</p>
                                        </div>
                                        <button class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 disabled:opacity-30" :disabled="!row.cachedBytes" @click="modelToDelete = row.model">
                                            <i class="bi bi-trash"></i> Supprimer
                                        </button>
                                    </div>
                                    <p v-if="!disk.length" class="px-3 py-4 text-xs text-(--text2)">Lecture du stockage…</p>
                                </div>
                                <p class="text-[11px] text-(--text2) mt-2">Supprimer un modèle libère l'espace disque du navigateur ; il sera retéléchargé si vous le sélectionnez de nouveau.</p>
                            </div>
                        </template>

                        <!-- Débogage -->
                        <template v-else>
                            <div>
                                <p class="section-title">Chargement</p>
                                <div class="card !p-0 overflow-hidden">
                                    <label v-for="o in toggles" :key="o.label" class="flex items-center gap-3 px-3 py-3 border-b border-(--border-color) last:border-0 cursor-pointer">
                                        <div class="flex-1 min-w-0">
                                            <p class="text-sm font-medium">{{ o.label }}</p>
                                            <p class="text-[11px] text-(--text2)">{{ o.desc }}</p>
                                        </div>
                                        <input type="checkbox" class="accent-(--primary) h-4 w-4" :checked="o.value()" :disabled="o.disabled?.()" @change="o.set(($event.target as HTMLInputElement).checked)" />
                                    </label>
                                </div>
                            </div>

                            <div>
                                <p class="section-title">Dépannage</p>
                                <div class="card space-y-3">
                                    <div class="flex items-center gap-3">
                                        <p class="flex-1 text-xs text-(--text2)">Oublier la limite de modèle mémorisée après un manque de mémoire graphique.</p>
                                        <button class="default shrink-0" @click="resetTier">Réinitialiser</button>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <p class="flex-1 text-xs text-(--text2)">Supprimer tous les modèles et fichiers de configuration IA du navigateur.</p>
                                        <button class="default shrink-0 !text-red-400" @click="showClearAll = true">Tout supprimer</button>
                                    </div>
                                    <div class="flex items-center gap-3">
                                        <p class="flex-1 text-xs text-(--text2)">Copier un rapport (matériel, état du modèle) à joindre à une demande de support.</p>
                                        <button class="default shrink-0" @click="copyDiagnostic"><i class="bi bi-clipboard mr-1"></i> Copier</button>
                                    </div>
                                </div>
                            </div>

                            <div v-if="localLLM.lastLoadTimings.value">
                                <p class="section-title">Dernier chargement du modèle</p>
                                <div class="card text-xs space-y-1 font-mono">
                                    <p>Total : {{ sec(localLLM.lastLoadTimings.value.totalMs) }} (vérif. du cache {{ sec(localLLM.lastLoadTimings.value.prefetchMs) }}, moteur {{ sec(localLLM.lastLoadTimings.value.reloadMs) }})</p>
                                    <p v-for="ph in localLLM.lastLoadTimings.value.phases" :key="ph.label + ph.atMs" class="text-(--text2)">+{{ sec(ph.atMs) }} · {{ ph.label }}</p>
                                </div>
                            </div>

                            <div v-if="localLLM.profile.value">
                                <p class="section-title">Matériel détecté</p>
                                <div class="card text-xs space-y-1 font-mono">
                                    <p v-for="l in hardwareLines" :key="l">{{ l }}</p>
                                </div>
                            </div>
                        </template>
            </main>

        </div>

    </Window>

    <ConfirmDelete
        :show="!!modelToDelete"
        :itemName="modelToDelete?.name || ''"
        itemType="le modèle"
        buttonText="Supprimer"
        message="Les poids téléchargés seront retirés du stockage du navigateur et le GPU sera déchargé s'il l'utilise. Vous pourrez le retélécharger plus tard."
        @confirm="confirmDeleteModel"
        @cancel="modelToDelete = null"
    />
    <ConfirmDelete
        :show="showClearAll"
        itemName="tous les modèles"
        itemType="les modèles"
        buttonText="Tout supprimer"
        message="Tous les modèles locaux et leurs fichiers de configuration seront supprimés du navigateur."
        @confirm="confirmClearAll"
        @cancel="showClearAll = false"
    />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Window from './Window.vue';
import AgentTab from './aiSettings/AgentTab.vue';
import StatsTab from './aiSettings/StatsTab.vue';
import { openedOrg } from '@/assets/var';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { plansSummary, refreshPlansSummary } from '@/services/aiPlansSummary';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { localLLM, type LLMModel } from '@/services/LocalLLMService';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();
const toast = useToast();

type Tab = 'agent' | 'stats' | 'local' | 'debug';
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'agent', label: 'Agent', icon: 'bi-sliders' },
    { id: 'stats', label: 'Statistiques', icon: 'bi-bar-chart-line' },
    { id: 'local', label: 'Modèles locaux', icon: 'bi-gpu-card' },
    { id: 'debug', label: 'Débogage', icon: 'bi-bug' },
];
const tab = ref<Tab>('agent');

// Compteur de l'onglet « Agent » : plans à valider (résumé de l'API, sans contenu).
const pendingPlans = computed(() => plansSummary.value?.toValidate ?? 0);
watch(() => props.show, (open) => { if (open && openedOrg.value?.id) void refreshPlansSummary(runtimeDeps().api, openedOrg.value.id); });

const sec = (ms: number) => (ms / 1000).toFixed(1) + ' s';
const fmtBytes = (n: number) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' Go' : Math.round(n / 1024 ** 2) + ' Mo';

// ---- Modèles locaux
const disk = ref<Array<{ model: LLMModel; cachedBytes: number }>>([]);
const refreshDisk = async () => { disk.value = await localLLM.listModelDisk().catch(() => []); };

const gpuInUse = computed(() => !!localLLM.currentModel.value || ['loading', 'downloading'].includes(localLLM.status.value));
const gpuStateLabel = computed(() => {
    const s = localLLM.status.value;
    if (localLLM.currentModel.value) return `${localLLM.currentModel.value.name} est chargé dans la mémoire graphique.`;
    if (s === 'loading') return 'Chargement du modèle en cours…';
    if (s === 'downloading') return 'Téléchargement du modèle en cours…';
    if (s === 'unsupported') return 'WebGPU indisponible sur cet appareil.';
    return 'Aucun modèle en mémoire graphique.';
});

const unloadGpu = async () => {
    await localLLM.releaseGpu();
    toast.show('GPU déchargé.', 'success');
};

const modelToDelete = ref<LLMModel | null>(null);
const confirmDeleteModel = async () => {
    const m = modelToDelete.value;
    modelToDelete.value = null;
    if (!m) return;
    await localLLM.deleteModel(m.id);
    await refreshDisk();
    toast.show(`${m.name} supprimé du navigateur.`, 'success');
};

// ---- Débogage
const toggles = [
    {
        label: 'Charger le modèle à l\'ouverture',
        desc: 'Désactivé : le modèle n\'est chargé en GPU que sur clic sur « Charger » ou à l\'envoi d\'un message.',
        value: () => localLLM.autoLoad.value,
        set: (v: boolean) => localLLM.setAutoLoad(v),
    },
    {
        label: 'Préchargement en arrière-plan',
        desc: 'Charge le modèle dès la connexion si vous l\'avez utilisé récemment.',
        value: () => localLLM.backgroundWarmup.value,
        set: (v: boolean) => localLLM.setBackgroundWarmup(v),
        disabled: () => !localLLM.autoLoad.value,
    },
    {
        label: 'Journaux détaillés',
        desc: 'Écrit le diagnostic du moteur local dans la console du navigateur.',
        value: () => localLLM.debugLogs.value,
        set: (v: boolean) => localLLM.setDebugLogs(v),
    },
];

const hardwareLines = computed(() => {
    const p = localLLM.profile.value;
    if (!p) return [];
    return [
        `GPU : ${p.description || p.vendor || 'inconnu'} (${p.architecture || '?'})`,
        `shader-f16 : ${p.shaderF16 ? 'oui' : 'non'}`,
        `Buffer max : ${fmtBytes(p.maxStorageBufferBindingSize)}`,
        `Bande passante : ${p.bandwidthGBs ? Math.round(p.bandwidthGBs) + ' Go/s' : 'non mesurée'}`,
        `Mémoire unifiée : ${p.unifiedMemory ? 'oui' : 'non'}`,
        `RAM appareil : ${p.deviceMemoryGB ?? '?'} Go · ${p.cores} cœurs`,
        `Stockage libre : ${p.storageFreeBytes ? fmtBytes(p.storageFreeBytes) : '?'}`,
    ];
});

const resetTier = async () => {
    await localLLM.resetTierLimit();
    toast.show('Limite de modèle réinitialisée.', 'success');
};

const showClearAll = ref(false);
const confirmClearAll = async () => {
    showClearAll.value = false;
    await localLLM.deleteAllModels();
    await refreshDisk();
    toast.show('Modèles locaux supprimés.', 'success');
};

const copyDiagnostic = async () => {
    const report = {
        status: localLLM.status.value,
        selected: localLLM.selectedModelId.value,
        loaded: localLLM.currentModel.value?.id ?? null,
        error: localLLM.error.value,
        settings: { autoLoad: localLLM.autoLoad.value, backgroundWarmup: localLLM.backgroundWarmup.value },
        hardware: localLLM.profile.value,
        userAgent: navigator.userAgent,
    };
    try {
        await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
        toast.show('Rapport copié.', 'success');
    } catch {
        toast.show('Copie impossible.', 'error');
    }
};

watch(() => props.show, open => {
    if (open) { tab.value = 'stats'; localLLM.prepare(); refreshDisk(); }
});
</script>

<style scoped>
.card { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 0.75rem; padding: 0.75rem 1rem; }
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); margin-bottom: 0.5rem; }
.chip { padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.75rem; color: var(--text2); border: 1px solid var(--border-color); }
.badge { min-width: 1.25rem; height: 1.25rem; padding: 0 0.35rem; border-radius: 999px; display: inline-grid; place-items: center; font-size: 0.7rem; font-weight: 800; color: var(--bg); background: var(--primary); margin-left: auto; }
.chip-active { color: var(--text); border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.badge {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px;
    border-radius: 999px; color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); margin-left: 0.4rem;
}
</style>
