<template>
    <div @click.stop="openModal" class="cursor-pointer">
        <slot />
    </div>

    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>Nouvelle Tâche</template>

        <form @submit.prevent="handleSubmit" class="space-y-5 min-w-[300px] sm:min-w-[400px]">
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Titre de la tâche
                </label>
                <input 
                    v-model="form.title"
                    @keydown.enter.prevent="handleSubmit"
                    type="text" 
                    placeholder="Qu'y a-t-il à faire ?"
                    ref="titleInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text2) 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                    required
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text2) uppercase tracking-wider">
                    Description (optionnel)
                </label>
                <textarea
                    v-model="form.description"
                    @keydown.ctrl.enter="handleSubmit"
                    @keydown.meta.enter="handleSubmit"
                    @paste="handlePaste"
                    placeholder="Plus de détails... (collez une image pour l'ajouter en pièce jointe)"
                    rows="3"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl
                        px-4 py-3 text-(--text) placeholder:text-(--text2)
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all resize-none
                    "
                    :disabled="loading"
                ></textarea>
                <input ref="imageInput" type="file" accept="image/*" multiple hidden @change="onPickImages" />
            </div>

            <!-- Options secondaires : repliées par défaut, un seul volet ouvert à la fois -->
            <div class="flex flex-col gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <button type="button" @click="toggleSection('date')" class="pill" :class="pillClass('date', !!form.dueDate)">
                        <i class="bi bi-calendar-event"></i>
                        {{ dueDateLabel }}
                    </button>
                    <button type="button" @click="toggleSection('assignees')" class="pill" :class="pillClass('assignees', form.assigneeIds.length > 0)">
                        <i class="bi bi-people"></i>
                        {{ assigneesLabel }}
                    </button>
                    <button type="button" @click="toggleSection('tags')" class="pill" :class="pillClass('tags', form.tagIds.length > 0)">
                        <i class="bi bi-tags"></i>
                        {{ form.tagIds.length ? `${form.tagIds.length} tag${form.tagIds.length > 1 ? 's' : ''}` : 'Tags' }}
                    </button>
                    <button type="button" @click="toggleSection('images')" class="pill" :class="pillClass('images', stagedImages.length > 0)">
                        <i class="bi bi-paperclip"></i>
                        {{ stagedImages.length ? `${stagedImages.length} image${stagedImages.length > 1 ? 's' : ''}` : 'Image' }}
                    </button>
                    <button v-if="!hideSpaceSelect" type="button" @click="toggleSection('space')" class="pill" :class="pillClass('space', !!form.spaceId)">
                        <i class="bi bi-folder2"></i>
                        {{ spaceLabel }}
                    </button>
                </div>

                <div v-if="activeSection" class="bg-(--bg2)/30 border border-white/10 rounded-xl p-3">

                    <template v-if="activeSection === 'date'">
                        <div class="flex gap-2">
                            <input
                                v-model="form.dueDate"
                                type="date"
                                class="w-full bg-(--bg3) border border-white/10 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50 transition-all"
                                :disabled="loading"
                            />
                            <input
                                v-model="form.dueTime"
                                type="time"
                                class="w-28 bg-(--bg3) border border-white/10 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50 transition-all"
                                :disabled="loading"
                            />
                            <button v-if="form.dueDate" type="button" @click="form.dueDate = ''; form.dueTime = ''" class="text-(--text2) hover:text-red-500 transition-colors px-2" title="Retirer l'échéance">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    </template>

                    <template v-else-if="activeSection === 'assignees'">
                        <div class="relative mb-2">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                            <input
                                v-model="searchAssignee"
                                @keydown.enter.prevent
                                placeholder="Rechercher une personne..."
                                class="w-full bg-(--bg3) border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50 transition-all"
                                :disabled="loading"
                            />
                        </div>
                        <div class="max-h-40 overflow-y-auto space-y-2">
                            <label v-for="member in filteredMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    :value="member.userId"
                                    v-model="form.assigneeIds"
                                    class="w-4 h-4 rounded bg-black/20 border-white/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                                    :disabled="loading"
                                />
                                <div class="flex items-center gap-2">
                                    <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                                    <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                                        {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                                    </div>
                                    <span class="text-sm font-medium text-(--text) group-hover:text-white transition-colors">
                                        {{ $p(member.user?.name) || member.userId }}
                                    </span>
                                </div>
                            </label>
                            <div v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-2">
                                Aucun résultat
                            </div>
                        </div>
                    </template>

                    <template v-else-if="activeSection === 'tags'">
                        <TaskTagPicker
                            v-if="route.params.orgId"
                            :orgId="route.params.orgId as string"
                            v-model="form.tagIds"
                        />
                    </template>

                    <template v-else-if="activeSection === 'images'">
                        <div
                            class="rounded-lg border-2 border-dashed transition-colors p-2"
                            :class="isImagesDragOver ? 'border-(--primary) bg-(--primary)/5' : 'border-(--border-color)'"
                            @dragenter.prevent="onImagesDragEnter"
                            @dragover.prevent
                            @dragleave.prevent="onImagesDragLeave"
                            @drop.prevent="onImagesDrop"
                        >
                            <div v-if="stagedImages.length" class="flex flex-wrap gap-2">
                                <div v-for="(img, idx) in stagedImages" :key="img.previewUrl" class="relative group w-16 h-16 rounded-lg overflow-hidden border border-(--border-color)">
                                    <img :src="img.previewUrl" class="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        @click="removeStagedImage(idx)"
                                        class="absolute inset-0 bg-(--bg3)/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-(--text)"
                                    >
                                        <i class="bi bi-x-lg"></i>
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    @click="imageInput?.click()"
                                    :disabled="loading"
                                    class="w-16 h-16 rounded-lg border-2 border-dashed border-(--border-color) hover:border-(--primary) flex items-center justify-center text-(--text2) hover:text-(--primary) transition-colors shrink-0"
                                    title="Ajouter une image"
                                >
                                    <i class="bi bi-plus-lg text-lg"></i>
                                </button>
                            </div>
                            <button
                                v-else
                                type="button"
                                @click="imageInput?.click()"
                                :disabled="loading"
                                class="w-full flex flex-col items-center justify-center gap-1.5 py-4 text-(--text2) hover:text-(--primary) transition-colors"
                            >
                                <i class="bi bi-paperclip text-lg"></i>
                                <span class="text-xs font-semibold">Cliquez, glissez ou collez une image ici</span>
                            </button>
                        </div>
                    </template>

                    <template v-else-if="activeSection === 'space'">
                        <select
                            v-model="form.spaceId"
                            class="w-full bg-(--bg3) border border-white/10 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50 transition-all"
                            :disabled="loading"
                        >
                            <option :value="null">Tâche personnelle (Général)</option>
                            <option v-for="space in openedOrg?.spaces || []" :key="space.id" :value="space.id">
                                {{ space.name }}
                            </option>
                        </select>
                    </template>

                </div>
            </div>

        </form>

        <template #footer>
            <button @click="closeModal" class="default" :disabled="loading">
                Annuler
            </button>
            <button 
                @click="handleSubmit"
                class="primary"
                :class="[
                    loading ? 'loader' : '',
                    !form.title.trim() ? ' grayscale-100 pointer-events-none opacity-50' : ''
                ]"
                :disabled="loading || !form.title.trim()"
            >
                {{ loading ? 'Création...' : 'Créer la tâche' }}
            </button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, computed } from 'vue';
