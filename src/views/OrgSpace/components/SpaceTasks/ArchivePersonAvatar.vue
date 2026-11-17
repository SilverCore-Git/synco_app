<template>
    <span
        v-if="person.isNone"
        class="rounded-full bg-(--text)/5 flex items-center justify-center shrink-0 text-(--text2)"
        :class="size"
    >
        <i class="bi bi-person-dash"></i>
    </span>
    <img
        v-else-if="person.avatarUrl"
        :src="person.avatarUrl"
        :alt="''"
        class="rounded-full object-cover shrink-0"
        :class="size"
    >
    <span
        v-else
        class="rounded-full flex items-center justify-center shrink-0 font-black text-[11px]"
        :class="size"
        :style="{ backgroundColor: `hsl(${hue} 70% 50% / 0.18)`, color: `hsl(${hue} 65% 55%)` }"
    >
        {{ ($p(person.name) || '?').substring(0, 2).toUpperCase() }}
    </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { personHue, type ArchivePerson } from './archivePeople';

const props = defineProps<{ person: ArchivePerson; size: string }>();
const hue = computed(() => personHue(props.person.id));
</script>
