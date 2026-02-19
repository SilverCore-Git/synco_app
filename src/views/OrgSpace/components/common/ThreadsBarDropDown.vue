<script setup lang="ts">

import DropDown from '@/components/DropDown.vue';

</script>

<template>

    <DropDown align="right">

        <template #trigger>

            <button class="default ">
                <i class="bi bi-three-dots text-(--text)/60" />
            </button>

        </template>

        <template #content>

            <button class="dropdown-item-annimate dropdown-item-style">
                <i class="bi bi-pencil mr-2"></i> Modifier
            </button>

            <button class=" dropdown-item-annimate dropdown-item-style text-red-400! hover:bg-red-500/10!" >
                <i class="bi bi-trash mr-2"></i> Supprimer
            </button>

        </template>

    </Dropdown>

</template>