<template>

    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">

            <div class="max-w-5xl mx-auto space-y-12">

                <div class="mb-8">
                    <h3 class="text-2xl font-black text-(--text) mb-2">Configuration de Synco AI</h3>
                    <p class="text-sm text-(--text2)">Activez les fournisseurs que les membres de votre organisation peuvent utiliser avec Synco AI, puis choisissez celui proposé par défaut. Chaque membre peut ensuite en changer pour lui-même.</p>
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

                    <section class="space-y-4">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2)">Local / Auto-hébergé</h4>
                        <AiProviderCard v-for="meta in localProviders" :key="meta.id" :meta="meta" :form="forms[meta.id]"
                            :is-default="effectiveDefault === meta.id" @learn-more="showLearnMorePopup = true" />
                    </section>

                    <section class="space-y-4">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2)">Fournisseurs API Cloud</h4>
                        <AiProviderCard v-for="meta in cloudProviders" :key="meta.id" :meta="meta" :form="forms[meta.id]"
                            :is-default="effectiveDefault === meta.id" @learn-more="showLearnMorePopup = true" />
                    </section>

                    <section class="space-y-4">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2)">Fournisseur par défaut</h4>
                        <p class="text-xs text-(--text2) leading-relaxed -mt-2">
                            Utilisé tant qu'un membre n'a pas choisi un autre fournisseur dans l'assistant. Chaque membre peut
                            en changer pour lui-même parmi ceux que vous avez activés.
                        </p>
                        <div v-if="enabledForms.length" class="relative max-w-md">
                            <select v-model="defaultProvider"
                                class="w-full bg-(--bg) border border-(--border-color) px-4 py-3 text-sm focus:outline-none rounded-xl focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all shadow-inner text-(--text)">
                                <option v-for="meta in enabledForms" :key="meta.id" :value="meta.id">{{ meta.name }}</option>
                            </select>
                        </div>
                        <p v-else class="text-xs text-red-400">Activez au moins un fournisseur pour que l'assistant soit utilisable.</p>
                    </section>

                    <section class="space-y-6">
                        <h4 class="text-xs font-bold uppercase tracking-widest text-(--text2) mb-4">Profondeur de réflexion par défaut</h4>
                        <p class="text-xs text-(--text2) leading-relaxed -mt-2">
                            Contrôle combien l'IA réfléchit avant de répondre. Chaque membre peut l'ajuster pour lui-même depuis
                            l'assistant. Les fournisseurs avec un réglage natif (OpenAI o*/GPT-5, Gemini 2.5+) l'utilisent
                            directement ; les autres suivent une consigne adaptée dans le prompt système — l'effet dépend alors
                            aussi du modèle choisi.
                        </p>

                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <label v-for="level in reasoningLevels" :key="level.id"
                                class="relative flex flex-col p-5 border rounded-2xl cursor-pointer transition-all hover:shadow-md group"
                                :class="reasoningEffort === level.id ? 'border-(--primary) bg-(--primary)/5 shadow-sm' : 'border-(--border-color) bg-(--bg2) hover:border-(--text)/20'">

                                <input type="radio" :value="level.id" v-model="reasoningEffort" name="reasoningEffort" class="sr-only">

                                <div class="flex items-center justify-between mb-3">
                                    <span class="font-bold text-sm text-(--text)">{{ level.name }}</span>
                                    <div class="w-5 h-5 rounded-full border flex items-center justify-center transition-colors"
                                         :class="reasoningEffort === level.id ? 'border-(--primary) bg-(--primary)' : 'border-(--text)/30 group-hover:border-(--text)/50 bg-transparent'">
                                        <i v-if="reasoningEffort === level.id" class="bi bi-check text-white text-xs"></i>
                                    </div>
                                </div>
                                <p class="text-xs text-(--text2) leading-relaxed">{{ level.desc }}</p>

                            </label>
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
                    :class="saving ? 'loader' : ''"
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