import Popup from '@/components/Popup.vue';
import TaskTagPicker from './TaskTagPicker.vue';
import { useRoute } from 'vue-router';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { uploadFiles } from '@/assets/uploadFile';
import { useToast } from '@/composables/useToast';
import type { OrgMember } from '@/types/types';

const props = defineProps<{
    defaultSpaceId?: string | null;
    hideSpaceSelect?: boolean;
    parentTaskId?: string | null;
    todoListId?: string | null;
}>();

const emit = defineEmits(['created']);

const route = useRoute();
const isOpen = ref<boolean>(false);
const loading = ref<boolean>(false);
const titleInput = ref<HTMLInputElement | null>(null);
const toast = useToast();

const form = reactive({
    title: '',
    description: '',
    dueDate: '',
    dueTime: '',
    spaceId: props.defaultSpaceId || null as string | null,
    assigneeIds: user.value?.id ? [user.value.id] : [] as string[],
    tagIds: [] as string[]
});

const searchAssignee = ref('');

interface StagedImage {
    file: File;
    previewUrl: string;
}
const stagedImages = ref<StagedImage[]>([]);
const imageInput = ref<HTMLInputElement | null>(null);

const addStagedImages = (files: File[]) => {
    for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        stagedImages.value.push({ file, previewUrl: URL.createObjectURL(file) });
    }
};

const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
        }
    }
    if (files.length) addStagedImages(files);
};

const onPickImages = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) addStagedImages(Array.from(input.files));
    input.value = '';
};

const isImagesDragOver = ref(false);
let imagesDragCounter = 0;

const onImagesDragEnter = () => {
    imagesDragCounter++;
    isImagesDragOver.value = true;
};

const onImagesDragLeave = () => {
    imagesDragCounter = Math.max(0, imagesDragCounter - 1);
    if (imagesDragCounter === 0) isImagesDragOver.value = false;
};

