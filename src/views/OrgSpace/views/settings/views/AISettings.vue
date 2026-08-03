<template>

    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">

            <div class="max-w-5xl mx-auto space-y-12">

                <div class="mb-8">
                    <h3 class="text-2xl font-black text-(--text) mb-2">Configuration de Synco AI</h3>
                    <p class="text-sm text-(--text2)">Paramétrez le fournisseur de Synco AI pour votre organisation. Ce paramétrage sera utilisé par tous les membres.</p>
                </div>

                <div v-if="!openedOrg?.features?.includes('ai')" class="mb-8 p-6 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-sm flex items-start gap-4">
                    <div class="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center shrink-0">
                        <i class="bi bi-shield-lock-fill text-xl"></i>
                    </div>
                    <div>
                        <h4 class="text-(--text) font-bold text-sm">Module non inclus</h4>
                        <p class="text-(--text2) text-xs mt-1">Le module Synco AI n'est pas inclus dans votre abonnement actuel. Vous ne pouvez pas modifier ces paramètres.</p>
                    </div>
                </div>

                <div class="space-y-12" :class="{'opacity-50 pointer-events-none grayscale': !openedOrg?.features?.includes('ai')}">

                    <section class="space-y-6">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2) mb-4">Fournisseur IA</h4>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label v-for="prov in providers" :key="prov.id" 
                                class="relative flex flex-col p-5 border rounded-2xl cursor-pointer transition-all hover:shadow-md group"
                                :class="orgData.provider === prov.id ? 'border-(--primary) bg-(--primary)/5 shadow-sm' : 'border-(--border-color) bg-(--bg2) hover:border-(--text)/20'">
                                
                                <input type="radio" :value="prov.id" v-model="orgData.provider" name="provider" class="sr-only">
                                
                                <div class="flex items-center justify-between mb-3">
                                    <span class="font-bold text-sm text-(--text)">{{ prov.name }}</span>
                                    <div class="w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
                                         :class="orgData.provider === prov.id ? 'border-(--primary) bg-(--primary)' : 'border-(--text)/30 group-hover:border-(--text)/50 bg-transparent'">
                                        <i v-if="orgData.provider === prov.id" class="bi bi-check text-white text-xs"></i>
                                    </div>
                                </div>
                                <p class="text-xs text-(--text2) leading-relaxed">{{ prov.desc }}</p>

                            </label>
                        </div>
                    </section>

                    <!-- Options Spécifiques -->
                    <section v-if="orgData.provider !== 'local'" class="animate-fade-in space-y-6">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2) mb-4">Configuration Spécifique</h4>
                        
                        <div class="p-8 bg-(--bg2) border border-(--border-color) rounded-2xl shadow-sm space-y-6">
                            
                            <!-- Clé API -->
                            <div class="space-y-2">
                                <label class="text-xs font-semibold text-(--text)">Clé API ({{ orgData.provider }})</label>
                                <div class="relative group">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                                        <i class="bi bi-key-fill"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.apiKey"
                                        :type="showApiKey ? 'text' : 'password'"
                                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-12 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all font-mono placeholder:text-(--text2) shadow-inner text-(--text)"
                                        :placeholder="orgData.hasApiKey ? '•••••••••••••••• (Clé configurée, tapez pour remplacer)' : 'sk-...'"
                                    />
                                    <button @click="showApiKey = !showApiKey" class="absolute right-4 top-1/2 -translate-y-1/2 text-(--text2) hover:text-(--primary) transition-colors">
                                        <i class="bi" :class="showApiKey ? 'bi-eye-slash' : 'bi-eye'"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Endpoint URL (Custom only) -->
                            <div class="space-y-2" v-if="orgData.provider === 'custom'">
                                <label class="text-xs font-semibold text-(--text)">URL de l'Endpoint</label>
                                <div class="relative group">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                                        <i class="bi bi-link-45deg"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.endpointUrl"
                                        type="text"
                                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner text-(--text)"
                                        placeholder="https://mon-serveur.local:11434/v1"
                                    />
                                </div>
                            </div>

                            <!-- Model ID -->
                            <div class="space-y-2">
                                <label class="text-xs font-semibold text-(--text)">Modèle à utiliser</label>
                                <div class="relative group">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text2) group-focus-within:text-(--primary) transition-colors">
                                        <i class="bi bi-robot"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.modelId"
                                        type="text"
                                        class="w-full bg-(--bg) border border-(--border-color) pl-11 pr-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all font-mono shadow-inner text-(--text)"
                                        :placeholder="defaultModelPlaceholder"
                                    />
                                </div>
                                <div class="flex gap-2 mt-3 flex-wrap" v-if="recommendedModels.length > 0">
                                    <button 
                                        v-for="model in recommendedModels" 
                                        :key="model"
                                        @click="orgData.modelId = model"
                                        class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-sm"
                                        :class="orgData.modelId === model ? 'bg-(--primary) border-(--primary) text-white' : 'bg-(--bg3) border-(--border-color) text-(--text2) hover:bg-(--bg)'"
                                    >
                                        {{ model }}
                                    </button>
                                </div>
                            </div>

                            <!-- Cloud Warning -->
                            <div v-if="orgData.provider !== 'local' && orgData.provider !== 'custom'" class="bg-orange-500/5 border border-orange-500/20 p-5 rounded-xl mt-6 flex flex-col gap-4">
                                <div class="flex items-start gap-3">
                                    <div class="w-8 h-8 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0">
                                        <i class="bi bi-exclamation-triangle-fill"></i>
                                    </div>
                                    <div>
                                        <p class="text-sm text-orange-500 font-bold">Attention : Cloud Externe</p>
                                        <p class="text-xs text-orange-500/80 mt-1 leading-relaxed">
                                            L'utilisation d'un modèle cloud implique le transfert de vos données vers ce fournisseur. SilverCore se décharge de toute responsabilité concernant la confidentialité et la gestion des données envoyées sur ces serveurs externes.
                                        </p>
                                        <a href="#" @click.prevent="showLearnMorePopup = true" class="text-xs text-orange-600 hover:text-orange-500 underline mt-2 inline-block font-medium transition-colors">En savoir plus</a>
                                    </div>
                                </div>
                                <label class="flex items-center gap-3 cursor-pointer pt-4 border-t border-orange-500/10 group">
                                    <input type="checkbox" v-model="acceptCloudWarning" class="w-4 h-4 rounded border-orange-500/30 text-orange-500 focus:ring-orange-500 bg-(--bg) transition-colors cursor-pointer" />
                                    <span class="text-xs font-medium" :class="acceptCloudWarning ? 'text-orange-600' : 'text-orange-500/60 group-hover:text-orange-500/80'">
                                        J'accepte et je comprends que mes données seront traitées par un service tiers.
                                    </span>
                                </label>
                            </div>

                        </div>
                    </section>

                </div>

            </div>
        </main>

        <Transition name="fade-bottom">
            <footer 
                v-if="hasChanges" 
                class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-(--border-color) flex justify-end gap-3 z-20"
            >
                <button @click="resetChanges" class="default px-6 py-2.5 rounded-xl text-sm font-medium">Annuler</button>
                <button 
                    @click="saveSettings" 
                    class="primary px-6 py-2.5 rounded-xl text-sm font-medium" 
                    :class="[
                        saving ? 'loader' : '',
                        orgData.provider !== 'local' && orgData.provider !== 'custom' && !acceptCloudWarning ? 'opacity-50 grayscale-100 pointer-events-none' : ''
                    ]"
                    :disabled="orgData.provider !== 'local' && orgData.provider !== 'custom' && !acceptCloudWarning"
                >
                    Enregistrer les modifications
                </button>
            </footer>
        </Transition>

    </div>

    <Popup :is-open="showLearnMorePopup" @close="showLearnMorePopup = false">
        <template #title>Utilisation de services Cloud externes</template>
        <div class="space-y-4 text-sm text-(--text) leading-relaxed">
            <p>En choisissant un fournisseur IA externe (tel que OpenAI, Google Gemini, Mistral AI, etc.), vous acceptez que les données de votre organisation (requêtes, documents analysés, historiques de conversation, etc.) soient transmises et traitées sur les serveurs de ce fournisseur.</p>
            
            <h4 class="font-bold text-(--text) mt-4">Ce que cela implique :</h4>
            <ul class="list-disc pl-5 space-y-2 bg-(--bg) border border-(--border-color) p-4 rounded-xl shadow-inner">
                <li><strong class="text-(--text)">Confidentialité des données :</strong> Les données transmises sont soumises à la politique de confidentialité du fournisseur choisi.</li>
                <li><strong class="text-(--text)">Décharge de responsabilité :</strong> SilverCore agit uniquement comme un intermédiaire. Nous n'hébergeons pas ces données sur notre infrastructure E2EE et nous déclinons toute responsabilité quant à la gestion des données de la part du fournisseur cloud.</li>
                <li><strong class="text-(--text)">Recommandation :</strong> Assurez-vous de ne pas envoyer d'informations sensibles (données médicales, mots de passe, secrets industriels) à travers un modèle d'IA tiers si vous n'avez pas un accord d'entreprise spécifique avec le fournisseur.</li>
            </ul>

            <p class="pt-2 font-medium">Si la confidentialité absolue est requise, privilégiez l'option <span class="text-(--primary)">WebGPU (Local)</span> ou un <span class="text-(--primary)">Serveur Client (Custom)</span> hébergé sur votre propre infrastructure privée.</p>
        </div>
        <template #footer>
            <button @click="showLearnMorePopup = false" class="primary px-6 py-2.5 rounded-xl text-sm font-medium">J'ai compris</button>
        </template>
    </Popup>

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { openedOrg, organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';


const toast = useToast();

const saving = ref<boolean>(false);
const showApiKey = ref<boolean>(false);
const acceptCloudWarning = ref<boolean>(false);
const showLearnMorePopup = ref<boolean>(false);

const providers = [
    { id: 'local', name: 'WebGPU (Local Browser)', desc: 'Exécuté sur la carte graphique de l\'utilisateur. Gratuit, 100% privé, mais dépend des performances de chaque machine.' },
    { id: 'custom', name: 'Serveur Client (Custom API)', desc: 'Votre propre serveur local ou distant avec une API compatible OpenAI (Ollama, vLLM, etc.).' },
    { id: 'openai', name: 'OpenAI', desc: 'Modèles Cloud de pointe (GPT-4o, GPT-4o-mini).' },
    { id: 'gemini', name: 'Google Gemini', desc: 'Modèles très rapides et puissants (1.5 Pro, Flash).' },
    { id: 'mistral', name: 'Mistral AI', desc: 'Modèles souverains européens (Mistral Large, Pixtral).' },
];

const getAiConfig = () => {
    const config = openedOrg.value?.activeModules?.aiConfig || {};
    return {
        provider: config.provider || 'local',
        apiKey: '', // API key is never populated from backend
        hasApiKey: config.hasApiKey || false,
        endpointUrl: config.endpointUrl || '',
        modelId: config.modelId || ''
    };
};

const orgData = ref({ ...getAiConfig() });

const hasChanges = computed(() => {
    const initial = getAiConfig();
    return (
        orgData.value.provider !== initial.provider ||
        (orgData.value.apiKey || '') !== '' ||
        orgData.value.endpointUrl !== initial.endpointUrl ||
        orgData.value.modelId !== initial.modelId
    );
});

const defaultModelPlaceholder = computed(() => {
    if (orgData.value.provider === 'openai') return 'gpt-4o-mini';
    if (orgData.value.provider === 'gemini') return 'gemini-1.5-flash';
    if (orgData.value.provider === 'mistral') return 'pixtral-12b-2409';
    return 'Ex: llama3.1:8b';
});

const recommendedModels = computed(() => {
    if (orgData.value.provider === 'openai') return ['gpt-4o-mini', 'gpt-4o'];
    if (orgData.value.provider === 'gemini') return ['gemini-1.5-flash', 'gemini-1.5-pro'];
    if (orgData.value.provider === 'mistral') return ['pixtral-12b-2409', 'mistral-large-latest'];
    return [];
});

const resetChanges = () => {
    orgData.value = { ...getAiConfig() };
    showApiKey.value = false;
};

const saveSettings = async () => {

    if (!hasChanges.value) return;

    // Validation
    if (orgData.value.provider !== 'local') {
        if (!orgData.value.apiKey && !orgData.value.hasApiKey && orgData.value.provider !== 'custom') { 
            return toast.show('Veuillez entrer une clé API pour ce fournisseur.', 'error');
        }
        if (orgData.value.provider === 'custom' && !orgData.value.endpointUrl) {
            return toast.show('Veuillez entrer l\'URL de l\'endpoint pour le serveur custom.', 'error');
        }
        if (!orgData.value.modelId) {
            return toast.show('Veuillez indiquer l\'ID du modèle à utiliser.', 'error');
        }
        if (orgData.value.provider !== 'custom' && !acceptCloudWarning.value) {
            return toast.show('Vous devez accepter les conditions d\'utilisation des services cloud externes.', 'error');
        }
    }

    saving.value = true;


    try {
        const aiConfigPayload: any = {
            provider: orgData.value.provider,
            endpointUrl: orgData.value.endpointUrl,
            modelId: orgData.value.modelId
        };

        if (orgData.value.apiKey) {
            aiConfigPayload.apiKey = orgData.value.apiKey;
        }

        const activeModules = {
            ...(openedOrg.value?.activeModules || {}),
            aiConfig: aiConfigPayload
        };

        const res = await sfetch(`/api/orgs/${openedOrg.value?.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ activeModules })
        }).then(res => res.json());

        if (res.error) {
            toast.show(res.error, 'error');
        } else {
            if (!openedOrg.value) return;

            openedOrg.value.activeModules = activeModules;

            const currentOrg = organizations.value.find(org => org.id === openedOrg.value?.id);
            if (currentOrg) {
                currentOrg.activeModules = activeModules;
            }

            toast.show('Configuration IA sauvegardée avec succès.', 'success');
        }
    } catch (err) {
        console.error(err);
        toast.show('Erreur lors de la sauvegarde.', 'error');
    } finally {
        saving.value = false;
    }
};

watch(() => openedOrg.value, (newOrg) => {
    if (newOrg) resetChanges();
}, { deep: true });

// Auto select default model when switching provider
watch(() => orgData.value.provider, (newProv, oldProv) => {
    if (newProv !== oldProv && newProv !== 'local') {
        if (newProv === 'openai' && (!orgData.value.modelId || !orgData.value.modelId.includes('gpt'))) orgData.value.modelId = 'gpt-4o-mini';
        else if (newProv === 'gemini' && (!orgData.value.modelId || !orgData.value.modelId.includes('gemini'))) orgData.value.modelId = 'gemini-1.5-flash';
        else if (newProv === 'mistral' && (!orgData.value.modelId || !orgData.value.modelId.includes('istral'))) orgData.value.modelId = 'pixtral-12b-2409';
        
        if (newProv !== 'custom') orgData.value.endpointUrl = '';
    }
});

</script>

<style scoped>
.animate-fade-in {
    animation: fadeIn 0.3s ease-out forwards;
}
@keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
}
</style>
