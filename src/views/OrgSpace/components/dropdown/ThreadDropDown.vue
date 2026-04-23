<script setup lang="ts">

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useToast } from '@/composables/useToast';
import { openedOrg } from '@/assets/var';
import type { WorkSpace } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';

import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import DropDown from '@/components/DropDown.vue';
import CreateNewCategory from '../popup/CreateNewCategory.vue';
import SpaceSettings from '@/components/windows/SpaceSettings.vue';


const toast = useToast();
const route = useRoute();
const router = useRouter();
const isModalOpen = ref<boolean>(false);
const isDeleting = ref<boolean>(false);
const showUpdateSpace = ref<boolean>(false);
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');


const currentWorkspace = computed(() => {
    if (isHome.value) return { categories: openedOrg.value?.home.categories, threads: openedOrg.value?.home.threads, id: 'home', name: 'Accueil', logo: 'bi-house', orgId: route.params.orgId } as WorkSpace;
    else return openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
});

const openConfirmModal = () => {
    isModalOpen.value = true;
}

const handleDelete = async () => {

    isDeleting.value = true;

    const res = await sfetch(`/api/spaces/${currentWorkspace.value?.id}`, {
        method: 'DELETE'
    });

    if (res.ok)
    {

        if (openedOrg.value)
        {
            openedOrg.value.spaces = openedOrg.value.spaces?.filter(
                (space: WorkSpace) => space.id !== currentWorkspace.value?.id
            );
        }

        router.push({ 
            name: 'OrgHome',
            params: { orgId: route.params.orgId }
        });

        toast.show('Espace de travail supprimé avec succès.', 'success');

    }
    else
    {
        toast.show('Une erreur est survenue lors de la suppression.', 'error');
    }

    isModalOpen.value = false;
    isDeleting.value = false;
 
};

</script>

<template>

    <DropDown align="right" class="ml-2">

        <template #trigger>

            <button class="default ">
                <i class="bi bi-three-dots text-(--text)/60" />
            </button>

        </template>

        <template #content>

            <CreateNewCategory
                :index="currentWorkspace?.categories.length || 0 + 1"
                :key="'createNewSpace-' + currentWorkspace?.id"
            >
                <button @click="" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-folder-plus mr-2" /> Créer une catégorie
                </button>
            </CreateNewCategory>

            <button v-if="!isHome" @click="showUpdateSpace = true" class="dropdown-item-annimate dropdown-item-style">
                <i class="bi bi-gear mr-2" /> Paramètres
            </button>

            <button v-if="!isHome" @click="openConfirmModal" class=" dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!" >
                <i class="bi bi-trash mr-2" /> Supprimer
            </button>

        </template>

    </Dropdown>

    <SpaceSettings
        :key="currentWorkspace?.id" 
        v-if="currentWorkspace"
        :isOpen="showUpdateSpace" 
        :space="currentWorkspace"
        @close="showUpdateSpace = false"
    />

    <ConfirmDelete
        v-if="currentWorkspace"
        :show="isModalOpen"
        item-type="le workspace"
        :item-name="currentWorkspace.name"
        :loading="isDeleting"
        @cancel="isModalOpen = false"
        @confirm="handleDelete"
    />

</template>