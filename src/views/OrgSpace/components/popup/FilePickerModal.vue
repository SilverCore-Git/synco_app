<template>
    <Popup :is-open="isOpen" @close="emit('close')">
        <template #title>Lier un fichier</template>

        <div class="w-full sm:w-[420px] flex flex-col gap-3">
            <div class="relative">
                <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                <input
                    v-model="search"
                    autofocus
                    placeholder="Rechercher un fichier..."
                    class="w-full bg-(--bg2)/30 border border-(--border-color) rounded-xl pl-9 pr-4 py-2.5 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50 focus:ring-1 focus:ring-(--primary)/20 transition-all"
                />
            </div>

            <div class="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                <div v-if="loading" class="text-xs text-center text-(--text2) py-6">Chargement...</div>
                <template v-else>
                    <button
                        v-for="file in filteredFiles" :key="file.id"
                        type="button"
                        @click="pick(file)"
                        class="w-full flex items-center gap-3 p-2.5 rounded-xl border border-(--border-color) hover:border-(--primary)/50 hover:bg-(--primary)/5 transition-all text-left"
                    >
                        <div class="w-9 h-9 flex items-center justify-center rounded-lg bg-(--bg3) shrink-0">
                            <i :class="[getFileInfo(file).icon, getFileInfo(file).color]" class="text-lg" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-semibold text-(--text) truncate">{{ file.originalName }}</p>
                            <p class="text-[10px] text-(--text2) truncate">{{ folderPath(file.folderId) }}</p>
                        </div>
                    </button>
                    <div v-if="filteredFiles.length === 0" class="text-xs text-center text-(--text2) py-6">
                        Aucun fichier trouvé.
                    </div>
                </template>
            </div>
        </div>
    </Popup>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import sfetch from '@/assets/utils/sfetch';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import type { StoredFile, Folder } from '@/types/types';

const props = defineProps<{
    isOpen: boolean;
    spaceId: string;
}>();

const emit = defineEmits<{
    close: [];
    select: [StoredFile];
}>();

const loading = ref(false);
const search = ref('');
const files = ref<StoredFile[]>([]);
const folders = ref<Folder[]>([]);

const folderPath = (folderId?: string | null): string => {
    if (!folderId) return 'Racine';
    const parts: string[] = [];
    let current = folders.value.find(f => f.id === folderId);
    while (current) {
        parts.unshift(current.name);
        current = current.parentId ? folders.value.find(f => f.id === current!.parentId) : undefined;
    }
    return parts.length ? parts.join(' / ') : 'Racine';
};

const filteredFiles = computed(() => {
    if (!search.value.trim()) return files.value;
    const s = search.value.toLowerCase();
    return files.value.filter(f => f.originalName.toLowerCase().includes(s));
});

const load = async () => {
    loading.value = true;
    try {
        const res = await sfetch(`/api/spaces/${props.spaceId}/files`);
        if (res.ok) {
            const data = await res.json();
            files.value = data.files || [];
            folders.value = data.folders || [];
        }
    } catch (e) {
        console.error('[FilePickerModal] Failed to load files', e);
    } finally {
        loading.value = false;
    }
};

const pick = (file: StoredFile) => {
    emit('select', file);
};

watch(() => props.isOpen, (open) => {
    if (open) {
        search.value = '';
        load();
    }
});
</script>
