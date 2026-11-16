<template>
    <form class="flex flex-col min-h-0" :class="variant === 'panel' ? 'flex-1' : ''" @submit.prevent="submit">
        <div
            class="flex flex-col gap-5"
            :class="variant === 'panel' ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 custom-scrollbar' : ''"
        >
            <input
                ref="titleInputEl"
                v-model="form.title"
                type="text"
                placeholder="Qu'y a-t-il à faire ?"
                class="w-full bg-transparent text-lg font-bold text-(--text) placeholder:text-(--text2) placeholder:font-semibold rounded-lg px-1.5 -mx-1.5 py-0.5 focus:outline-none focus:bg-(--surface-sunken)"
                :disabled="loading"
                @keydown.enter.prevent="submit"
            />

            <!-- Statut de départ : les trois colonnes du Kanban -->
            <div class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-(--surface-sunken)" role="group" aria-label="Statut">
                <button
                    v-for="s in STATUSES"
                    :key="s.id"
                    type="button"
                    class="h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95"
                    :class="form.status === s.id ? s.activeClass : 'text-(--text2) hover:text-(--text)'"
                    :aria-pressed="form.status === s.id"
                    @click="form.status = s.id"
                >
                    <i :class="s.icon"></i> {{ s.label }}
                </button>
            </div>

            <div class="flex flex-col">
                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'date' }" @click="toggleSection('date')">
                    <span class="prop-k"><i class="bi bi-calendar-event"></i> Échéance</span>
                    <span class="prop-v" :class="form.dueDate ? '' : 'text-(--text2)!'">{{ dueDateLabel }}</span>
                </button>
                <div v-if="activeSection === 'date'" class="prop-editor">
                    <div class="flex gap-2">
                        <input
                            v-model="form.dueDate"
                            type="date"
                            class="w-full bg-(--surface-sunken) border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                        />
                        <input
                            v-model="form.dueTime"
                            type="time"
                            class="w-28 bg-(--surface-sunken) border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                        />
                        <button v-if="form.dueDate" type="button" class="text-(--text2) hover:text-red-500 transition-colors px-2" title="Retirer l'échéance" @click="form.dueDate = ''; form.dueTime = ''">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'assignees' }" @click="toggleSection('assignees')">
                    <span class="prop-k"><i class="bi bi-people"></i> Assignés</span>
                    <span class="prop-v">
                        <span v-if="!selectedMembers.length" class="text-(--text2)">Personne</span>
                        <template v-else>
                            <span class="flex items-center -space-x-1.5">
                                <template v-for="m in selectedMembers.slice(0, 4)" :key="m.userId">
                                    <img v-if="m.user?.avatarUrl" :src="m.user.avatarUrl" :title="$p(m.user?.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg)">
                                    <span v-else :title="$p(m.user?.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg)">
                                        {{ ($p(m.user?.name) || m.userId).substring(0, 2).toUpperCase() }}
                                    </span>
                                </template>
                            </span>
                            <span class="truncate">{{ assigneesLabel }}</span>
                        </template>
                    </span>
                </button>
                <div v-if="activeSection === 'assignees'" class="prop-editor">
                    <div class="relative mb-2">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                        <input
                            v-model="searchAssignee"
                            placeholder="Rechercher une personne..."
                            class="w-full bg-(--surface-sunken) border border-(--text)/20 rounded-xl pl-9 pr-4 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                            @keydown.enter.prevent
                        />
                    </div>
                    <div class="max-h-40 overflow-y-auto space-y-2">
                        <label v-for="member in filteredMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
                            <input
                                v-model="form.assigneeIds"
                                type="checkbox"
                                :value="member.userId"
                                class="w-4 h-4 rounded bg-(--surface-sunken) border-(--text)/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                            />
                            <span class="flex items-center gap-2">
                                <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                                <span v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                                    {{ ($p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                                </span>
                                <span class="text-sm font-medium text-(--text) group-hover:text-(--primary) transition-colors">
                                    {{ $p(member.user?.name) || member.userId }}
                                </span>
                            </span>
                        </label>
                        <p v-if="filteredMembers.length === 0" class="text-xs text-center text-(--text2) py-2">Aucun résultat</p>
                    </div>
                </div>

                <template v-if="!draft.hideSpaceSelect">
                    <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'space' }" @click="toggleSection('space')">
                        <span class="prop-k"><i class="bi bi-folder"></i> Espace</span>
                        <span class="prop-v">{{ spaceLabel }}</span>
                    </button>
                    <div v-if="activeSection === 'space'" class="prop-editor">
                        <div class="max-h-48 overflow-y-auto flex flex-col gap-1">
                            <button
                                v-for="option in spaceOptions"
                                :key="option.id ?? 'general'"
                                type="button"
                                class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors"
                                :class="option.id === form.spaceId ? 'bg-(--primary)/10 text-(--primary) font-bold' : 'text-(--text) hover:bg-(--text)/5'"
                                @click="selectSpace(option.id)"
                            >
                                <i :class="option.icon" class="w-4 text-center"></i>
                                <span class="truncate flex-1">{{ option.name }}</span>
                                <i v-if="option.id === form.spaceId" class="bi bi-check-lg"></i>
                            </button>
                        </div>
                    </div>
                </template>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'tags' }" @click="toggleSection('tags')">
                    <span class="prop-k"><i class="bi bi-tag"></i> Tags</span>
                    <span class="prop-v" :class="form.tagIds.length ? '' : 'text-(--text2)!'">
                        {{ form.tagIds.length ? `${form.tagIds.length} tag${form.tagIds.length > 1 ? 's' : ''}` : 'Ajouter un tag' }}
                    </span>
                </button>
                <div v-if="activeSection === 'tags'" class="prop-editor">
                    <TaskTagPicker v-model="form.tagIds" :orgId="orgId" />
                </div>
            </div>

            <section>
                <h3 class="section-title"><i class="bi bi-text-left"></i> Description</h3>
                <ThreadTextarea
                    v-model="form.description"
                    :submit-on-enter="false"
                    :auto-focus="false"
                    placeholder="Plus de détails… (Ctrl+V pour coller une image ou un fichier)"
                    class="w-full bg-(--surface-sunken) border border-(--border-color) focus-within:border-(--primary)/50 rounded-xl px-3 text-(--text) placeholder:opacity-60"
                    @send="submit"
                    @paste="handlePaste"
                    @dragenter.prevent="onDragEnter"
                    @dragover.prevent
                    @dragleave.prevent="onDragLeave"
                    @drop.prevent="onDrop"
                />
            </section>

            <!-- Fichiers : envoyés une fois la tâche créée -->
            <section
                tabindex="-1"
                class="rounded-xl transition-colors outline-none"
                :class="isDragOver ? 'bg-(--primary)/5 ring-2 ring-(--primary)/50 ring-offset-4 ring-offset-(--bg)' : ''"
                @paste="handlePaste"
                @dragenter.prevent="onDragEnter"
                @dragover.prevent
                @dragleave.prevent="onDragLeave"
                @drop.prevent="onDrop"
            >
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="section-title mb-0!">
                        <i class="bi bi-paperclip"></i> Fichiers
                        <span v-if="draft.files.length" class="font-normal text-(--text2) tabular-nums">{{ draft.files.length }}</span>
                    </h3>
                    <button v-if="form.spaceId" type="button" class="file-action" @click="fileInput?.click()">
                        <i class="bi bi-plus-lg"></i> Ajouter
                    </button>
                </div>
                <p v-if="!form.spaceId" class="flex items-center gap-2 text-xs text-(--text2) px-1">
                    <i class="bi bi-shield-lock"></i>
                    Rattachez la tâche à un espace pour y joindre des fichiers : ils sont chiffrés avec sa clé.
                </p>
                <div v-else-if="draft.files.length" class="grid grid-cols-3 gap-2">
                    <div v-for="(f, idx) in draft.files" :key="f.previewUrl || `${f.file.name}-${idx}`" class="file-tile cursor-default! group" :title="f.file.name">
                        <img v-if="f.previewUrl" :src="f.previewUrl" :alt="f.file.name" class="absolute inset-0 w-full h-full object-cover" />
                        <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2">
                            <i :class="[fileIcon(f.file).icon, fileIcon(f.file).color]" class="text-xl"></i>
                            <span class="text-[10px] text-(--text2) truncate max-w-full">{{ f.file.name }}</span>
                        </div>
                        <button
                            type="button"
                            class="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-500"
                            title="Retirer"
                            @click="removeFile(idx)"
                        >
                            <i class="bi bi-x-lg text-[10px]"></i>
                        </button>
                    </div>
                </div>
                <button
                    v-else
                    type="button"
                    class="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-(--border-color) px-3 py-3 text-xs text-(--text2) hover:border-(--primary)/50 hover:text-(--text) transition-colors"
                    @click="fileInput?.click()"
                >
                    <i class="bi bi-cloud-arrow-up"></i>
                    Glissez, collez (Ctrl+V) ou cliquez pour ajouter un fichier
                </button>
                <input ref="fileInput" type="file" multiple hidden @change="onPickFiles" />
            </section>
        </div>

        <footer
            class="shrink-0 flex items-center justify-end gap-2"
            :class="variant === 'panel' ? 'px-4 py-2.5 border-t border-(--border-color)' : 'pt-5'"
        >
            <button type="button" class="default text-xs!" :disabled="loading" @click="closeTask(panelId)">Annuler</button>
            <button type="submit" class="primary text-xs!" :class="{ loader: loading }" :disabled="loading || !form.title.trim()">
                {{ loading ? 'Création…' : 'Créer la tâche' }}
            </button>
        </footer>
    </form>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import TaskTagPicker from '../popup/TaskTagPicker.vue';
import ThreadTextarea from '../common/ThreadTextarea.vue';
import type { OrgMember, Task } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { uploadFiles } from '@/assets/uploadFile';
import { useToast } from '@/composables/useToast';
import { extractReferenceTokens } from '@/composables/useReferences';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { openedOrg, user } from '@/assets/var';
import { useTaskPanels, type TaskDraft } from '@/composables/useTaskPanels';

const props = withDefaults(defineProps<{
    panelId: string;
    draft: TaskDraft;
    orgId: string;
    variant?: 'panel' | 'popup';
}>(), { variant: 'panel' });

const toast = useToast();
const { finishDraft, closeTask } = useTaskPanels();

// Le formulaire vit dans le brouillon (useTaskPanels) : réduire le panneau ne perd rien.
const form = props.draft.form;
const loading = ref(false);
const titleInputEl = ref<HTMLInputElement | null>(null);

onMounted(() => nextTick(() => titleInputEl.value?.focus()));

const STATUSES = [
    { id: 'TODO', label: 'À faire', icon: 'bi bi-circle', activeClass: 'bg-(--bg) text-(--text) shadow-sm' },
    { id: 'IN_PROGRESS', label: 'En cours', icon: 'bi bi-arrow-repeat', activeClass: 'bg-blue-500 text-white' },
    { id: 'DONE', label: 'Terminé', icon: 'bi bi-check-circle-fill', activeClass: 'bg-green-500 text-white' }
] as const;

type Section = 'date' | 'assignees' | 'space' | 'tags';
const activeSection = ref<Section | null>(null);
const toggleSection = (key: Section) => {
    activeSection.value = activeSection.value === key ? null : key;
};

const dueDateLabel = computed(() => {
    if (!form.dueDate) return 'Aucune échéance';
    const d = new Date(form.dueDate + 'T00:00:00');
    const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    return form.dueTime ? `${label} à ${form.dueTime}` : label;
});

// ── Assignés ───────────────────────────────────────────────────────────
const searchAssignee = ref('');

const availableMembers = computed<OrgMember[]>(() => {
    if (!openedOrg.value?.members) return [];
    if (!form.spaceId) return openedOrg.value.members;
    const space = openedOrg.value.spaces?.find(s => s.id === form.spaceId);
    if (!space) return openedOrg.value.members;
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const filteredMembers = computed<OrgMember[]>(() => {
    const s = searchAssignee.value.trim().toLowerCase();
    if (!s) return availableMembers.value;
    return availableMembers.value.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

const selectedMembers = computed(() =>
    (openedOrg.value?.members || []).filter(m => form.assigneeIds.includes(m.userId))
);

const assigneesLabel = computed(() => {
    const list = selectedMembers.value;
    if (!list.length) return '';
    if (list.length === 1) return list[0]!.userId === user.value?.id ? 'Moi' : String(list[0]!.user?.name ?? '');
    return `${list.length} personnes`;
});

// ── Espace ─────────────────────────────────────────────────────────────
const spaceOptions = computed(() => {
    const myId = user.value?.id;
    const spaces = (openedOrg.value?.spaces ?? [])
        .filter(s => !myId || s.membersId?.includes(myId))
        .map(s => ({ id: s.id as string | null, name: s.name, icon: 'bi bi-grid' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: null as string | null, name: 'Général', icon: 'bi bi-house' }, ...spaces];
});

const spaceLabel = computed(() => spaceOptions.value.find(o => o.id === form.spaceId)?.name ?? 'Général');

const selectSpace = (id: string | null) => {
    form.spaceId = id;
    // Un assigné qui n'est pas membre du nouvel espace ne verrait pas la tâche.
    const allowed = new Set(availableMembers.value.map(m => m.userId));
    form.assigneeIds = form.assigneeIds.filter(uid => allowed.has(uid));
    activeSection.value = null;
};

// ── Fichiers (mis de côté jusqu'à la création) ─────────────────────────
const fileInput = ref<HTMLInputElement | null>(null);
const fileIcon = (f: File) => getFileInfo({ originalName: f.name, mimeType: f.type } as any);

const addFiles = (files: File[]) => {
    if (!form.spaceId) {
        toast.show('Rattachez la tâche à un espace pour y joindre des fichiers.', 'warning');
        return;
    }
    for (const file of files) {
        props.draft.files.push({ file, previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null });
    }
};

const removeFile = (idx: number) => {
    const [removed] = props.draft.files.splice(idx, 1);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
};

const handlePaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items || [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    addFiles(files);
};

const onPickFiles = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) addFiles(Array.from(input.files));
    input.value = '';
};

const isDragOver = ref(false);
let dragCounter = 0;
const onDragEnter = () => { dragCounter++; isDragOver.value = true; };
const onDragLeave = () => {
    dragCounter = Math.max(0, dragCounter - 1);
    if (dragCounter === 0) isDragOver.value = false;
};
const onDrop = (e: DragEvent) => {
    dragCounter = 0;
    isDragOver.value = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) addFiles(files);
};

// ── Création ───────────────────────────────────────────────────────────
const submit = async () => {
    if (!form.title.trim() || loading.value) return;
    loading.value = true;
    try {
        const endpoint = props.draft.todoListId
            ? `/api/tasks/${props.orgId}/lists/${props.draft.todoListId}/tasks`
            : `/api/tasks/${props.orgId}/tasks`;

        let dueDate = null;
        if (form.dueDate) {
            dueDate = new Date(form.dueDate + (form.dueTime ? `T${form.dueTime}` : 'T00:00')).toISOString();
        }

        const res = await sfetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({
                title: form.title.trim(),
                description: form.description || null,
                dueDate,
                spaceId: form.spaceId,
                assigneeIds: form.assigneeIds,
                tagIds: form.tagIds,
                parentTaskId: props.draft.parentTaskId,
                status: form.status,
                references: extractReferenceTokens(form.description)
            })
        });
        if (!res.ok) {
            toast.show('Erreur de création de tâche', 'error');
            return;
        }
        const task: Task = await res.json();

        // Fichiers chiffrés avec la clé de l'espace : envoyés une fois la tâche créée.
        if (props.draft.files.length && task.spaceId) {
            try {
                task.attachments = await uploadFiles(
                    props.draft.files.map(f => f.file),
                    { taskId: task.id, workspaceId: task.spaceId }
                ) as any;
            } catch (e) {
                toast.show('Tâche créée, mais l\'ajout des fichiers a échoué.', 'error');
            }
        }

        toast.show('Tâche créée', 'success');
        finishDraft(props.panelId, task);
    } catch (e) {
        toast.show('Erreur inattendue', 'error');
    } finally {
        loading.value = false;
    }
};
</script>

<style scoped src="./taskPanel.css"></style>
