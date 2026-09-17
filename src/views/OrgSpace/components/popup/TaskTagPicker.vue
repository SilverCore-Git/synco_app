<template>
    <div class="flex flex-col gap-2" @click.stop>
        <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Tags
            </label>
            <button
                type="button"
                @click="openCreateForm"
                class="text-[11px] font-bold text-(--primary) hover:underline flex items-center gap-1"
            >
                <i class="bi" :class="showCreateForm ? 'bi-dash-lg' : 'bi-plus-lg'"></i>
                Nouveau tag
            </button>
        </div>

        <div v-if="tags.length > 6" class="relative">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
            <input
                v-model="search"
                type="text"
                placeholder="Rechercher un tag..."
                class="w-full bg-(--bg3) border border-(--border-color) rounded-lg pl-8 pr-3 py-1.5 text-xs text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
            />
        </div>

        <div class="flex flex-wrap gap-2">
            <template v-for="tag in filteredTags" :key="tag.id">
                <!-- Mini-formulaire d'édition inline, remplace le chip -->
                <div v-if="editingTagId === tag.id" class="flex flex-col gap-2 bg-(--bg2)/30 border border-(--border-color) rounded-xl p-3 w-full">
                    <input
                        v-model="editName"
                        @keydown.enter.prevent="handleSaveEdit"
                        @keydown.escape="cancelEdit"
                        type="text"
                        maxlength="40"
                        placeholder="Nom du tag"
                        class="w-full bg-(--bg3) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                    />
                    <div class="flex items-center gap-2 flex-wrap">
                        <button
                            v-for="color in presetColors" :key="color"
                            type="button"
                            @click="editColor = color"
                            class="w-6 h-6 rounded-full border-2 transition-all"
                            :style="{ backgroundColor: color, borderColor: editColor === color ? '#fff' : 'transparent' }"
                        ></button>
                        <button type="button" @click="cancelEdit" class="ml-auto default !text-xs !px-3 !py-1.5">
                            Annuler
                        </button>
                        <button
                            type="button"
                            @click="handleSaveEdit"
                            :disabled="!editName.trim() || savingEdit"
                            class="primary !text-xs !px-3 !py-1.5"
                            :class="savingEdit ? 'loader' : ''"
                        >
                            Enregistrer
                        </button>
                    </div>
                </div>

                <!-- Chip normal, sélectionnable, avec crayon/poubelle au survol pour son créateur -->
                <div
                    v-else
                    class="group relative pl-3 pr-1.5 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all"
                    :style="isSelected(tag.id)
                        ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
                        : { borderColor: tag.color, color: tag.color, backgroundColor: 'transparent' }"
                >
                    <button type="button" @click="toggle(tag.id)" class="flex items-center gap-1.5">
                        <i v-if="isSelected(tag.id)" class="bi bi-check-lg"></i>
                        {{ tag.name }}
                    </button>
                    <span v-if="tag.creatorId === currentUserId" class="flex items-center gap-0.5 pl-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button type="button" @click.stop="startEdit(tag)" class="w-4 h-4 flex items-center justify-center hover:scale-110 transition-transform" title="Renommer">
                            <i class="bi bi-pencil-fill text-[9px]"></i>
                        </button>
                        <button type="button" @click.stop="confirmDeleteTag = tag" class="w-4 h-4 flex items-center justify-center hover:scale-110 transition-transform" title="Supprimer">
                            <i class="bi bi-trash-fill text-[9px]"></i>
                        </button>
                    </span>
                </div>
            </template>

            <span v-if="!loading && tags.length === 0" class="text-xs text-(--text2) italic py-1.5">
                Aucun tag pour le moment.
            </span>
            <span v-else-if="tags.length > 0 && filteredTags.length === 0" class="text-xs text-(--text2) italic py-1.5">
                Aucun tag ne correspond à « {{ search }} ».
            </span>
        </div>

        <div v-if="showCreateForm" class="flex flex-col gap-2 bg-(--bg2)/30 border border-(--border-color) rounded-xl p-3 mt-1">
            <input
                v-model="newTagName"
                ref="newTagInput"
                @keydown.enter.prevent="handleCreateTag"
                type="text"
                maxlength="40"
                placeholder="Nom du tag"
                class="w-full bg-(--bg3) border border-(--border-color) rounded-lg px-3 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
            />
            <div class="flex items-center gap-2 flex-wrap">
                <button
                    v-for="color in presetColors" :key="color"
                    type="button"
                    @click="newTagColor = color"
                    class="w-6 h-6 rounded-full border-2 transition-all"
                    :style="{ backgroundColor: color, borderColor: newTagColor === color ? '#fff' : 'transparent' }"
                ></button>
                <button
                    type="button"
                    @click="handleCreateTag"
                    :disabled="!newTagName.trim() || creating"
                    class="ml-auto primary !text-xs !px-3 !py-1.5"
                    :class="creating ? 'loader' : ''"
                >
                    Créer
                </button>
            </div>
        </div>

        <ConfirmDelete
            :show="!!confirmDeleteTag"
            :item-name="confirmDeleteTag?.name || ''"
            item-type="ce tag"
            message="Le tag sera retiré de toutes les tâches auxquelles il est assigné. Cette action est irréversible."
            :loading="deleting"
            @cancel="confirmDeleteTag = null"
            @confirm="handleConfirmDelete"
        />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useTaskTags } from '@/composables/useTaskTags';
