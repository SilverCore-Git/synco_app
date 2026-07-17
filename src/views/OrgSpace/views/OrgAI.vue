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
        
        <button 
            @click="showUsersBar = !showUsersBar"
            class="hover:text-(--text) transition-colors ml-2"
            :class="showUsersBar ? 'text-(--text)' : 'text-(--text)/40'"
        >
            <i class="bi bi-people-fill text-lg" />
        </button>
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
      
      <!-- WebGPU Non supporté (Warning) -->
      <div v-if="!localLLM.hasWebGPU.value" class="flex items-center gap-4 bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl mb-2">
        <i class="bi bi-exclamation-triangle text-2xl text-yellow-500"></i>
        <div>
          <h4 class="text-yellow-500 font-bold text-sm">Performances réduites (WebGPU non détecté)</h4>
          <p class="text-xs text-yellow-500/80 mt-1">
            Votre navigateur ne supporte pas l'accélération matérielle (WebGPU). L'agent tentera de s'exécuter sur le processeur (CPU), ce qui sera <b>considérablement plus lent</b>. Pour une expérience optimale, utilisez Google Chrome ou activez WebGPU dans vos paramètres.
          </p>
        </div>
      </div>
      <div v-if="initError" class="flex items-center gap-4 bg-red-500/10 border border-red-500/20 p-4 rounded-xl mb-2">
        <i class="bi bi-x-circle text-2xl text-red-500"></i>
        <div>
          <h4 class="text-red-500 font-bold text-sm">Erreur d'initialisation</h4>
          <p class="text-xs text-red-500/80 mt-1">{{ initError }}</p>
        </div>
      </div>

        <!-- Installation classique -->
      <div v-if="!hasStartedInit" class="flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="text-sm">
          <p class="font-bold text-white/80">Téléchargement initial de Synco AI requis</p>
          <p class="text-white/50 text-xs">Modèle recommandé pour votre matériel : <span class="font-mono text-(--primary)">{{ availableModels.find(m => m.id === selectedModelId)?.name || 'Aucun' }}</span></p>
        </div>
        <div class="flex gap-2">
          <button 
            v-if="!localLLM.hasWebGPU.value || initError"
            @click="startInitCPU" 
            class="bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-500 border border-yellow-500/30 px-5 py-2 rounded-xl text-sm font-bold transition-all active:scale-95"
          >
            Forcer sur le CPU
          </button>
          <button 
            v-if="!initError"
            @click="startInit" 
            class="bg-(--primary) hover:brightness-110 text-white px-5 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            :disabled="!localLLM.hasWebGPU.value"
          >
            <i class="bi bi-cloud-arrow-down-fill"></i>
            Télécharger & Initialiser
          </button>
        </div>
      </div>

      <div v-else class="flex flex-col gap-2">
        <div class="flex items-center justify-between text-xs text-white/50">
          <span class="flex items-center gap-2">
            <i class="bi" :class="[localLLM.downloadProgress.value >= 100 ? 'bi-cpu animate-pulse' : 'bi-cloud-arrow-down animate-bounce', localLLM.isCPUFallback.value ? 'text-yellow-500' : 'text-(--primary)']"></i>
            {{ localLLM.downloadProgress.value >= 100 ? 'Initialisation en mémoire (cela peut prendre du temps)...' : (localLLM.isCPUFallback.value ? 'Téléchargement CPU (très lent)...' : 'Téléchargement et initialisation...') }}
          </span>
          <span class="font-mono">{{ localLLM.downloadProgress.value }}%</span>
        </div>
        <div class="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div class="h-full transition-all duration-300" :class="localLLM.isCPUFallback.value ? 'bg-yellow-500' : 'bg-(--primary)'" :style="{ width: localLLM.downloadProgress.value + '%' }"></div>
        </div>
        <p class="text-[10px] text-white/30 text-center mt-1 font-mono truncate">{{ localLLM.downloadText.value }}</p>
      </div>

    </div>

    <div v-else-if="localLLM.isCPUFallback.value" class="px-4 py-1.5 bg-yellow-500/10 border-t border-yellow-500/20 text-center text-[11px] text-yellow-500/70 font-medium tracking-wide shrink-0 flex justify-center items-center gap-2">
      <i class="bi bi-cpu-fill"></i>
      Exécution sur le CPU (Performances réduites)
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
          @click="isGenerating ? stopGeneration() : sendMessage()"
          class="shrink-0 mb-1 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50"
          :class="isGenerating ? 'text-red-500 hover:text-red-400' : (localLLM.isCPUFallback.value ? 'text-yellow-500 hover:brightness-110' : 'text-(--primary) hover:brightness-110')"
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
import useSettingsItem from '@/composables/useSettingsItem';

const { Item: showUsersBar } = useSettingsItem('showUsersBar', true);

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

const initError = ref('');

const loadModel = async () => {
  if (!selectedModelId.value) return;
  // If the user changes the select, we don't auto load unless they already started once
  if (hasStartedInit.value) {
    initError.value = '';
    try {
      if (localLLM.isCPUFallback.value) {
        await localLLM.initCPU();
      } else {
        await localLLM.init(selectedModelId.value);
      }
    } catch (e: any) {
      console.error("Impossible de charger le modèle", e);
      initError.value = "Erreur WebGPU: " + (e.message || String(e));
      hasStartedInit.value = false;
    }
  }
};

const startInit = async () => {
  if (!selectedModelId.value) return;
  hasStartedInit.value = true;
  initError.value = '';
  try {
    await localLLM.init(selectedModelId.value);
  } catch (e: any) {
    console.error("Impossible d'initialiser le modèle", e);
    initError.value = "Le modèle graphique (WebGPU) n'est pas supporté par votre carte graphique ou navigateur (extension f16 manquante). Veuillez utiliser le processeur (CPU).";
    hasStartedInit.value = false;
  }
};

const startInitCPU = async () => {
  hasStartedInit.value = true;
  initError.value = '';
  try {
    await localLLM.initCPU();
  } catch (e: any) {
    console.error("Impossible d'initialiser le CPU", e);
    initError.value = "Impossible d'initialiser le mode CPU.";
    hasStartedInit.value = false;
  }
};

const stopGeneration = () => {
  if (isGenerating.value) {
    localLLM.interrupt();
    isGenerating.value = false;
  }
};

const sendMessage = async () => {
  if (isGenerating.value) {
    stopGeneration();
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
      if (!isGenerating.value) break;
      messages.value[assistantMsgIndex]!.content += chunk;
      await scrollToBottom();
    }
  } catch (error: any) {
    if (error.message !== "USER_STOPPED" && !String(error).includes("USER_STOPPED")) {
      messages.value[assistantMsgIndex]!.content += `\n\n**Erreur:** ${error.message}`;
    }
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
