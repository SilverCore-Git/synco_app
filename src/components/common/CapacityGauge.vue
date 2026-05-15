<template>

    <div class="w-full p-4 bg-(--bg2) border border-white/5 rounded-2xl shadow-xl flex flex-col gap-3">
        
        <div class="flex items-center justify-between">

            <div class="flex items-center gap-2">
                <div class="p-2 rounded-lg bg-(--primary)/10 text-(--primary)">
                    <i :class="icon ? icon : 'hidden'" class="bi text-sm" />
                </div>
                <div class="flex flex-col">
                <span class="text-xs font-bold text-(--text) uppercase tracking-wider">
                    {{ title }}
                </span>
                <span class="text-[10px] text-(--text)/40 font-medium">
                    {{ used }} / {{ max }} {{ unit }}
                </span>
                </div>
            </div>
            
            <span 
                class="text-xs font-black px-2 py-1 rounded-md transition-colors duration-500"
                :class="statusClasses.badge"
            >
                {{ percentage }}%
            </span>

        </div>

        <div class="relative w-full h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5">
            
            <div 
                class="h-full rounded-full transition-all duration-1000 ease-out bg-gradient-to-r"
                :class="statusClasses.bar"
                :style="{ width: `${percentage}%` }"
            />

        </div>

        <div class="flex items-center gap-1.5 px-0.5 mt-0.5">

            <span class="relative flex h-1.5 w-1.5">
                <span 
                    class="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                    :class="statusClasses.dot"
                />
                <span 
                    class="relative inline-flex rounded-full h-1.5 w-1.5"
                    :class="statusClasses.dot"
                />
            </span>

            <span class="text-[9px] font-medium tracking-wide text-(--text)/40 uppercase">
                {{ statusClasses.message }}
            </span>

        </div>

    </div>

</template>

<script setup lang="ts">

import { computed } from 'vue';


const props = defineProps<{
    title?: string;
    used: number;
    max: number;
    unit: string;
    icon?: string;
}>();

const percentage = computed(() => {
  if (props.max <= 0) return 0;
  const calc = Math.round((props.used / props.max) * 100);
  return Math.min(Math.max(calc, 0), 100);
});

const statusClasses = computed(() => {

  const p = percentage.value;
  
  if (p >= 85) {
    return {
      bar: 'from-red-500 to-rose-600 shadow-[0_0_12px_rgba(239,68,68,0.4)]',
      badge: 'bg-red-500/10 text-red-500',
      dot: 'bg-red-500',
      message: 'Surcharge critique imminent'
    };
  }
  
  if (p >= 60) {
    return {
      bar: 'from-amber-400 to-orange-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]',
      badge: 'bg-amber-500/10 text-amber-500',
      dot: 'bg-amber-500',
      message: 'Capacité modérée'
    };
  }
  
  return {
    bar: 'from-green-400 to-(--primary) shadow-[0_0_12px_rgba(18,138,96,0.3)]',
    badge: 'bg-green-500/10 text-green-400',
    dot: 'bg-green-500',
    message: 'Utilisation optimale'
  };

});

</script>