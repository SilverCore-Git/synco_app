<template>
    <ConfirmDelete
        :show="!!pendingConfirm"
        itemName=""
        title="Appel non chiffré"
        message="Ce salon vocal n'a pas de clé de chiffrement de bout en bout. Si vous le rejoignez, le serveur d'appels pourra techniquement voir et entendre l'audio, la vidéo et les partages d'écran."
        extraWarning="Ne partagez pas d'information sensible dans cet appel."
        buttonText="Rejoindre sans chiffrement"
        @confirm="accept"
        @cancel="decline"
    />
</template>

<script setup lang="ts">
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useUnencryptedCallPrompt } from '@/composables/useVoiceJoin';

const { pendingConfirm, accept, decline } = useUnencryptedCallPrompt();
</script>
