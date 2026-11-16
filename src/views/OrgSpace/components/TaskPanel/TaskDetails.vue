<template>
    <div v-if="task" class="flex flex-col min-h-0" :class="variant === 'panel' ? 'flex-1' : ''">
        <div
            class="flex flex-col gap-5"
            :class="variant === 'panel' ? 'flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-4 custom-scrollbar' : ''"
        >
            <!-- Titre : cliquer pour modifier -->
            <h2
                v-if="!isEditingTitle"
                class="text-lg font-bold text-(--text) leading-snug break-words cursor-text rounded-lg px-1.5 -mx-1.5 py-0.5 hover:bg-(--text)/5 transition-colors"
                title="Cliquer pour modifier"
                @click="startEditTitle"
            >{{ editForm.title }}</h2>
            <input
                v-else
                ref="titleInputEl"
                v-model="editForm.title"
                type="text"
                class="w-full bg-(--surface-sunken) border border-(--primary)/50 rounded-lg px-3 py-1.5 text-lg font-bold text-(--text) focus:outline-none"
                @blur="commitEditTitle"
                @keydown.enter="commitEditTitle"
                @keydown.escape.stop="cancelEditTitle"
            />

            <!-- Statut : les trois colonnes du Kanban -->
            <div class="flex flex-col gap-1.5">
                <div class="grid grid-cols-3 gap-1 p-1 rounded-xl bg-(--surface-sunken)" role="group" aria-label="Statut">
                    <button
                        v-for="s in STATUSES"
                        :key="s.id"
                        type="button"
                        class="h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95"
                        :class="task.status === s.id ? s.activeClass : 'text-(--text2) hover:text-(--text)'"
                        :aria-pressed="task.status === s.id"
                        :disabled="statusSaving"
                        @click="setStatus(s.id)"
                    >
                        <i :class="s.icon"></i> {{ s.label }}
                    </button>
                </div>
                <p class="text-xs text-(--text2) px-1">{{ statusInfo.label }} depuis {{ statusDuration }}</p>
            </div>

            <!-- Propriétés : chaque ligne s'ouvre en place -->
            <div class="flex flex-col">
                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'date' }" @click="toggleSection('date')">
                    <span class="prop-k"><i class="bi bi-calendar-event"></i> Échéance</span>
                    <span class="prop-v">
                        <span v-if="isTaskOverdue(task)" class="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-black whitespace-nowrap">{{ overdueLabel(task.dueDate!) }}</span>
                        <span :class="editForm.dueDate ? 'text-(--text)' : 'text-(--text2)'">{{ dueDateLabel }}</span>
                        <span v-if="task.dueDate && task.status !== 'DONE'" class="w-14 h-1.5 rounded-full bg-(--surface-sunken) overflow-hidden shrink-0" :title="deadline.text">
                            <span class="block h-full rounded-full" :class="deadline.color" :style="{ width: `${deadline.percent}%` }"></span>
                        </span>
                    </span>
                </button>
                <div v-if="activeSection === 'date'" class="prop-editor">
                    <div class="flex gap-2">
                        <input
                            v-model="editForm.dueDate"
                            type="date"
                            class="w-full bg-(--surface-sunken) border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                            :disabled="loading"
                        />
                        <input
                            v-model="editForm.dueTime"
                            type="time"
                            class="w-28 bg-(--surface-sunken) border border-(--text)/20 rounded-lg px-3 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)/50"
                            :disabled="loading"
                        />
                        <button v-if="editForm.dueDate" type="button" class="text-(--text2) hover:text-red-500 transition-colors px-2" title="Retirer l'échéance" @click="editForm.dueDate = ''; editForm.dueTime = ''">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'assignees' }" @click="toggleSection('assignees')">
                    <span class="prop-k"><i class="bi bi-people"></i> Assignés</span>
                    <span class="prop-v">
                        <span v-if="!task.assignees?.length" class="text-(--text2)">Personne</span>
                        <template v-else>
                            <span class="flex items-center -space-x-1.5">
                                <template v-for="assignee in task.assignees.slice(0, 4)" :key="assignee.id">
                                    <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg)">
                                    <span v-else :title="$p(assignee.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg)">
                                        {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
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
                            :disabled="loading"
                        />
                    </div>
                    <div class="max-h-40 overflow-y-auto space-y-2">
                        <label v-for="member in filteredMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
                            <input
                                v-model="editForm.assigneeIds"
                                type="checkbox"
                                :value="member.userId"
                                class="w-4 h-4 rounded bg-(--surface-sunken) border-(--text)/20 text-(--primary) focus:ring-(--primary) focus:ring-offset-0"
                                :disabled="loading"
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

                <!-- Une sous-tâche suit sa tâche parente : son espace ne se change pas ici. -->
                <div v-if="task.parentTaskId" class="prop-row cursor-default hover:bg-transparent">
                    <span class="prop-k"><i class="bi bi-folder"></i> Espace</span>
                    <span class="prop-v">{{ currentSpaceName }}</span>
                </div>
                <button v-else type="button" class="prop-row" :class="{ 'is-active': activeSection === 'space' }" @click="toggleSection('space')">
                    <span class="prop-k"><i class="bi bi-folder"></i> Espace</span>
                    <span class="prop-v">{{ currentSpaceName }}</span>
                </button>
                <div v-if="activeSection === 'space'" class="prop-editor">
                    <p v-if="task.attachments?.length || task._count?.attachments" class="text-xs text-amber-400 flex items-start gap-1.5 mb-2">
                        <i class="bi bi-exclamation-triangle mt-0.5"></i>
                        Les fichiers joints sont chiffrés avec la clé de cet espace : retirez-les pour pouvoir déplacer la tâche.
                    </p>
                    <div v-if="spaceOptions.length > 8" class="relative mb-2">
                        <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm"></i>
                        <input
                            v-model="searchSpace"
                            placeholder="Rechercher un espace..."
                            class="w-full bg-(--surface-sunken) border border-(--text)/20 rounded-xl pl-9 pr-4 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                        />
                    </div>
                    <div class="max-h-48 overflow-y-auto flex flex-col gap-1">
                        <button
                            v-for="option in filteredSpaceOptions"
                            :key="option.id ?? 'general'"
                            type="button"
                            class="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors disabled:cursor-default"
                            :class="option.id === (task.spaceId ?? null) ? 'bg-(--primary)/10 text-(--primary) font-bold' : 'text-(--text) hover:bg-(--text)/5'"
                            :disabled="loading || moving || option.id === (task.spaceId ?? null)"
                            @click="requestMove(option.id)"
                        >
                            <i :class="option.icon" class="w-4 text-center"></i>
                            <span class="truncate flex-1">{{ option.name }}</span>
                            <i v-if="option.id === (task.spaceId ?? null)" class="bi bi-check-lg"></i>
                            <span v-else-if="pendingMove?.spaceId === option.id && moving" class="w-3.5 h-3.5 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin"></span>
                        </button>
                    </div>
                    <!-- Assignés qui ne verraient plus la tâche : on le dit avant de déplacer. -->
                    <div v-if="pendingMove && pendingMove.removed.length" class="mt-3 p-3 rounded-lg bg-amber-400/10 border border-amber-400/30 text-xs text-(--text)">
                        <p class="mb-2">
                            <b>{{ pendingMove.removed.map(m => $p(m.name)).join(', ') }}</b>
                            {{ pendingMove.removed.length > 1 ? 'ne font pas partie' : 'ne fait pas partie' }}
                            de « {{ pendingMove.name }} » et {{ pendingMove.removed.length > 1 ? 'seront retirés' : 'sera retiré(e)' }} des assignés.
                        </p>
                        <div class="flex gap-2 justify-end">
                            <button type="button" class="default text-xs!" @click="pendingMove = null">Annuler</button>
                            <button type="button" class="primary text-xs!" :disabled="moving" @click="moveTask(pendingMove.spaceId)">Déplacer quand même</button>
                        </div>
                    </div>
                </div>

                <button type="button" class="prop-row" :class="{ 'is-active': activeSection === 'tags' }" @click="toggleSection('tags')">
                    <span class="prop-k"><i class="bi bi-tag"></i> Tags</span>
                    <span class="prop-v flex-wrap">
                        <span
                            v-for="tag in task.tags" :key="tag.id"
                            class="px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap"
                            :style="{ borderColor: tag.color, color: tag.color }"
                        >{{ tag.name }}</span>
                        <span v-if="!task.tags?.length" class="text-(--text2)">Ajouter un tag</span>
                    </span>
                </button>
                <div v-if="activeSection === 'tags'" class="prop-editor">
                    <TaskTagPicker v-model="editForm.tagIds" :orgId="orgId" />
                </div>

                <div v-if="task.creator" class="prop-row cursor-default hover:bg-transparent">
                    <span class="prop-k"><i class="bi bi-person"></i> Créée par</span>
                    <span class="prop-v">
                        <button
                            type="button"
                            class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-(--text)/5 hover:bg-(--text)/10 text-(--text) font-semibold transition-colors"
                            :title="'Profil de ' + $p(task.creator.name)"
                            @click.stop="(e) => task?.creator && openProfile(task.creator, e)"
                        >
                            <img v-if="task.creator.avatarUrl" :src="task.creator.avatarUrl" class="w-4 h-4 rounded-full object-cover">
                            <span v-else class="w-4 h-4 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black">
                                {{ $p(task.creator.name).substring(0, 2).toUpperCase() }}
                            </span>
                            {{ $p(task.creator.name) }}
                        </button>
                    </span>
                </div>
            </div>

            <!-- Description : Ctrl+V et glisser-déposer y ajoutent des fichiers -->
            <section>
                <h3 class="section-title"><i class="bi bi-text-left"></i> Description</h3>
                <div
                    v-if="!isEditingDescription"
                    class="text-sm cursor-text rounded-xl px-3 py-2.5 bg-(--text)/[0.04] hover:bg-(--text)/[0.07] transition-colors"
                    :class="editForm.description ? 'text-(--text)' : 'text-(--text2)'"
                    title="Cliquer pour modifier"
                    @click="startEditDescription"
                >
                    <MarkdownRender
                        v-if="editForm.description"
                        :content="editForm.description"
                        mode="chat"
                        @user-click="(u, e) => { e.stopPropagation(); openProfile(u, e); }"
                        @reference-click="(ref, e) => { e.stopPropagation(); navigateToReference(router, ref); }"
                    />
                    <template v-else>Ajouter une description…</template>
                </div>
                <ThreadTextarea
                    v-else
                    ref="descriptionInputEl"
                    v-model="editForm.description"
                    :submit-on-enter="false"
                    placeholder="Plus de détails… (Ctrl+V pour coller une image ou un fichier)"
                    class="w-full bg-(--surface-sunken) border border-(--primary)/50 rounded-xl px-3 text-(--text) placeholder:opacity-60"
                    @focusout="isEditingDescription = false"
                    @keydown.escape.stop="cancelEditDescription"
                    @paste="handlePaste"
                    @dragenter.prevent="onFilesDragEnter"
                    @dragover.prevent
                    @dragleave.prevent="onFilesDragLeave"
                    @drop.prevent="onFilesDrop"
                />
            </section>

            <!-- Fichiers : sous la description, les médias s'ouvrent en grand -->
            <section
                tabindex="-1"
                class="rounded-xl transition-colors outline-none"
                :class="isFilesDragOver ? 'bg-(--primary)/5 ring-2 ring-(--primary)/50 ring-offset-4 ring-offset-(--bg)' : ''"
                @paste="handlePaste"
                @dragenter.prevent="onFilesDragEnter"
                @dragover.prevent
                @dragleave.prevent="onFilesDragLeave"
                @drop.prevent="onFilesDrop"
            >
                <div class="flex items-center justify-between gap-2 mb-2">
                    <h3 class="section-title mb-0!">
                        <i class="bi bi-paperclip"></i> Fichiers
                        <span v-if="fileTiles.length" class="font-normal text-(--text2) tabular-nums">{{ fileTiles.length }}</span>
                    </h3>
                    <div v-if="task.spaceId" class="flex items-center gap-1">
                        <button type="button" class="file-action" :disabled="uploading" @click="fileInput?.click()">
                            <i class="bi bi-plus-lg"></i> Ajouter
                        </button>
                        <button type="button" class="file-action" @click="showFilePicker = true">
                            <i class="bi bi-link-45deg"></i> Lier
                        </button>
                    </div>
                </div>

                <p v-if="!task.spaceId" class="flex items-center gap-2 text-xs text-(--text2) px-1">
                    <i class="bi bi-shield-lock"></i>
                    Rattachez la tâche à un espace pour y joindre des fichiers : ils sont chiffrés avec sa clé.
                </p>

                <div v-else-if="fileTiles.length || uploading" class="grid grid-cols-3 gap-2">
                    <div
                        v-for="tile in fileTiles"
                        :key="tile.key"
                        role="button"
                        tabindex="0"
                        class="file-tile group"
                        :title="tile.name"
                        @click="openFile(tile)"
                        @keydown.enter.prevent="openFile(tile)"
                    >
                        <img v-if="previews[tile.fileId]" :src="previews[tile.fileId]" :alt="tile.name" class="absolute inset-0 w-full h-full object-cover" />
                        <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-1 px-2">
                            <i :class="[tileIcon(tile).icon, tileIcon(tile).color]" class="text-xl"></i>
                            <span class="text-[10px] text-(--text2) truncate max-w-full">{{ tile.name }}</span>
                        </div>
                        <span v-if="isVideo(tile)" class="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <span class="w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><i class="bi bi-play-fill text-lg"></i></span>
                        </span>
                        <span v-if="tile.kind === 'linked'" class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-md bg-black/60 text-white text-[9px] font-bold flex items-center gap-1 pointer-events-none">
                            <i class="bi bi-link-45deg"></i> Lié
                        </span>
                        <button
                            type="button"
                            class="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-red-500"
                            :title="tile.kind === 'linked' ? 'Retirer le lien (le fichier reste dans l’espace)' : 'Supprimer le fichier'"
                            @click.stop="removeTile(tile)"
                        >
                            <i class="bi bi-x-lg text-[10px]"></i>
                        </button>
                    </div>
                    <div v-if="uploading" class="file-tile flex items-center justify-center">
                        <i class="bi bi-arrow-repeat animate-spin text-(--text2) text-lg"></i>
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

            <!-- Sous-tâches -->
            <section>
                <h3 class="section-title">
                    <i class="bi bi-list-nested"></i> Sous-tâches
                    <span v-if="task.subtasks?.length" class="font-normal text-(--text2) tabular-nums">{{ doneSubtasks }}/{{ task.subtasks.length }}</span>
                </h3>
                <div v-if="task.subtasks?.length" class="h-1 rounded-full bg-(--surface-sunken) overflow-hidden mb-1.5">
                    <div class="h-full bg-green-500 transition-all duration-300" :style="{ width: `${(doneSubtasks / task.subtasks.length) * 100}%` }"></div>
                </div>
                <ul class="flex flex-col">
                    <li
                        v-for="subtask in task.subtasks"
                        :key="subtask.id"
                        class="group flex items-center gap-2.5 px-2 -mx-2 py-1.5 rounded-lg hover:bg-(--text)/5 transition-colors"
                    >
                        <button
                            type="button"
                            class="text-lg leading-none transition-transform active:scale-90"
                            :class="subtask.status === 'DONE' ? 'text-green-500' : 'text-(--text2) hover:text-(--primary)'"
                            :aria-label="`${subtask.status === 'DONE' ? 'Rouvrir' : 'Terminer'} : ${subtask.title}`"
                            @click="toggleSubtaskStatus(subtask)"
                        >
                            <i class="bi" :class="subtask.status === 'DONE' ? 'bi-check-circle-fill' : 'bi-circle'"></i>
                        </button>
                        <button
                            type="button"
                            class="flex-1 min-w-0 text-left text-sm truncate hover:underline"
                            :class="subtask.status === 'DONE' ? 'text-(--text2) line-through' : 'text-(--text)'"
                            @click="openTaskById(orgId, subtask)"
                        >{{ subtask.title }}</button>
                        <span v-if="subtask.assignees?.length" class="flex -space-x-1.5 shrink-0">
                            <template v-for="assignee in subtask.assignees.slice(0, 2)" :key="assignee.id">
                                <img v-if="assignee.avatarUrl" :src="assignee.avatarUrl" :title="$p(assignee.name)" class="w-5 h-5 rounded-full object-cover border border-(--bg)">
                                <span v-else :title="$p(assignee.name)" class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[8px] font-black border border-(--bg)">
                                    {{ $p(assignee.name).substring(0, 2).toUpperCase() }}
                                </span>
                            </template>
                        </span>
                        <button
                            type="button"
                            class="text-red-500/60 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                            title="Supprimer la sous-tâche"
                            @click="deleteSubtask(subtask.id)"
                        >
                            <i class="bi bi-trash"></i>
                        </button>
                    </li>
                </ul>
                <label class="flex items-center gap-2.5 px-2 -mx-2 py-1.5 rounded-lg text-(--text2) focus-within:bg-(--surface-sunken) transition-colors">
                    <i v-if="addingSubtask" class="bi bi-arrow-repeat animate-spin text-lg leading-none"></i>
                    <i v-else class="bi bi-plus-lg text-lg leading-none"></i>
                    <input
                        v-model="newSubtaskTitle"
                        type="text"
                        placeholder="Ajouter une sous-tâche"
                        class="flex-1 min-w-0 bg-transparent text-sm text-(--text) placeholder:text-(--text2) focus:outline-none"
                        :disabled="addingSubtask"
                        @keydown.enter.prevent="addSubtask"
                        @keydown.escape.stop="newSubtaskTitle = ''"
                    />
                </label>
            </section>
        </div>

        <!-- Pied : état de l'enregistrement + actions rares -->
        <footer
            class="relative shrink-0 flex items-center gap-2 text-xs text-(--text2)"
            :class="variant === 'panel' ? 'px-4 py-2.5 border-t border-(--border-color)' : 'pt-5'"
        >
            <span class="flex-1 flex items-center gap-1.5 min-h-7">
                <template v-if="saveStatus === 'saving'"><i class="bi bi-arrow-repeat animate-spin"></i> Enregistrement…</template>
                <template v-else-if="saveStatus === 'saved'"><i class="bi bi-check-circle-fill text-green-500"></i> Enregistré</template>
            </span>
            <button
                ref="menuButtonEl"
                type="button"
                class="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-(--text)/10 hover:text-(--text) transition-colors"
                aria-label="Plus d'actions"
                :aria-expanded="menuOpen"
                @click="menuOpen = !menuOpen"
            >
                <i class="bi bi-three-dots"></i>
            </button>
            <Transition name="task-menu">
                <div
                    v-if="menuOpen"
                    ref="menuEl"
                    class="absolute right-3 bottom-full mb-1 min-w-52 p-1.5 rounded-xl bg-(--bg) border border-(--border-color) shadow-xl flex flex-col gap-0.5 z-10"
                >
                    <button type="button" class="task-menu-item" :disabled="loading" @click="archiveTask">
                        <i class="bi bi-archive"></i> Archiver la tâche
                    </button>
                    <button type="button" class="task-menu-item text-red-500!" :disabled="loading" @click="menuOpen = false; showDeleteConfirm = true">
                        <i class="bi bi-trash"></i> Supprimer la tâche
                    </button>
                </div>
            </Transition>
        </footer>
    </div>

    <ConfirmDelete
        :show="showDeleteConfirm"
        item-type="la tâche"
        :item-name="task?.title || 'cette tâche'"
        :loading="deleting"
        @cancel="showDeleteConfirm = false"
        @confirm="confirmDeleteTask"
    />

    <FileViewer
        v-if="viewingFile"
        :file="viewingFile"
        :isOpen="!!viewingFile"
        @close="viewingFile = null"
        @deleted="onViewerDeleted"
    />

    <FilePickerModal
        v-if="task?.spaceId"
        :isOpen="showFilePicker"
        :spaceId="task.spaceId"
        @close="showFilePicker = false"
        @select="onFileLinked"
    />
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import confetti from 'canvas-confetti';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import TaskTagPicker from '../popup/TaskTagPicker.vue';
import FileViewer from '../popup/FileViewer.vue';
import FilePickerModal from '../popup/FilePickerModal.vue';
import ThreadTextarea from '../common/ThreadTextarea.vue';
import MarkdownRender from '../../views/MarkdownRender.vue';
import type { Task, OrgMember, TaskAttachment, TaskLinkedFile, StoredFile } from '@/types/types';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import { openedOrg, user } from '@/assets/var';
import { openProfile } from '@/composables/useProfile';
import uploadFile from '@/assets/uploadFile';
import { getFilePreviewUrl } from '@/assets/utils/downloadFile';
import { getFileInfo } from '@/assets/utils/getFileIcon';
import { extractReferenceTokens } from '@/composables/useReferences';
import { navigateToReference } from '@/composables/useReferenceNavigation';
import { deadlineProgress, isTaskOverdue, overdueLabel } from '@/assets/utils/taskOverdue';
import { useTaskPanels } from '@/composables/useTaskPanels';

const props = withDefaults(defineProps<{
    task: Task;
    orgId: string;
    /** « Renommer » depuis un menu contextuel : le titre s'ouvre en édition. */
    editTitle?: boolean;
    /** panel : dock de bureau (défilement interne, pied fixe) ; popup : contenu de la Popup mobile. */
    variant?: 'panel' | 'popup';
}>(), { editTitle: false, variant: 'panel' });

const router = useRouter();
const toast = useToast();
const { openTaskById, notifyTaskUpdated, notifyTaskDeleted } = useTaskPanels();

const loading = ref(false);

const STATUSES = [
    { id: 'TODO', label: 'À faire', icon: 'bi bi-circle', activeClass: 'bg-(--bg) text-(--text) shadow-sm' },
    { id: 'IN_PROGRESS', label: 'En cours', icon: 'bi bi-arrow-repeat', activeClass: 'bg-blue-500 text-white' },
    { id: 'DONE', label: 'Terminé', icon: 'bi bi-check-circle-fill', activeClass: 'bg-green-500 text-white' }
] as const;

// ── Édition au clic, champ par champ ───────────────────────────────────
const isEditingTitle = ref(false);
const isEditingDescription = ref(false);
const titleInputEl = ref<HTMLInputElement | null>(null);
const descriptionInputEl = ref<InstanceType<typeof ThreadTextarea> | null>(null);

const startEditTitle = () => {
    isEditingTitle.value = true;
    nextTick(() => titleInputEl.value?.focus());
};

// Un titre vide n'est jamais valide : on revient au dernier titre connu.
const commitEditTitle = () => {
    if (!editForm.title.trim()) editForm.title = props.task.title;
    isEditingTitle.value = false;
};

const cancelEditTitle = () => {
    editForm.title = props.task.title;
    isEditingTitle.value = false;
};

const startEditDescription = () => {
    isEditingDescription.value = true;
    nextTick(() => descriptionInputEl.value?.textarea?.focus());
};

const cancelEditDescription = () => {
    editForm.description = props.task.description || '';
    isEditingDescription.value = false;
};

// ── Statut ─────────────────────────────────────────────────────────────
const statusSaving = ref(false);

const setStatus = async (status: Task['status']) => {
    if (props.task.status === status || statusSaving.value) return;
    const previous = { status: props.task.status, statusChangedAt: props.task.statusChangedAt };
    props.task.status = status;
    props.task.statusChangedAt = new Date().toISOString();
    statusSaving.value = true;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
        if (!res.ok) throw new Error('API Error');
        notifyTaskUpdated(await res.json());
        if (status === 'DONE') celebrate();
    } catch (e) {
        Object.assign(props.task, previous);
        toast.show('Impossible de changer le statut', 'error');
    } finally {
        statusSaving.value = false;
    }
};

