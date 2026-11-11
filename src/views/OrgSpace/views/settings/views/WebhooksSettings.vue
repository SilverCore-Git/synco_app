<template>

    <WebhooksManager v-if="orgId" :org-id="orgId" />

</template>

<script lang="ts" setup>

// Enveloppe de route : l'écran lui-même vit dans WebhooksManager, qui est aussi monté dans l'onglet « Webhooks »
// de la fenêtre Paramètres d'un space. Ici le périmètre est l'organisation entière. (Pas de commentaire HTML à
// la racine du template : en dev, Vue le garde et la vue devient un fragment, que la <Transition> de
// SettingsLayout ne sait pas faire sortir — l'onglet restait bloqué.)

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import WebhooksManager from './components/WebhooksManager.vue';

const route = useRoute();

const orgId = computed<string>(() => route.params.orgId as string);

</script>
