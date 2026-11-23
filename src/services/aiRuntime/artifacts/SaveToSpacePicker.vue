<template>
    <Teleport to="body">
        <div class="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <div class="absolute inset-0 bg-black/60" @click="emit('cancel')" />
            <div class="relative w-full max-w-md rounded-2xl bg-(--bg2) text-(--text) border border-(--text)/10 shadow-2xl p-5 flex flex-col gap-3" role="dialog" aria-label="Enregistrer dans un espace">
                <h3 class="text-lg font-bold">Enregistrer « {{ fileName }} »</h3>
                <input v-model="q" type="search" class="rounded-lg border border-(--text)/15 bg-(--bg) px-3 py-2 text-sm" placeholder="Rechercher un espace ou un dossier" aria-label="Rechercher un espace ou un dossier" />
                <ul class="max-h-72 overflow-auto flex flex-col gap-0.5" role="listbox">
                    <li v-for="o in options" :key="o.key">
                        <button type="button" role="option" :aria-selected="picked?.key === o.key" class="w-full text-left rounded-lg px-3 py-2 text-sm flex items-center gap-2 hover:bg-(--text)/6" :class="picked?.key === o.key ? 'bg-(--primary)/15' : ''" @click="picked = o">
                            <i class="bi" :class="o.folderId ? 'bi-folder2 ml-4' : 'bi-box'" />
                            <span class="min-w-0 flex-1 truncate">{{ o.label }}</span>
                            <span v-if="o.suggested" class="text-[11px] text-emerald-600 shrink-0">créé par le plan</span>
                        </button>
                    </li>
                    <li v-if="options.length === 0" class="px-3 py-2 text-sm text-(--text2)">Aucun résultat.</li>
                </ul>
                <p v-if="error" class="text-sm text-red-500" role="alert">{{ error }}</p>
                <div class="flex justify-end gap-2">
                    <button type="button" class="rounded-lg bg-(--text)/8 px-4 py-2 text-sm font-medium" @click="emit('cancel')">Annuler</button>
                    <button type="button" class="rounded-lg bg-(--primary) text-white px-4 py-2 text-sm font-semibold disabled:opacity-40" :disabled="!picked || busy" @click="save">Enregistrer ici</button>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';

export interface PickerSpace { id: string; name: string; folders: { id: string; name: string; suggested?: boolean }[] }
interface Option { key: string; label: string; spaceId: string; folderId: string | null; suggested: boolean }

const props = defineProps<{ fileName: string; spaces: PickerSpace[]; busy?: boolean; error?: string }>();
const emit = defineEmits<{ (e: 'save', target: { spaceId: string; folderId: string | null }): void; (e: 'cancel'): void }>();

const q = ref('');
const picked = ref<Option | null>(null);
// Liste cherchable, plafonnée : l'app vise des espaces nombreux, jamais de rangée par élément sans filtre.
const options = computed<Option[]>(() => {
    const needle = q.value.trim().toLowerCase();
    const out: Option[] = [];
    for (const s of props.spaces) {
        const spaceHit = s.name.toLowerCase().includes(needle);
        const folders = s.folders.filter(f => spaceHit || f.name.toLowerCase().includes(needle));
        if (spaceHit || folders.length) out.push({ key: s.id, label: s.name, spaceId: s.id, folderId: null, suggested: false });
        for (const f of folders) out.push({ key: `${s.id}/${f.id}`, label: f.name, spaceId: s.id, folderId: f.id, suggested: !!f.suggested });
    }
    return out.slice(0, 100);
});
const save = () => { if (picked.value) emit('save', { spaceId: picked.value.spaceId, folderId: picked.value.folderId }); };
</script>
