<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="transform scale-95 opacity-0"
    enter-to-class="transform scale-100 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="transform scale-100 opacity-100"
    leave-to-class="transform scale-95 opacity-0"
  >
    <div
      v-if="isOpen"
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-(--bg) rounded-2xl border border-white/10 shadow-2xl max-w-xl w-full max-h-[80vh] flex flex-col relative overflow-hidden" @click.stop>

        <!-- Header -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <i class="bi bi-archive-fill text-amber-500 text-lg" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-(--text)">Tâches archivées</h2>
              <p class="text-xs text-(--text2)">{{ archivedTasks.length }} tâche(s) archivée(s)</p>
            </div>
          </div>
          <button @click="$emit('close')" class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-white/5">
            <i class="bi bi-x-lg text-xl" />
          </button>
        </header>

        <!-- Main -->
        <main class="flex-1 overflow-y-auto p-6">
          <div v-if="loading" class="flex justify-center py-12">
            <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <div v-else-if="archivedTasks.length === 0" class="py-16 flex flex-col items-center justify-center text-(--text2)">
            <i class="bi bi-archive text-5xl mb-4 opacity-50" />
            <p class="text-sm font-medium">Aucune tâche archivée pour le moment.</p>
          </div>

          <template v-else>
            <div class="flex items-center gap-2 mb-5">
              <span class="text-[11px] font-bold text-(--text2) uppercase tracking-wider mr-1">Trier par</span>
              <button
                @click="sortMode = 'date'"
                class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                :class="sortMode === 'date' ? 'bg-(--primary) text-white' : 'bg-white/5 text-(--text2) hover:bg-white/10'"
              >
                <i class="bi bi-calendar3" /> Date
              </button>
              <button
                @click="sortMode = 'folder'"
                class="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
                :class="sortMode === 'folder' ? 'bg-(--primary) text-white' : 'bg-white/5 text-(--text2) hover:bg-white/10'"
              >
                <i class="bi bi-folder2" /> Dossier
              </button>
            </div>

            <div class="space-y-6">
              <div v-for="group in groupedTasks" :key="group.key">
                <div class="flex items-center gap-2 mb-3">
                  <span class="text-[11px] font-black uppercase tracking-widest text-(--text2)">{{ group.label }}</span>
                  <span class="text-[10px] text-(--text2)/60">({{ group.tasks.length }})</span>
                  <div class="flex-1 h-px bg-white/10"></div>
                </div>

                <div class="space-y-3">
                  <div
                    v-for="task in group.tasks" :key="task.id"
                    class="flex items-center justify-between gap-3 p-4 bg-(--bg2)/40 border border-(--border-color) rounded-xl"
                  >
                    <div class="min-w-0">
                      <p class="text-sm font-bold text-(--text) truncate">{{ task.title }}</p>
                      <p class="text-[11px] text-(--text2) mt-0.5">
                        Archivée le {{ formatDate(task.archivedAt) }}
                      </p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <button
                        @click="restore(task)"
                        :disabled="pendingId === task.id"
                        class="text-xs font-bold px-3 py-1.5 rounded-lg bg-(--primary)/10 text-(--primary) hover:bg-(--primary)/20 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <i class="bi bi-arrow-counterclockwise" /> Restaurer
                      </button>
                      <button
                        @click="askRemove(task)"
                        :disabled="pendingId === task.id"
                        class="text-xs font-bold p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title="Supprimer définitivement"
                      >
                        <i class="bi bi-trash" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </main>
      </div>
    </div>
  </transition>

  <ConfirmDelete
    :show="!!taskToRemove"
    item-type="la tâche"
    :item-name="taskToRemove?.title || ''"
    button-text="Supprimer définitivement"
    :loading="!!pendingId"
    @cancel="taskToRemove = null"
    @confirm="remove"
  />
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { Task } from '@/types/types';
import { useToast } from '@/composables/useToast';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';

const props = defineProps<{
  isOpen: boolean;
  orgId: string;
  spaceId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  restored: [task: Task];
  deleted: [taskId: string];
  count: [count: number];
}>();

const toast = useToast();
const loading = ref(false);
const pendingId = ref<string | null>(null);
const archivedTasks = ref<Task[]>([]);
const taskToRemove = ref<Task | null>(null);
const sortMode = ref<'date' | 'folder'>('date');

const formatDate = (date?: string | Date | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

const dayLabel = (date: Date) => {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

type TaskGroup = { key: string; label: string; tasks: Task[] };

const groupedTasks = computed<TaskGroup[]>(() => {
  const sorted = [...archivedTasks.value].sort(
    (a, b) => new Date(b.archivedAt || 0).getTime() - new Date(a.archivedAt || 0).getTime()
  );

  const groups = new Map<string, TaskGroup>();

  if (sortMode.value === 'folder') {
    for (const task of sorted) {
      const key = task.space?.id || '__none__';
      const label = task.space?.name || 'Sans dossier';
      if (!groups.has(key)) groups.set(key, { key, label, tasks: [] });
      groups.get(key)!.tasks.push(task);
    }
    return [...groups.values()].sort((a, b) => {
      if (a.key === '__none__') return 1;
      if (b.key === '__none__') return -1;
      return a.label.localeCompare(b.label, 'fr');
    });
  }

  for (const task of sorted) {
    const date = task.archivedAt ? new Date(task.archivedAt) : null;
    const key = date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : '__unknown__';
    const label = date ? dayLabel(date) : 'Date inconnue';
    if (!groups.has(key)) groups.set(key, { key, label, tasks: [] });
    groups.get(key)!.tasks.push(task);
  }
  return [...groups.values()];
});

const load = async () => {
  loading.value = true;
  try {
    const url = props.spaceId
      ? `/api/tasks/${props.orgId}/spaces/${props.spaceId}/archived`
      : `/api/tasks/${props.orgId}/archived/me`;
    const res = await sfetch(url);
    if (res.ok) {
      const data = await res.json();
      archivedTasks.value = data.archivedTasks;
    }
  } catch (e) {
    toast.show("Erreur chargement des archives", "error");
  } finally {
    loading.value = false;
  }
};

const restore = async (task: Task) => {
  pendingId.value = task.id;
  try {
    const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ archived: false })
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    archivedTasks.value = archivedTasks.value.filter(t => t.id !== task.id);
    emit('restored', updated);
    toast.show('Tâche restaurée', 'success');
  } catch (e) {
    toast.show('Erreur lors de la restauration', 'error');
  } finally {
    pendingId.value = null;
  }
};

const askRemove = (task: Task) => {
  taskToRemove.value = task;
};

const remove = async () => {
  const task = taskToRemove.value;
  if (!task) return;
  pendingId.value = task.id;
  try {
    const res = await sfetch(`/api/tasks/${props.orgId}/tasks/${task.id}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error();
    archivedTasks.value = archivedTasks.value.filter(t => t.id !== task.id);
    emit('deleted', task.id);
    toast.show('Tâche supprimée définitivement', 'success');
  } catch (e) {
    toast.show('Erreur lors de la suppression', 'error');
  } finally {
    pendingId.value = null;
    taskToRemove.value = null;
  }
};

watch(() => props.isOpen, (open) => {
  if (open) load();
});

watch(archivedTasks, (tasks) => {
  emit('count', tasks.length);
}, { deep: false });

onMounted(load);
</script>
