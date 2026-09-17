<template>

    <div class="space-y-4">
        
        <!-- État de chargement -->
        <div v-if="loading" class="flex items-center justify-center py-8">
            <SpinLoader />
            <span class="ml-3 text-(--text2)">Chargement des webhooks...</span>
        </div>

        <!-- État d'erreur -->
        <div v-else-if="error" class="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-500">
            <p>{{ error }}</p>
        </div>

        <!-- Liste vide -->
        <div 
            v-else-if="webhooks.length === 0"
            class="bg-(--white)/5 border border-(--white)/10 rounded-2xl p-8 text-center"
        >
            <i class="bi bi-link-45deg text-4xl text-(--text2)" />
            <h3 class="text-lg font-semibold text-(--text) mt-4">Aucun webhook configuré</h3>
            <p class="text-(--text2) mt-2">
                Créez votre premier webhook pour commencer à recevoir des notifications.
            </p>
        </div>

        <!-- Liste des webhooks -->
        <div v-else class="space-y-3">
            <div 
                v-for="webhook in webhooks" 
                :key="webhook.id"
                class="bg-(--white)/5 border border-(--white)/10 rounded-2xl p-4 hover:bg-(--white)/8 transition-all group"
            >
                
                <!-- En-tête du webhook -->
                <div class="flex items-start justify-between gap-4">
                    
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-3">
                            <div class="relative">
                                <div class="w-10 h-10 rounded-xl bg-(--primary)/20 flex items-center justify-center">
                                    <i class="bi bi-link-45deg text-(--primary) text-lg" />
                                </div>
                                <div 
                                    v-if="!webhook.isActive" 
                                    class="absolute -top-1 -right-1 w-4 h-4 bg-(--bg) rounded-full border border-(--white)/20 flex items-center justify-center"
                                    title="Désactivé"
                                >
                                    <i class="bi bi-pause-fill text-[10px] text-(--text2)" />
                                </div>
                            </div>
                            
                            <div class="flex-1 min-w-0">
                                <h3 class="text-lg font-bold text-(--text) flex items-center gap-2">
                                    {{ webhook.name }}
                                    <span 
                                        v-if="webhook.e2eeEnabled"
                                        class="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full"
                                        title="Chiffrement E2EE activé"
                                    >
                                        <i class="bi bi-lock-fill" /> E2EE
                                    </span>
                                </h3>
                                <p v-if="webhook.description" class="text-sm text-(--text2) truncate">
                                    {{ webhook.description }}
                                </p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Actions rapides -->
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button 
                            @click="$emit('test', webhook)"
                            class="text-(--text2) hover:text-(--primary) transition-all p-2 rounded-lg hover:bg-(--white)/10"
                            title="Envoyer un message de test"
                        >
                            <i class="bi bi-send-fill" />
                        </button>
                        
                        <button 
                            @click="toggleActive(webhook)"
                            class="text-(--text2) hover:text-(--primary) transition-all p-2 rounded-lg hover:bg-(--white)/10"
                            :title="webhook.isActive ? 'Désactiver' : 'Activer'"
                        >
                            <i 
                                class="bi"
                                :class="webhook.isActive ? 'bi-pause-fill' : 'bi-play-fill'"
                            />
                        </button>
                        
                        <button 
                            @click="$emit('details', webhook)"
                            class="text-(--text2) hover:text-(--primary) transition-all p-2 rounded-lg hover:bg-(--white)/10"
                            title="Voir les détails"
                        >
                            <i class="bi bi-three-dots" />
                        </button>
                    </div>
                </div>

                <!-- Métadonnées -->
                <div class="flex flex-wrap gap-4 mt-4 pl-13">
                    
                    <!-- Statut -->
                    <div class="flex items-center gap-1.5 text-sm">
                        <span 
                            class="w-2 h-2 rounded-full"
                            :class="webhook.isActive ? 'bg-green-500' : 'bg-red-500'"
                        />
                        <span class="text-(--text2)">
                            {{ webhook.isActive ? 'Actif' : 'Inactif' }}
                        </span>
                    </div>
                    
                    <!-- Utilisation -->
                    <div class="flex items-center gap-1.5 text-sm text-(--text2)">
                        <i class="bi bi-chart-line text-(--text2)" />
                        <span>{{ webhook.usageCount }} messages</span>
                    </div>
                    
                    <!-- Dernière utilisation -->
                    <div class="flex items-center gap-1.5 text-sm text-(--text2)">
                        <i class="bi bi-clock text-(--text2)" />
                        <span>{{ formatLastUsed(webhook.lastUsedAt) }}</span>
                    </div>
                    
                    <!-- Créé le -->
                    <div class="flex items-center gap-1.5 text-sm text-(--text2)">
                        <i class="bi bi-calendar text-(--text2)" />
                        <span>{{ formatDate(webhook.createdAt) }}</span>
                    </div>
                </div>

                <!-- URL du webhook (mini) -->
                <div class="mt-3 pl-13">
                    <code class="text-xs text-(--text2) bg-(--white)/5 px-2 py-1 rounded">
                        {{ getShortUrl(webhook) }}
                    </code>
                </div>

            </div>
        </div>

    </div>

</template>

<script lang="ts" setup>

import SpinLoader from '@/components/SpinLoader.vue';
import type { Webhook } from '@/types/webhooks';

const props = defineProps<{
    webhooks: Webhook[];
    loading: boolean;
    error: string | null;
}>();

const emit = defineEmits<{
    (e: 'edit', webhook: Webhook): void;
    (e: 'delete', webhook: Webhook): void;
    (e: 'test', webhook: Webhook): void;
    (e: 'details', webhook: Webhook): void;
    (e: 'toggle', webhook: Webhook, isActive: boolean): void;
}>();

// Toggle le statut d'un webhook
const toggleActive = (webhook: Webhook) => {
    emit('toggle', webhook, !webhook.isActive);
};

// Formate la date de dernière utilisation
const formatLastUsed = (date: string | Date | undefined): string => {
    if (!date) return 'Jamais';
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `Il y a ${days} jour${days > 1 ? 's' : ''}`;
    if (hours > 0) return `Il y a ${hours} heure${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `Il y a ${minutes} minute${minutes > 1 ? 's' : ''}`;
    if (seconds < 60) return 'À l\'instant';
    
    return 'Jamais';
};

// Formate une date
const formatDate = (date: string | Date): string => {
    return new Date(date).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
};

// Retourne une URL raccourcie. Le listing ne renvoie jamais le jeton (cf.
// audit H3 côté backend) donc `webhook.url` n'est disponible que juste
// après création/régénération — on retombe sinon sur `urlPreview`, l'aperçu
// masqué renvoyé par le backend pour ce cas précis.
const getShortUrl = (webhook: Webhook): string => {
    const url = webhook.url;
    if (!url) return webhook.urlPreview || 'URL masquée — voir les détails';
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        const webhookId = pathParts.find(p => p.startsWith('wh_'));
        if (webhookId) {
            return `/api/webhooks/${webhookId}/...`;
        }
        return url;
    } catch {
        return url;
    }
};

</script>

<style scoped>

</style>
