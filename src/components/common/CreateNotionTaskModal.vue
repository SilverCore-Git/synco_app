<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="transform scale-95 opacity-0"
    enter-to-class="transform scale-100 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="transform scale-100 opacity-100"
    leave-to-class="transform scale-95 opacity-0"
  >
    <div v-if="show" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4" @click="emit('close')">
      <div class="bg-(--bg) rounded-2xl border border-white/10 shadow-2xl max-w-md w-full overflow-hidden" @click.stop>
        
        <div class="flex items-center px-6 py-4 border-b border-(--border-color) justify-between bg-(--bg2)">
            <div class="flex items-center gap-3">
                <img src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" class="w-6 h-6 object-contain invert opacity-80" />
                <h2 class="text-lg font-black text-(--text)">Créer une tâche Notion</h2>
            </div>
            <button @click="emit('close')" class="text-(--text2) hover:text-(--text) p-1 transition-colors">
                <i class="bi bi-x-lg text-xl" />
            </button>
        </div>

        <div class="p-6 space-y-5">
            <div v-if="loadingDatabases" class="flex flex-col items-center py-6 text-(--text2)">
                <i class="bi bi-arrow-repeat animate-spin text-2xl mb-2"></i>
                <span class="text-sm">Chargement de vos bases de données...</span>
            </div>
            
            <div v-else-if="error" class="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
                {{ error }}
            </div>

            <template v-else>
                <div class="space-y-1.5">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Base de données cible</label>
                    <select 
                        v-model="selectedDatabase"
                        class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all cursor-pointer"
                    >
                        <option value="" disabled>Sélectionner une base Notion</option>
                        <option v-for="db in databases" :key="db.id" :value="db.id">
                            {{ db.title }}
                        </option>
                    </select>
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Titre de la tâche</label>
                    <input 
                        type="text" 
                        v-model="taskTitle" 
                        placeholder="Titre de l'action à réaliser..."
                        class="w-full bg-(--bg2) border border-(--border-color) rounded-xl px-4 py-3 text-(--text) focus:outline-none focus:border-(--primary) focus:ring-1 focus:ring-(--primary) transition-all"
                    />
                </div>

                <div class="space-y-1.5">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Description (contenu du message)</label>
                    <div class="w-full bg-white/5 border border-(--border-color) rounded-xl px-4 py-3 text-(--text2) text-sm max-h-32 overflow-y-auto font-mono whitespace-pre-wrap">
                        {{ initialContent }}
                    </div>
                </div>

                <div class="pt-2">
                    <button 
                        @click="createTask"
                        :disabled="!selectedDatabase || !taskTitle || isCreating"
                        class="w-full primary flex items-center justify-center gap-2 py-3"
                    >
                        <i v-if="isCreating" class="bi bi-arrow-repeat animate-spin"></i>
                        <i v-else class="bi bi-box-arrow-up-right"></i>
                        <span>{{ isCreating ? 'Création en cours...' : 'Ajouter à Notion' }}</span>
                    </button>
                </div>
            </template>
        </div>

      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const props = defineProps<{
    show: boolean;
    initialContent: string;
}>();

const emit = defineEmits(['close']);
const toast = useToast();

const databases = ref<any[]>([]);
const selectedDatabase = ref('');
const taskTitle = ref('');
const loadingDatabases = ref(false);
const error = ref<string | null>(null);
const isCreating = ref(false);

const fetchDatabases = async () => {
    loadingDatabases.value = true;
    error.value = null;
    try {
        const res = await sfetch('/api/integrations/notion/databases');
        if (res.ok) {
            const data = await res.json();
            databases.value = data.databases || [];
            if (databases.value.length > 0) {
                selectedDatabase.value = databases.value[0].id;
            } else {
                error.value = "Aucune base de données trouvée. Vérifiez que votre intégration Notion a accès à au moins une base.";
            }
        } else {
            error.value = "Erreur lors de la récupération des bases de données. Avez-vous configuré votre Token Notion dans les paramètres ?";
        }
    } catch (e) {
        error.value = "Erreur réseau.";
    } finally {
        loadingDatabases.value = false;
    }
};

watch(() => props.show, (val) => {
    if (val) {
        // Auto-generate title from content
        const words = props.initialContent.split(' ');
        taskTitle.value = words.slice(0, 8).join(' ') + (words.length > 8 ? '...' : '');
        if (databases.value.length === 0) {
            fetchDatabases();
        }
    }
});

const createTask = async () => {
    if (!selectedDatabase.value || !taskTitle.value) return;
    
    isCreating.value = true;
    try {
        const res = await sfetch('/api/integrations/notion/pages', {
            method: 'POST',
            body: JSON.stringify({
                databaseId: selectedDatabase.value,
                title: taskTitle.value,
                content: props.initialContent
            })
        });

        if (res.ok) {
            const data = await res.json();
            toast.show('Tâche créée dans Notion avec succès', 'success');
            if (data.url) {
                window.open(data.url, '_blank');
            }
            emit('close');
        } else {
            toast.show('Erreur lors de la création de la tâche', 'error');
        }
    } catch (e) {
        toast.show('Erreur réseau', 'error');
    } finally {
        isCreating.value = false;
    }
};
</script>
