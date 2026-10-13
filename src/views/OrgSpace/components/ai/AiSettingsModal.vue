<template>
    <Teleport to="body">
        <Transition name="fade">
            <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" @click="emit('close')">
                <div class="bg-(--bg) rounded-2xl border border-(--text)/10 shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col overflow-hidden" @click.stop>

                    <div class="flex items-center justify-between px-5 py-3 border-b border-(--border-color) shrink-0">
                        <h3 class="font-semibold flex items-center gap-2"><i class="bi bi-sliders text-(--primary)"></i> Paramètres de Synco AI</h3>
                        <button class="text-(--text2) hover:text-(--text) p-1" @click="emit('close')"><i class="bi bi-x-lg text-xl"></i></button>
                    </div>

                    <div class="flex gap-1 px-4 pt-3 border-b border-(--border-color) shrink-0 overflow-x-auto">
                        <button v-for="t in tabs" :key="t.id" class="tab-btn" :class="tab === t.id ? 'tab-active' : ''" @click="tab = t.id">
                            <i class="bi" :class="t.icon"></i> {{ t.label }}
                        </button>
                    </div>

                    <div class="flex-1 min-h-0 overflow-y-auto p-5 space-y-6">

                        <!-- Statistiques -->
                        <template v-if="tab === 'stats'">
                            <div class="flex items-center justify-between gap-3">
                                <div class="flex gap-1">
                                    <button v-for="p in periods" :key="p.id" class="chip" :class="period === p.id ? 'chip-active' : ''" @click="period = p.id">{{ p.label }}</button>
                                </div>
                                <button class="text-xs text-red-400 hover:text-red-300 flex items-center gap-1" :disabled="!usageEvents.length" @click="showResetStats = true">
                                    <i class="bi bi-trash"></i> Réinitialiser
                                </button>
                            </div>

                            <p v-if="!events.length" class="text-sm text-(--text2) italic text-center py-10">
                                Aucune utilisation enregistrée sur cette période.
                            </p>

                            <template v-else>
                                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    <div v-for="c in cards" :key="c.label" class="card">
                                        <p class="text-[10px] uppercase font-bold text-(--text2)">{{ c.label }}</p>
                                        <p class="text-xl font-semibold mt-1">{{ c.value }}</p>
                                    </div>
                                </div>

                                <div>
                                    <p class="section-title">Tokens par jour</p>
                                    <div class="flex items-end gap-px h-28 card !p-3">
                                        <div v-for="d in daily" :key="d.day" class="flex-1 min-w-0 h-full flex items-end" :title="`${d.day} : ${d.tokens.toLocaleString('fr-FR')} tokens`">
                                            <div class="w-full rounded-t bg-(--primary)/70" :style="{ height: d.tokens ? Math.max(4, d.tokens / dailyMax * 100) + '%' : '2px', opacity: d.tokens ? 1 : 0.2 }"></div>
                                        </div>
                                    </div>
                                </div>

                                <div v-for="g in groups" :key="g.title">
                                    <p class="section-title">{{ g.title }}</p>
                                    <div class="card !p-0 overflow-hidden">
                                        <div v-for="row in g.rows" :key="row.key" class="flex items-center gap-3 px-3 py-2 border-b border-(--border-color) last:border-0 text-xs">
                                            <span class="flex-1 min-w-0 truncate font-medium">{{ g.label(row.key) }}</span>
                                            <span class="text-(--text2) w-20 text-right">{{ row.requests }} req.</span>
                                            <span class="text-(--text2) w-24 text-right hidden sm:block">{{ fmt(row.promptTokens) }} → {{ fmt(row.completionTokens) }}</span>
                                            <span class="w-20 text-right font-semibold">{{ fmt(row.totalTokens) }}</span>
                                        </div>
                                    </div>
                                </div>
                                <p class="text-[11px] text-(--text2)">Statistiques calculées sur cet appareil uniquement (les conversations sont chiffrées de bout en bout). « entrée → sortie » = tokens du prompt → tokens générés.</p>
                            </template>
                        </template>

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

                            <div v-if="localLLM.profile.value">
                                <p class="section-title">Matériel détecté</p>
                                <div class="card text-xs space-y-1 font-mono">
                                    <p v-for="l in hardwareLines" :key="l">{{ l }}</p>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>

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
    <ConfirmDelete
        :show="showResetStats"
        itemName="les statistiques"
        itemType="les statistiques"
        buttonText="Réinitialiser"
        message="L'historique d'utilisation enregistré sur cet appareil sera effacé. Vos conversations ne sont pas touchées."
        @confirm="resetUsageStats(); showResetStats = false"
        @cancel="showResetStats = false"
    />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { localLLM, type LLMModel } from '@/services/LocalLLMService';
