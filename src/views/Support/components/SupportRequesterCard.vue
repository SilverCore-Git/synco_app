<template>

    <!-- Fiche du demandeur (équipe uniquement, GET .../requester) : jamais
         visible du client, jamais envoyée par erreur sur le canal PUBLIC. -->

    <div class="bg-(--bg) border border-(--border-color) rounded-xl p-4">

        <div v-if="loading" class="flex justify-center py-6"><SpinLoader /></div>

        <template v-else-if="requester">
            <div class="flex items-center gap-3 mb-3">
                <img :src="requester.avatarUrl || defaultAvatar(requester.name)" class="w-12 h-12 rounded-full object-cover" />
                <div class="min-w-0">
                    <p class="font-bold truncate">{{ requester.name }}</p>
                    <p class="text-xs text-(--text2) truncate">{{ requester.email }}</p>
                </div>
            </div>

            <p v-if="requester.job" class="text-xs text-(--primary) font-bold uppercase tracking-wide mb-1">{{ requester.job }}</p>
            <p v-if="requester.description" class="text-xs text-(--text2) leading-relaxed mb-3 line-clamp-4">{{ requester.description }}</p>

            <p class="text-[10px] font-bold text-(--text2) uppercase tracking-wide mb-1.5">Membre depuis</p>
            <p class="text-xs mb-3"><i class="bi bi-calendar3 mr-1 text-(--text2)" />{{ formatDate(requester.createdAt) }}</p>

            <template v-if="requester.organizations.length">
                <p class="text-[10px] font-bold text-(--text2) uppercase tracking-wide mb-1.5">Organisations</p>
                <div class="flex flex-col gap-1.5">
                    <div v-for="org in requester.organizations" :key="org.id" class="flex items-center justify-between gap-2 text-xs bg-(--bg2) rounded-lg px-2.5 py-1.5">
                        <span class="truncate font-medium">{{ org.name }}</span>
                        <span class="flex flex-wrap gap-1 justify-end shrink-0">
                            <span v-for="r in org.roles" :key="r.id" class="px-1.5 py-0.5 rounded text-[10px] font-bold" :style="{ background: (r.color || '#888') + '22', color: r.color || '#888' }">{{ r.name }}</span>
                            <span v-if="org.roles.length === 0 && org.role" class="text-(--text2)">{{ org.role }}</span>
                        </span>
                    </div>
                </div>
            </template>
            <p v-else class="text-xs text-(--text2)">Aucune organisation.</p>
        </template>

        <p v-else class="text-xs text-red-500">{{ error }}</p>

    </div>

</template>

<script lang="ts" setup>

import { onMounted, ref, watch } from 'vue';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { supportApi } from '@/services/support/api';
import type { SupportRequesterDTO } from '@/types/support';
import SpinLoader from '@/components/SpinLoader.vue';

const props = defineProps<{ ticketId: string }>();

const requester = ref<SupportRequesterDTO | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

const load = async () => {
    loading.value = true;
    error.value = null;
    try {
        requester.value = await supportApi.getRequester(props.ticketId);
    } catch (e) {
        error.value = (e as Error).message || 'Fiche du demandeur indisponible.';
    } finally {
        loading.value = false;
    }
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

watch(() => props.ticketId, load);
onMounted(load);

</script>
