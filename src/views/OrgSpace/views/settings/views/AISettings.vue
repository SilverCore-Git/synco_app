<template>

    <div class="flex flex-col w-full overflow-hidden h-full">
        
        <main class="flex-1 overflow-y-auto p-6 lg:p-10">

            <div class="max-w-3xl mx-auto space-y-12">

                <section>
                    
                    <div class="mb-6">
                        <h3 class="text-xl font-black text-(--text) mb-1">Configuration de l'IA</h3>
                        <p class="text-sm text-(--text)/60">Paramétrez le fournisseur de l'intelligence artificielle pour votre organisation. Ce paramétrage sera utilisé par tous les membres.</p>
                    </div>

                    <div class="space-y-8">

                        <div class="space-y-4">
                            <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Fournisseur IA</label>
                            
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label v-for="prov in providers" :key="prov.id" 
                                    class="relative flex items-center p-4 border rounded-xl cursor-pointer transition-all hover:bg-white/5"
                                    :class="orgData.provider === prov.id ? 'border-(--primary) bg-(--primary)/5' : 'border-(--border-color) bg-(--bg2)'">
                                    
                                    <input type="radio" :value="prov.id" v-model="orgData.provider" name="provider" class="sr-only">
                                    <div class="flex flex-col gap-1 w-full">
                                        <div class="flex items-center justify-between">
                                            <span class="font-bold text-sm">{{ prov.name }}</span>
                                            <i v-if="orgData.provider === prov.id" class="bi bi-check-circle-fill text-(--primary)"></i>
                                        </div>
                                        <span class="text-xs text-(--text)/50">{{ prov.desc }}</span>
                                    </div>

                                </label>
                            </div>
                        </div>

                        <!-- Options Spécifiques -->
                        <div v-if="orgData.provider !== 'local'" class="space-y-6 animate-fade-in p-6 bg-(--bg2) border border-(--border-color) rounded-xl shadow-inner">
                            
                            <!-- Clé API -->
                            <div class="space-y-1.5">
                                <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Clé API ({{ orgData.provider }})</label>
                                <div class="relative">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                        <i class="bi bi-key-fill"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.apiKey"
                                        :type="showApiKey ? 'text' : 'password'"
                                        class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 pl-11 pr-12 text-sm focus:outline-none rounded-xl focus:border-(--primary) transition-all font-mono placeholder:text-(--text)/30 shadow-inner"
                                        :placeholder="orgData.hasApiKey ? '•••••••••••••••• (Clé configurée, tapez pour remplacer)' : 'sk-...'"
                                    />
                                    <button @click="showApiKey = !showApiKey" class="absolute right-4 top-1/2 -translate-y-1/2 text-(--text)/40 hover:text-(--text)">
                                        <i class="bi" :class="showApiKey ? 'bi-eye-slash' : 'bi-eye'"></i>
                                    </button>
                                </div>
                            </div>

                            <!-- Endpoint URL (Custom only) -->
                            <div class="space-y-1.5" v-if="orgData.provider === 'custom'">
                                <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">URL de l'Endpoint</label>
                                <div class="relative">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                        <i class="bi bi-link-45deg"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.endpointUrl"
                                        type="text"
                                        class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 pl-11 text-sm focus:outline-none rounded-xl focus:border-(--primary) transition-all shadow-inner"
                                        placeholder="https://mon-serveur.local:11434/v1"
                                    />
                                </div>
                            </div>

                            <!-- Model ID -->
                            <div class="space-y-1.5">
                                <label class="text-xs font-bold uppercase tracking-widest text-(--text)/50">Modèle à utiliser</label>
                                <div class="relative">
                                    <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-(--text)/40">
                                        <i class="bi bi-robot"></i>
                                    </div>
                                    <input 
                                        v-model="orgData.modelId"
                                        type="text"
                                        class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 pl-11 text-sm focus:outline-none rounded-xl focus:border-(--primary) transition-all font-mono shadow-inner"
                                        :placeholder="defaultModelPlaceholder"
                                    />
                                </div>
                                <div class="flex gap-2 mt-2 flex-wrap" v-if="recommendedModels.length > 0">
                                    <button 
                                        v-for="model in recommendedModels" 
                                        :key="model"
                                        @click="orgData.modelId = model"
                                        class="px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors border"
                                        :class="orgData.modelId === model ? 'bg-(--primary) border-(--primary) text-white' : 'bg-white/5 border-white/10 text-(--text)/50 hover:bg-white/10'"
                                    >
                                        {{ model }}
                                    </button>
                                </div>
                            </div>

                        </div>

                    </div>

                </section>

            </div>
        </main>

        <Transition name="fade-bottom">
            <footer 
                v-if="hasChanges" 
                class="p-4 bg-(--bg2)/80 backdrop-blur-xl border-t border-(--border-color) flex justify-end gap-3"
            >
                <button @click="resetChanges" class="default">Annuler</button>
                <button @click="saveSettings" class="primary" :class="saving ? 'loader' : ''">Enregistrer les modifications</button>
            </footer>
        </Transition>

    </div>

</template>

<script lang="ts" setup>

import { ref, computed, watch } from 'vue';
import { openedOrg, organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';


const toast = useToast();

const saving = ref<boolean>(false);
const showApiKey = ref<boolean>(false);

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