const statusInfo = computed(() => {
    switch (props.task.status) {
        case 'TODO': return { label: 'À faire' };
        case 'IN_PROGRESS': return { label: 'En cours' };
        case 'DONE': return { label: 'Terminée' };
        default: return { label: '' };
    }
});

const formatDuration = (since: Date): string => {
    const minutes = Math.floor((Date.now() - since.getTime()) / 60000);
    if (minutes < 1) return "à l'instant";
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} heure${hours > 1 ? 's' : ''}`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} jour${days > 1 ? 's' : ''}`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} mois`;
    const years = Math.floor(months / 12);
    return `${years} an${years > 1 ? 's' : ''}`;
};

const statusDuration = computed(() => {
    const since = props.task.statusChangedAt || props.task.createdAt;
    return since ? formatDuration(new Date(since)) : '';
});

const deadline = computed(() => deadlineProgress(props.task));

function celebrate() {
    try {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#4ade80', '#3b82f6', '#fbbf24', '#f87171'],
            zIndex: 10000
        });
    } catch (e) { /* pas de canvas : tant pis */ }
}

// ── Fichiers : pièces jointes (possédées par la tâche) et fichiers liés ──
interface FileTile {
    key: string;
    fileId: string;
    name: string;
    mimeType: string;
    size: number;
    kind: 'attachment' | 'linked';
}

const fileInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const previews = ref<Record<string, string>>({});
const viewingFile = ref<StoredFile | null>(null);
let viewingTile: FileTile | null = null;
const showFilePicker = ref(false);

const fileTiles = computed<FileTile[]>(() => [
    ...(props.task.attachments || []).map(a => ({
        key: `a-${a.id}`, fileId: a.id, name: a.originalName, mimeType: a.mimeType, size: a.size, kind: 'attachment' as const
    })),
    ...(props.task.linkedFiles || []).map(l => ({
        key: `l-${l.id}`, fileId: l.fileId, name: l.file.originalName, mimeType: l.file.mimeType, size: l.file.size, kind: 'linked' as const
    }))
]);

const isImage = (t: FileTile) => t.mimeType.startsWith('image/');
const isVideo = (t: FileTile) => t.mimeType.startsWith('video/');
const tileIcon = (t: FileTile) => getFileInfo({ originalName: t.name, mimeType: t.mimeType } as any);

// Miniatures : images seulement (une vidéo devrait être déchiffrée en entier
// pour en tirer une image). Au-delà de 15 Mo, on garde l'icône.
const PREVIEW_MAX_BYTES = 15 * 1024 * 1024;
const pendingPreviews = new Set<string>();

const resolvePreview = async (tile: FileTile) => {
    if (!isImage(tile) || tile.size > PREVIEW_MAX_BYTES) return;
    if (previews.value[tile.fileId] || pendingPreviews.has(tile.fileId)) return;
    pendingPreviews.add(tile.fileId);
    try {
        const preview = await getFilePreviewUrl(tile.fileId);
        previews.value[tile.fileId] = preview.url;
    } catch (e) {
        console.error('[TaskDetails] Failed to load preview', e);
    } finally {
        pendingPreviews.delete(tile.fileId);
    }
};

watch(fileTiles, tiles => tiles.forEach(resolvePreview), { immediate: true });

// La tâche vient souvent d'une liste qui ne charge qu'un _count.attachments :
// on relit la tâche complète pour avoir pièces jointes et fichiers liés.
const refreshFiles = async () => {
    const taskId = props.task.id;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${taskId}`);
        if (!res.ok) return;
        const fullTask = await res.json();
        if (props.task.id !== taskId) return;
        props.task.attachments = fullTask.attachments;
        props.task.linkedFiles = fullTask.linkedFiles;
        if (!props.task.parentTask && fullTask.parentTask) props.task.parentTask = fullTask.parentTask;
    } catch (e) {
        console.error('[TaskDetails] Failed to refresh task files', e);
    }
};

