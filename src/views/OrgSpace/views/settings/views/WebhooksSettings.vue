<template>

    <!-- Enveloppe de route : l'écran lui-même vit dans WebhooksManager, qui
         est aussi monté dans l'onglet « Webhooks » de la fenêtre Paramètres
         du space. -->
    <WebhooksManager v-if="spaceId" :space-id="spaceId" />

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WebhooksManager from './components/WebhooksManager.vue';

const route = useRoute();

const spaceId = computed<string>(() => route.params.spaceId as string);

</script>
