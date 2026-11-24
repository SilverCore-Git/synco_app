<template>
    <div v-if="failed" class="mt-2 flex items-center gap-2 rounded-lg bg-(--text)/6 px-3 py-2 text-sm text-(--text2) max-w-sm"><i class="bi bi-file-earmark-x" /> Fichier illisible sur cet appareil</div>
    <AgentArtifacts v-else-if="meta && source" :artifacts="[meta]" :source="source" :org-id="orgId" :spaces="spaces" :offline="offline || !online" :save-text="saveText" />
    <div v-else class="mt-2 text-xs text-(--text2)" aria-busy="true">Fichier en cours de lecture…</div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { openConversationKey } from '@/services/aiRuntime';
import { runtimeDeps } from '@/services/aiRuntimeUi';
import { createTextFile } from '@/services/fileActions';
import AgentArtifacts from './AgentArtifacts.vue';
import type { ArtifactMeta } from './artifactModel';
import { createArtifactSource, type ArtifactLoader, type ArtifactWire } from './artifactSource';
import type { PickerSpace } from './SaveToSpacePicker.vue';

const props = defineProps<{ orgId: string; sessionId: string; messageId: string; toolCallId: string; artifactId: string; offline?: boolean }>();

const meta = shallowRef<ArtifactMeta | null>(null);
const source = shallowRef<ArtifactLoader | null>(null);
const failed = ref(false);
const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine);
const setOnline = () => { online.value = navigator.onLine; };

// Espaces de l'org ouverte (liste cherchable du sélecteur) ; les dossiers ne sont pas chargés ici : dépôt à la racine.
const spaces = computed<PickerSpace[]>(() => (openedOrg.value?.id === props.orgId ? openedOrg.value.spaces ?? [] : []).map(s => ({ id: s.id, name: s.name, folders: [] })));

/** Action d'appareil `file.create_text` (13 §8), hors plan : clé de l'utilisateur, aucun en-tête `X-Synco-Plan`. */
const saveText = async (target: { spaceId: string; folderId: string | null }, name: string, content: string): Promise<void> => {
    await createTextFile({ spaceId: target.spaceId, folderId: target.folderId, name, content });
};

onMounted(async () => {
    window.addEventListener('online', setOnline);
    window.addEventListener('offline', setOnline);
    try {
        const ck = await openConversationKey(runtimeDeps(), props.orgId, props.sessionId);
        const src = createArtifactSource({
            ck,
            fetchArtifact: async (id): Promise<ArtifactWire> => {
                const res = await sfetch(`/api/orgs/${encodeURIComponent(props.orgId)}/ai/sessions/${encodeURIComponent(props.sessionId)}/artifacts/${encodeURIComponent(id)}`);
                if (!res.ok) throw new Error('artifact_fetch');
                return await res.json() as ArtifactWire;
            },
        });
        meta.value = await src.load({ sessionId: props.sessionId, messageId: props.messageId, toolCallId: props.toolCallId, artifactId: props.artifactId });
        source.value = src;
    } catch { failed.value = true; }
});
onBeforeUnmount(() => {
    window.removeEventListener('online', setOnline);
    window.removeEventListener('offline', setOnline);
});
</script>
