<template>
  <div 
    class="z-100 w-72 sm:w-80 h-96 bg-(--bg) border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-['Outfit',sans-serif] text-white select-none"
    @click.stop
  >
    <div class="p-3 border-b border-white/5 bg-(--bg2) flex items-center gap-2">
      <i class="bi bi-search text-white/40 text-sm pl-1" />
      <input 
        v-model="searchQuery"
        type="text" 
        placeholder="Rechercher un emoji..." 
        class="w-full bg-transparent border-none text-sm text-white/90 placeholder-white/30 focus:outline-none"
      />
      <button 
        v-if="searchQuery" 
        @click="searchQuery = ''"
        class="text-white/40 hover:text-white/70 transition-colors"
      >
        <i class="bi bi-x-circle-fill text-xs" />
      </button>
    </div>

    <div 
      v-if="!searchQuery"
      class="flex justify-between items-center px-3 py-2 bg-(--bg2) border-b border-white/5 text-sm overflow-x-auto no-scrollbar scroll-smooth"
    >
      <button 
        v-for="category in emojiCategories" 
        :key="category.id"
        @click="scrollToCategory(category.id)"
        class="p-1 rounded-lg transition-colors text-xl"
        :class="activeCategory === category.id ? 'text-[#6356e5] bg-[#6356e5]/10' : 'text-white/40 hover:text-white/80'"
        :title="category.name"
      >
        {{ category.icon }}
      </button>
    </div>

    <div 
      ref="scrollContainer"
      @scroll="handleScroll"
      class="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar"
    >
      <div v-if="searchQuery">
        <div v-if="filteredEmojis.length > 0" class="grid grid-cols-7 sm:grid-cols-8 gap-1">
          <button
            v-for="emoji in filteredEmojis"
            :key="emoji"
            @click="selectEmoji(emoji)"
            class="text-2xl p-1.5 rounded-xl hover:bg-white/10 transition-transform active:scale-90 duration-100"
          >
            {{ emoji }}
          </button>
        </div>
        <div v-else class="text-center py-12 text-white/30 text-sm">
          Aucun emoji trouvé 😢
        </div>
      </div>

      <div v-else>
        <div 
          v-for="category in emojiCategories" 
          :key="category.id"
          :id="'cat-' + category.id"
          class="space-y-2 category-section"
        >
          <h3 class="text-xs font-semibold uppercase tracking-wider text-white/40 pl-1 pt-1">
            {{ category.name }}
          </h3>
          <div class="grid grid-cols-7 sm:grid-cols-8 gap-1">
            <button
              v-for="emoji in category.emojis"
              :key="emoji"
              @click="selectEmoji(emoji)"
              class="text-2xl p-1.5 rounded-xl hover:bg-white/10 transition-transform active:scale-90 duration-100"
            >
              {{ emoji }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const emit = defineEmits<{
  (e: 'select', emoji: string): void
}>();

const searchQuery = ref('');
const activeCategory = ref('recent');
const scrollContainer = ref<HTMLElement | null>(null);

// Base de données d'emojis classifiée
const emojiCategories = [
  {
    id: 'smileys',
    name: 'Smileys & Personnes',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', 
      '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳', 
      '😏', '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', 
      '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', 
      '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', 
      '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑', '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', 
      '👻', '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸', '😹', '😻', '😼', '😽', '🙀', '😿', '😾',
      '👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', 
      '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏', '✍️', 
      '💅', '🤳', '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '🧠', '🫀', '🫁', '🦷', '🦴', '👀', 
      '👁️', '👅', '👄', '💋', '🩸'
    ]
  },
  {
    id: 'animals',
    name: 'Animaux & Nature',
    icon: '🐱',
    emojis: [
      '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐽', '🐸', 
      '🐵', '🙈', '🙉', '🙊', '🐒', '🐔', '🐧', '🐦', '🐤', '🐣', '🐥', '🦆', '🦅', '🦉', '🦤', '🦩', 
      '🦚', '🦜', '🐺', '🐗', '🐴', '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🐞', '🐜', '🪰', '🪲', '🪳', 
      '🦂', '🕸️', '🕷️', '🐢', '🐍', '🦎', '🦖', '🦕', '🐙', '🦑', '🦐', '🦞', '🦀', '🐡', '🐠', '🐟', 
      '🐬', '🐳', '🐋', '🦈', '🐊', '🐅', '🐆', '🦓', '🦍', '🦧', '🦣', '🐘', '🦛', '🦏', '🐪', '🐫', 
      '🦒', '🦘', '🦬', '🐃', '🐂', '🐄', '🐎', '🐖', '🐏', '🐑', '🐐', '🦌', '🐕', '🐩', '🐈', '🐈‍⬛', 
      '🪶', '🦅', '🕊️', '🐇', '🦫', '🦔', '🐿️', '🦡', '🦥', '🦦', '🦨', '🦘', '🦡', '🐾', '🐉', '🐲', 
      '🌵', '🎄', '🌲', '🌳', '🌴', '🪵', '🌱', '🌿', '☘️', '🍀', '🎍', '🪴', '🎋', '🍃', '🍂', '🍁', 
      '🍄', '🐚', '🪨', '🌾', '💐', '🌷', '🌹', '🥀', '🌺', '🌸', '🌼', '🌻', '🌞', '🌝', '🌛', '🌜', 
      '🌙', '🪐', '💫', '⭐️', '🌟', '✨', '⚡️', '☄️', '💥', '🔥', '🌪️', '🌈', '☀️', '🌤️', '⛅️', '🌥️', 
      '☁️', '🌦️', '🌧️', '⛈️', '🌩️', '❄️', '☃️', '⛄️', '🌬️', '💨', '💧', '💦', '☔️', '☂️', '🌊', '🌫️'
    ]
  },
  {
    id: 'food',
    name: 'Nourriture & Boisson',
    icon: '🍏',
    emojis: [
      '🍏', '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', 
      '🥝', '🍅', '🍆', '🥑', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🫒', '🧄', '🧅', '🥔', '🍠', 
      '🥐', '🥯', '🍞', '🥖', '🥨', '🧀', '🥚', '🍳', '🧈', '🥞', '🧇', '🥓', '🥩', '🍗', '🍖', '🍔', 
      '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🫔', '🥙', '🧆', '🥚', '🍳', '🥘', '🍲', '🫕', '🥣', '🥗', 
      '🍿', '🧈', '🧂', '🥫', '🍱', '🍘', '🍙', '🍚', '🍛', '🍜', '🍝', '🍠', '🍢', '🍣', '🍤', '🍥', 
      '🥮', '🍡', '🥟', '🥠', '🥡', '🍦', '🍧', '🍨', '🍩', '🍪', '🎂', '🍰', '🧁', '🥧', '🍫', '🍬', 
      '🍭', '🍮', '🍯', '🍼', '🥛', '☕️', '🫖', '🍵', '🍶', '🍾', '🍷', '🍸', '🍹', '🍺', '🍻', '🥂', 
      '🥃', '🥤', '🧋', '🧃', '🧉', '🧊'
    ]
  },
  {
    id: 'activity',
    name: 'Activités & Sports',
    icon: '⚽',
    emojis: [
      '⚽️', '🏀', '🏈', '⚾️', '🥎', '🎾', '🏐', '🏉', '🥏', '🏓', '🏸', '🏒', '🏑', '🥍', '🏏', '🪃', 
      '🥅', '⛳️', '🪁', '🏹', '🎣', '🤿', '🥊', '🥋', '🎽', '🛹', '🛼', '🛷', '⛸️', '🥌', '🎿', '🏂', 
      '🪂', '🏋️', '🤼', '🤸', '⛹️', '🤺', '🤾', '🏌️', '🏇', '🧘', '🏄', '🏊', '🤽', '🚣', '🧗', '🚴', 
      '🚵', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🏵️', '🎗️', '🎫', '🎟️', '🎪', '🤹', '🎭', '🩰', '🎨', 
      '🎬', '🎤', '🎧', '🎼', '🎹', '🥁', '🪘', '🎷', '🎺', '🎸', '🪕', '🎻', '🎲', '♟️', '🎯', '🎳', 
      '🎮', '🎰', '🧩'
    ]
  },
  {
    id: 'objects',
    name: 'Objets',
    icon: '💡',
    emojis: [
      '👑', '🎒', '👓', '🕶️', '🥽', '🥼', '🛟', '🧳', '☂️', '🪞', '💄', '💍', '💼', '📱', '📲', '💻', 
      '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '🕹️', '🗜️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', 
      '📽️', '🎞️', '📞', '📟', '📠', '📺', '📻', '🎙️', '🎚️', '🎛️', '🧭', '⏱️', '⏲️', '⏰', '🕰️', '⌛️', 
      '⏳', '📡', '🔋', '🔌', '💡', '🔦', '🕯️', '🪔', '🧯', '🛢️', '💸', '💵', '💴', '💶', '💷', '🪙', 
      '💰', '💳', '💎', '⚖️', '🪜', '🧰', '🪛', '🔧', '🔨', '⚒️', '🛠️', '⛏️', '🪓', '🪚', '🔬', '🔭', 
      '📡', '💉', '🩸', '💊', '🩹', '🩺', '🚪', '🛗', '🪞', '🪟', '🛏️', '🛋️', '🪑', '🚽', '🪠', '🚿', 
      '🛁', '🪒', '🧴', '🧷', '🧹', '🧺', '🧻', '🧼', '🪣', '🧽', '🔑', '🗝️', '🪤', '📦', '📫', '📦', 
      '📜', '📃', '📄', '📑', '📊', '📈', '📉', '🗒️', '🗓️', '📆', '📅', '🗑️', '📇', '🗃️', '🗳️', '🗄️', 
      '📋', '📁', '📂', '🗂️', '🗞️', '📰', '📓', '📔', '📒', '📕', '📗', '📘', '📙', '📚', '📖', '🔖', 
      '🧷', '🔗', '📎', '🖇️', '📐', '📏', '📌', '📍', '✂️', '🖊️', '🖋️', '✒️', '📝', '✏️', '🔍', '🔎'
    ]
  },
  {
    id: 'flags',
    name: 'Drapeaux',
    icon: '🏁',
    emojis: [
      '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️', '🇦🇨', '🇦🇩', '🇦🇪', '🇦🇫', '🇦🇬', '🇦🇮', '🇦🇱', 
      '🇦🇲', '🇦🇴', '🇦🇶', '🇦🇷', '🇦🇸', '🇦🇹', '🇦🇺', '🇦🇼', '🇦🇽', '🇦🇿', '🇧🇦', '🇧🇧', '🇧🇩', '🇧🇪', '🇧🇫', '🇧🇬', 
      '🇧🇭', '🇧🇮', '🇧🇯', '🇧🇱', '🇧🇲', '🇧🇳', '🇧🇴', '🇧🇶', '🇧🇷', '🇧🇸', '🇧🇹', '🇧🇻', '🇧🇼', '🇧🇾', '🇧🇿', '🇨🇦', 
      '🇨🇨', '🇨🇩', '🇨🇫', '🇨🇬', '🇨🇭', '🇨🇮', '🇨🇰', '🇨🇱', '🇨🇲', '🇨🇳', '🇨🇴', '🇨🇵', '🇨🇷', '🇨🇺', '🇨🇻', '🇨🇼', 
      '🇨🇽', '🇨🇾', '🇨🇿', '🇩🇪', '🇩🇬', '🇩🇯', '🇩🇰', '🇩🇲', '🇩🇴', '🇩🇿', '🇪🇦', '🇪🇨', '🇪🇪', '🇪🇬', '🇪🇭', '🇪🇷', 
      '🇪🇸', '🇪🇹', '🇪🇺', '🇫🇮', '🇫🇯', '🇫🇰', '🇫🇲', '🇫🇴', '🇫🇷', '🇬🇦', '🇬🇧', '🇬🇩', '🇬🇪', '🇬🇫', '🇬🇬', '🇬🇭', 
      '🇬🇮', '🇬🇱', '🇬🇲', '🇬🇳', '🇬🇵', '🇬🇶', '🇬🇷', '🇬🇸', '🇬🇹', '🇬🇺', '🇬🇼', '🇬🇾', '🇭🇰', '🇭🇲', '🇭🇳', '🇭🇷', 
      '🇭🇹', '🇭🇺', '🇮🇨', '🇮🇩', '🇮🇪', '🇮🇱', '🇮🇲', '🇮🇳', '🇮🇴', '🇮🇶', '🇮🇷', '🇮🇸', '🇮🇹', '🇯🇪', '🇯🇲', '🇯🇴', 
      '🇯🇵', '🇰🇪', '🇰🇬', '🇰🇭', '🇰🇮', '🇰🇲', '🇰🇳', '🇰🇵', '🇰🇷', '🇰🇼', '🇰🇾', '🇰🇿', '🇱🇦', '🇱🇧', '🇱🇨', '🇱🇮', 
      '🇱🇰', '🇱🇷', '🇱🇸', '🇱🇹', '🇱🇺', '🇱🇻', '🇱🇾', '🇲🇦', '🇲🇨', '🇲🇩', '🇲🇪', '🇲🇫', '🇲🇬', '🇲🇭', '🇲🇰', '🇲🇱', 
      '🇲🇲', '🇲🇳', '🇲🇴', '🇲🇵', '🇲🇶', '🇲🇷', '🇲🇸', '🇲🇹', '🇲🇺', '🇲🇻', '🇲🇼', '🇲🇽', '🇲🇾', '🇲🇿', '🇳🇦', '🇳🇨', 
      '🇳🇪', '🇳🇫', '🇳🇬', '🇳🇮', '🇳🇱', '🇳🇴', '🇳🇵', '🇳🇷', '🇳🇺', '🇳🇿', '🇴🇲', '🇵🇦', '🇵🇪', '🇵🇫', '🇵🇬', '🇵🇭', 
      '🇵🇰', '🇵🇱', '🇵🇲', '🇵🇳', '🇵🇷', '🇵🇸', '🇵🇹', '🇵🇼', '🇵运行', '🇵🇾', '🇶🇦', '🇷🇪', '🇷🇴', '🇷🇸', '🇷🇺', '🇷🇼', 
      '🇸🇦', '🇸🇧', '🇸🇨', '🇸🇩', '🇸🇪', '🇸🇬', '🇸🇭', '🇸🇮', '🇸🇯', '🇸🇰', '🇸🇱', '🇸🇲', '🇸🇳', '🇸🇴', '🇸🇷', '🇸🇸', 
      '🇸🇹', '🇸🇻', '🇸🇽', '叙', '🇸🇿', '🇹🇦', '🇹🇨', '🇹🇩', '🇹🇫', '🇹🇬', '🇹🇭', '🇹🇯', '🇹🇰', '🇹🇱', '🇹🇲', '🇹🇳', 
      '🇹🇴', '🇹🇷', '🇹🇹', '🇹🇻', '🇹🇼', '🇹🇿', '🇺🇦', '🇺🇬', '🇺🇲', '🇺🇳', '🇺🇸', '🇺🇾', '🇺🇿', '🇻🇦', '🇻🇨', '🇻🇪', 
      '🇻🇬', '🇻🇮', '🇻🇳', '🇻🇺', '🇼🇫', '🇼🇸', '🇽🇰', '🇾🇪', '🇾🇹', '🇿🇦', '🇿🇲', '🇿🇼'
    ]
  }
];