const uploadFiles = async (files: File[]) => {
    // Fichiers chiffrés avec la clé de l'espace de la tâche.
    if (!props.task.spaceId) {
        toast.show('Rattachez la tâche à un espace pour y joindre des fichiers.', 'warning');
        return;
    }
    uploading.value = true;
    try {
        for (const file of files) {
            const uploaded = await uploadFile(file, { taskId: props.task.id, workspaceId: props.task.spaceId });
            if (!props.task.attachments) props.task.attachments = [];
            props.task.attachments.unshift(uploaded as unknown as TaskAttachment);
        }
        notifyTaskUpdated(props.task);
    } catch (e) {
        toast.show('Erreur lors de l\'ajout du fichier', 'error');
    } finally {
        uploading.value = false;
    }
};

// Ctrl+V : tout fichier du presse-papiers (capture d'écran, fichier copié).
// Le texte collé, lui, suit son cours normal.
const handlePaste = (e: ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items || [])
        .filter(item => item.kind === 'file')
        .map(item => item.getAsFile())
        .filter((f): f is File => !!f);
    if (!files.length) return;
    e.preventDefault();
    uploadFiles(files);
};

const onPickFiles = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files?.length) uploadFiles(Array.from(input.files));
    input.value = '';
};

const isFilesDragOver = ref(false);
let filesDragCounter = 0;

