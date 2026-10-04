<script setup lang="ts">

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useToast } from '@/composables/useToast';
import { openedOrg, user } from '@/assets/var';
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
const isExitModalOpen = ref<boolean>(false);
const isExiting = ref<boolean>(false);
const showUpdateSpace = ref<boolean>(false);
const deleteFilesToo = ref<boolean>(false);
const isHome = computed(()=> route.name == 'OrgHome' || route.name == 'OrgThreadHome');


const currentWorkspace = computed(() => {
    if (isHome.value) return { categories: openedOrg.value?.home.categories, threads: openedOrg.value?.home.threads, id: 'home', name: 'Accueil', logo: 'bi-house', orgId: route.params.orgId } as WorkSpace;
    else return openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
});

const openConfirmModal = () => {
    deleteFilesToo.value = false;
    isModalOpen.value = true;
}

const handleExit = async () => {

    const workspace = currentWorkspace.value;
    const userId = user.value?.id;

    if (!workspace || !userId) return;

    isExiting.value = true;

    // Route dédiée : PATCH /members est réservé au propriétaire. Le serveur
    // retire l'utilisateur en base et diffuse lui-même space:updated à l'org.
    const res = await sfetch(`/api/spaces/${workspace.id}/leave`, { method: 'POST' });

    if (res.ok)
    {

        if (openedOrg.value)
        {
            openedOrg.value.spaces = openedOrg.value.spaces?.filter(
                (space: WorkSpace) => space.id !== workspace.id
            );
        }

        router.push({
            name: 'OrgHome',
            params: { orgId: route.params.orgId }
        });

        toast.show("Vous avez quitté l'espace de travail.", 'success');

    }
    else
    {
        const body = await res.json().catch(() => null);
        toast.show(body?.error || 'Une erreur est survenue en quittant l\'espace.', 'error');
    }

    isExitModalOpen.value = false;
    isExiting.value = false;

};

const handleDelete = async () => {

    isDeleting.value = true;

    const res = await sfetch(`/api/spaces/${currentWorkspace.value?.id}?deleteFiles=${deleteFilesToo.value}`, {
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
                <i class="bi bi-three-dots text-(--text2)" />
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

            <button v-if="!isHome && currentWorkspace?.ownerId !== user?.id" @click="isExitModalOpen = true" class="dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!">
                <i class="bi bi-door-open mr-2" /> Quitter
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
        :show="isExitModalOpen"
        item-type="le workspace"
        :item-name="currentWorkspace.name"
        :loading="isExiting"
        title="Quitter cet espace de travail ?"
        :message="`Vous n'aurez plus accès à ${currentWorkspace.name} ni à ses salons. Un membre devra vous y réinviter.`"
        checkbox
        checkbox-label="Je comprends que je perdrai l'accès à cet espace et à ses salons."
        button-text="Quitter l'espace"
        @cancel="isExitModalOpen = false"
        @confirm="handleExit"
    />

    <ConfirmDelete
        v-if="currentWorkspace"
        :show="isModalOpen"
        item-type="le workspace"
        :item-name="currentWorkspace.name"
        :loading="isDeleting"
        checkbox
        checktext
        extra-option-label="Supprimer aussi les fichiers et dossiers liés dans le gestionnaire de fichiers"
        :extra-option-value="deleteFilesToo"
        @update:extra-option-value="deleteFilesToo = $event"
        @cancel="isModalOpen = false"
        @confirm="handleDelete"
    />

</template>