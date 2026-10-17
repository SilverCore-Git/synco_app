<template>
    <!-- Message sans garantie d'origine : ancien format ou expéditeur non vérifiable (audit FC7).
         Volontairement discret : il ne signale qu'une absence de preuve, pas une anomalie. -->
    <span
        v-if="state === 'legacy' || state === 'unsigned'"
        class="ml-1 inline-flex items-center text-[10px] text-(--text2)/60"
        :title="state === 'legacy'
            ? 'Message créé avec un ancien format : son expéditeur n\'a pas pu être authentifié.'
            : 'L\'expéditeur de ce message n\'a pas pu être vérifié (pas de clé de signature connue).'"
    >
        <i class="bi bi-shield-slash" />
    </span>
</template>

<script setup lang="ts">
defineProps<{ state?: 'legacy' | 'unsigned' | 'verified' | 'invalid' }>();
</script>
