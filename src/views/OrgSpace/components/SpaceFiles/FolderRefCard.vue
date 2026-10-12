<template>

    <div
        @click="openFolder"
        class="max-w-full group flex items-center gap-3 p-3 bg-(--bg2)/40 border border-(--border-color) rounded-xl transition-all cursor-pointer shadow-sm select-none hover:border-(--primary)/50 hover:bg-(--primary)/5"
    >
        <div
            class="w-10 h-10 flex items-center justify-center rounded-lg shrink-0"
            :class="[colorTextMap[folder.color || 'yellow'], colorBgMap[folder.color || 'yellow']]"
        >
            <i class="bi bi-folder-fill text-xl" />
        </div>

        <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5">
                <p class="text-sm font-semibold text-(--text) truncate group-hover:text-(--primary) transition-colors">{{ folder.name }}</p>
                <i v-if="folder._count?.folderPermissions" class="bi bi-shield-lock-fill text-xs text-(--primary)" title="Permissions spécifiques" />
            </div>
            <p class="text-[9px] text-(--text2) font-bold uppercase tracking-tighter mt-1">Dossier</p>
        </div>

        <i class="bi bi-box-arrow-up-right text-(--text2) opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />

    </div>

</template>

<script lang="ts" setup>

// Carte légère pour une référence <folder:id> dans un message — contrairement
// à FolderCard.vue (grille du file manager), pas de sélection/drag&drop/menu
// contextuel : un seul geste utile ici, ouvrir le dossier dans le gestionnaire
// de fichiers (voir useReferenceNavigation.ts).

import { useRouter } from 'vue-router';
import { openedOrg } from '@/assets/var';
import type { Folder } from '@/types/types';

const props = defineProps<{
    folder: Folder;
}>();

const router = useRouter();

const colorTextMap: Record<string, string> = {
  'yellow': 'text-yellow-500',
  'blue':   'text-blue-500',
  'red':    'text-red-500',
  'green':  'text-green-500',
  'purple': 'text-purple-500',
  'pink':   'text-pink-500',
};

const colorBgMap: Record<string, string> = {
  'yellow': 'bg-yellow-500/10',
  'blue':   'bg-blue-500/10',
  'red':    'bg-red-500/10',
  'green':  'bg-green-500/10',
  'purple': 'bg-purple-500/10',
  'pink':   'bg-pink-500/10',
};

const openFolder = () => {
    const orgId = openedOrg.value?.id;
    if (!orgId || !props.folder.workspaceId) return;
    router.push({
        name: 'SpaceFiles',
        params: { orgId, spaceId: props.folder.workspaceId },
        query: { showView: '1', folderId: props.folder.id },
    });
};

</script>