// Combine tous les emojis dans une liste plate pour la recherche
const allEmojisFlat = emojiCategories.flatMap(c => c.emojis);

// Système de filtrage natif (Vue effectue la comparaison de chaînes)
const filteredEmojis = computed(() => {
  if (!searchQuery.value) return [];
  const q = searchQuery.value.trim().toLowerCase();
  return allEmojisFlat.filter(emoji => emoji.includes(q) || q === '');
});

// Émet l'emoji et ferme/réinitialise si nécessaire
const selectEmoji = (emoji: string) => {
  emit('select', emoji);
};

// Scroll fluide vers une catégorie cible
const scrollToCategory = (categoryId: string) => {
  activeCategory.value = categoryId;
  const target = document.getElementById(`cat-${categoryId}`);
  if (target && scrollContainer.value) {
    scrollContainer.value.scrollTo({
      top: target.offsetTop - scrollContainer.value.offsetTop,
      behavior: 'smooth'
    });
  }
};

// Met à jour l'icône de catégorie active lors du défilement manuel
const handleScroll = () => {
  if (!scrollContainer.value || searchQuery.value) return;

  const containerTop = scrollContainer.value.getBoundingClientRect().top;
  const sections = scrollContainer.value.querySelectorAll('.category-section');

  for (const section of sections) {
    const rect = section.getBoundingClientRect();
    if (rect.top - containerTop <= 40 && rect.bottom - containerTop > 40) {
      const id = section.id.replace('cat-', '');
      activeCategory.value = id;
      break;
    }
  }
};
</script>

<style scoped>
/* Scrollbar invisible pour la navigation horizontale */
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Scrollbar stylisée sombre et fine */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(99, 86, 229, 0.4);
}
</style>