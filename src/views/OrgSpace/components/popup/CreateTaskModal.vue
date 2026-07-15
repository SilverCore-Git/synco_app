<template>
    <div @click.stop="openModal" class="cursor-pointer">
        <slot />
    </div>

    <Popup :is-open="isOpen" @close="closeModal">
        <template #title>Nouvelle Tâche</template>

        <form @submit.prevent="handleSubmit" class="space-y-5 min-w-[300px] sm:min-w-[400px]">
            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Titre de la tâche
                </label>
                <input 
                    v-model="form.title"
                    type="text" 
                    placeholder="Qu'y a-t-il à faire ?"
                    ref="titleInput"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                    required
                />
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Description (optionnel)
                </label>
                <textarea 
                    v-model="form.description"
                    placeholder="Plus de détails..."
                    rows="3"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all resize-none
                    "
                    :disabled="loading"
                ></textarea>
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Date d'échéance (optionnel)
                </label>
                <input 
                    v-model="form.dueDate"
                    type="datetime-local" 
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) placeholder:text-(--text)/20 
                        focus:outline-none focus:border-(--primary)/50 focus:ring-1
                        focus:ring-(--primary)/20 transition-all
                    "
                    :disabled="loading"
                />
            </div>

            <div class="flex flex-col gap-2" v-if="!hideSpaceSelect">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Projet
                </label>
                <select 
                    v-model="form.spaceId"
                    class="
                        w-full bg-(--bg2)/30 border border-white/10 rounded-xl 
                        px-4 py-3 text-(--text) 
                        focus:outline-none focus:border-(--primary)/50 transition-all
                    "
                    :disabled="loading"
                >
                    <option :value="null">Tâche personnelle (Général)</option>
                    <option v-for="space in openedOrg?.spaces || []" :key="space.id" :value="space.id">
                        {{ space.name }}
                    </option>
                </select>
            </div>

            <div class="flex flex-col gap-2">
                <label class="text-xs font-bold text-(--text)/60 uppercase tracking-wider">
                    Assignation (Multiples)
                </label>
                <div class="bg-(--bg2)/30 border border-white/10 rounded-xl p-3 max-h-40 overflow-y-auto space-y-2">
                    <label v-for="member in availableMembers" :key="member.id" class="flex items-center gap-3 cursor-pointer group">
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
                                {{ (member.user?.name || member.userId).substring(0, 2).toUpperCase() }}
                            </div>
                            <span class="text-sm font-medium text-(--text) group-hover:text-white transition-colors">
                                {{ member.user?.name || member.userId }}
                            </span>
                        </div>
                    </label>
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
import { useRoute } from 'vue-router';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
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
    spaceId: props.defaultSpaceId || null as string | null,
    assigneeIds: user.value?.id ? [user.value.id] : [] as string[]
});

const availableMembers = computed<OrgMember[]>(() => {
    if (!openedOrg.value?.members) return [];
    if (!form.spaceId) {
        return openedOrg.value.members;
    }
    const space = openedOrg.value.spaces?.find(s => s.id === form.spaceId);
    if (!space) return openedOrg.value.members;
    return openedOrg.value.members.filter(m => space.membersId.includes(m.userId));
});

const openModal = () => {
    isOpen.value = true;
    form.title = '';
    form.description = '';
    form.dueDate = '';
    form.spaceId = props.defaultSpaceId || null;
    form.assigneeIds = user.value?.id ? [user.value.id] : [];
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

        const payload = {
            title: form.title,
            description: form.description || null,
            dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
            spaceId: form.spaceId,
            assigneeIds: form.assigneeIds,
            parentTaskId: props.parentTaskId || null,
            status: 'TODO'
        };

        const res = await sfetch(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const task = await res.json();
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
