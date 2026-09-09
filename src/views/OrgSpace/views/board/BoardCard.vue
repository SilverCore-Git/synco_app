<template>

    <div
        class="rounded-xl border p-3 flex flex-col gap-2 transition-colors"
        :class="statusClasses"
    >

        <div class="flex items-start gap-2">

            <i v-if="card.isAiGenerated" class="bi bi-stars text-(--primary) mt-0.5" title="Suggestion de l'IA" />

            <p class="text-sm text-(--text) leading-relaxed flex-1 whitespace-pre-wrap break-words">
                {{ card.clearContent }}
            </p>

        </div>

        <div v-if="card.similarToCardId && similarCardText" class="flex items-start gap-2 text-xs bg-(--primary)/10 border border-(--primary)/20 rounded-lg p-2">
            <i class="bi bi-copy text-(--primary) mt-0.5" />
            <div class="flex-1">
                <p class="text-(--text2)">Ressemble à : <span class="text-(--text) italic">« {{ similarCardText }} »</span></p>
                <div class="flex gap-3 mt-1">
                    <button v-if="isOwner" @click="$emit('merge')" class="text-(--primary) hover:underline font-medium">Fusionner</button>
                    <button @click="$emit('ignoreDuplicate')" class="text-(--text2) hover:underline">Ignorer</button>
                </div>
            </div>
        </div>

        <div class="flex items-center justify-between mt-1">

            <div class="flex items-center gap-1">
                <button
                    @click="$emit('vote', 1)"
                    class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    :class="card.myVote === 1 ? 'text-(--primary)' : 'text-(--text2)'"
                >
                    <i class="bi bi-hand-thumbs-up-fill text-sm" />
                </button>

                <span class="text-xs w-6 text-center text-(--text2)">
                    {{ card.myVote ? card.score : '·' }}
                </span>

                <button
                    @click="$emit('vote', -1)"
                    class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    :class="card.myVote === -1 ? 'text-red-400' : 'text-(--text2)'"
                >
                    <i class="bi bi-hand-thumbs-down-fill text-sm" />
                </button>
            </div>

            <div class="flex items-center gap-2">

                <span
                    v-if="card.status !== 'PENDING'"
                    class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                    :class="{
                        'bg-green-500/15 text-green-400': card.status === 'VALIDATED',
                        'bg-red-500/15 text-red-400': card.status === 'REJECTED',
                        'bg-white/10 text-(--text2)': card.status === 'MERGED',
                    }"
                >
                    {{ statusLabel }}
                </span>

                <template v-if="isOwner && card.status === 'PENDING'">
                    <button @click="$emit('validate')" title="Valider" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-green-500/15 text-green-400">
                        <i class="bi bi-check-lg" />
                    </button>
                    <button @click="$emit('reject')" title="Rejeter" class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-500/15 text-red-400">
                        <i class="bi bi-x-lg" />
                    </button>
                </template>

                <button
                    v-if="canDelete"
                    @click="$emit('deleteCard')"
                    title="Supprimer"
                    class="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 text-(--text2)"
                >
                    <i class="bi bi-trash-fill text-xs" />
                </button>

            </div>

        </div>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import type { Card } from '@/types/types';

const props = defineProps<{
    card: Card;
    isOwner: boolean;
    currentUserId?: string;
    similarCardText?: string;
}>();

defineEmits(['vote', 'validate', 'reject', 'deleteCard', 'merge', 'ignoreDuplicate']);

const canDelete = computed(() => props.isOwner || props.card.authorId === props.currentUserId);

const statusLabel = computed(() => ({
    VALIDATED: 'Validée',
    REJECTED: 'Rejetée',
    MERGED: 'Fusionnée',
    PENDING: '',
}[props.card.status]));

const statusClasses = computed(() => {
    switch (props.card.status) {
        case 'VALIDATED': return 'border-green-500/30 bg-green-500/5';
        case 'REJECTED': return 'border-red-500/20 bg-white/[0.02] opacity-60';
        case 'MERGED': return 'border-white/10 bg-white/[0.02] opacity-50';
        default: return 'border-(--border-color) bg-(--bg2)/40';
    }
});

</script>
