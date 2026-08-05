<template>
    <button v-if="isLittleScreen" @click="router.push({ query: { ...route.query, showView: '0' } })" class="mr-3">
        <i class="bi bi-arrow-left text-2xl text-(--text)" />
    </button>
</template>

<script setup lang="ts">
import { isLittleScreen } from '@/assets/var';
import { useRouter, useRoute } from 'vue-router';

const router = useRouter();
const route = useRoute();
</script>
