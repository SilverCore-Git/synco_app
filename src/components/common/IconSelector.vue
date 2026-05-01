<template>

  <div class="relative p-2 bg-(--bg2) rounded-2xl z-110 w-100 h-100 flex flex-col gap-2 border border-white/5" v-if="!loading">

    <div class="flex gap-2 p-1 bg-(--bg2)/20 rounded-xl border border-white/5">
      <input 
        type="text"
        class="outline-none w-full p-1"
        placeholder="Lune, logo, fusée..."
        v-model="search"
      />
    </div>

    <div class="flex gap-2 p-1 bg-(--bg2)/20 rounded-xl border border-white/5">
      <button 
        v-for="tab in ['Emojis', 'Icons' ]" 
        :key="'tab-' + tab"
        @click="activeTab = tab"
        type="button"
        :class="['flex-1 py-1.5 text-xs rounded-lg transition-all', activeTab === tab ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60']"
      >
        {{ tab }}
      </button>
    </div>

    <div 
      v-if="activeTab === 'Emojis'"
      class="flex gap-2 p-1 bg-(--bg2)/20 rounded-xl border border-white/5"
    >
      <button 
        v-for="tab in emojisGroups"
        :key="'tab-Emojis-group-' + tab"
        @click="activeGroup = tab"
        type="button"
        :class="['flex-1 py-1.5 text-xs rounded-lg transition-all', activeGroup === tab ? 'bg-white/10 text-white shadow-sm' : 'text-white/40 hover:text-white/60']"
      >
        {{ getEmojiByCategory(tab) }}
      </button>
    </div>
        
    <div v-if="activeTab == 'Emojis'" class="flex-1 overflow-y-auto">

      <div class="grid grid-cols-6 gap-2 h-full ">

        <button 
          v-for="item in currentList" 
          :key="item.slug"
          @click="updateValue(activeTab === 'Emojis' ? item.codePoint : item)"
          type="button"
          class="
            w-10 h-10 flex items-center justify-center 
            rounded-lg hover:bg-(--primary)/20 
            hover:border-(--primary)/30 
            border border-transparent transition-all
          "
          :class="selectedIcon == (item.codePoint) ? 'bg-(--primary)/20' : ''"
        >
          <span class="text-2xl">{{ item.character || item }}</span>
        </button>

      </div>

    </div>

    <div v-else class="flex-1">

      <input 
            type="file" 
            ref="fileInput" 
            accept="image/*" 
            @change="onFileChange" 
            style="display: none"
      />
      
      <button 
        @click="triggerFileSelect()" 
        class="primary w-full"
        :class="imgLoading ? 'loader' : ''"
      >
        Sélectionner une image
      </button>

    </div>

  </div>

</template>

<script setup lang="ts">

import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import { ref, computed, onMounted } from 'vue';

const props = defineProps<{
  modelValue: string
}>();

const emit = defineEmits(['update:modelValue']);
const toast = useToast();

const activeTab = ref('Emojis');
const bootstrapIcons = ref<string[]>([]);
const emojis = ref<any[]>([]);
const emojisGroups = ref<string[]>([]);
const activeGroup = ref<string>("");
const search = ref<string>("");
const selectedIcon = ref<string>("");
const loading = ref<boolean>(true);
const imgLoading = ref<boolean>(false);
const fileInput = ref<HTMLInputElement | null>(null);


const triggerFileSelect = () => {
  fileInput.value?.click();
};

const onFileChange = async (event: Event) => {

    imgLoading.value = true;
    const target = event.target as HTMLInputElement;

    if (target.files && target.files[0]) 
    {
        const file = target.files[0];

        if (file.size > 10 * 1024 * 1024) 
        {
            toast.show("L'image est trop lourde (max 10Mo)", 'error');
            imgLoading.value = false;
            return;
        }

        const reader = new FileReader();

        reader.onload = async (e) => {

            const result = e.target?.result as string;
            const formData = new FormData();

            const response = await fetch(result);
            const blob = await response.blob();

            formData.append('file', blob, `${window.crypto.randomUUID()}.jpg`);

            const res = await sfetch(`/api/cdn/upload/orgIcons`, {
                method: "POST",
                body: formData
            })

            const data = await res.json();

            if (res.ok)
            {
                selectedIcon.value = data.url;
                updateValue(data.url);
                toast.show("Image upload avec succès", 'success');
            }
            else            {
                toast.show("Erreur upload image", 'error');
            }

        };

        reader.readAsDataURL(file);
    }
};


const currentList = computed(() => {

  const query = search.value.toLowerCase().trim();

  if (activeTab.value === 'Icons') 
  {

    if (!query) 
    {
      return bootstrapIcons.value.slice(0, 150);
    }

    return bootstrapIcons.value.filter(icon => 
      icon.toLowerCase().includes(query)
    );

  }
  
  if (activeTab.value === 'Emojis') 
  {

    if (!emojis.value.length) return [];

    if (!query) 
    {
      return emojis.value.filter(emoji => emoji.group === activeGroup.value);
    } 
    else {
      return emojis.value
        .filter(emoji => emoji.unicodeName.toLowerCase().includes(query))
        .slice(0, 200);
    }

  }

  return [];

});;


const updateValue = (val: string) => {

  selectedIcon.value = val;

  const Valval = 
    activeTab.value === 'Emojis' 
      ? `https://openmoji.org/data/color/svg/${val}.svg` 
      : selectedIcon.value;

  emit('update:modelValue', Valval);

};

const getEmojiByCategory = (category: string): string => {
  const found = emojis.value.find(emoji => emoji.group === category);
  return found ? found.character : '⏳'; 
}

onMounted(async () => {
  
  loading.value = true;

  try {

    // const key = import.meta.env.VITE_EMOJI_API_KEY;
    
    // const groupsRes = await fetch(`https://emoji-api.com/categories?access_key=${key}`);
    // const groupsData = await groupsRes.json();
    // emojisGroups.value = groupsData.map((g: any) => g.slug);
    // activeGroup.value = emojisGroups.value[0] || '';

    // const emojiRes = await fetch(`https://emoji-api.com/emojis?access_key=${key}`);
    // emojis.value = await emojiRes.json();

    const res = await fetch('https://raw.githubusercontent.com/twbs/icons/main/font/bootstrap-icons.json');
    const data = await res.json();
    bootstrapIcons.value = Object.keys(data).map(name => `bi-${name}`);

  } 
  catch (e) {
    console.error("Erreur API Emoji", e);
  } 
  finally {
    loading.value = false;
  }

});

</script>
