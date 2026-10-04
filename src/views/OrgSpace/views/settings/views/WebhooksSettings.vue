<template>

    <!-- Enveloppe de route : l'écran lui-même vit dans WebhooksManager, qui
         est aussi monté dans l'onglet « Webhooks » de la fenêtre Paramètres
         d'un space. Ici le périmètre est l'organisation entière. -->
    <WebhooksManager v-if="orgId" :org-id="orgId" />

</template>

<script lang="ts" setup>

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WebhooksManager from './components/WebhooksManager.vue';

const route = useRoute();

const orgId = computed<string>(() => route.params.orgId as string);

</script>