import type { Tag } from '@/types/types';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';

const props = defineProps<{
    orgId: string;
    modelValue: string[];
}>();

const emit = defineEmits<{
    'update:modelValue': [string[]];
}>();

const { tags, loading, loadTags, createTag, updateTag, deleteTag } = useTaskTags(props.orgId);

const presetColors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#64748b'];

const currentUserId = localStorage.getItem('userId') || '';

const search = ref('');
const filteredTags = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return tags.value;
    return tags.value.filter(t => t.name.toLowerCase().includes(q));
});

const showCreateForm = ref(false);
const newTagName = ref('');
const newTagColor = ref(presetColors[0]);
const creating = ref(false);
const newTagInput = ref<HTMLInputElement | null>(null);

const editingTagId = ref<string | null>(null);
const editName = ref('');
const editColor = ref(presetColors[0]);
const savingEdit = ref(false);

const confirmDeleteTag = ref<Tag | null>(null);
const deleting = ref(false);

const isSelected = (tagId: string) => props.modelValue.includes(tagId);

const toggle = (tagId: string) => {
    if (isSelected(tagId)) {
        emit('update:modelValue', props.modelValue.filter(id => id !== tagId));
    } else {
        emit('update:modelValue', [...props.modelValue, tagId]);
    }
};

const openCreateForm = () => {
    showCreateForm.value = !showCreateForm.value;
    if (showCreateForm.value) nextTick(() => newTagInput.value?.focus());
};

const handleCreateTag = async () => {
    if (!newTagName.value.trim() || creating.value) return;
    creating.value = true;
    try {
        const tag = await createTag(newTagName.value.trim(), newTagColor.value!);
        if (tag) {
            emit('update:modelValue', [...props.modelValue, tag.id]);
            newTagName.value = '';
            showCreateForm.value = false;
        }
    } finally {
        creating.value = false;
    }
};

const startEdit = (tag: Tag) => {
    editingTagId.value = tag.id;
    editName.value = tag.name;
    editColor.value = tag.color;
};

const cancelEdit = () => {
    editingTagId.value = null;
};

const handleSaveEdit = async () => {
    if (!editingTagId.value || !editName.value.trim() || savingEdit.value) return;
    savingEdit.value = true;
    try {
        const updated = await updateTag(editingTagId.value, { name: editName.value.trim(), color: editColor.value });
        if (updated) editingTagId.value = null;
    } finally {
        savingEdit.value = false;
    }
};

const handleConfirmDelete = async () => {
    if (!confirmDeleteTag.value || deleting.value) return;
    deleting.value = true;
    try {
        const ok = await deleteTag(confirmDeleteTag.value.id);
        if (ok) {
            emit('update:modelValue', props.modelValue.filter(id => id !== confirmDeleteTag.value!.id));
            confirmDeleteTag.value = null;
        }
    } finally {
        deleting.value = false;
    }
};

onMounted(() => {
    loadTags();
});
</script>