const onFilesDragEnter = () => {
    filesDragCounter++;
    isFilesDragOver.value = true;
};

const onFilesDragLeave = () => {
    filesDragCounter = Math.max(0, filesDragCounter - 1);
    if (filesDragCounter === 0) isFilesDragOver.value = false;
};

const onFilesDrop = (e: DragEvent) => {
    filesDragCounter = 0;
    isFilesDragOver.value = false;
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) uploadFiles(files);
};

// Ouvre le fichier en grand (images, vidéos, audio, PDF, texte : FileViewer).
const openFile = async (tile: FileTile) => {
    try {
        const res = await sfetch(`/api/cdn/meta/${tile.fileId}`);
        if (!res.ok) throw new Error();
        viewingTile = tile;
        viewingFile.value = await res.json();
    } catch (e) {
        toast.show('Impossible de charger le fichier', 'error');
    }
};

const forgetPreview = (fileId: string) => {
    const url = previews.value[fileId];
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    delete previews.value[fileId];
};

const removeAttachmentLocally = (fileId: string) => {
    props.task.attachments = (props.task.attachments || []).filter(a => a.id !== fileId);
    forgetPreview(fileId);
    notifyTaskUpdated(props.task);
};

const removeLinkedFileLocally = (fileId: string) => {
    props.task.linkedFiles = (props.task.linkedFiles || []).filter(l => l.fileId !== fileId);
    forgetPreview(fileId);
    notifyTaskUpdated(props.task);
};

