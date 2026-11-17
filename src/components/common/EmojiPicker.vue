<template>
  <div
    class="emoji-picker w-[20rem] max-w-[calc(100vw-1.5rem)] h-[26.5rem] max-h-[70vh] bg-(--bg) border border-(--text)/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden font-['Outfit',sans-serif] text-(--text) select-none relative z-50"
    style="background-color: var(--bg);"
    @click.stop
  >
    <!-- Recherche -->
    <div class="px-3 pt-3 pb-2 bg-(--bg2)">
      <label
        class="flex items-center gap-2 h-9 px-3 rounded-xl bg-(--bg) border border-(--text)/10 focus-within:border-(--primary)/60 focus-within:ring-2 focus-within:ring-(--primary)/20 transition-[border-color,box-shadow]"
      >
        <i class="bi bi-search text-(--text2) text-sm" />
        <input
          ref="searchInput"
          v-model="query"
          type="text"
          inputmode="search"
          enterkeyhint="done"
          autocomplete="off"
          spellcheck="false"
          placeholder="Rechercher (fr, en, :shortcode:)"
          aria-label="Rechercher un emoji"
          class="w-full min-w-0 bg-transparent border-none text-sm text-(--text)/90 placeholder-(--text)/35 focus:outline-none"
          @keydown="onKeydown"
        />
        <button
          v-if="query"
          type="button"
          class="text-(--text)/40 hover:text-(--text)/70 transition-colors"
          title="Effacer"
          @click="clearQuery"
        >
          <i class="bi bi-x-circle-fill text-xs" />
        </button>
      </label>
    </div>

    <!-- Onglets de catégories -->
    <nav
      v-if="!query"
      class="relative flex px-2 pb-1.5 bg-(--bg2) border-b border-(--border-color)"
      aria-label="Catégories d'emojis"
    >
      <span
        class="tab-indicator absolute top-0 bottom-1.5 rounded-lg bg-(--primary)/12"
        :style="{
          width: `calc((100% - 1rem) / ${tabs.length})`,
          transform: `translateX(${activeTabIndex * 100}%)`,
        }"
      />
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="relative flex-1 h-8 flex items-center justify-center rounded-lg transition-colors"
        :class="activeSection === tab.id ? 'text-(--primary)' : 'text-(--text2) hover:text-(--text)'"
        :title="tab.label"
        :aria-label="tab.label"
        :aria-current="activeSection === tab.id"
        @click="scrollToSection(tab.id)"
      >
        <i class="bi text-[0.95rem]" :class="activeSection === tab.id ? tab.icon + '-fill' : tab.icon" />
      </button>
    </nav>

    <!-- Grille virtualisée -->
    <div
      ref="scroller"
      class="emoji-scroller flex-1 overflow-y-auto overflow-x-hidden px-2 relative"
      :class="{ 'pt-1': query }"
      role="listbox"
      aria-label="Emojis"
      @scroll.passive="onScroll"
      @mouseleave="hoverIndex = -1"
    >
      <!-- Chargement -->
      <div v-if="loadState === 'loading'" class="grid grid-cols-8 gap-1 pt-3 px-1" aria-hidden="true">
        <div v-for="n in 48" :key="n" class="aspect-square rounded-full bg-(--text)/6 animate-pulse" :style="{ animationDelay: `${(n % 8) * 60}ms` }" />
      </div>

      <div v-else-if="loadState === 'error'" class="flex flex-col items-center justify-center h-full gap-3 text-sm text-(--text2)">
        <span>Impossible de charger les emojis.</span>
        <button type="button" class="px-3 py-1.5 rounded-lg bg-(--primary)/15 text-(--primary) font-medium" @click="load">Réessayer</button>
      </div>

      <div v-else-if="query && !cells.length" class="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
        <span class="text-4xl emoji-glyph opacity-70">🔍</span>
        <p class="text-sm text-(--text2)">Aucun emoji pour « {{ query.trim() }} »</p>
        <p class="text-xs text-(--text)/35">Essaie un synonyme, en français ou en anglais.</p>
      </div>

      <div v-else :style="{ height: totalHeight + 'px' }" class="relative">
        <template v-for="row in visibleRows" :key="row.key">
          <h3
            v-if="row.kind === 'header'"
            class="absolute inset-x-0 flex items-end pb-1 px-1 text-[0.7rem] font-semibold uppercase tracking-wider text-(--text2)"
            :style="{ top: row.top + 'px', height: HEADER_H + 'px' }"
          >
            {{ row.label }}
          </h3>
          <div
            v-else
            class="absolute inset-x-0 grid"
            :style="{ top: row.top + 'px', height: ROW_H + 'px', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }"
          >
            <button
              v-for="(cell, i) in row.cells"
              :key="cell.char"
              type="button"
              role="option"
              class="emoji-cell"
              :class="{ 'is-active': activeIndex === row.start + i }"
              :aria-selected="activeIndex === row.start + i"
              :aria-label="cell.entry?.label ?? cell.char"
              @click="select(cell.char)"
              @mousemove="onCellPointer($event, row.start + i)"
            >
              <span class="emoji-glyph">{{ cell.char }}</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Aperçu + ton de peau -->
    <footer class="h-14 shrink-0 flex items-center gap-3 px-3 border-t border-(--border-color) bg-(--bg2)">
        <div v-if="skinMenuOpen" class="skin-menu flex items-center gap-1 flex-1">
          <span class="text-xs text-(--text2) mr-1">Ton</span>
          <button
            v-for="(sample, tone) in SKIN_TONE_SAMPLES"
            :key="tone"
            type="button"
            class="w-8 h-8 rounded-lg flex items-center justify-center text-xl transition-colors"
            :class="skinTone === tone ? 'bg-(--primary)/15 ring-1 ring-(--primary)/50' : 'hover:bg-(--text)/8'"
            :title="SKIN_TONE_LABELS[tone]"
            @click="chooseSkinTone(tone)"
          >
            <span class="emoji-glyph">{{ sample }}</span>
          </button>
        </div>

        <div v-else-if="previewCell" class="flex items-center gap-3 flex-1 min-w-0">
          <span class="emoji-glyph text-[1.9rem] leading-none">{{ previewCell.char }}</span>
          <div class="min-w-0 leading-tight">
            <p class="text-sm font-medium truncate first-letter:uppercase">{{ previewCell.entry?.label ?? previewCell.char }}</p>
            <p v-if="previewCell.entry?.shortcodes[0]" class="text-[0.7rem] text-(--text2) truncate font-mono">
              :{{ previewCell.entry.shortcodes[0] }}:
            </p>
          </div>
        </div>

        <p v-else class="flex-1 text-xs text-(--text)/40 truncate">
          {{ hasFinePointer ? '↑ ↓ ← → pour naviguer · Entrée pour choisir' : 'Choisis un emoji' }}
        </p>
      <button
        type="button"
        class="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-xl transition-colors"
        :class="skinMenuOpen ? 'bg-(--primary)/15' : 'hover:bg-(--text)/8'"
        title="Ton de peau"
        aria-label="Choisir le ton de peau"
        :aria-expanded="skinMenuOpen"
        @click="skinMenuOpen = !skinMenuOpen"
      >
        <span class="emoji-glyph">{{ SKIN_TONE_SAMPLES[skinTone] }}</span>
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import {
  GROUPS,
  SKIN_TONE_SAMPLES,
  emojis,
  findEmoji,
  getFrequentEmojis,
  loadEmojis,
  recordEmojiUsage,
  searchEmojis,
  setSkinTone,
  skinTone,
  withSkin,
  type Emoji,
} from './emoji/emojiStore';