import { ref, reactive, computed, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { openedOrg, organizations } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import sfetch from '@/assets/utils/sfetch';
import { ensureAiSessionKey } from '@/services/AiSessionKeyService';
import AiProviderCard, { type ProviderForm } from './components/AiProviderCard.vue';
import {
    AI_PROVIDERS, normalizeAiConfig, type AiProviderId, type ReasoningEffort,
} from '@/services/aiProviders';

const toast = useToast();

const saving = ref<boolean>(false);
const showLearnMorePopup = ref<boolean>(false);

const localProviders = AI_PROVIDERS.filter(p => p.category === 'local');
const cloudProviders = AI_PROVIDERS.filter(p => p.category === 'cloud');

const reasoningLevels: Array<{ id: ReasoningEffort; name: string; desc: string }> = [
    { id: 'low', name: 'Bas', desc: 'Réponses rapides et directes, raisonnement minimal, moins de tokens consommés.' },
    { id: 'medium', name: 'Moyen', desc: "Comportement par défaut : bon équilibre entre rapidité et pertinence." },
    { id: 'high', name: 'Haut', desc: "Réflexion plus poussée avant de répondre : réponses plus pertinentes, mais plus lentes et plus coûteuses en tokens." },
];

const buildForms = (): Record<AiProviderId, ProviderForm> => {
    const cfg = normalizeAiConfig(openedOrg.value?.activeModules?.aiConfig);
    return Object.fromEntries(AI_PROVIDERS.map(meta => {
        const entry = cfg.providers[meta.id];
        return [meta.id, {
            enabled: !!entry?.enabled,
            modelId: entry?.modelId || '',
            endpointUrl: entry?.endpointUrl || '',
            gatewayUrl: entry?.gatewayUrl || '',
            apiKey: '',
            hasApiKey: !!entry?.hasApiKey,
            removeKey: false,
            acceptedCloud: false,
        } satisfies ProviderForm];
    })) as Record<AiProviderId, ProviderForm>;
};

const forms = reactive<Record<AiProviderId, ProviderForm>>(buildForms());
const initialConfig = () => normalizeAiConfig(openedOrg.value?.activeModules?.aiConfig);
const defaultProvider = ref<AiProviderId>(initialConfig().defaultProvider);
const reasoningEffort = ref<ReasoningEffort>(initialConfig().reasoningEffort);

const enabledForms = computed(() => AI_PROVIDERS.filter(p => forms[p.id].enabled));
// Un défaut désactivé ou jamais choisi retombe sur le premier fournisseur activé.
const effectiveDefault = computed<AiProviderId | null>(() =>
    forms[defaultProvider.value]?.enabled ? defaultProvider.value : (enabledForms.value[0]?.id ?? null));

type SnapForm = Pick<ProviderForm, 'enabled' | 'modelId' | 'endpointUrl' | 'gatewayUrl'>;

const snapshot = (f: Record<AiProviderId, SnapForm>, def: AiProviderId | null, effort: ReasoningEffort) => JSON.stringify({
    def, effort,
    providers: AI_PROVIDERS.map(p => [p.id, f[p.id].enabled, f[p.id].modelId, f[p.id].endpointUrl, f[p.id].gatewayUrl]),
});

const hasChanges = computed(() => {
    const initialForms = (() => {
        const cfg = initialConfig();
        return Object.fromEntries(AI_PROVIDERS.map(p => {
            const e = cfg.providers[p.id];
            return [p.id, { enabled: !!e?.enabled, modelId: e?.modelId || '', endpointUrl: e?.endpointUrl || '', gatewayUrl: e?.gatewayUrl || '' }];
        })) as Record<AiProviderId, SnapForm>;
    })();
    const initial = initialConfig();
    const keysTouched = AI_PROVIDERS.some(p => forms[p.id].apiKey !== '' || forms[p.id].removeKey);
    return keysTouched || snapshot(forms, effectiveDefault.value, reasoningEffort.value) !== snapshot(initialForms, initial.defaultProvider, initial.reasoningEffort);
});

const resetChanges = () => {
    Object.assign(forms, buildForms());
    defaultProvider.value = initialConfig().defaultProvider;
    reasoningEffort.value = initialConfig().reasoningEffort;
};

const validate = (): string | null => {
    if (enabledForms.value.length === 0) return 'Activez au moins un fournisseur.';
    const initial = initialConfig();
    for (const meta of enabledForms.value) {
        const f = forms[meta.id];
        const keyAvailable = !!f.apiKey || (f.hasApiKey && !f.removeKey);
        if (meta.needsKey && !keyAvailable) return `Veuillez entrer une clé API pour ${meta.name}.`;
        if (meta.id === 'custom' && !f.endpointUrl) return "Veuillez entrer l'URL de l'endpoint pour le serveur custom.";
        if (meta.id === 'gateway' && !f.gatewayUrl) return "Veuillez entrer l'URL de votre Synco AI Gateway.";
        if (meta.id !== 'local' && !f.modelId) return `Veuillez indiquer le modèle à utiliser pour ${meta.name}.`;
        // Consentement demandé à l'activation d'un fournisseur cloud ou au changement de sa clé, pas à chaque enregistrement.
        const newlyEnabled = !initial.providers[meta.id]?.enabled;
        if (meta.category === 'cloud' && (newlyEnabled || !!f.apiKey) && !f.acceptedCloud) {
            return `Vous devez accepter les conditions d'utilisation de ${meta.name} (service cloud externe).`;
        }
    }
    return null;
};

const saveSettings = async () => {

    if (!hasChanges.value) return;

    const problem = validate();
    if (problem) return toast.show(problem, 'error');

    saving.value = true;

    // Provisionne (ou récupère) la clé de session IA chiffrée AVANT d'activer le provider 'gateway' —
    // sans ça, un membre pourrait se retrouver avec la passerelle choisie mais aucune clé, et son premier
    // chat échouerait silencieusement (cf. E2EE_PLAN.md §6). Idempotent.
    if (forms.gateway.enabled) {
        try {
            await ensureAiSessionKey(openedOrg.value!.id);
        } catch (keyErr: any) {
            toast.show(keyErr?.message || "Impossible de provisionner la clé de session IA chiffrée pour cette organisation.", 'error');
            saving.value = false;
            return;
        }
    }

    try {
        const providers = Object.fromEntries(AI_PROVIDERS.map(meta => {
            const f = forms[meta.id];
            return [meta.id, {
                enabled: f.enabled,
                modelId: f.modelId,
                endpointUrl: f.endpointUrl,
                gatewayUrl: f.gatewayUrl,
                // undefined = clé inchangée, null = suppression explicite.
                ...(f.apiKey ? { apiKey: f.apiKey } : f.removeKey ? { apiKey: null } : {}),
            }];
        }));

        const aiConfig = { defaultProvider: effectiveDefault.value, reasoningEffort: reasoningEffort.value, providers };
        const activeModules = { ...(openedOrg.value?.activeModules || {}), aiConfig };

        const res = await sfetch(`/api/orgs/${openedOrg.value?.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ activeModules })
        }).then(res => res.json());

        if (res.error) {
            toast.show(res.error, 'error');
        } else {
            if (!openedOrg.value) return;

            // La réponse porte la config telle que le serveur l'a normalisée (drapeaux hasApiKey recalculés).
            const saved = res.activeModules || activeModules;
            openedOrg.value.activeModules = saved;

            const currentOrg = organizations.value.find(org => org.id === openedOrg.value?.id);
            if (currentOrg) {
                currentOrg.activeModules = saved;
            }

            resetChanges();
            toast.show('Configuration IA sauvegardée avec succès.', 'success');
        }
    } catch (err) {
        console.error(err);
        toast.show('Erreur lors de la sauvegarde.', 'error');
    } finally {
        saving.value = false;
    }
};

watch(() => openedOrg.value?.id, () => resetChanges());

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
