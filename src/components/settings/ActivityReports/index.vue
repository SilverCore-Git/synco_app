<template>

    <!--
        Ouvert depuis OrgSelection, il n'y a pas d'organisation courante : un
        rapport a forcément une portée, donc on le dit plutôt que de proposer
        un formulaire qui échouerait à l'enregistrement.
    -->
    <div v-if="!orgId" class="p-6 text-center rounded-xl border border-dashed border-(--border-color)">
        <i class="bi bi-diagram-3 text-2xl text-(--text2)" />
        <p class="text-sm text-(--text2) mt-2">
            Ouvrez une organisation pour créer un rapport d'activité.
        </p>
    </div>

    <!--
        L'éditeur remplace le contenu de l'onglet au lieu d'ouvrir une modale :
        UserSettings est déjà dans Window.vue, et empiler une surface par-dessus
        est précisément là où le conflit de z-index entre DropDown et Popup se
        manifeste. Le remplacement règle aussi le cas du mobile.
    -->
    <ReportEditor
        v-else-if="view === 'editor'"
        :orgId="orgId"
        :reportId="editingId"
        :spaces="spaces"
        @back="backToList"
    />

    <ReportList
        v-else
        :orgId="orgId"
        @create="openCreate"
        @edit="openEdit"
    />

</template>

<script setup lang="ts">

import { ref, computed } from 'vue';
import ReportList from './ReportList.vue';
import ReportEditor from './ReportEditor.vue';
import { useActivityReports } from '@/composables/useActivityReports';
import { openedOrg } from '@/assets/var';

const { fetchReports } = useActivityReports();

const view = ref<'list' | 'editor'>('list');
const editingId = ref<string | null>(null);

const orgId = computed<string>(() => openedOrg.value?.id ?? '');

const spaces = computed(() =>
    (openedOrg.value?.spaces ?? []).map(space => ({ id: space.id, name: space.name }))
);

const openCreate = () => {
    editingId.value = null;
    view.value = 'editor';
};

const openEdit = (reportId: string) => {
    editingId.value = reportId;
    view.value = 'editor';
};

const backToList = () => {
    view.value = 'list';
    editingId.value = null;
    // La liste affiche le rythme et le prochain envoi : elle doit refléter ce
    // qui vient d'être enregistré, pas l'état d'avant l'édition.
    fetchReports().catch(() => {});
};

</script>
