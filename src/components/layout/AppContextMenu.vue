<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { contextMenu, type ContextMenuItem } from '@/assets/appTabs';

// Menu contextuel des onglets et des liens (appTabs.ts › openContextMenu), même apparence que DropDown.vue
// (classes .sdropdown / .dropdown-item-style, définies sans scope dans DropDown.vue).

const menuEl = ref<HTMLElement | null>(null);
const pos = ref({ left: 0, top: 0 });

const close = () => { contextMenu.value = null; };
const run = (item: ContextMenuItem) => { close(); item.action(); };

// Recalé dans la fenêtre une fois mesuré (clic droit près d'un bord).
watch(contextMenu, async (m) => {
    if (!m) return;
    pos.value = { left: m.x, top: m.y };
    await nextTick();
    const r = menuEl.value?.getBoundingClientRect();
    if (!r) return;
    pos.value = {
        left: Math.max(8, Math.min(m.x, window.innerWidth - r.width - 8)),
        top: Math.max(8, Math.min(m.y, window.innerHeight - r.height - 8)),
    };
});

const onPointerDown = (e: Event) => {
    if (contextMenu.value && !menuEl.value?.contains(e.target as Node)) close();
};
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
window.addEventListener('mousedown', onPointerDown, true);
window.addEventListener('keydown', onKey);
window.addEventListener('blur', close);
window.addEventListener('resize', close);
onBeforeUnmount(() => {
    window.removeEventListener('mousedown', onPointerDown, true);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', close);
    window.removeEventListener('resize', close);
});
</script>

<template>
    <Teleport to="body">
        <transition
            enter-active-class="transition duration-100 ease-out"
            enter-from-class="transform scale-95 opacity-0"
            enter-to-class="transform scale-100 opacity-100"
            leave-active-class="transition duration-75 ease-in"
            leave-from-class="transform scale-100 opacity-100"
            leave-to-class="transform scale-95 opacity-0"
        >
            <div
                v-if="contextMenu"
                ref="menuEl"
                role="menu"
                class="fixed w-60 rounded-xl border border-(--border-color) bg-(--bg) shadow-xl ring-1 ring-(--text)/5"
                :style="{ left: pos.left + 'px', top: pos.top + 'px', zIndex: 3000 }"
                @contextmenu.prevent
            >
                <div class="p-1.5 sdropdown">
                    <template v-for="(item, i) in contextMenu.items" :key="i">
                        <hr v-if="item.separator" class="my-1 border-(--border-color)" />
                        <button
                            role="menuitem"
                            class="dropdown-item-annimate dropdown-item-style"
                            :class="item.danger ? 'text-red-400! hover:bg-red-500/10!' : ''"
                            @click="run(item)"
                        >
                            <i v-if="item.icon" class="bi mr-2" :class="item.icon" />
                            {{ item.label }}
                        </button>
                    </template>
                </div>
            </div>
        </transition>
    </Teleport>
</template>
