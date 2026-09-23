<template>

  <!-- Pas de wrapper unique ni de DropDown/Teleport ici : ce composant est
       toujours utilisé à l'intérieur d'une rangée flex-wrap (TaskTagPicker),
       elle-même parfois dans une Popup (z-2000) dont le contenu est
       overflow-y-auto (voir Popup.vue). Un panneau flottant/teleporté
       (DropDown.vue) y serait soit invisible sous le fond de la Popup
       (DropDown = z-1000), soit rogné par le scroll — même piège que celui
       déjà contourné dans CreateTaskModal.vue pour ses sections accordéon.
       En root fragment, le panneau (w-full) est un flex-item de la même
       rangée : flex-wrap le pousse tout seul sur sa propre ligne au lieu de
       flotter, sans jamais sortir du flux normal. -->
  <button
    ref="triggerRef"
    type="button"
    @click="open = !open"
    class="w-6 h-6 rounded-full overflow-hidden shrink-0 border border-(--text)/10 shadow-inner"
    :style="{ backgroundColor: modelValue }"
    title="Choisir une couleur personnalisée"
  />

  <Transition name="wheel-pop">
    <div
      v-if="open"
      ref="panelRef"
      class="w-full flex flex-col items-center gap-3 p-3 mt-1 rounded-xl border border-(--border-color) bg-(--bg2)/60"
      @click.stop
    >

      <div class="flex items-center justify-between w-full">
        <span class="text-xs font-bold text-(--text2) uppercase tracking-wider">Couleur personnalisée</span>
        <button
          v-if="eyedropperSupported"
          type="button"
          @click="pickWithEyedropper"
          class="w-7 h-7 rounded-lg flex items-center justify-center text-(--text2) hover:text-(--primary) hover:bg-(--primary)/10 transition-colors"
          title="Pipette : capturer une couleur à l'écran"
        >
          <i class="bi bi-eyedropper text-sm" />
        </button>
      </div>

      <!-- Roue chromatique : angle depuis le haut (sens horaire) = teinte,
           distance au centre = saturation — même convention que le
           conic-gradient CSS ci-dessous (0deg = haut, horaire), donc
           l'angle mesuré est directement la teinte HSL, pas de mapping
           supplémentaire nécessaire. La luminosité est gérée à part par
           le slider en dessous. -->
      <div
        ref="wheelRef"
        class="relative rounded-full cursor-crosshair select-none touch-none"
        :style="wheelStyle"
        @pointerdown="startDrag"
        @pointermove="onDrag"
        @pointerup="stopDrag"
        @pointercancel="stopDrag"
      >
        <div
          class="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none -translate-x-1/2 -translate-y-1/2"
          :style="{ left: `${pointerPos.x}px`, top: `${pointerPos.y}px`, backgroundColor: currentHex }"
        />
      </div>

      <input
        type="range"
        min="0"
        max="100"
        :value="hsl.l"
        @input="applyHsl({ l: Number(($event.target as HTMLInputElement).value) })"
        class="w-full accent-(--primary)"
        title="Luminosité"
      />

    </div>
  </Transition>

</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { hexToHsl, hslToHex, isValidHex, type Hsl } from '@/assets/utils/color';

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [string];
}>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);

const handleClickOutside = (e: MouseEvent) => {
  if (!open.value) return;
  const target = e.target as Node;
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;
  open.value = false;
};

onMounted(() => document.addEventListener('mousedown', handleClickOutside));
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside));

const WHEEL_SIZE = 160;
const RADIUS = WHEEL_SIZE / 2;

const wheelStyle = {
  width: `${WHEEL_SIZE}px`,
  height: `${WHEEL_SIZE}px`,
  background:
    'radial-gradient(circle, #fff 0%, rgba(255,255,255,0) 100%), ' +
    'conic-gradient(red 0deg, yellow 60deg, lime 120deg, cyan 180deg, blue 240deg, magenta 300deg, red 360deg)',
};

const hsl = ref<Hsl>(hexToHsl(props.modelValue || '#16ac77'));
const currentHex = computed(() => hslToHex(hsl.value));

// Resynchronise depuis l'extérieur (ex: clic sur une couleur prédéfinie dans
// TaskTagPicker) sans reboucler sur notre propre emit — hexToHsl(hex) d'une
// hex qu'on vient nous-mêmes d'émettre redonnerait exactement currentHex.
watch(() => props.modelValue, (val) => {
  if (!val || !isValidHex(val)) return;
  if (val.toLowerCase() === currentHex.value.toLowerCase()) return;
  hsl.value = hexToHsl(val);
});

const applyHsl = (patch: Partial<Hsl>) => {
  hsl.value = { ...hsl.value, ...patch };
  emit('update:modelValue', hslToHex(hsl.value));
};

const pointerPos = computed(() => {
  const rad = (hsl.value.h * Math.PI) / 180;
  const dist = (Math.min(hsl.value.s, 100) / 100) * RADIUS;
  return {
    x: RADIUS + dist * Math.sin(rad),
    y: RADIUS - dist * Math.cos(rad),
  };
});

const wheelRef = ref<HTMLElement | null>(null);
let dragging = false;

const updateFromPointer = (e: PointerEvent) => {
  if (!wheelRef.value) return;
  const rect = wheelRef.value.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const r = rect.width / 2;
  const dist = Math.min(Math.hypot(dx, dy), r);

  let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
  if (angle < 0) angle += 360;

  applyHsl({ h: angle, s: (dist / r) * 100 });
};

const startDrag = (e: PointerEvent) => {
  dragging = true;
  (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId);
  updateFromPointer(e);
};
const onDrag = (e: PointerEvent) => {
  if (!dragging) return;
  updateFromPointer(e);
};
const stopDrag = () => {
  dragging = false;
};

// Chromium/Tauri (WebView2) uniquement pour l'instant — bouton masqué
// ailleurs plutôt que de planter au clic.
const eyedropperSupported = 'EyeDropper' in window;

const pickWithEyedropper = async () => {
  try {
    const eyeDropper = new (window as any).EyeDropper();
    const result = await eyeDropper.open();
    if (result?.sRGBHex && isValidHex(result.sRGBHex)) {
      hsl.value = hexToHsl(result.sRGBHex);
      emit('update:modelValue', result.sRGBHex);
    }
  } catch {
    // Annulé par l'utilisateur (Échap / clic ailleurs) — rien à faire.
  }
};
</script>

<style scoped>

.wheel-pop-enter-active,
.wheel-pop-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.wheel-pop-enter-from,
.wheel-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.97);
}

</style>