import { usageEvents, resetUsageStats, groupUsage, dailyTokens } from '@/services/aiUsageStats';
import { getProviderMeta } from '@/services/aiProviders';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ close: [] }>();
const toast = useToast();

type Tab = 'stats' | 'local' | 'debug';
const tabs: Array<{ id: Tab; label: string; icon: string }> = [
    { id: 'stats', label: 'Statistiques', icon: 'bi-bar-chart-line' },
    { id: 'local', label: 'Modèles locaux', icon: 'bi-gpu-card' },
    { id: 'debug', label: 'Débogage', icon: 'bi-bug' },
];
const tab = ref<Tab>('stats');

// ---- Statistiques
const periods = [
    { id: 7, label: '7 jours' },
    { id: 30, label: '30 jours' },
    { id: 0, label: 'Tout' },
];
const period = ref(30);

const events = computed(() => {
    if (!period.value) return usageEvents.value;
    const since = Date.now() - period.value * 86400000;
    return usageEvents.value.filter(e => e.t >= since);
});

const fmt = (n: number) => n < 1000 ? String(n) : n < 1e6 ? (n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '') + 'k' : (n / 1e6).toFixed(1) + 'M';
const fmtBytes = (n: number) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(1) + ' Go' : Math.round(n / 1024 ** 2) + ' Mo';

const cards = computed(() => {
    const t = groupUsage(events.value, () => 'all')[0];
    if (!t) return [];
    return [
        { label: 'Requêtes', value: fmt(t.requests) },
        { label: 'Tokens au total', value: fmt(t.totalTokens) },
        { label: 'Moy. / requête', value: fmt(Math.round(t.totalTokens / t.requests)) },
        { label: 'Raisonnement', value: fmt(t.reasoningTokens) },
    ];
});

const daily = computed(() => dailyTokens(events.value, Math.min(period.value || 30, 30)));
const dailyMax = computed(() => Math.max(1, ...daily.value.map(d => d.tokens)));

const groups = computed(() => [
    { title: 'Par fournisseur', rows: groupUsage(events.value, e => e.provider), label: (k: string) => getProviderMeta(k as any)?.name ?? k },
    { title: 'Par modèle', rows: groupUsage(events.value, e => e.model), label: (k: string) => k },
]);

const showResetStats = ref(false);

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
.tab-btn {
    display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.5rem 0.9rem;
    font-size: 0.8rem; color: var(--text2); border-bottom: 2px solid transparent; white-space: nowrap;
}
.tab-btn:hover { color: var(--text); }
.tab-active { color: var(--text); border-bottom-color: var(--primary); }
.card { background: var(--bg2); border: 1px solid var(--border-color); border-radius: 0.75rem; padding: 0.75rem 1rem; }
.section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text2); margin-bottom: 0.5rem; }
.chip { padding: 0.25rem 0.7rem; border-radius: 999px; font-size: 0.75rem; color: var(--text2); border: 1px solid var(--border-color); }
.chip-active { color: var(--text); border-color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); }
.badge {
    font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 6px;
    border-radius: 999px; color: var(--primary); background: color-mix(in srgb, var(--primary) 12%, transparent); margin-left: 0.4rem;
}
</style>
