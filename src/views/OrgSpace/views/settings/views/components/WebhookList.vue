<template>

    <div class="flex flex-col gap-1 p-3">

        <!-- Chargement initial -->
        <div v-if="loading && webhooks.length === 0" class="py-10 flex items-center justify-center">
            <span class="w-6 h-6 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
        </div>

        <!-- Erreur -->
        <div v-else-if="error" class="m-1 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <p class="text-sm text-red-500">{{ error }}</p>
        </div>

        <!-- Aucun webhook du tout -->
        <div v-else-if="webhooks.length === 0 && !hasQuery" class="px-4 py-10 text-center">
            <div class="w-12 h-12 mx-auto rounded-2xl bg-(--bg) border border-(--border-color) flex items-center justify-center text-xl text-(--primary)">
                <i class="bi bi-link-45deg" />
            </div>
            <p class="text-sm font-bold text-(--text) mt-3">Aucun webhook</p>
            <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                Créez-en un pour qu'un service externe poste dans vos salons.
            </p>
        </div>

        <!-- Recherche sans résultat -->
        <div v-else-if="webhooks.length === 0" class="px-4 py-10 text-center">
            <p class="text-sm text-(--text2)">Aucun webhook ne correspond.</p>
        </div>

        <!-- Liste -->
        <button
            v-for="webhook in webhooks"
            :key="webhook.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all text-left group"
            :class="webhook.id === selectedId
                ? 'bg-(--primary)/10 border-(--primary)/20 shadow-sm'
                : 'border-transparent hover:bg-(--bg2)'"
            @click="emit('select', webhook)"
        >

            <WebhookAvatar
                :avatar-url="webhook.avatarUrl"
                :name="webhook.name"
                :size="38"
                :status="webhook.isActive ? 'active' : 'paused'"
            />

            <div class="flex-1 min-w-0">
                <p
                    class="text-sm font-bold truncate"
                    :class="webhook.id === selectedId ? 'text-(--primary)' : 'text-(--text)'"
                >
                    {{ webhook.name }}
                </p>
                <p class="text-xs text-(--text2) truncate mt-0.5">
                    <!-- L'espace passe avant le salon : à l'échelle de
                         l'organisation, c'est lui qui situe le webhook. -->
                    <template v-if="showSpace && spaceNames[webhook.spaceId || '']">
                        {{ spaceNames[webhook.spaceId || ''] }} ·
                    </template>
                    <template v-if="channelName(webhook)">#{{ channelName(webhook) }}</template>
                    <template v-else>Aucun salon</template>
                    · {{ webhook.usageCount }} message{{ webhook.usageCount === 1 ? '' : 's' }}
                </p>
            </div>

            <i
                class="bi bi-chevron-right text-xs shrink-0 transition-all"
                :class="webhook.id === selectedId ? 'opacity-100 text-(--primary)' : 'opacity-0 group-hover:opacity-100 text-(--text2)'"
            />

        </button>

    </div>

</template>

<script lang="ts" setup>

import WebhookAvatar from './WebhookAvatar.vue';
import type { Webhook, WebhookTargetChannel } from '@/types/webhooks';

const props = defineProps<{
    webhooks: Webhook[];
    // Salons indexés par espace : à l'échelle de l'organisation, deux lignes
    // voisines ne visent pas les mêmes.
    channelsBySpace: Record<string, WebhookTargetChannel[]>;
    spaceNames: Record<string, string>;
    showSpace: boolean;
    selectedId: string | null;
    loading: boolean;
    error: string | null;
    hasQuery: boolean;
}>();

const emit = defineEmits<{
    (e: 'select', webhook: Webhook): void;
}>();

const channelName = (webhook: Webhook): string => {
    const id = webhook.targetChannelId || webhook.defaultThreadId;
    if (!id || !webhook.spaceId) return '';
    return props.channelsBySpace[webhook.spaceId]?.find(c => c.id === id)?.name || '';
};

</script>