// « Supprimer » dans FileViewer supprime le fichier réel : pour une pièce
// jointe il quitte la tâche, pour un fichier lié il quitte l'espace (le lien
// disparaît en cascade côté serveur).
const onViewerDeleted = () => {
    if (viewingTile?.kind === 'attachment') removeAttachmentLocally(viewingTile.fileId);
    else if (viewingTile?.kind === 'linked') removeLinkedFileLocally(viewingTile.fileId);
    viewingFile.value = null;
    viewingTile = null;
};

const removeTile = async (tile: FileTile) => {
    try {
        if (tile.kind === 'attachment') {
            const res = await sfetch(`/api/cdn/${tile.fileId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            removeAttachmentLocally(tile.fileId);
        } else {
            const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}/files/${tile.fileId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
            removeLinkedFileLocally(tile.fileId);
        }
    } catch (e) {
        toast.show(tile.kind === 'attachment' ? 'Erreur lors de la suppression du fichier' : 'Erreur lors de la suppression du lien', 'error');
    }
};

const onFileLinked = async (file: StoredFile) => {
    showFilePicker.value = false;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}/files/${file.id}`, { method: 'POST' });
        if (!res.ok) throw new Error();
        const link: TaskLinkedFile = await res.json();
        if (!props.task.linkedFiles) props.task.linkedFiles = [];
        if (!props.task.linkedFiles.some(l => l.fileId === file.id)) props.task.linkedFiles.unshift(link);
        notifyTaskUpdated(props.task);
    } catch (e) {
        toast.show('Erreur lors de la liaison du fichier', 'error');
    }
};

onBeforeUnmount(() => {
    Object.values(previews.value).forEach(url => {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    });
});

// ── Formulaire et enregistrement automatique ───────────────────────────
const editForm = reactive({
    title: '',
    description: '',
    dueDate: '',
    dueTime: '',
    assigneeIds: [] as string[],
    tagIds: [] as string[]
});

type Section = 'date' | 'space' | 'assignees' | 'tags';
const activeSection = ref<Section | null>(null);

const toggleSection = (key: Section) => {
    activeSection.value = activeSection.value === key ? null : key;
    pendingMove.value = null;
    searchSpace.value = '';
};

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle');
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let initializing = false;


function scheduleAutosave() {
    if (initializing) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(performAutosave, 600);
}

watch(editForm, scheduleAutosave, { deep: true });

const performAutosave = async () => {
    autosaveTimer = null;
    if (!editForm.title.trim()) return;
    saveStatus.value = 'saving';
    try {
        let dueDate = null;
        if (editForm.dueDate) {
            const dateStr = editForm.dueDate + (editForm.dueTime ? `T${editForm.dueTime}` : 'T00:00');
            dueDate = new Date(dateStr).toISOString();
        }
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                title: editForm.title,
                description: editForm.description,
                dueDate,
                assigneeIds: editForm.assigneeIds,
                tagIds: editForm.tagIds,
                references: extractReferenceTokens(editForm.description)
            })
        });
        if (res.ok) {
            notifyTaskUpdated(await res.json());
            saveStatus.value = 'saved';
        } else {
            saveStatus.value = 'idle';
        }
    } catch (e) {
        saveStatus.value = 'idle';
        toast.show('Erreur lors de l\'enregistrement', 'error');
    }
};

