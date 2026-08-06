<template>
  <div class="w-full h-full bg-(--bg) flex flex-col relative overflow-hidden">
    
    <!-- Header -->
    <div class="px-6 py-4 border-b border-(--border-color) flex items-center justify-between shrink-0 bg-(--bg2)">
      <div class="flex items-center gap-3">
        <img src="https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png" alt="Notion" class="w-6 h-6 object-contain invert opacity-80" />
        <h2 class="text-xl font-black text-(--text)">Base de Données Notion</h2>
      </div>
      <button 
        v-if="selectedDatabase" 
        @click="selectedDatabase = null" 
        class="text-xs font-bold bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-(--text2) transition-colors"
      >
        Changer de base
      </button>
    </div>

    <!-- Selection de base de données -->
    <div v-if="!selectedDatabase" class="flex-1 flex flex-col items-center justify-center p-6">
      
      <div v-if="loadingDatabases" class="flex flex-col items-center text-(--text2)">
        <i class="bi bi-arrow-repeat animate-spin text-3xl mb-4"></i>
        <p>Recherche de vos bases de données...</p>
      </div>

      <div v-else-if="databases.length === 0" class="max-w-md w-full text-center p-6 bg-red-500/10 border border-red-500/20 rounded-xl">
        <i class="bi bi-exclamation-triangle text-3xl text-red-400 mb-2"></i>
        <p class="text-red-400 text-sm">Aucune base de données trouvée ou intégration non configurée.</p>
        <p class="text-xs text-red-400/70 mt-2 mb-4">Veuillez vérifier vos paramètres et votre jeton Notion.</p>
        <button @click="showSettings = true" class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold rounded-lg transition-colors text-sm">
          <i class="bi bi-gear-fill mr-1"></i> Configurer l'intégration
        </button>
      </div>

      <div v-else class="max-w-md w-full">
        <h3 class="text-lg font-bold text-(--text) mb-4 text-center">Sélectionnez une base de données</h3>
        <div class="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
          <button 
            v-for="db in databases" 
            :key="db.id"
            @click="selectDatabase(db.id)"
            class="w-full text-left p-4 bg-(--bg2) border border-(--border-color) rounded-xl hover:bg-white/5 hover:border-white/20 transition-all flex items-center gap-3"
          >
            <i class="bi bi-table text-(--text2)"></i>
            <span class="font-medium text-(--text) flex-1 truncate">{{ db.title }}</span>
            <i class="bi bi-chevron-right text-(--text2) text-xs"></i>
          </button>
        </div>
      </div>

    </div>

    <!-- Affichage de la base -->
    <div v-else class="flex-1 overflow-auto bg-(--bg)">
      
      <div v-if="loadingQuery" class="flex flex-col items-center justify-center h-full text-(--text2)">
        <i class="bi bi-arrow-repeat animate-spin text-3xl mb-4"></i>
        <p>Chargement des données...</p>
      </div>

      <div v-else-if="rows.length === 0" class="flex flex-col items-center justify-center h-full text-(--text2)">
        <i class="bi bi-table text-4xl mb-4 opacity-50"></i>
        <p>Cette base de données est vide.</p>
      </div>

      <div v-else class="min-w-max p-6">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr>
              <th v-for="prop in propertiesKeys" :key="prop" class="px-4 py-2 border-b border-(--border-color) text-xs font-bold uppercase tracking-widest text-(--text2) whitespace-nowrap bg-(--bg) sticky top-0 z-10">
                {{ prop }}
              </th>
              <th class="px-4 py-2 border-b border-(--border-color) bg-(--bg) sticky top-0 z-10"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="border-b border-(--border-color)/50 hover:bg-white/5 transition-colors group">
              <td v-for="prop in propertiesKeys" :key="prop" class="px-4 py-3 align-top max-w-[250px] truncate">
                <component :is="renderProperty(row.properties[prop])" />
              </td>
              <td class="px-4 py-3 align-top text-right">
                <a :href="row.url" target="_blank" class="text-(--text2) hover:text-(--primary) opacity-0 group-hover:opacity-100 transition-all p-2 inline-block">
                  <i class="bi bi-box-arrow-up-right"></i>
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <!-- Modale de configuration -->
    <UserSettings 
      :isOpen="showSettings" 
      initialTab="integrations" 
      @close="onSettingsClose" 
    />

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, h } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import UserSettings from '@/components/windows/UserSettings.vue';