const emit = defineEmits<{
  (e: 'select', emoji: string): void;
  (e: 'close'): void;
}>();

const SKIN_TONE_LABELS = ['Par défaut', 'Peau claire', 'Peau moyennement claire', 'Peau légèrement mate', 'Peau mate', 'Peau foncée'];

// Géométrie fixe : c'est ce qui permet de virtualiser sans mesurer le DOM.
const CELL_MIN = 36;
const ROW_H = 38;
const HEADER_H = 30;
const OVERSCAN = 160;

const searchInput = ref<HTMLInputElement | null>(null);
const scroller = ref<HTMLElement | null>(null);

const query = ref('');
const loadState = ref<'loading' | 'ready' | 'error'>(emojis.value.length ? 'ready' : 'loading');
const scrollTop = ref(0);
const viewportH = ref(320);
const cols = ref(8);
const hoverIndex = ref(-1);
const keyIndex = ref(-1);
const skinMenuOpen = ref(false);
const frequent = shallowRef<string[]>([]);

const hasFinePointer = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;

// ─── Sections & lignes ─────────────────────────────────────────────────────

interface Cell {
  char: string;
  entry: Emoji | undefined;
}
interface Section {
  id: string;
  label: string;
  cells: Cell[];
}
type Row =
  | { kind: 'header'; key: string; top: number; section: string; label: string }
  | { kind: 'emojis'; key: string; top: number; section: string; start: number; cells: Cell[] };