// Fermer le panneau ne doit pas perdre une modification en attente.
onBeforeUnmount(() => {
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        performAutosave();
    }
});

const dueDateLabel = computed(() => {
    if (!editForm.dueDate) return 'Aucune échéance';
    const d = new Date(editForm.dueDate + 'T00:00:00');
    const label = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
    return editForm.dueTime ? `${label} à ${editForm.dueTime}` : label;
});

// ── Assignés ───────────────────────────────────────────────────────────
const searchAssignee = ref('');

const assigneesLabel = computed(() => {
    const list = props.task.assignees || [];
    if (!list.length) return '';
    const first = String((list[0] as any).name ?? '');
    const name = first.split(' ')[0] || first;
    return list.length === 1 ? first : `${name} et ${list.length - 1} autre${list.length > 2 ? 's' : ''}`;
});

const availableMembers = computed<OrgMember[]>(() => {
    if (!openedOrg.value?.members) return [];
    if (!props.task.spaceId) return openedOrg.value.members;
    const space = openedOrg.value.spaces?.find(s => s.id === props.task.spaceId);
    if (!space) return openedOrg.value.members;
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const filteredMembers = computed<OrgMember[]>(() => {
    const s = searchAssignee.value.trim().toLowerCase();
    if (!s) return availableMembers.value;
    return availableMembers.value.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

// ── Déplacer la tâche : Général ou un espace dont on est membre ─────────
const currentSpaceName = computed(() => {
    if (!props.task.spaceId) return 'Général';
    return props.task.space?.name
        || openedOrg.value?.spaces?.find(s => s.id === props.task.spaceId)?.name
        || 'Espace';
});

const spaceOptions = computed<Array<{ id: string | null; name: string; icon: string }>>(() => {
    const myId = user.value?.id;
    const spaces = (openedOrg.value?.spaces ?? [])
        .filter(s => !myId || s.membersId?.includes(myId))
        .map(s => ({ id: s.id, name: s.name, icon: 'bi bi-grid' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return [{ id: null, name: 'Général', icon: 'bi bi-house' }, ...spaces];
});

const searchSpace = ref('');
const filteredSpaceOptions = computed(() => {
    const q = searchSpace.value.trim().toLowerCase();
    return q ? spaceOptions.value.filter(o => o.name.toLowerCase().includes(q)) : spaceOptions.value;
});

const moving = ref(false);
const pendingMove = ref<{ spaceId: string | null; name: string; removed: Array<{ id: string; name: string }> } | null>(null);

/** Assignés qui ne sont pas membres de l'espace visé (Général : personne). */
const assigneesOutside = (spaceId: string | null) => {
    if (!spaceId) return [];
    const space = openedOrg.value?.spaces?.find(s => s.id === spaceId);
    return (props.task.assignees ?? []).filter(a => !space?.membersId?.includes(a.id)).map(a => ({ id: a.id, name: a.name }));
};

const requestMove = (spaceId: string | null) => {
    const removed = assigneesOutside(spaceId);
    const name = spaceOptions.value.find(o => o.id === spaceId)?.name ?? 'Espace';
    pendingMove.value = { spaceId, name, removed };
    if (removed.length === 0) moveTask(spaceId);
};

const moveTask = async (spaceId: string | null) => {
    if (moving.value) return;
    moving.value = true;
    try {
        const removed = new Set(assigneesOutside(spaceId).map(a => a.id));
        const assigneeIds = (props.task.assignees ?? []).map(a => a.id).filter(id => !removed.has(id));
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ spaceId, assigneeIds })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast.show(err.error || 'Impossible de déplacer la tâche', 'error');
            return;
        }
        const updated = await res.json();
        // Le formulaire suit sans relancer d'enregistrement automatique.
        initializing = true;
        editForm.assigneeIds = assigneeIds;
        await nextTick();
        initializing = false;
        notifyTaskUpdated(updated);
        toast.show(`Tâche déplacée vers « ${pendingMove.value?.name ?? 'Général'} »`, 'success');
        pendingMove.value = null;
        activeSection.value = null;
    } catch {
        toast.show('Impossible de déplacer la tâche', 'error');
    } finally {
        moving.value = false;
    }
};

// ── Sous-tâches ────────────────────────────────────────────────────────
const doneSubtasks = computed(() => (props.task.subtasks || []).filter(st => st.status === 'DONE').length);
const newSubtaskTitle = ref('');
const addingSubtask = ref(false);

const addSubtask = async () => {
    const title = newSubtaskTitle.value.trim();
    if (!title || addingSubtask.value) return;
    addingSubtask.value = true;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({
                title,
                description: null,
                dueDate: null,
                spaceId: props.task.spaceId ?? null,
                assigneeIds: [],
                tagIds: [],
                parentTaskId: props.task.id,
                status: 'TODO',
                references: []
            })
        });
        if (!res.ok) throw new Error('API Error');
        const subtask: Task = await res.json();
        if (!props.task.subtasks) props.task.subtasks = [];
        if (!props.task.subtasks.some(st => st.id === subtask.id)) props.task.subtasks.push(subtask);
        newSubtaskTitle.value = '';
        notifyTaskUpdated(props.task);
    } catch (e) {
        toast.show('Impossible d\'ajouter la sous-tâche', 'error');
    } finally {
        addingSubtask.value = false;
    }
};

const toggleSubtaskStatus = async (subtask: Task) => {
    const newStatus = subtask.status === 'DONE' ? 'TODO' : 'DONE';
    const oldStatus = subtask.status;
    subtask.status = newStatus;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${subtask.id}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus })
        });
        if (!res.ok) {
            subtask.status = oldStatus;
            toast.show('Erreur lors de la mise à jour', 'error');
            return;
        }
        if (newStatus === 'DONE') celebrate();
        notifyTaskUpdated(props.task);
    } catch (e) {
        subtask.status = oldStatus;
        toast.show('Erreur lors de la mise à jour', 'error');
    }
};

