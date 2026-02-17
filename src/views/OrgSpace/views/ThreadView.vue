<template>

</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { workSpaces } from '../../../organizations';
import { useRoute } from 'vue-router';

const route = useRoute();

const thread = computed(() => {
    const space = workSpaces.find(space => space.id == route.params.spaceId);
    if (space) 
})

</script>