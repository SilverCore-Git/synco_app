<template>

    <Popup :is-open="true" @close="$emit('close')" class="max-w-2xl">
        <template #title>{{ webhook.name }}</template>

        <div class="space-y-6">
            
            <!-- URL du Webhook -->
            <div>
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-link-45deg" />
                    URL du Webhook
                </h3>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-3 flex items-center justify-between">
                    <code class="text-sm text-(--text2) overflow-x-auto">{{ webhook.url || webhook.urlPreview || 'URL masquée' }}</code>
                    <button 
                        @click="copyUrl"
                        class="flex items-center gap-2 text-(--text2) hover:text-(--primary) transition-all"
                        title="Copier dans le clipboard"
                    >
                        <i class="bi bi-clipboard" />
                    </button>
                </div>
                <p class="text-xs text-(--text2) mt-2">
                    Envoyez vos requêtes POST vers cette URL pour envoyer des messages.
                </p>
            </div>

            <!-- Secret HMAC -->
            <div>
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-key" />
                    Secret HMAC
                </h3>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-3 flex items-center justify-between">
                    <code class="text-sm text-(--text2) overflow-x-auto">{{ webhook.secret }}</code>
                    <button 
                        @click="copySecret"
                        class="flex items-center gap-2 text-(--text2) hover:text-(--primary) transition-all"
                        title="Copier dans le clipboard"
                    >
                        <i class="bi bi-clipboard" />
                    </button>
                </div>
                <p class="text-xs text-amber-500 mt-2">
                    ⚠️ Conservez ce secret en sécurité. Il est utilisé pour signer vos requêtes.
                </p>
            </div>

            <!-- Clé Publique E2EE (si activée) -->
            <div v-if="webhook.e2eeEnabled && webhook.publicKey">
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-lock-fill" />
                    Clé Publique E2EE
                </h3>
                <textarea 
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl p-3 text-xs font-mono text-(--text2) resize-none"
                    readonly
                    :value="webhook.publicKey"
                    rows="4"
                />
                <div class="flex justify-end mt-2">
                    <button 
                        @click="copyPublicKey"
                        class="flex items-center gap-2 text-(--text2) hover:text-(--primary) transition-all"
                        title="Copier dans le clipboard"
                    >
                        <i class="bi bi-clipboard" /> Copier
                    </button>
                </div>
                <p class="text-xs text-(--text2) mt-2">
                    Utilisez cette clé pour chiffrer vos messages avant envoi.
                </p>
            </div>

            <!-- Statistiques -->
            <div>
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-graph-up" />
                    Statistiques d'Utilisation
                </h3>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                        <div class="text-2xl font-bold text-(--text)">{{ webhook.usageCount }}</div>
                        <div class="text-xs text-(--text2)">Messages reçus</div>
                    </div>
                    <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                        <div class="text-2xl font-bold text-(--text)">{{ webhook.errorCount }}</div>
                        <div class="text-xs text-(--text2)">Erreurs</div>
                    </div>
                    <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                        <div class="text-xl font-bold text-(--text)" :class="webhook.isActive ? 'text-green-500' : 'text-red-500'">
                            {{ webhook.isActive ? 'Actif' : 'Inactif' }}
                        </div>
                        <div class="text-xs text-(--text2)">Statut</div>
                    </div>
                    <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                        <div class="text-lg font-bold text-(--text)">
                            {{ webhook.e2eeEnabled ? 'Oui' : 'Non' }}
                        </div>
                        <div class="text-xs text-(--text2)">E2EE</div>
                    </div>
                </div>
            </div>

            <!-- Dernière utilisation -->
            <div v-if="webhook.lastUsedAt">
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-clock-history" />
                    Dernière utilisation
                </h3>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-3">
                    <div class="text-sm text-(--text)">{{ formatDateTime(webhook.lastUsedAt) }}</div>
                </div>
            </div>

            <!-- Créé le -->
            <div>
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-calendar" />
                    Créé le
                </h3>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-3">
                    <div class="text-sm text-(--text)">{{ formatDateTime(webhook.createdAt) }}</div>
                </div>
            </div>

            <!-- Permissions -->
            <div>
                <h3 class="text-sm font-semibold text-(--text) mb-2 flex items-center gap-2">
                    <i class="bi bi-shield-check" />
                    Permissions
                </h3>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                    <div class="flex flex-wrap gap-2">
                        <span 
                            v-for="permission in webhook.permissions" 
                            :key="permission"
                            class="text-xs bg-(--white)/10 text-(--text) px-3 py-1 rounded-full"
                        >
                            {{ formatPermission(permission) }}
                        </span>
                    </div>
                </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-3 pt-4 border-t border-(--white)/10">
                <button 
                    @click="$emit('test', webhook)"
                    class="default px-4 py-2 flex items-center gap-2"
                >
                    <i class="bi bi-send-fill" />
                    Tester
                </button>
                <button 
                    @click="$emit('edit', webhook)"
                    class="primary px-4 py-2 flex items-center gap-2"
                >
                    <i class="bi bi-pencil" />
                    Modifier
                </button>
                <button 
                    @click="$emit('delete', webhook)"
                    class="danger px-4 py-2 flex items-center gap-2"
                >
                    <i class="bi bi-trash-fill" />
                    Supprimer
                </button>
            </div>

        </div>

    </Popup>

</template>

<script lang="ts" setup>

import Popup from '@/components/Popup.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook } from '@/types/webhooks';

const props = defineProps<{
    webhook: Webhook;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'edit', webhook: Webhook): void;
    (e: 'delete', webhook: Webhook): void;
    (e: 'test', webhook: Webhook): void;
}>();

const { 
    copyWebhookUrl,
    copyWebhookSecret,
    copyWebhookPublicKey,
    formatPermission
} = useWebhooks();

// Copie l'URL dans le clipboard
const copyUrl = async () => {
    await copyWebhookUrl(props.webhook);
};

// Copie le secret dans le clipboard
const copySecret = async () => {
    await copyWebhookSecret(props.webhook);
};

// Copie la clé publique dans le clipboard
const copyPublicKey = async () => {
    await copyWebhookPublicKey(props.webhook);
};

// Formate une date/heure
const formatDateTime = (date: string | Date | undefined): string => {
    if (!date) return 'Jamais';
    return new Date(date).toLocaleString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

</script>

<style scoped>

</style>
