<template>
    <!-- SVG produit localement par uqr à partir de `value` : aucun contenu externe. -->
    <div class="qr bg-white p-3 rounded-xl inline-block" role="img" :aria-label="label" v-html="svg" />
</template>

<script setup lang="ts">

import { computed } from 'vue';
import { renderSVG } from 'uqr';

const props = withDefaults(defineProps<{ value: string; label?: string }>(), { label: 'QR code' });

// Correction d'erreur « M » : bon compromis lisibilité / densité pour ~80 caractères.
const svg = computed(() => renderSVG(props.value, { ecc: 'M', border: 1, whiteColor: '#ffffff', blackColor: '#000000' }));

</script>

<style scoped>
.qr :deep(svg) {
    width: 13rem;
    height: 13rem;
    display: block;
}
</style>