const searchResults = computed(() => (query.value.trim() ? searchEmojis(query.value, emojis.value) : []));

const sections = computed<Section[]>(() => {
  if (query.value.trim()) {
    return [{ id: 'results', label: '', cells: searchResults.value.map((e) => ({ char: withSkin(e), entry: e })) }];
  }
  const byGroup: Cell[][] = GROUPS.map(() => []);
  for (const e of emojis.value) byGroup[e.group]?.push({ char: withSkin(e), entry: e });
  return [
    { id: 'frequent', label: 'Fréquemment utilisés', cells: frequent.value.map((char) => ({ char, entry: findEmoji(char) })) },
    ...GROUPS.map((g, i) => ({ id: g.id, label: g.label, cells: byGroup[i]! })),
  ].filter((s) => s.cells.length);
});

const layout = computed(() => {
  const rows: Row[] = [];
  const cells: Cell[] = [];
  /** Pour chaque ligne d'emojis : index de sa première cellule, nombre, index dans rows. */
  const emojiRows: { start: number; count: number; row: number }[] = [];
  const sectionTops = new Map<string, number>();
  let top = 0;
  for (const s of sections.value) {
    sectionTops.set(s.id, top);
    if (s.label) {
      rows.push({ kind: 'header', key: `h-${s.id}`, top, section: s.id, label: s.label });
      top += HEADER_H;
    }
    for (let i = 0; i < s.cells.length; i += cols.value) {
      const slice = s.cells.slice(i, i + cols.value);
      emojiRows.push({ start: cells.length, count: slice.length, row: rows.length });
      rows.push({ kind: 'emojis', key: `r-${s.id}-${i}`, top, section: s.id, start: cells.length, cells: slice });
      cells.push(...slice);
      top += ROW_H;
    }
  }
  return { rows, cells, emojiRows, sectionTops, height: top + 8 };
});

const cells = computed(() => layout.value.cells);
const totalHeight = computed(() => layout.value.height);

// Recherche dichotomique de la première ligne visible
const visibleRows = computed(() => {
  const { rows } = layout.value;
  const from = scrollTop.value - OVERSCAN;
  const to = scrollTop.value + viewportH.value + OVERSCAN;
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid]!.top + ROW_H < from) lo = mid + 1;
    else hi = mid;
  }
  const out: Row[] = [];
  for (let i = lo; i < rows.length && rows[i]!.top < to; i++) out.push(rows[i]!);
  return out;
});

// ─── Onglets ───────────────────────────────────────────────────────────────

const tabs = computed(() => [
  ...(frequent.value.length ? [{ id: 'frequent', label: 'Fréquemment utilisés', icon: 'bi-clock' }] : []),
  ...GROUPS.filter((g) => layout.value.sectionTops.has(g.id)),
]);

