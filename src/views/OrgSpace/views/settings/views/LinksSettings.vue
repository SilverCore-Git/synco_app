<template>
    <div class="flex flex-col h-full w-full overflow-hidden bg-(--bg3) text-(--text)">
        <main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-10">
            <div class="max-w-5xl mx-auto flex flex-col gap-6">

                <div>
                    <h3 class="text-2xl font-black text-(--text) mb-2">Liens de partage</h3>
                    <p class="text-sm text-(--text2)">
                        Les liens de téléchargement créés dans l'organisation. Vous voyez les vôtres et ceux des membres dont le rôle est en dessous du vôtre ; vous pouvez les révoquer à tout moment.
                    </p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <div class="flex gap-1 p-1 rounded-xl bg-(--bg2) border border-(--border-color)">
                        <button
                            v-for="s in scopes"
                            :key="s.id"
                            class="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                            :class="scope === s.id ? 'bg-(--primary) text-white' : 'text-(--text2) hover:text-(--text)'"
                            @click="scope = s.id"
                        >
                            {{ s.label }}
                        </button>
                    </div>
                    <label class="flex items-center gap-2 text-xs text-(--text2) ml-auto cursor-pointer">
                        <input v-model="onlyActive" type="checkbox" class="accent-(--primary)" />
                        Actifs seulement
                    </label>
                </div>

                <div v-if="loading" class="flex justify-center py-12">
                    <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
                </div>
                <p v-else-if="error" class="text-sm text-red-500">{{ error }}</p>
                <p v-else-if="visible.length === 0" class="text-center py-16 text-sm text-(--text2)">
                    <i class="bi bi-link-45deg text-4xl block mb-2 opacity-40" />Aucun lien.
                </p>
                <ShareLinkList v-else :org-id="orgId" :links="visible" show-target @changed="load" />
            </div>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ShareLinkList from '@/components/shareLinks/ShareLinkList.vue';
import { shareLinksApi, type ShareLinkSummary } from '@/services/shareLinks/api';

const route = useRoute();
const orgId = computed(() => String(route.params.orgId));

const scopes = [
    { id: 'all' as const, label: 'Tous ceux que je gère' },
    { id: 'mine' as const, label: 'Les miens' },
];
const scope = ref<'all' | 'mine'>('all');
const onlyActive = ref(true);
const links = ref<ShareLinkSummary[]>([]);
const loading = ref(true);
const error = ref('');

const visible = computed(() => (onlyActive.value ? links.value.filter(l => l.live) : links.value));

async function load() {
    error.value = '';
    try {
        links.value = await shareLinksApi.list(orgId.value, { scope: scope.value });
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Liens indisponibles.';
    } finally {
        loading.value = false;
    }
}

watch([orgId, scope], () => { loading.value = true; void load(); }, { immediate: true });
</script>