const toast = useToast();

const databases = ref<any[]>([]);
const loadingDatabases = ref(false);
const showSettings = ref(false);

const selectedDatabase = ref<string | null>(null);
const loadingQuery = ref(false);
const rows = ref<any[]>([]);
const propertiesKeys = ref<string[]>([]);

const loadDatabases = async () => {
  loadingDatabases.value = true;
  try {
    const res = await sfetch('/api/integrations/notion/databases');
    if (res.ok) {
      const data = await res.json();
      databases.value = data.databases || [];
    }
  } catch(e) {}
  loadingDatabases.value = false;
};

onMounted(() => {
  loadDatabases();
});

const onSettingsClose = () => {
  showSettings.value = false;
  // Recharge les bases au cas où l'utilisateur a configuré son jeton
  if (!selectedDatabase.value) {
    loadDatabases();
  }
};

const selectDatabase = async (id: string) => {
  selectedDatabase.value = id;
  loadingQuery.value = true;
  rows.value = [];
  propertiesKeys.value = [];

  try {
    const res = await sfetch(`/api/integrations/notion/databases/${id}/query`, {
      method: 'POST',
      body: JSON.stringify({})
    });

    if (res.ok) {
      const data = await res.json();
      rows.value = data.results || [];
      if (rows.value.length > 0) {
        // Extraire les clés de propriétés de la première ligne
        propertiesKeys.value = Object.keys(rows.value[0].properties).sort((a, b) => {
            // Mettre la propriété "title" en premier
            const typeA = rows.value[0].properties[a].type;
            const typeB = rows.value[0].properties[b].type;
            if (typeA === 'title') return -1;
            if (typeB === 'title') return 1;
            return 0;
        });
      }
    } else {
      toast.show("Erreur lors du chargement de la base", "error");
      selectedDatabase.value = null;
    }
  } catch (e) {
    toast.show("Erreur réseau", "error");
    selectedDatabase.value = null;
  }
  loadingQuery.value = false;
};

// Fonction de rendu dynamique pour les propriétés Notion
const renderProperty = (prop: any) => {
  if (!prop) return h('span', { class: 'text-xs text-white/30' }, '-');

  switch (prop.type) {
    case 'title':
    case 'rich_text':
      const text = prop[prop.type].map((t: any) => t.plain_text).join('');
      return h('span', { class: prop.type === 'title' ? 'font-bold text-sm text-white truncate block w-full' : 'text-xs text-white/80 line-clamp-2 w-full whitespace-normal' }, text || '-');
      
    case 'select':
      if (!prop.select) return h('span', { class: 'text-xs text-white/30' }, '-');
      return h('span', { class: `px-2 py-0.5 rounded text-[10px] font-bold bg-${prop.select.color}-500/20 text-${prop.select.color}-400` }, prop.select.name);
      
    case 'multi_select':
      if (!prop.multi_select || prop.multi_select.length === 0) return h('span', { class: 'text-xs text-white/30' }, '-');
      return h('div', { class: 'flex flex-wrap gap-1' }, prop.multi_select.map((s: any) => 
        h('span', { class: `px-1.5 py-0.5 rounded text-[10px] font-bold bg-${s.color}-500/20 text-${s.color}-400 whitespace-nowrap` }, s.name)
      ));
      
    case 'date':
      if (!prop.date) return h('span', { class: 'text-xs text-white/30' }, '-');
      const d = new Date(prop.date.start);
      return h('span', { class: 'text-xs text-white/80' }, d.toLocaleDateString());
      
    case 'checkbox':
      return h('i', { class: prop.checkbox ? 'bi bi-check-square-fill text-green-500' : 'bi bi-square text-white/20' });
      
    case 'people':
      if (!prop.people || prop.people.length === 0) return h('span', { class: 'text-xs text-white/30' }, '-');
      return h('div', { class: 'flex -space-x-1' }, prop.people.map((p: any) => 
        h('img', { 
            src: p.avatar_url || `https://ui-avatars.com/api/?name=${p.name || '?'}&background=random`, 
            class: 'w-5 h-5 rounded-full border border-(--bg) bg-white/10' ,
            title: p.name
        })
      ));
      
    default:
      return h('span', { class: 'text-[10px] text-white/40' }, `[${prop.type}]`);
  }
};
</script>
