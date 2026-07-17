<template>
  <div class="h-full flex flex-col w-full relative">
    
    <!-- Header / Model Selection -->
    <div class="min-h-14 pl-5 px-3 flex items-center justify-between border-b border-white/5 bg-(--bg2) z-10 shrink-0">
      <div class="flex items-center gap-3">
        <i class="bi bi-robot text-xl text-(--primary)"></i>
        <div>
          <h2 class="font-bold text-white leading-tight">Agent IA (Local)</h2>
          <p class="text-[10px] text-(--text)/50">Zéro fuite de données • Exécuté via WebGPU</p>
        </div>
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
        <h3 class="text-xl font-bold mb-2">Bonjour, je suis votre assistant Synco.</h3>
        <p class="max-w-md text-sm">Je tourne entièrement en local sur votre machine. Demandez-moi de créer des ressources, d'interroger la documentation ou de rédiger des textes, le tout en préservant 100% de votre vie privée.</p>
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
            {{ msg.role === 'user' ? 'Vous' : 'Agent IA' }}
          </div>
          <div v-html="formatMessage(msg.content)" class="prose prose-invert max-w-none prose-sm"></div>
        </div>
      </div>
    </div>

    <!-- Loading / Status Bar -->
    <div v-if="!localLLM.isInitialized.value" class="px-6 py-3 border-t border-white/5 bg-black/20 flex flex-col gap-2 z-10 shrink-0">
      <div class="flex items-center justify-between text-xs text-white/50">
        <span class="flex items-center gap-2">
          <i class="bi bi-cloud-arrow-down animate-bounce"></i>
          Téléchargement et initialisation du modèle IA...
        </span>
        <span class="font-mono">{{ localLLM.downloadProgress.value }}%</span>
      </div>
      <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
        <div class="h-full bg-(--primary) transition-all duration-300" :style="{ width: localLLM.downloadProgress.value + '%' }"></div>
      </div>
      <p class="text-[10px] text-white/30 text-center mt-1">{{ localLLM.downloadText.value }}</p>
    </div>

    <!-- Input Area (adjusted for UserCard which is w-75 (~300px) on the left) -->
    <div class="p-4 border-t border-white/5 bg-(--bg2) shrink-0 z-10">
      <form @submit.prevent="sendMessage" class="relative w-1/3 min-w-[300px] max-w-2xl ml-[320px] flex items-end gap-2">
        <textarea 
          v-model="inputMsg"
          rows="1"
          placeholder="Demandez-moi n'importe quoi..."
          class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-(--primary) transition-colors resize-none disabled:opacity-50"
          :disabled="!localLLM.isInitialized.value || isGenerating"
          @keydown.enter.prevent="sendMessage"
        ></textarea>
        
        <button 
          type="submit"
          class="shrink-0 h-[46px] w-[46px] rounded-xl flex items-center justify-center transition-colors disabled:opacity-50"
          :class="isGenerating ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-(--primary) text-white hover:brightness-110'"
          :disabled="!localLLM.isInitialized.value || (!inputMsg.trim() && !isGenerating)"
        >
          <i :class="isGenerating ? 'bi-stop-fill' : 'bi-send-fill'"></i>
        </button>
      </form>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { localLLM, availableModels } from '@/services/LocalLLMService';

// On utilise marked pour le formatage, ou simplement un remplacement basique pour l'instant
const formatMessage = (text: string) => {
  return text.replace(/\n/g, '<br>').replace(/```([\s\S]*?)```/g, '<pre class="bg-black/50 p-3 rounded-lg border border-white/10 overflow-x-auto my-2"><code>$1</code></pre>');
};

const selectedModelId = ref<string>('');
const isGenerating = ref(false);
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
  try {
    await localLLM.init(selectedModelId.value);
  } catch (e) {
    console.error("Impossible de charger le modèle", e);
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
    await loadModel();
  } else {
    selectedModelId.value = localLLM.currentModel.value?.id || '';
  }
});
</script>