const onImagesDrop = (e: DragEvent) => {
    imagesDragCounter = 0;
    isImagesDragOver.value = false;
    const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
    if (files.length) addStagedImages(files);
};

const removeStagedImage = (idx: number) => {
    const [removed] = stagedImages.value.splice(idx, 1);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
};

const clearStagedImages = () => {
    stagedImages.value.forEach(img => URL.revokeObjectURL(img.previewUrl));
    stagedImages.value = [];
};

const availableMembers = computed<OrgMember[]>(() => {
    if (!openedOrg.value?.members) return [];
    if (!form.spaceId) {
        return openedOrg.value.members;
    }
    const space = openedOrg.value.spaces?.find(s => s.id === form.spaceId);
    if (!space) return openedOrg.value.members;
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const filteredMembers = computed<OrgMember[]>(() => {
    if (!searchAssignee.value.trim()) return availableMembers.value;
    const s = searchAssignee.value.toLowerCase();
    return availableMembers.value.filter(m => {
        const name = m.user?.name || m.userId;
        return name.toLowerCase().includes(s);
    });
});

type Section = 'date' | 'assignees' | 'tags' | 'images' | 'space';
const activeSection = ref<Section | null>(null);

const toggleSection = (key: Section) => {
    activeSection.value = activeSection.value === key ? null : key;
};

const pillClass = (key: Section, hasValue: boolean) => {
    if (activeSection.value === key) return 'bg-(--primary) border-(--primary) text-white';
    if (hasValue) return 'bg-(--primary)/10 border-(--primary)/40 text-(--primary)';
    return 'bg-transparent border-white/10 text-(--text2) hover:border-(--primary)/50 hover:text-(--primary)';
};

const dueDateLabel = computed(() => {
    if (!form.dueDate) return 'Échéance';
    const d = new Date(form.dueDate + 'T00:00:00');
    const label = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return form.dueTime ? `${label} ${form.dueTime}` : label;
});

const assigneesLabel = computed(() => {
    const n = form.assigneeIds.length;
    if (n === 0) return 'Assigné(s)';
    if (n === 1 && form.assigneeIds[0] === user.value?.id) return 'Moi';
    return `${n} personne${n > 1 ? 's' : ''}`;
});

const spaceLabel = computed(() => {
    if (!form.spaceId) return 'Général';
    return openedOrg.value?.spaces?.find(s => s.id === form.spaceId)?.name || 'Projet';
});

const openModal = () => {
    isOpen.value = true;
    form.title = '';
    form.description = '';
    form.dueDate = '';
    form.dueTime = '';
    form.spaceId = props.defaultSpaceId || null;
    form.assigneeIds = user.value?.id ? [user.value.id] : [];
    form.tagIds = [];
    searchAssignee.value = '';
    activeSection.value = null;
    clearStagedImages();
    nextTick(() => {
        titleInput.value?.focus();
    });
};

const closeModal = () => {
    isOpen.value = false;
};

const handleSubmit = async () => {
    if (!form.title.trim()) return;

    loading.value = true;
    try {
        let endpoint = `/api/tasks/${route.params.orgId}/tasks`;
        if (props.todoListId) {
            endpoint = `/api/tasks/${route.params.orgId}/lists/${props.todoListId}/tasks`;
        }

        let finalDueDate = null;
        if (form.dueDate) {
            const dateStr = form.dueDate + (form.dueTime ? `T${form.dueTime}` : 'T00:00');
            finalDueDate = new Date(dateStr).toISOString();
        }

        const payload = {
            title: form.title,
            description: form.description || null,
            dueDate: finalDueDate,
            spaceId: form.spaceId,
            assigneeIds: form.assigneeIds,
            tagIds: form.tagIds,
            parentTaskId: props.parentTaskId || null,
            status: 'TODO'
        };

        const res = await sfetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const task = await res.json();

            if (stagedImages.value.length) {
                try {
                    task.attachments = await uploadFiles(
                        stagedImages.value.map(img => img.file),
                        { taskId: task.id, workspaceId: task.spaceId || undefined }
                    );
                } catch (e) {
                    toast.show('Tâche créée, mais l\'ajout des images a échoué.', 'error');
                }
            }

            emit('created', task);
            toast.show('Tâche créée avec succès.', 'success');
            closeModal();
        } else {
            toast.show('Erreur de création de tâche', 'error');
        }
    } catch (e) {
        toast.show('Erreur inattendue', 'error');
    } finally {
        loading.value = false;
    }
};
</script>

<style scoped>
.pill {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 700;
    border-width: 1px;
    white-space: nowrap;
    transition: all 0.15s ease;
}
</style>
