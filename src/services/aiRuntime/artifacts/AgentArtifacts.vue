<template>
    <div>
        <div v-for="m in unreadable" :key="m.id" class="mt-2 flex items-center gap-2 rounded-lg bg-(--text)/6 px-3 py-2 text-sm text-(--text2) max-w-sm"><i class="bi bi-file-earmark-x" /> Fichier illisible sur cet appareil</div>
        <MessageAttachments :files="files" :download="download" :open="open" :save-to-space="offline ? undefined : askSave" />
        <Teleport to="body">
            <div v-if="viewing" class="fixed inset-y-0 right-0 z-[2500] flex w-full sm:w-auto shadow-2xl">
                <ArtifactViewer :meta="viewing" :source="source" :offline="offline" @close="viewing = null" @download="download(toFile(viewing))" @save="askSave(toFile(viewing))" />
            </div>
        </Teleport>
        <SaveToSpacePicker v-if="saving" :file-name="saving.name" :spaces="spaces" :busy="busy" :error="error" @cancel="saving = null" @save="save" />
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StoredFile } from '@/types/types';
import MessageAttachments from '@/views/OrgSpace/components/common/MessageAttachments.vue';
import ArtifactViewer from './ArtifactViewer.vue';
import SaveToSpacePicker, { type PickerSpace } from './SaveToSpacePicker.vue';
import { ArtifactUnreadableError, readVerified, sanitizeArtifactName, type ArtifactMeta, type ArtifactSource } from './artifactModel';

const props = defineProps<{
    artifacts: ArtifactMeta[];
    source: ArtifactSource;
    orgId: string;
    spaces: PickerSpace[];
    offline?: boolean;
    /** Action d'appareil (`file.create_text` hors plan, PC72) : fournie par l'appelant, avec la clé de l'utilisateur. */
    saveText: (target: { spaceId: string; folderId: string | null }, name: string, content: string) => Promise<void>;
}>();

const viewing = ref<ArtifactMeta | null>(null);
const saving = ref<ArtifactMeta | null>(null);
const busy = ref(false);
const error = ref('');
const unreadable = ref<ArtifactMeta[]>([]);

const metaOf = (f: StoredFile): ArtifactMeta | undefined => props.artifacts.find(a => a.id === f.id);
// Adaptateur vers le composant des pièces jointes : l'identifiant reste celui de l'artefact, jamais un id de fichier d'espace.
const toFile = (m: ArtifactMeta): StoredFile => ({
    id: m.id, originalName: sanitizeArtifactName(m.name), mimeType: m.mimeType, size: m.size, ownerId: '', orgId: props.orgId, createdAt: new Date(0), updatedAt: new Date(0),
});
const files = computed(() => props.artifacts.filter(a => !unreadable.value.some(u => u.id === a.id)).map(toFile));

const open = (f: StoredFile) => { const m = metaOf(f); if (m) viewing.value = m; };
const askSave = (f: StoredFile) => { const m = metaOf(f); if (m) { error.value = ''; saving.value = m; } };

const download = async (f: StoredFile) => {
    const m = metaOf(f);
    if (!m) return;
    try {
        const bytes = await readVerified(props.source, m);
        const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' }));
        const a = document.createElement('a');
        a.href = url; a.download = sanitizeArtifactName(m.name);
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5_000);
    } catch (e) {
        if (e instanceof ArtifactUnreadableError) unreadable.value = [...unreadable.value, m];
    }
};

const save = async (target: { spaceId: string; folderId: string | null }) => {
    const m = saving.value;
    if (!m) return;
    busy.value = true; error.value = '';
    try {
        const content = new TextDecoder().decode(await readVerified(props.source, m));
        await props.saveText(target, sanitizeArtifactName(m.name), content);
        saving.value = null;
    } catch { error.value = 'Enregistrement impossible. Réessayez.'; }
    finally { busy.value = false; }
};
</script>
