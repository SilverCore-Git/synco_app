<template>

    <div class="flex flex-col gap-2">

        <div v-if="rows.length" :class="tool.name === 'list_members' ? 'grid grid-cols-2 gap-2' : 'flex flex-col gap-2'">
            <EntityRow
                v-for="row in rows" :key="row.key"
                :icon="row.icon"
                :avatar-url="row.avatarUrl"
                :title="row.title"
                :subtitle="row.subtitle"
                @click="open(row)"
            />
        </div>

        <p v-else-if="isList" class="text-xs text-(--text2)">Aucun résultat.</p>

        <p v-if="summary" class="text-xs text-(--text)">
            <i class="bi bi-check2-circle text-(--primary) mr-1"></i>{{ summary }}
        </p>

        <p v-if="inviteUrl" class="text-xs text-(--text2) break-all select-all bg-black/20 border border-(--text)/10 rounded-xl px-3 py-2">{{ inviteUrl }}</p>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ToolStep } from '@/views/OrgSpace/components/ai/agentTypes';
import EntityRow from '@/views/OrgSpace/components/ai/EntityRow.vue';
import { inviteUrlOf, membersRows, membersSummary, type MemberRow } from './membersResultRows';

/**
 * Rendu des résultats du domaine `members` (L15d). Texte toujours interpolé (jamais en HTML) : noms, rôles et
 * adresses viennent de tiers. Le lien d'invitation s'affiche en texte à copier, pas en lien cliquable.
 */
const props = defineProps<{ tool: ToolStep }>();

const route = useRoute();
const router = useRouter();

const rows = computed(() => membersRows(props.tool.name, props.tool.result));
const summary = computed(() => membersSummary(props.tool.name, props.tool.result));
const inviteUrl = computed(() => inviteUrlOf(props.tool.name, props.tool.result));
const isList = computed(() => !summary.value && !inviteUrl.value);

function open(row: MemberRow) {
    if (row.userId) router.push(`/${route.params.orgId as string}/chat/${row.userId}`);
}

</script>
