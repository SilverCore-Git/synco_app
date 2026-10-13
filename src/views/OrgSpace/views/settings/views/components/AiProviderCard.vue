<template>
    <div class="border rounded-2xl transition-all bg-(--bg2)"
        :class="form.enabled ? 'border-(--primary)/60 shadow-sm' : 'border-(--border-color)'">

        <div class="flex items-center gap-4 p-5 cursor-pointer select-none" @click="toggle">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                :class="form.enabled ? 'bg-(--primary)/10 text-(--primary)' : 'bg-(--bg) text-(--text2)'">
                <i class="bi text-lg" :class="meta.icon"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-sm text-(--text)">{{ meta.name }}</span>
                    <span v-if="isDefault" class="text-[10px] font-bold uppercase tracking-wide text-(--primary) bg-(--primary)/10 px-2 py-0.5 rounded-full">Par défaut</span>
                </div>
                <p class="text-xs text-(--text2) leading-relaxed mt-1">{{ meta.desc }}</p>
            </div>
            <label class="relative inline-flex items-center shrink-0 pointer-events-none">
                <input type="checkbox" :checked="form.enabled" class="sr-only peer" tabindex="-1">
                <div class="w-11 h-6 bg-black/20 border border-(--border-color) rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-(--primary) peer-checked:border-(--primary)"></div>
            </label>
        </div>

        <div v-if="form.enabled" class="px-5 pb-5 pt-1 space-y-5 border-t border-(--border-color)/60">

            <div v-if="meta.needsKey" class="space-y-2 pt-4">
                <label class="text-xs font-semibold text-(--text)">Clé API</label>
                <div class="relative group">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                        <i class="bi bi-key-fill"></i>
                    </div>
                    <input v-model="form.apiKey" :type="showKey ? 'text' : 'password'" autocomplete="off"
                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-12 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all font-mono placeholder:text-(--text2) shadow-inner text-(--text)"
                        :placeholder="form.hasApiKey && !form.removeKey ? '•••••••••••••••• (clé configurée, tapez pour remplacer)' : 'sk-...'" />
                    <button type="button" @click="showKey = !showKey" class="absolute right-4 top-1/2 -translate-y-1/2 text-(--text2) hover:text-(--primary) transition-colors">
                        <i class="bi" :class="showKey ? 'bi-eye-slash' : 'bi-eye'"></i>
                    </button>
                </div>
                <button v-if="form.hasApiKey" type="button" @click="form.removeKey = !form.removeKey; form.apiKey = ''"
                    class="text-xs underline transition-colors" :class="form.removeKey ? 'text-(--text2)' : 'text-red-400 hover:text-red-300'">
                    {{ form.removeKey ? 'Annuler la suppression de la clé' : 'Supprimer la clé enregistrée' }}
                </button>
            </div>

            <div v-if="meta.id === 'custom'" class="space-y-2 pt-4">
                <label class="text-xs font-semibold text-(--text)">URL de l'endpoint</label>
                <div class="relative group">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                        <i class="bi bi-link-45deg"></i>
                    </div>
                    <input v-model="form.endpointUrl" type="text" placeholder="https://mon-serveur.local:11434/v1"
                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner text-(--text)" />
                </div>
            </div>

            <div v-if="meta.id === 'gateway'" class="space-y-2 pt-4">
                <label class="text-xs font-semibold text-(--text)">URL de votre Synco AI Gateway</label>
                <div class="relative group">
                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                        <i class="bi bi-hdd-network-fill"></i>
                    </div>
                    <input v-model="form.gatewayUrl" type="text" placeholder="https://ia-gateway.mon-organisation.fr" @blur="fetchGatewayModels"
                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner text-(--text)" />
                </div>
                <p class="text-[10px] text-(--text2) leading-relaxed">Le navigateur appelle cette passerelle directement (pas notre serveur), avec votre compte Synco pour vous authentifier. Ollama vit à côté de cette passerelle : elle sait déjà où le trouver.</p>
            </div>

            <div v-if="meta.id !== 'local'" class="space-y-2 pt-4">
                <label class="text-xs font-semibold text-(--text)">Modèle à utiliser</label>
                <select v-if="modelOptions.length" v-model="modelSelection"
                    class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner text-(--text)">
                    <option value="" disabled>{{ loadingModels ? 'Chargement des modèles...' : 'Choisir un modèle' }}</option>
                    <option v-for="m in modelOptions" :key="m" :value="m">{{ m }}</option>
                    <option value="__manual__">Autre (saisie manuelle)...</option>
                </select>
                <input v-if="!modelOptions.length || modelSelection === '__manual__'" v-model="form.modelId" type="text" :placeholder="meta.defaultModel || 'Ex: llama3.1:8b'"
                    class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all font-mono shadow-inner text-(--text)" />
                <p v-if="meta.id === 'gateway' && loadingModels" class="text-xs text-(--text2)">
                    <i class="bi bi-arrow-repeat animate-spin mr-1"></i> Récupération des modèles disponibles sur Ollama...
                </p>
                <p v-else-if="meta.id === 'gateway' && modelsError" class="text-xs text-red-400">{{ modelsError }}</p>
            </div>

            <p v-if="meta.id === 'local'" class="text-xs text-(--text2) pt-4 leading-relaxed">
                Aucun réglage requis : chaque utilisateur télécharge le modèle adapté à son matériel au premier usage.
            </p>

            <div v-if="meta.category === 'cloud'" class="bg-orange-500/5 border border-orange-500/20 p-4 rounded-xl flex flex-col gap-3">
                <div class="flex items-start gap-3">
                    <i class="bi bi-exclamation-triangle-fill text-orange-500 mt-0.5"></i>
                    <p class="text-xs text-orange-500/90 leading-relaxed">
                        <strong>Cloud externe :</strong> les données de vos conversations avec cette IA sont transmises à {{ meta.name }}.
                        <a href="#" @click.prevent="$emit('learn-more')" class="underline ml-1">En savoir plus</a>
                    </p>
                </div>
                <label class="flex items-center gap-3 cursor-pointer pt-3 border-t border-orange-500/10">
                    <input type="checkbox" v-model="form.acceptedCloud" class="w-4 h-4 rounded border-orange-500/30 text-orange-500 bg-(--bg) cursor-pointer" />
                    <span class="text-xs font-medium" :class="form.acceptedCloud ? 'text-orange-600' : 'text-orange-500/70'">
                        J'accepte que ces données soient traitées par un service tiers.
                    </span>
                </label>
            </div>
        </div>
    </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import { listGatewayModels } from '@/services/AIService';