const deleteSubtask = async (subtaskId: string) => {
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${subtaskId}`, { method: 'DELETE' });
        if (!res.ok) {
            toast.show('Erreur lors de la suppression', 'error');
            return;
        }
        props.task.subtasks = (props.task.subtasks || []).filter(st => st.id !== subtaskId);
        notifyTaskUpdated(props.task);
    } catch (e) {
        toast.show('Erreur', 'error');
    }
};

// ── Menu « … » : archiver, supprimer ───────────────────────────────────
const menuOpen = ref(false);
const menuEl = ref<HTMLElement | null>(null);
const menuButtonEl = ref<HTMLElement | null>(null);

const onDocumentPointerDown = (e: PointerEvent) => {
    if (!menuOpen.value) return;
    const target = e.target as Node;
    if (menuEl.value?.contains(target) || menuButtonEl.value?.contains(target)) return;
    menuOpen.value = false;
};

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown));

const archiveTask = async () => {
    menuOpen.value = false;
    loading.value = true;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}`, {
            method: 'PUT',
            body: JSON.stringify({ archived: true })
        });
        if (res.ok) {
            toast.show('Tâche archivée', 'success');
            notifyTaskDeleted(props.task.id);
        }
    } catch (e) {
        toast.show('Erreur lors de l\'archivage', 'error');
    } finally {
        loading.value = false;
    }
};

