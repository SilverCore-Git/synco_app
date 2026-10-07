<template>

    <div
        class="
            relative mb-2 flex items-center gap-3 overflow-hidden
            rounded-xl border border-(--text)/10 bg-(--bg)/90 backdrop-blur-xl
            shadow-lg pl-4 pr-2 py-2
        "
    >

        <span class="absolute left-0 inset-y-0 w-1 bg-(--primary)" />

        <div class="w-8 h-8 shrink-0 rounded-lg bg-(--primary)/10 text-(--primary) flex items-center justify-center">
            <i class="bi bi-reply-fill text-lg" />
        </div>

        <div class="flex-1 min-w-0">

            <p class="flex items-center gap-1.5 text-xs text-(--text2) leading-tight">
                Réponse à
                <img
                    :src="avatarSrc"
                    :alt="$p(senderName)"
                    @error="(e: any) => e.target.src = fallbackAvatar"
                    class="w-4 h-4 rounded-full shrink-0"
                />
                <span class="font-semibold text-(--text) truncate">{{ $p(senderName) }}</span>
            </p>

            <div
                v-if="msg.content"
                class="mt-0.5 text-xs text-(--text2)/80 truncate pointer-events-none"
            >
                {{ messagePreview(msg.content) }}
            </div>

            <p v-else-if="fileCount" class="mt-0.5 text-xs text-(--text2)/80 italic">
                <i class="bi bi-paperclip" />
                {{ fileCount > 1 ? `${fileCount} pièces jointes` : 'Pièce jointe' }}
            </p>

        </div>

        <button
            @click="emit('cancel')"
            class="
                shrink-0 w-7 h-7 rounded-full flex items-center justify-center
                text-(--text2) hover:text-(--text) hover:bg-(--text)/10 transition-colors
            "
            title="Annuler la réponse"
        >
            <i class="bi bi-x-lg text-sm" />
        </button>

    </div>

</template>

<script lang="ts" setup>

import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { messagePreview } from '@/assets/utils/messagePreview';
import { computed } from 'vue';
import type { DMMessage, Message } from '@/types/types';

const props = defineProps<{
    msg: Message | DMMessage;
}>();

const emit = defineEmits<{
    (e: 'cancel'): void;
}>();

const senderName = computed(() =>
    ('webhookName' in props.msg && props.msg.webhookName) || props.msg.sender?.name || 'Anonyme'
);

const fallbackAvatar = computed(() =>
    defaultAvatar(senderName.value)
);

const avatarSrc = computed(() =>
    ('webhookAvatar' in props.msg && props.msg.webhookAvatar) || props.msg.sender?.avatarUrl || fallbackAvatar.value
);

const fileCount = computed(() =>
    ('files' in props.msg && props.msg.files?.length) || 0
);

</script>
