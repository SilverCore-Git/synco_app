<template>
    <div class="w-full max-w-5xl mx-auto flex items-center justify-between gap-2 px-1 pb-2">

        <DropDown align="top" contentInerTW="!w-80">
            <template #trigger>
                <button type="button" class="chip" :disabled="busy" :title="busy ? 'Impossible de changer pendant une réponse' : 'Choisir le fournisseur et le modèle'">
                    <i class="bi text-(--primary)" :class="activeMeta.icon"></i>
                    <span class="font-semibold truncate max-w-48">{{ activeMeta.name }}</span>
                    <span v-if="activeModelLabel" class="text-(--text2) truncate max-w-40 hidden sm:inline">· {{ activeModelLabel }}</span>
                    <i class="bi bi-chevron-up text-[10px] text-(--text2)"></i>
                </button>
            </template>
            <template #content>
                <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-(--text2)">Fournisseur</div>

                <template v-for="id in enabledProviders" :key="id">
                    <button type="button" class="row" :class="activeProvider === id ? 'row-active' : ''" @click="pickProvider(id)">
                        <i class="bi text-base w-5 text-center" :class="metaOf(id).icon"></i>
                        <span class="flex-1 min-w-0 text-left">
                            <span class="block text-xs font-medium truncate">{{ metaOf(id).name }}</span>
                            <span class="block text-[10px] text-(--text2) truncate">{{ subtitleOf(id) }}</span>
                        </span>
                        <span v-if="id === defaultProvider" class="badge">Défaut</span>
                        <i v-if="activeProvider === id" class="bi bi-check2 text-(--primary)"></i>
                    </button>

                    <div v-if="id === 'local'" class="ml-5 pl-3 border-l border-(--border-color) mb-1">
                        <button v-for="m in availableModels" :key="m.id" type="button" class="row" :class="activeProvider === 'local' && localLLM.selectedModelId.value === m.id ? 'row-active' : ''" @click="pickLocalModel(m.id)">
                            <span class="flex-1 min-w-0 text-left">
                                <span class="block text-xs font-medium truncate">{{ m.name }}</span>
                                <span class="block text-[10px] text-(--text2)">Tier {{ m.tier }} · {{ m.params }}</span>
                            </span>
                            <span v-if="localLLM.recommendation.value?.model.id === m.id" class="badge">Recommandé</span>
                            <i v-if="activeProvider === 'local' && localLLM.selectedModelId.value === m.id" class="bi bi-check2 text-(--primary)"></i>
                        </button>
                    </div>
                </template>
            </template>
        </DropDown>

        <DropDown align="top" contentInerTW="!w-72">
            <template #trigger>
                <button type="button" class="chip" :disabled="busy" title="Profondeur de réflexion">
                    <i class="bi bi-lightbulb text-(--primary)"></i>
                    <span class="text-(--text2) hidden sm:inline">Réflexion</span>
                    <span class="font-semibold">{{ currentLevel.name }}</span>
                    <i class="bi bi-chevron-up text-[10px] text-(--text2)"></i>
                </button>
            </template>
            <template #content>
                <div class="px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-(--text2)">Profondeur de réflexion</div>
                <button v-for="level in levels" :key="level.id" type="button" class="row" :class="effort === level.id ? 'row-active' : ''" @click="setReasoningEffort(level.id)">
                    <span class="flex-1 min-w-0 text-left">
                        <span class="block text-xs font-medium">{{ level.name }}</span>
                        <span class="block text-[10px] text-(--text2) leading-snug">{{ level.desc }}</span>
                    </span>
                    <i v-if="effort === level.id" class="bi bi-check2 text-(--primary)"></i>
                </button>
            </template>
        </DropDown>

    </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import DropDown from '@/components/DropDown.vue';
import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import { localLLM, availableModels } from '@/services/LocalLLMService';
import {
    aiActiveProvider, aiDefaultProvider, aiEffort, aiEnabledProviders, setActiveProvider, setReasoningEffort,
} from '@/services/AIService';
import { getProviderMeta, type AiProviderId, type ReasoningEffort } from '@/services/aiProviders';

defineProps<{ busy?: boolean }>();

const toast = useToast();

// Pour afficher le modèle local recommandé dans la liste dès son ouverture (le diagnostic matériel est mis en cache).
onMounted(() => {
    if (aiEnabledProviders.value.includes('local')) localLLM.prepare();
});

const activeProvider = aiActiveProvider;
const defaultProvider = aiDefaultProvider;
const enabledProviders = aiEnabledProviders;
const effort = aiEffort;

const metaOf = getProviderMeta;
const activeMeta = computed(() => getProviderMeta(activeProvider.value));

const modelIdOf = (id: AiProviderId): string =>
    openedOrg.value?.activeModules?.aiConfig?.providers?.[id]?.modelId
    || (openedOrg.value?.activeModules?.aiConfig?.provider === id ? openedOrg.value.activeModules.aiConfig.modelId : '')
    || '';

const subtitleOf = (id: AiProviderId): string => {
    if (id === 'local') return localLLM.selectedModel.value?.name || 'Sur votre carte graphique';
    return modelIdOf(id) || (getProviderMeta(id).category === 'cloud' ? 'Cloud' : 'Auto-hébergé');
};

const activeModelLabel = computed(() => subtitleOf(activeProvider.value));

const levels: Array<{ id: ReasoningEffort; name: string; desc: string }> = [
    { id: 'low', name: 'Bas', desc: 'Réponses rapides et directes, moins de tokens consommés.' },
    { id: 'medium', name: 'Moyen', desc: 'Bon équilibre entre rapidité et pertinence.' },
    { id: 'high', name: 'Haut', desc: 'Réflexion plus poussée : plus pertinent, mais plus lent et plus coûteux.' },
];
const currentLevel = computed(() => levels.find(l => l.id === effort.value) ?? levels[1]!);

const pickProvider = (id: AiProviderId) => {
    if (id === activeProvider.value) return;
    if (setActiveProvider(id)) {
        toast.show('Nouvelle conversation : ce fournisseur ne peut pas reprendre la précédente.', 'info', 4000);
    }
};

const pickLocalModel = (modelId: string) => {
    pickProvider('local');
    localLLM.select(modelId);
};
</script>

<style scoped>
.chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.7rem;
    border-radius: 0.75rem;
    font-size: 0.75rem;
    color: var(--text);
    background: var(--bg2);
    border: 1px solid var(--border-color);
    transition: border-color 0.15s, background 0.15s;
}
.chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--primary) 50%, transparent); }
.chip:disabled { opacity: 0.5; cursor: not-allowed; }

.row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.45rem 0.6rem;
    border-radius: 0.6rem;
    color: var(--text);
    transition: background 0.15s;
}
.row:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }
.row-active { background: color-mix(in srgb, var(--primary) 10%, transparent); }

.badge {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
}
</style>
