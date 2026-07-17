<template>
  <div class="h-full flex flex-col w-full relative">
    
    <!-- Header / Model Selection -->
    <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-white/5 bg-(--bg2) z-10 shrink-0">
      <div class="flex items-center gap-3">
        <MobileBackBtn />
        <i class="bi bi-robot text-xl text-(--text)"></i>
        <h3 class="font-semibold text-(--text)">Synco AI</h3>
      </div>

      <div class="flex items-center gap-3">
        <div class="text-xs text-right mr-2 hidden md:block">
          <p class="text-white/40 mb-0.5">Modèle actuel :</p>
          <p class="font-mono text-white/70">{{ localLLM.currentModel.value?.name || 'Aucun' }}</p>
        </div>
        
        <select 
          v-model="selectedModelId"
          @change="loadModel"
          class="bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-(--primary) transition-colors"
        >
          <option v-for="model in availableModels" :key="model.id" :value="model.id">
            Tier {{ model.tier }} - {{ model.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Chat Area -->
    <div class="flex-1 overflow-y-auto p-6 space-y-6 flex flex-col w-full max-w-5xl mx-auto" ref="chatContainer">
      
      <!-- Welcome Message -->
      <div v-if="messages.length === 0" class="flex-1 flex flex-col items-center justify-center text-center opacity-50">
        <i class="bi bi-cpu text-6xl mb-4 text-(--primary) opacity-50"></i>
        <h3 class="text-xl font-bold mb-2">Bonjour, je suis Synco AI.</h3>
        <p class="max-w-md text-sm">Je tourne entièrement en local sur votre machine. Posez-moi vos questions, demandez-moi d'analyser vos ressources ou de rédiger des textes, le tout en préservant 100% de votre vie privée.</p>
      </div>

      <!-- Messages -->
      <div 
        v-for="(msg, index) in messages" 
        :key="index"
        class="flex w-full"
        :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
      >
        <div 
          class="max-w-[75%] rounded-2xl p-4 text-sm leading-relaxed"
          :class="msg.role === 'user' ? 'bg-(--primary)/20 text-white border border-(--primary)/30 rounded-tr-sm' : 'bg-white/5 border border-white/10 rounded-tl-sm font-mono'"
        >
          <div class="flex items-center gap-2 mb-2 opacity-50 text-[10px] uppercase font-bold tracking-wider">
            <i :class="msg.role === 'user' ? 'bi-person' : 'bi-robot'"></i>
            {{ msg.role === 'user' ? 'Vous' : 'Synco AI' }}
          </div>
          <div v-html="formatMessage(msg.content)" class="prose prose-invert max-w-none prose-sm"></div>
        </div>
      </div>
    </div>

    <!-- Loading / Status Bar / Manual Start -->
    <div v-if="!localLLM.isInitialized.value" class="px-6 py-4 border-t border-white/5 bg-black/20 flex flex-col gap-3 shrink-0">
      
      <!-- WebGPU Non supporté -->
      <div v-if="!localLLM.hasWebGPU.value" class="flex items-center gap-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
        <i class="bi bi-exclamation-triangle text-2xl text-red-400"></i>
        <div>
          <h4 class="text-red-400 font-bold text-sm">Navigateur Incompatible (WebGPU manquant)</h4>
          <p class="text-xs text-red-400/70 mt-1">
            Synco AI nécessite l'API WebGPU pour s'exécuter localement. Cette fonctionnalité est désactivée par défaut sur Linux ou sur les anciens navigateurs. 
            Veuillez activer le flag expérimental WebGPU dans votre navigateur pour continuer.
          </p>
        </div>
      </div>

      <!-- Installation classique -->
      <template v-else>
        <div v-if="!hasStartedInit" class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="text-sm">
          <p class="font-bold text-white/80">Téléchargement initial de Synco AI requis</p>
          <p class="text-white/50 text-xs">Modèle recommandé pour votre matériel : <span class="font-mono text-(--primary)">{{ availableModels.find(m => m.id === selectedModelId)?.name || 'Aucun' }}</span></p>
        </div>
        <button 
          @click="startInit" 
          class="bg-(--primary) hover:brightness-110 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
        >
          <i class="bi bi-cloud-arrow-down-fill"></i>
          Télécharger & Initialiser
        </button>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs text-white/50">
          <span class="flex items-center gap-2">
            <i class="bi bi-cloud-arrow-down animate-bounce text-(--primary)"></i>
            Téléchargement et initialisation... (Ne fermez pas la page)
          </span>
          <span class="font-mono">{{ localLLM.downloadProgress.value }}%</span>
        </div>
        <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: localLLM.downloadProgress.value + '%' }"></div>
        </div>
        <p class="text-[10px] text-white/30 text-center mt-1 font-mono truncate">{{ localLLM.downloadText.value }}</p>
      </div>
      </template>

    </div>

    <div class="p-1 border-t border-white/5 shrink-0 relative">
      <form @submit.prevent="sendMessage" class="relative ml-0 lg:ml-60 w-full lg:w-[calc(100%-240px)] flex items-end gap-3 mx-auto lg:mx-0 bg-(--bg) border border-white/10 rounded-xl px-4 py-2 focus-within:border-(--primary)/50 transition-all shadow-2xl">
        
        <ThreadTextarea 
          v-model="inputMsg"
          placeholder="Demandez-moi n'importe quoi..."
          @send="sendMessage"
        />
        
        <button 
          type="button"
          @click="isGenerating ? null : sendMessage()"
          class="shrink-0 mb-1 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
          :class="isGenerating ? 'text-red-500 hover:text-red-400' : 'text-(--primary) hover:brightness-110'"
          :disabled="!localLLM.isInitialized.value || (!inputMsg.trim() && !isGenerating)"
        >
          <i :class="isGenerating ? 'bi-stop-fill text-xl' : 'bi-send-fill text-xl'"></i>
        </button>

      </form>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { localLLM, availableModels } from '@/services/LocalLLMService';
import ThreadTextarea from '../components/common/ThreadTextarea.vue';
import MobileBackBtn from '@/components/common/MobileBackBtn.vue';

// On utilise marked pour le formatage, ou simplement un remplacement basique pour l'instant
const formatMessage = (text: string) => {
  return text.replace(/\n/g, '<br>').replace(/```([\s\S]*?)```/g, '<pre class="bg-black/50 p-3 rounded-lg border border-white/10 overflow-x-auto my-2"><code>$1</code></pre>');
};

const selectedModelId = ref<string>('');
const isGenerating = ref(false);
const hasStartedInit = ref(false);
const inputMsg = ref('');
const messages = ref<{role: 'user'|'assistant', content: string}[]>([]);
const chatContainer = ref<HTMLElement | null>(null);

const scrollToBottom = async () => {
  await nextTick();
  if (chatContainer.value) {
    chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
  }
};

const loadModel = async () => {
  if (!selectedModelId.value) return;
  // If the user changes the select, we don't auto load unless they already started once
  if (hasStartedInit.value) {
    try {
      await localLLM.init(selectedModelId.value);
    } catch (e) {
      console.error("Impossible de charger le modèle", e);
    }
  }
};

const startInit = async () => {
  if (!selectedModelId.value) return;
  hasStartedInit.value = true;
  try {
    await localLLM.init(selectedModelId.value);
  } catch (e) {
    console.error("Impossible d'initialiser le modèle", e);
  }
};

const sendMessage = async () => {
  if (isGenerating.value) {
    // Bouton stop (à implémenter si besoin via AbortController)
    return;
  }

  const text = inputMsg.value.trim();
  if (!text || !localLLM.isInitialized.value) return;

  inputMsg.value = '';
  messages.value.push({ role: 'user', content: text });
  
  const assistantMsgIndex = messages.value.length;
  messages.value.push({ role: 'assistant', content: '' });
  
  isGenerating.value = true;
  await scrollToBottom();

  try {
    const generator = await localLLM.chat(messages.value.slice(0, -1) as any); // On envoie l'historique
    for await (const chunk of generator) {
      messages.value[assistantMsgIndex]!.content += chunk;
      await scrollToBottom();
    }
  } catch (error: any) {
    messages.value[assistantMsgIndex]!.content = `**Erreur:** ${error.message}`;
  } finally {
    isGenerating.value = false;
  }
};

onMounted(async () => {
  if (!localLLM.isInitialized.value) {
    const recommended = await localLLM.getRecommendedModel();
    selectedModelId.value = recommended.id;
  } else {
    hasStartedInit.value = true;
    selectedModelId.value = localLLM.currentModel.value?.id || '';
  }
});
</script>
