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

          <div v-else class="space-y-3">
            <div
              v-for="task in archivedTasks" :key="task.id"
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
                  @click="remove(task)"
                  :disabled="pendingId === task.id"
                  class="text-xs font-bold p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  title="Supprimer définitivement"
                >
                  <i class="bi bi-trash" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { Task } from '@/types/types';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
  isOpen: boolean;
  orgId: string;
  spaceId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
  restored: [task: Task];
  deleted: [taskId: string];
}>();

const toast = useToast();
const loading = ref(false);
const pendingId = ref<string | null>(null);
const archivedTasks = ref<Task[]>([]);

const formatDate = (date?: string | Date | null) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
};

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

const remove = async (task: Task) => {
  if (!confirm(`Supprimer définitivement "${task.title}" ? Cette action est irréversible.`)) return;
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
  }
};

watch(() => props.isOpen, (open) => {
  if (open) load();
});
</script>
