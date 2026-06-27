<template>

    <Popup :is-open="true" @close="$emit('close')" class="max-w-lg">
        <template #title>Modifier le Webhook</template>

        <form @submit.prevent="handleUpdate" class="space-y-6">
            
            <!-- Nom -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Nom du Webhook <span class="text-red-500">*</span>
                </label>
                <input
                    v-model="name"
                    type="text"
                    placeholder="GitHub CI/CD, Discord Bot, etc."
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                    required
                    :maxlength="100"
                />
                <p class="text-xs text-(--text)/50 mt-1">
                    Donnez un nom descriptif à votre webhook (max 100 caractères)
                </p>
            </div>

            <!-- Description -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Description
                </label>
                <textarea
                    v-model="description"
                    placeholder="Notifications de déploiement, Alertes Discord, etc."
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all resize-none"
                    rows="3"
                    :maxlength="500"
                />
                <p class="text-xs text-(--text)/50 mt-1">
                    Description optionnelle pour identifier l'usage du webhook
                </p>
            </div>

            <!-- Channel Cible -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Channel Cible <span class="text-red-500">*</span>
                </label>
                <select
                    v-model="targetChannelId"
                    class="w-full bg-(--white)/5 border border-(--white)/10 rounded-xl px-4 py-3 text-(--text) placeholder-(--text)/40 focus:outline-none focus:border-(--primary)/40 transition-all"
                    required
                    :disabled="loadingChannels"
                >
                    <option value="" disabled>
                        {{ loadingChannels ? 'Chargement...' : 'Sélectionnez un channel' }}
                    </option>
                    <option 
                        v-for="channel in channels" 
                        :key="channel.id"
                        :value="channel.id"
                    >
                        #{{ channel.name }}
                    </option>
                </select>
                <p class="text-xs text-(--text)/50 mt-1">
                    Les messages de ce webhook seront envoyés dans ce channel
                </p>
            </div>

            <!-- Permissions -->
            <div>
                <label class="block text-sm font-medium text-(--text) mb-2">
                    Permissions <span class="text-red-500">*</span>
                </label>
                <div class="bg-(--white)/5 border border-(--white)/10 rounded-xl p-4">
                    <div 
                        v-for="permission in allPermissions" 
                        :key="permission"
                        class="flex items-center gap-3 p-2 rounded-lg hover:bg-(--white)/10"
                    >
                        <input
                            type="checkbox"
                            :id="`perm-${permission}`"
                            v-model="permissions"
                            :value="permission"
                            class="w-4 h-4 rounded border-(--white)/20 text-(--primary) focus:ring-(--primary)/40"
                        />
                        <label :for="`perm-${permission}`" class="flex-1 text-sm cursor-pointer">
                            {{ formatPermission(permission) }}
                        </label>
                    </div>
                </div>
                <p class="text-xs text-(--text)/50 mt-1">
                    Sélectionnez les permissions que ce webhook pourra utiliser
                </p>
            </div>

            <!-- Chiffrement E2EE -->
            <div class="border-t border-(--white)/10 pt-4">
                <label class="flex items-center gap-3 cursor-pointer" @click="e2eeEnabled = !e2eeEnabled">
                    <input
                        type="checkbox"
                        v-model="e2eeEnabled"
                        class="w-5 h-5 rounded border-(--white)/20 text-(--primary) focus:ring-(--primary)/40"
                    />
                    <span class="text-sm font-medium text-(--text)">
                        Activer le chiffrement E2EE
                    </span>
                </label>
                
                <div class="mt-4 p-4 bg-(--white)/5 border border-(--white)/10 rounded-xl" v-if="e2eeEnabled">
                    <div class="flex items-start gap-3">
                        <i class="bi bi-info-circle text-(--primary) text-lg flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 class="text-sm font-semibold text-(--text) mb-1">Chiffrement de bout en bout</h4>
                            <p class="text-xs text-(--text)/60">
                                Les messages reçus via ce webhook seront chiffrés avec une paire de clés ECDH P-256.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Statut -->
            <div class="border-t border-(--white)/10 pt-4">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        v-model="isActive"
                        class="w-5 h-5 rounded border-(--white)/20 text-(--primary) focus:ring-(--primary)/40"
                    />
                    <span class="text-sm font-medium text-(--text)">
                        Webhook actif
                    </span>
                </label>
                <p class="text-xs text-(--text)/50 mt-1">
                    {{ isActive ? 'Le webhook est actuellement actif et peut recevoir des messages.' : 'Le webhook est désactivé et ne peut pas recevoir de messages.' }}
                </p>
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
                    :disabled="loading || !isFormValid"
                >
                    <SpinLoader v-if="loading" class="!h-4 !w-4" />
                    <span v-else>Mettre à jour</span>
                </button>
            </div>

        </form>

    </Popup>

</template>

<script lang="ts" setup>

import { ref, computed, onMounted } from 'vue';
import Popup from '@/components/Popup.vue';
import SpinLoader from '@/components/SpinLoader.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import { ALL_WEBHOOK_PERMISSIONS, type Webhook, type WebhookPermission } from '@/types/webhooks';
import type { WebhookTargetChannel } from '@/types/webhooks';

const props = defineProps<{
    webhook: Webhook & { targetChannelId?: string };
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'updated'): void;
}>();

const { 
    updateWebhook, 
    getSpaceChannels,
    formatPermission
} = useWebhooks();

// State du formulaire
const name = ref<string>(props.webhook.name);
const description = ref<string>(props.webhook.description || '');
const targetChannelId = ref<string>(props.webhook.targetChannelId || '');
const permissions = ref<WebhookPermission[]>([...props.webhook.permissions]);
const e2eeEnabled = ref<boolean>(props.webhook.e2eeEnabled);
const isActive = ref<boolean>(props.webhook.isActive);

// State des channels
const channels = ref<WebhookTargetChannel[]>([]);
const loadingChannels = ref<boolean>(false);

// State de chargement
const loading = ref<boolean>(false);

// Toutes les permissions disponibles
const allPermissions = ALL_WEBHOOK_PERMISSIONS;

// Validation du formulaire
const isFormValid = computed(() => {
    return name.value.trim().length > 0 && 
           name.value.length <= 100 &&
           targetChannelId.value.length > 0 &&
           permissions.value.length > 0;
});

// Charger les channels au montage
onMounted(async () => {
    if (props.webhook.spaceId) {
        loadingChannels.value = true;
        const result = await getSpaceChannels(props.webhook.spaceId);
        if (result) {
            channels.value = result;
        }
        loadingChannels.value = false;
    }
});

// Mise à jour du webhook
const handleUpdate = async () => {
    if (!isFormValid.value) return;
    
    loading.value = true;
    
    try {
        const result = await updateWebhook(props.webhook.id, {
            name: name.value.trim(),
            description: description.value.trim() || undefined,
            permissions: permissions.value,
            e2eeEnabled: e2eeEnabled.value,
            isActive: isActive.value,
            targetChannelId: targetChannelId.value
        });
        
        if (result?.success) {
            emit('updated');
        }
    } catch (err) {
        console.error('Erreur lors de la mise à jour:', err);
    } finally {
        loading.value = false;
    }
};

</script>

<style scoped>

</style>