import type { AiProviderMeta } from '@/services/aiProviders';

export interface ProviderForm {
    enabled: boolean;
    modelId: string;
    endpointUrl: string;
    gatewayUrl: string;
    apiKey: string;
    hasApiKey: boolean;
    removeKey: boolean;
    acceptedCloud: boolean;
}

const props = defineProps<{
    meta: AiProviderMeta;
    form: ProviderForm;
    isDefault: boolean;
}>();

defineEmits<{ (e: 'learn-more'): void }>();

const showKey = ref(false);
const gatewayModels = ref<string[]>([]);
const loadingModels = ref(false);
const modelsError = ref('');

const toggle = () => {
    props.form.enabled = !props.form.enabled;
    if (props.form.enabled && !props.form.modelId && props.meta.defaultModel) props.form.modelId = props.meta.defaultModel;
};

// L'URL n'est contactée qu'au chargement (valeur déjà enregistrée) et à la sortie du champ, jamais à
// chaque frappe : sinon chaque caractère enverrait le jeton Keycloak à l'origine en cours de saisie
// (audit FC5).
const fetchGatewayModels = async () => {
    if (props.meta.id !== 'gateway' || !props.form.enabled || !props.form.gatewayUrl || !openedOrg.value?.id) {
        gatewayModels.value = [];
        return;
    }
    loadingModels.value = true;
    modelsError.value = '';
    try {
        gatewayModels.value = await listGatewayModels(props.form.gatewayUrl, openedOrg.value.id);
        if (gatewayModels.value.length === 0) modelsError.value = 'Aucun modèle trouvé sur cet Ollama — pensez à en télécharger un (ollama pull).';
    } catch (e: any) {
        gatewayModels.value = [];
        modelsError.value = e.message || 'Impossible de récupérer la liste des modèles.';
    } finally {
        loadingModels.value = false;
    }
};

watch(() => props.form.enabled, enabled => { if (enabled) fetchGatewayModels(); }, { immediate: true });

const modelOptions = computed(() => {
    if (props.meta.id === 'gateway') return gatewayModels.value;
    return props.meta.recommendedModels || [];
});

const modelSelection = computed<string>({
    get() {
        if (props.form.modelId && modelOptions.value.includes(props.form.modelId)) return props.form.modelId;
        return props.form.modelId ? '__manual__' : '';
    },
    set(value: string) {
        if (value !== '__manual__') props.form.modelId = value;
        else if (modelOptions.value.includes(props.form.modelId)) props.form.modelId = '';
    },
});
</script>
