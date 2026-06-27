<template>

    <Popup :is-open="true" @close="$emit('close')" class="max-w-lg">
        <template #title>Tester le Webhook</template>

        <form @submit.prevent="handleTest" class="space-y-6">
            
            <!-- Info -->
            <div class="p-4 bg-(--white)/5 border border-(--white)/10 rounded-xl">
                <div class="flex items-start gap-3">
                    <i class="bi bi-info-circle text-(--primary) text-lg flex-shrink-0 mt-0.5" />
                    <div>
                        <h4 class="text-sm font-semibold text-(--text) mb-1">Test du Webhook</h4>
                        <p class="text-xs text-(--text)/60">
                            Envoyez un message de test pour vérifier que votre webhook fonctionne correctement.
                            Le message sera envoyé dans le channel configuré.
                        </p>
                    </div>
                </div>
            </div>

            <!-- Contenu -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Contenu du message
                </label>
                <textarea
                    v-model="payload.content"
                    placeholder="Saisissez votre message de test..."
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all resize-none"
                    rows="3"
                    :maxlength="4096"
                />
                <p class="text-xs text-(--text)/50 mt-1 flex justify-between">
                    <span>Contenu du message (optionnel si embeds présents)</span>
                    <span>{{ payload.content?.length || 0 }}/4096</span>
                </p>
            </div>

            <!-- Nom d'utilisateur -->
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-(--text) mb-2">
                        Nom de l'expéditeur
                    </label>
                    <input
                        v-model="payload.username"
                        type="text"
                        placeholder="Test Bot"
                        class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                        :maxlength="100"
                    />
                </div>
                <div>
                    <label class="block text-sm font-medium text-(--text) mb-2">
                        URL de l'avatar
                    </label>
                    <input
                        v-model="payload.avatar_url"
                        type="url"
                        placeholder="https://example.com/avatar.png"
                        class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                    />
                </div>
            </div>

            <!-- Embeds -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2 flex items-center justify-between">
                    <span>Embeds</span>
                    <button 
                        type="button"
                        @click="addEmbed"
                        class="text-xs text-(--primary) hover:text-(--primary)/80"
                    >
                        + Ajouter
                    </button>
                </label>
                
                <div v-if="payload.embeds?.length === 0" class="text-xs text-(--text)/50">
                    Aucun embed configuré
                </div>
                
                <div v-else class="space-y-3">
                    <div 
                        v-for="(embed, index) in payload.embeds" 
                        :key="index"
                        class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4"
                    >
                        <div class="flex justify-between items-start mb-3">
                            <h5 class="text-sm font-medium text-(--text)">Embed {{ index + 1 }}</h5>
                            <button 
                                type="button"
                                @click="removeEmbed(index)"
                                class="text-(--text)/40 hover:text-red-500"
                            >
                                <i class="bi bi-trash" />
                            </button>
                        </div>
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs text-(--text)/60 mb-1">Titre</label>
                                <input
                                    v-model="embed.title"
                                    type="text"
                                    placeholder="Titre de l'embed"
                                    class="w-full bg-(--white)/10 border border-(--white)/20 rounded-lg px-3 py-2 text-sm text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                                    :maxlength="256"
                                />
                            </div>
                            <div>
                                <label class="block text-xs text-(--text)/60 mb-1">Couleur (hex)</label>
                                <input
                                    v-model="embed.color"
                                    type="text"
                                    placeholder="#22c55e"
                                    class="w-full bg-(--white)/10 border border-(--white)/20 rounded-lg px-3 py-2 text-sm text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                                    :maxlength="7"
                                />
                            </div>
                        </div>
                        
                        <div class="mt-3">
                            <label class="block text-xs text-(--text)/60 mb-1">Description</label>
                            <textarea
                                v-model="embed.description"
                                placeholder="Description de l'embed"
                                class="w-full bg-(--white)/10 border border-(--white)/20 rounded-lg px-3 py-2 text-sm text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all resize-none"
                                rows="2"
                                :maxlength="4096"
                            />
                        </div>
                        
                        <div class="mt-3">
                            <label class="block text-xs text-(--text)/60 mb-1">URL</label>
                            <input
                                v-model="embed.url"
                                type="url"
                                placeholder="https://example.com"
                                class="w-full bg-(--white)/10 border border-(--white)/20 rounded-lg px-3 py-2 text-sm text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                            />
                        </div>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-4 border-t border-(--white)/10">
                <button 
                    type="button"
                    @click="$emit('close')"
                    class="default px-6 py-2"
                    :disabled="loading"
                >
                    Annuler
                </button>
                <button 
                    type="submit"
                    class="primary px-6 py-2 flex items-center gap-2"
                    :disabled="loading || !hasContent"
                >
                    <span v-if="loading" class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    <span v-else>Envoyer le Test</span>
                </button>
            </div>

        </form>

    </Popup>

</template>

<script lang="ts" setup>

import { ref, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook, TestWebhookPayload } from '@/types/webhooks';

const props = defineProps<{
    webhook: Webhook;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
}>();

const { testWebhook, generateDefaultTestPayload } = useWebhooks();

// Payload par défaut
const defaultPayload = generateDefaultTestPayload();

// State du formulaire
const payload = ref<TestWebhookPayload>({
    content: defaultPayload.content,
    username: defaultPayload.username,
    avatar_url: defaultPayload.avatar_url,
    embeds: defaultPayload.embeds
});

const loading = ref<boolean>(false);

// Validation: doit avoir au moins un contenu ou un embed
const hasContent = computed(() => {
    return (payload.value.content && payload.value.content.trim().length > 0) ||
           (payload.value.embeds && payload.value.embeds.length > 0);
});

// Ajouter un embed
const addEmbed = () => {
    if (!payload.value.embeds) {
        payload.value.embeds = [];
    }
    payload.value.embeds.push({
        title: '',
        description: '',
        color: '#22c55e',
        url: ''
    });
};

// Supprimer un embed
const removeEmbed = (index: number) => {
    if (payload.value.embeds && payload.value.embeds.length > 0) {
        payload.value.embeds.splice(index, 1);
    }
};

// Envoyer le test
const handleTest = async () => {
    if (!hasContent.value) return;
    
    loading.value = true;
    
    try {
        // Nettoyer les embeds vides
        if (payload.value.embeds) {
            payload.value.embeds = payload.value.embeds.filter(e => 
                e.title?.trim() || e.description?.trim() || e.url?.trim()
            );
        }
        
        const result = await testWebhook(props.webhook.id, {
            content: payload.value.content?.trim() || undefined,
            username: payload.value.username?.trim() || undefined,
            avatar_url: payload.value.avatar_url?.trim() || undefined,
            embeds: payload.value.embeds && payload.value.embeds.length > 0 ? payload.value.embeds : undefined
        });
        
        if (result?.success) {
            emit('close');
        }
    } catch (err) {
        console.error('Erreur lors du test:', err);
    } finally {
        loading.value = false;
    }
};

</script>

<style scoped>

</style>