const showDeleteConfirm = ref(false);
const deleting = ref(false);

const confirmDeleteTask = async () => {
    deleting.value = true;
    try {
        const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${props.task.id}`, { method: 'DELETE' });
        if (res.ok) {
            toast.show('Tâche supprimée', 'success');
            showDeleteConfirm.value = false;
            notifyTaskDeleted(props.task.id);
        }
    } catch (e) {
        toast.show('Erreur de suppression', 'error');
    } finally {
        deleting.value = false;
    }
};

// ── Chargement du formulaire ───────────────────────────────────────────
// En fin de script : le watch immédiat lit des refs déclarées plus haut.
// Une autre tâche s'affiche : on recharge le formulaire. Une simple mise à
// jour de la même tâche, elle, ne doit pas écraser ce qu'on est en train de taper.
watch(() => props.task.id, async () => {
    initializing = true;
    if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
    }
    editForm.title = props.task.title;
    editForm.description = props.task.description || '';
    if (props.task.dueDate) {
        const d = new Date(props.task.dueDate);
        editForm.dueDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        editForm.dueTime = (hh === '00' && mm === '00') ? '' : `${hh}:${mm}`;
    } else {
        editForm.dueDate = '';
        editForm.dueTime = '';
    }
    editForm.assigneeIds = props.task.assignees ? props.task.assignees.map(a => a.id) : [];
    editForm.tagIds = props.task.tags ? props.task.tags.map(t => t.id) : [];
    searchAssignee.value = '';
    isEditingTitle.value = false;
    isEditingDescription.value = false;
    activeSection.value = null;
    menuOpen.value = false;
    saveStatus.value = 'idle';
    refreshFiles();
    await nextTick();
    initializing = false;
    if (props.editTitle) startEditTitle();
}, { immediate: true });
</script>

<style scoped>
.prop-row {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: 2.25rem;
    padding: 0 0.5rem;
    margin: 0 -0.5rem;
    border-radius: 0.6rem;
    text-align: left;
    transition: background-color 0.15s;
}
.prop-row:hover,
.prop-row.is-active { background: color-mix(in srgb, var(--text) 6%, transparent); }
.prop-k {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--text2);
}
.prop-v {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    font-size: 0.8rem;
    color: var(--text);
}
.prop-editor {
    margin: 0.25rem 0 0.5rem;
    padding: 0.75rem;
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--text) 5%, transparent);
    border: 1px solid var(--border-color);
}

.section-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text);
}
.section-title > i { color: var(--primary); }

.file-action {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    height: 1.75rem;
    padding: 0 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text2);
    transition: background-color 0.15s, color 0.15s;
}
.file-action:hover { background: color-mix(in srgb, var(--text) 8%, transparent); color: var(--text); }
.file-action:disabled { opacity: 0.5; }

.file-tile {
    position: relative;
    aspect-ratio: 4 / 3;
    border-radius: 0.6rem;
    overflow: hidden;
    border: 1px solid var(--border-color);
    background: var(--bg3);
    cursor: zoom-in;
    transition: border-color 0.15s, transform 0.1s;
}
.file-tile:hover { border-color: color-mix(in srgb, var(--primary) 60%, transparent); }
.file-tile:active { transform: scale(0.98); }
.file-tile:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }

.task-menu-item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    height: 2.1rem;
    padding: 0 0.65rem;
    border-radius: 0.5rem;
    font-size: 0.8rem;
    color: var(--text);
    text-align: left;
    transition: background-color 0.15s;
}
.task-menu-item:hover { background: color-mix(in srgb, var(--text) 8%, transparent); }

.task-menu-enter-active, .task-menu-leave-active { transition: opacity 0.12s, transform 0.12s; }
.task-menu-enter-from, .task-menu-leave-to { opacity: 0; transform: translateY(4px); }
</style>
