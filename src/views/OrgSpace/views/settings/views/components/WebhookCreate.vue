<template>

    <!-- Création volontairement réduite à trois décisions : qui est ce
         webhook (photo + nom) et où il poste. Tout le reste — permissions,
         signature, chiffrement, URL — a un défaut sûr et se règle après coup
         dans le panneau de configuration, où l'utilisateur a le contexte pour
         comprendre de quoi il s'agit. -->
    <Popup :is-open="true" @close="$emit('close')">

        <template #title>Nouveau webhook</template>

        <form id="webhook-create-form" class="flex flex-col gap-6" @submit.prevent="handleCreate">

            <p class="text-sm text-(--text2) leading-relaxed -mt-1">
                Vous obtiendrez une adresse à coller dans l'outil de votre choix.
                Ce qu'il enverra dessus s'affichera ici, sous le nom et la photo
                que vous choisissez maintenant.
            </p>

            <WebhookAvatarInput v-model="avatarUrl" :name="name" />

            <div class="flex flex-col gap-2">
                <label for="webhook-name" class="text-xs font-bold uppercase tracking-wider text-(--text2)">
                    Nom affiché
                </label>
                <input
                    id="webhook-name"
                    ref="nameInput"
                    v-model="name"
                    type="text"
                    placeholder="Ex: Déploiements, Alertes Grafana..."
                    :maxlength="100"
                    class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2.5 text-sm text-(--text) font-semibold outline-none focus:border-(--primary) transition-colors placeholder-(--text2)/60"
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold uppercase tracking-wider text-(--text2)">
                    Salon de destination
                </label>
                <WebhookChannelPicker
                    v-model="targetChannelId"
                    :channels="channels"
                    :loading="loadingChannels"
                />
            </div>

        </form>

        <template #footer>
            <button type="button" class="default" :disabled="loading" @click="$emit('close')">
                Annuler
            </button>
            <button
                type="submit"
                form="webhook-create-form"
                class="primary flex items-center gap-2"
                :disabled="loading || !isFormValid"
                :class="loading || !isFormValid ? 'opacity-40 cursor-not-allowed' : ''"
            >
                <span v-if="loading" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Créer le webhook
            </button>
        </template>

    </Popup>

</template>

<script lang="ts" setup>

import { ref, computed, onMounted, nextTick } from 'vue';
import Popup from '@/components/Popup.vue';
import WebhookAvatarInput from './WebhookAvatarInput.vue';
import WebhookChannelPicker from './WebhookChannelPicker.vue';
import { useWebhooks } from '@/composables/useWebhooks';
import type { Webhook, WebhookTargetChannel } from '@/types/webhooks';

const props = defineProps<{
    spaceId: string;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'created', webhook: Webhook): void;
}>();

const { createWebhook, getSpaceChannels } = useWebhooks();

const name = ref<string>('');
const avatarUrl = ref<string | null>(null);
const targetChannelId = ref<string>('');

const nameInput = ref<HTMLInputElement | null>(null);
const channels = ref<WebhookTargetChannel[]>([]);
const loadingChannels = ref<boolean>(false);
const loading = ref<boolean>(false);

const isFormValid = computed<boolean>(() =>
    name.value.trim().length > 0 && targetChannelId.value.length > 0
);

onMounted(async () => {

    nextTick(() => nameInput.value?.focus());

    if (!props.spaceId) return;

    loadingChannels.value = true;
    const result = await getSpaceChannels(props.spaceId);
    loadingChannels.value = false;

    if (!result) return;
    channels.value = result;

    // Un seul salon possible : le choix n'en est pas un, on le présélectionne.
    if (result.length === 1) targetChannelId.value = result[0].id;

});

const handleCreate = async () => {

    if (!isFormValid.value || loading.value) return;

    loading.value = true;

    try {
        const result = await createWebhook(props.spaceId, {
            name: name.value.trim(),
            avatarUrl: avatarUrl.value || undefined,
            targetChannelId: targetChannelId.value,
            // Défauts sûrs, modifiables ensuite : de quoi poster du texte et
            // des cartes enrichies, signature HMAC exigée, pas de E2EE (qui
            // impose au service externe de chiffrer ses payloads).
            permissions: ['send_messages', 'send_embeds'],
            requireSignature: true,
            e2eeEnabled: false
        });

        if (result?.success && result.webhook) {
            emit('created', result.webhook);
        }
    } catch (err) {
        console.error('[Webhooks] Erreur lors de la création:', err);
    } finally {
        loading.value = false;
    }

};

</script>
