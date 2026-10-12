<template>

    <div class="flex items-start gap-2.5 p-2.5 rounded-xl border border-(--border-color) bg-(--bg2)/40 max-w-md">

        <img
            :src="payload.senderAvatar || defaultAvatar(payload.senderName)"
            :alt="payload.senderName"
            @error="(e: any) => e.target.src = defaultAvatar(payload.senderName)"
            class="w-6 h-6 rounded-full shrink-0 mt-0.5 object-cover"
        />

        <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 text-xs font-semibold text-(--primary)/90 mb-0.5">
                <i class="bi bi-arrow-return-right text-(--text2) text-[10px]" />
                {{ payload.senderName || 'Anonyme' }}
            </div>
            <MarkdownRender
                :content="payload.text"
                mode="chat"
                :show-reference-cards="false"
                :enable-references="false"
                class="text-sm opacity-90"
            />
        </div>

    </div>

</template>

<script lang="ts" setup>

// Carte d'un message transféré, encodée dans le contenu du message qui le
// porte (voir useForwardedContent.ts) — pas un live-lookup vers l'original :
// le texte/auteur affichés sont un instantané pris à l'envoi, lisible même si
// l'original a depuis été supprimé ou édité. `enable-references=false` :
// un fichier/tâche/dossier référencé dans l'original n'est plus forcément
// accessible au lecteur de CE message (autre salon/DM) — on affiche le
// token brut plutôt qu'une carte ou un chip qui semblerait fonctionner.

import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import MarkdownRender from '@/views/OrgSpace/views/MarkdownRender.vue';
import type { ForwardedPayload } from '@/composables/useForwardedContent';

defineProps<{
    payload: ForwardedPayload;
}>();

</script>