const activeSection = computed(() => {
  let current = tabs.value[0]?.id ?? '';
  // On passe à la section suivante un peu avant son en-tête, pour que
  // l'onglet suive le contenu visible.
  for (const [id, top] of layout.value.sectionTops) {
    if (top <= scrollTop.value + 24) current = id;
    else break;
  }
  return current;
});

const activeTabIndex = computed(() => Math.max(0, tabs.value.findIndex((t) => t.id === activeSection.value)));

const scrollToSection = (id: string) => {
  const top = layout.value.sectionTops.get(id);
  if (top === undefined || !scroller.value) return;
  keyIndex.value = -1;
  scroller.value.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
};

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

// ─── Défilement & dimensions ───────────────────────────────────────────────

let scrollFrame = 0;
const onScroll = () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    if (scroller.value) scrollTop.value = scroller.value.scrollTop;
  });
};

let resizeObserver: ResizeObserver | null = null;
const measure = () => {
  const el = scroller.value;
  if (!el) return;
  viewportH.value = el.clientHeight;
  // clientWidth exclut la scrollbar ; on retire le padding horizontal (px-2)
  const inner = el.clientWidth - 16;
  cols.value = Math.max(6, Math.floor(inner / CELL_MIN));
};

// ─── Sélection active (souris / clavier) ───────────────────────────────────

const activeIndex = computed(() => (keyIndex.value >= 0 ? keyIndex.value : hoverIndex.value));
const previewCell = computed(() => cells.value[activeIndex.value] ?? null);

// La souris reprend la main sur le clavier, mais seulement si elle bouge
// vraiment : quand le clavier fait défiler la grille, une cellule passe sous
// le curseur immobile et ne doit pas voler la sélection.
let lastPointer = '';
const onCellPointer = (event: MouseEvent, index: number) => {
  const pos = `${event.screenX},${event.screenY}`;
  if (pos === lastPointer && keyIndex.value >= 0) return;
  lastPointer = pos;
  keyIndex.value = -1;
  hoverIndex.value = index;
};

watch(query, (q) => {
  hoverIndex.value = -1;
  keyIndex.value = q.trim() ? 0 : -1;
  skinMenuOpen.value = false;
  if (scroller.value) scroller.value.scrollTop = 0;
  scrollTop.value = 0;
});

const rowOfCell = (index: number) => {
  const rows = layout.value.emojiRows;
  let lo = 0;
  let hi = rows.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rows[mid]!.start <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

const ensureVisible = (index: number) => {
  const el = scroller.value;
  if (!el) return;
  const r = layout.value.emojiRows[rowOfCell(index)];
  if (!r) return;
  const top = layout.value.rows[r.row]!.top;
  // Garde l'en-tête de section visible quand on remonte sur sa première ligne
  const prev = layout.value.rows[r.row - 1];
  const wantedTop = prev?.kind === 'header' ? prev.top : top;
  if (wantedTop < el.scrollTop) el.scrollTop = wantedTop;
  else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight + 4;
};

const moveTo = (index: number) => {
  const max = cells.value.length - 1;
  if (max < 0) return;
  keyIndex.value = Math.min(max, Math.max(0, index));
  hoverIndex.value = -1;
  ensureVisible(keyIndex.value);
};

const moveVertical = (delta: 1 | -1) => {
  const { emojiRows } = layout.value;
  const current = activeIndex.value;
  if (current < 0) return moveTo(delta > 0 ? 0 : cells.value.length - 1);
  const r = rowOfCell(current);
  const col = current - emojiRows[r]!.start;
  const target = emojiRows[r + delta];
  if (!target) return moveTo(delta > 0 ? cells.value.length - 1 : 0);
  moveTo(target.start + Math.min(col, target.count - 1));
};

const onKeydown = (event: KeyboardEvent) => {
  if (event.isComposing) return;
  const navigating = activeIndex.value >= 0;
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveVertical(1);
      break;
    case 'ArrowUp':
      if (!navigating) return;
      event.preventDefault();
      if (rowOfCell(activeIndex.value) === 0) {
        keyIndex.value = -1;
        hoverIndex.value = -1;
      } else moveVertical(-1);
      break;
    case 'ArrowRight':
    case 'ArrowLeft':
      // Sans sélection active, les flèches latérales déplacent le curseur du texte
      if (!navigating) return;
      event.preventDefault();
      moveTo(activeIndex.value + (event.key === 'ArrowRight' ? 1 : -1));
      break;
    case 'Enter': {
      const cell = cells.value[navigating ? activeIndex.value : 0];
      if (!cell || (!navigating && !query.value.trim())) return;
      event.preventDefault();
      select(cell.char);
      break;
    }
    case 'Escape':
      event.preventDefault();
      event.stopPropagation();
      if (skinMenuOpen.value) skinMenuOpen.value = false;
      else if (query.value) clearQuery();
      else emit('close');
      break;
  }
};

