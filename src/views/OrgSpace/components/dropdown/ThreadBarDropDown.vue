<script setup lang="ts">

import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { openedOrg } from '@/assets/var';
import type { WorkSpace } from '@/types/types';

import DropDown from '@/components/DropDown.vue';
import CreateNewCategory from '../popup/CreateNewCategory.vue';
import CreateNewThread from '../popup/CreateNewThread.vue';


const route = useRoute();


const currentWorkspace = computed(() => {
    return openedOrg.value?.spaces?.find((space: WorkSpace) => space.id == route.params.spaceId && space.orgId == route.params.orgId);
});

</script>

<template>

    <DropDown align="mouse" click="right">

        <template #trigger>
            <slot name="trigger" />
        </template>

        <template #content>

            <CreateNewCategory
                :index="currentWorkspace!.categories.length + 1"
                :key="'createNewSpace-' + currentWorkspace?.id"
            >
                <button @click="" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-folder-plus mr-2" /> Créer une catégorie
                </button>
            </CreateNewCategory>

            <CreateNewThread
                :index="currentWorkspace!.threads.length + 1"
                :categoryId="currentWorkspace!.categories[0]!.id"
                :key="'createNewSpace-' + currentWorkspace?.id"
            >
                <button @click="" class="dropdown-item-annimate dropdown-item-style">
                    <i class="bi bi-plus-circle mr-2" /> Créer un salon
                </button>
            </CreateNewThread>

        </template>

    </Dropdown>

</template>