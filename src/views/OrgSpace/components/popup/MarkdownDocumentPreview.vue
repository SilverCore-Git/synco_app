<template>
    <div class="w-full h-full overflow-y-auto p-6 sm:p-8">
        <MarkdownRender :content="content" mode="document" class="max-w-3xl mx-auto" />
    </div>
</template>

<script setup lang="ts">
import MarkdownRender from '@/views/OrgSpace/views/MarkdownRender.vue';

defineProps<{
    content: string;
}>();
</script>
