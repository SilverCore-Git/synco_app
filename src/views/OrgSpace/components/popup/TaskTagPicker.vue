<template>
    <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
            <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                Tags
            </label>
            <button
                type="button"
                @click="showCreateForm = !showCreateForm"
                class="text-[11px] font-bold text-(--primary) hover:underline flex items-center gap-1"
            >
                <i class="bi" :class="showCreateForm ? 'bi-dash-lg' : 'bi-plus-lg'"></i>
                Nouveau tag
            </button>
        </div>

        <div class="flex flex-wrap gap-2">
            <button
                v-for="tag in tags" :key="tag.id"
                type="button"
                @click="toggle(tag.id)"
                class="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 border transition-all"
                :style="isSelected(tag.id)
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: '#fff' }
                    : { borderColor: tag.color, color: tag.color, backgroundColor: 'transparent' }"
            >
                <i v-if="isSelected(tag.id)" class="bi bi-check-lg"></i>
                {{ tag.name }}
            </button>
            <span v-if="!loading && tags.length === 0" class="text-xs text-(--text2) italic py-1.5">
                Aucun tag pour le moment.
            </span>
        </div>

        <div v-if="showCreateForm" class="flex flex-col gap-2 bg-(--bg2)/30 border border-white/10 rounded-xl p-3 mt-1">
            <input
                v-model="newTagName"
                @keydown.enter.prevent="handleCreateTag"
                type="text"
                maxlength="40"
                placeholder="Nom du tag"
                class="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
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
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTaskTags } from '@/composables/useTaskTags';

const props = defineProps<{
    orgId: string;
    modelValue: string[];
}>();

const emit = defineEmits<{
    'update:modelValue': [string[]];
}>();

const { tags, loading, loadTags, createTag } = useTaskTags(props.orgId);

const presetColors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#64748b'];

const showCreateForm = ref(false);
const newTagName = ref('');
const newTagColor = ref(presetColors[0]);
const creating = ref(false);

const isSelected = (tagId: string) => props.modelValue.includes(tagId);

const toggle = (tagId: string) => {
    if (isSelected(tagId)) {
        emit('update:modelValue', props.modelValue.filter(id => id !== tagId));
    } else {
        emit('update:modelValue', [...props.modelValue, tagId]);
    }
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

onMounted(() => {
    loadTags();
});
</script>