// ─── Actions ───────────────────────────────────────────────────────────────

const select = (char: string) => {
  recordEmojiUsage(char);
  emit('select', char);
};

const clearQuery = () => {
  query.value = '';
  searchInput.value?.focus();
};

const chooseSkinTone = (tone: number) => {
  setSkinTone(tone);
  skinMenuOpen.value = false;
  if (hasFinePointer) searchInput.value?.focus();
};

const load = async () => {
  loadState.value = 'loading';
  try {
    await loadEmojis();
    // Instantané à l'ouverture : les fréquents ne bougent pas sous le doigt
    frequent.value = getFrequentEmojis();
    loadState.value = 'ready';
    await nextTick();
    measure();
  } catch (err) {
    console.error('[EmojiPicker] chargement des emojis impossible', err);
    loadState.value = 'error';
  }
};

onMounted(() => {
  measure();
  if (scroller.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(scroller.value);
  }
  // Pas d'autofocus au doigt : ça ouvrirait le clavier virtuel par-dessus le picker
  if (hasFinePointer) searchInput.value?.focus({ preventScroll: true });
  load();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (scrollFrame) cancelAnimationFrame(scrollFrame);
});
</script>

<style scoped>
.emoji-glyph {
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", "Twemoji Mozilla", "Android Emoji", "EmojiSymbols", sans-serif;
  font-style: normal;
  line-height: 1;
}

.emoji-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  margin: 1px;
  border-radius: 10px;
  font-size: 1.45rem;
  transition: background-color 120ms ease;
  -webkit-tap-highlight-color: transparent;
}
.emoji-cell .emoji-glyph {
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.emoji-cell:hover,
.emoji-cell.is-active {
  background-color: color-mix(in srgb, var(--text) 9%, transparent);
}
.emoji-cell.is-active {
  box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--primary) 55%, transparent);
}
.emoji-cell:hover .emoji-glyph,
.emoji-cell.is-active .emoji-glyph {
  transform: scale(1.18);
}
.emoji-cell:active .emoji-glyph {
  transform: scale(0.88);
  transition-duration: 60ms;
}

.tab-indicator {
  left: 0.5rem;
  transition: transform 260ms cubic-bezier(0.34, 1.3, 0.64, 1);
}

.skin-menu {
  animation: skin-in 160ms cubic-bezier(0.34, 1.3, 0.64, 1);
}
@keyframes skin-in {
  from {
    opacity: 0;
    transform: translateX(10px);
  }
}

.emoji-scroller {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text) 18%, transparent) transparent;
  overscroll-behavior: contain;
}
.emoji-scroller::-webkit-scrollbar {
  width: 6px;
}
.emoji-scroller::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--text) 18%, transparent);
  border-radius: 99px;
}
.emoji-scroller::-webkit-scrollbar-thumb:hover {
  background: color-mix(in srgb, var(--primary) 50%, transparent);
}

@media (prefers-reduced-motion: reduce) {
  .emoji-cell .emoji-glyph,
  .tab-indicator {
    transition: none;
  }
  .skin-menu {
    animation: none;
  }
}
</style>
