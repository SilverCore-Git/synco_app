<template>
    <!-- Nouvelle tâche : le formulaire s'ouvre dans le dock en bas à droite
         (TaskCreateForm.vue via useTaskPanels), plus dans une Popup. Ce
         composant ne garde que le déclencheur, pour ne rien changer chez les
         appelants (slot, props, événement « created »). -->
    <div class="cursor-pointer" @click.stop="open">
        <slot />
    </div>
</template>

<script setup lang="ts">
import type { Task } from '@/types/types';
import { useTaskPanels } from '@/composables/useTaskPanels';

const props = defineProps<{
    defaultSpaceId?: string | null;
    hideSpaceSelect?: boolean;
    parentTaskId?: string | null;
    todoListId?: string | null;
}>();

const emit = defineEmits<{ created: [task: Task] }>();

const { openDraft } = useTaskPanels();

const open = () => {
    openDraft({
        defaultSpaceId: props.defaultSpaceId,
        hideSpaceSelect: props.hideSpaceSelect,
        parentTaskId: props.parentTaskId,
        todoListId: props.todoListId,
        onCreated: task => emit('created', task)
    });
};
</script>
