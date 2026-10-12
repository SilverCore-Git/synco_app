<template>

    <Teleport to="body">

        <Transition name="fade">

            <div v-if="show" class="fixed inset-0 z-[3000] flex items-center justify-center p-4">

                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="close" />

                <div class="relative w-full max-w-lg bg-(--bg) rounded-2xl border border-(--text)/10 shadow-2xl max-h-[85vh] flex flex-col scale-animation">

                    <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center shrink-0">
                                <i class="bi bi-send-fill text-(--primary) text-lg" />
                            </div>
                            <div class="min-w-0">
                                <h2 class="text-lg font-bold text-(--text)">Transférer</h2>
                                <p v-if="preview" class="text-xs text-(--text2) truncate flex items-center gap-1.5">
                                    <i class="bi" :class="preview.icon" />
                                    <span class="truncate">{{ preview.title }}</span>
                                </p>
                            </div>
                        </div>
                        <button @click="close" class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-(--text)/5 shrink-0">
                            <i class="bi bi-x-lg text-xl" />
                        </button>
                    </header>

                    <div class="px-6 pt-4 shrink-0">
                        <div class="relative">
                            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-sm" />
                            <input
                                v-model="query"
                                type="text"
                                placeholder="Rechercher un salon, un workspace ou une personne…"
                                class="w-full bg-black/20 border border-(--text)/10 rounded-lg pl-9 pr-3 py-2 text-sm text-(--text) focus:border-(--primary)/50 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <main class="flex-1 overflow-y-auto px-4 py-3">

                        <template v-if="filteredThreadGroups.length">
                            <div class="px-2 pt-2 pb-1 text-[10px] uppercase font-bold tracking-wider text-(--text2)">Salons</div>
                            <div v-for="group in filteredThreadGroups" :key="group.id" class="mb-2">
                                <div class="px-2 py-1 text-[10px] font-bold text-(--text2)/70 uppercase tracking-wide truncate">{{ group.label }}</div>
                                <button
                                    v-for="thread in group.threads"
                                    :key="thread.id"
                                    @click="select({ kind: 'thread', threadId: thread.id, spaceId: group.spaceId })"
                                    :class="[
                                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                                        isSelectedThread(thread.id) ? 'bg-(--primary)/15 border border-(--primary)/40' : 'hover:bg-(--text)/5 border border-transparent'
                                    ]"
                                >
                                    <div class="w-8 h-8 rounded-lg bg-(--text)/10 flex items-center justify-center shrink-0 text-(--text2)">
                                        <i class="bi bi-hash" />
                                    </div>
                                    <span class="text-sm text-(--text) truncate flex-1">{{ thread.name }}</span>
                                    <i v-if="thread.isPrivate" class="bi bi-lock-fill text-xs text-(--text2)" />
                                    <i v-if="isSelectedThread(thread.id)" class="bi bi-check-circle-fill text-(--primary)" />
                                </button>
                            </div>
                        </template>

                        <template v-if="filteredMembers.length">
                            <div class="px-2 pt-3 pb-1 text-[10px] uppercase font-bold tracking-wider text-(--text2)">Messages privés</div>
                            <button
                                v-for="member in filteredMembers"
                                :key="member.user!.id"
                                @click="select({ kind: 'dm', recipientId: member.user!.id, recipientPublicKey: member.user!.publicKey! })"
                                :class="[
                                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors',
                                    isSelectedDM(member.user!.id) ? 'bg-(--primary)/15 border border-(--primary)/40' : 'hover:bg-(--text)/5 border border-transparent'
                                ]"
                            >
                                <img v-if="member.user!.avatarUrl" :src="member.user!.avatarUrl" class="w-8 h-8 rounded-full object-cover shrink-0" />
                                <div v-else class="w-8 h-8 rounded-full bg-(--primary)/20 flex items-center justify-center text-(--primary) font-bold text-xs shrink-0">
                                    {{ member.user!.name.charAt(0).toUpperCase() }}
                                </div>
                                <span class="text-sm text-(--text) truncate flex-1">{{ member.user!.name }}</span>
                                <i v-if="isSelectedDM(member.user!.id)" class="bi bi-check-circle-fill text-(--primary)" />
                            </button>
                        </template>

                        <div v-if="!filteredThreadGroups.length && !filteredMembers.length" class="flex flex-col items-center gap-2 py-12 text-(--text2)">
                            <i class="bi bi-search text-2xl opacity-50" />
                            <span class="text-sm">Aucun résultat pour "{{ query }}"</span>
                        </div>

                    </main>

                    <footer class="px-6 py-4 border-t border-(--border-color) shrink-0 bg-(--bg2)/50 space-y-3">

                        <div v-if="selectedTarget" class="flex items-center gap-2 text-xs text-(--text2)">
                            <i class="bi bi-arrow-right text-(--primary)" />
                            Envoyer vers <strong class="text-(--text)">{{ selectedLabel }}</strong>
                        </div>

                        <textarea
                            v-model="note"
                            rows="1"
                            placeholder="Ajouter un message (optionnel)…"
                            class="w-full bg-black/20 border border-(--text)/10 rounded-lg px-3 py-2 text-sm text-(--text) placeholder:text-(--text2) focus:border-(--primary)/50 outline-none resize-none transition-all"
                        />

                        <div class="flex justify-end gap-3">
                            <button @click="close" class="default">Annuler</button>
                            <button
                                @click="confirmSend"
                                :disabled="!selectedTarget || sending"
                                class="primary flex items-center justify-center gap-2"
                                :class="!selectedTarget || sending ? 'opacity-40 cursor-not-allowed!' : ''"
                            >
                                <span v-if="sending" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                <span v-else>Envoyer</span>
                            </button>
                        </div>

                    </footer>

                </div>

            </div>

        </Transition>

    </Teleport>

</template>

<script setup lang="ts">

// Picker générique « où transférer ceci ? » : propose tous les salons (de
// l'espace courant + des autres workspaces + "accueil" de l'org) et tous les
// membres de l'org comme destination DM, puis délègue l'envoi réel au
// consommateur via la prop `send` — ce composant ne sait rien du contenu
// transféré (fichier/dossier pingé avec &, ou message réécrit/rechiffré, cf.
// useShareReference.ts) ni de son format, seulement de la destination choisie
// et de la note optionnelle.
// - Lancé depuis le file manager (FileCard.vue/FolderCard.vue ->
//   SpaceFiles.vue) pour partager un fichier/dossier.
// - Lancé depuis ChatMessage.vue/ThreadMessage.vue pour transférer un message.

import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { openedOrg, user } from '@/assets/var';
import type { ShareTarget, ShareReferenceResult } from '@/composables/useShareReference';
import { useToast } from '@/composables/useToast';
import type { Thread } from '@/types/types';

const props = defineProps<{
    show: boolean;
    // Icône + titre affichés dans l'en-tête, pour rappeler ce qu'on transfère.
    preview: { icon: string; title: string } | null;
    // Envoie réellement vers la cible choisie (+ note optionnelle) — c'est au
    // consommateur de savoir comment construire le contenu (référence &
    // fichier/dossier, ou contenu de message déchiffré/rechiffré).
    send: (target: ShareTarget, note: string) => Promise<ShareReferenceResult>;
}>();

const emit = defineEmits<{ (e: 'close'): void }>();

const toast = useToast();

const query = ref<string>('');
const note = ref<string>('');
const selectedTarget = ref<ShareTarget | null>(null);
const sending = ref<boolean>(false);

watch(() => props.show, (show) => {
    if (!show) return;
    query.value = '';
    note.value = '';
    selectedTarget.value = null;
});

const close = () => { if (!sending.value) emit('close'); };

const handleEsc = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
};
onMounted(() => window.addEventListener('keydown', handleEsc));
onUnmounted(() => window.removeEventListener('keydown', handleEsc));

interface ThreadGroup { id: string; label: string; spaceId?: string; threads: Thread[]; }

// Salons "texte" uniquement (une référence pingée dans un salon vocal ne
// mène à rien) — l'accueil d'org (home) puis chaque workspace, dans l'ordre
// où ils apparaissent déjà dans la sidebar (ThreadsBar.vue).
const threadGroups = computed<ThreadGroup[]>(() => {
    const org = openedOrg.value;
    if (!org) return [];

    const groups: ThreadGroup[] = [];

    const homeThreads = (org.home?.threads || []).filter(t => t.type === 'text');
    if (homeThreads.length) groups.push({ id: 'home', label: org.name, threads: homeThreads });

    for (const space of org.spaces || []) {
        const threads = (space.threads || []).filter(t => t.type === 'text');
        if (threads.length) groups.push({ id: space.id, label: space.name, spaceId: space.id, threads });
    }

    return groups;
});

const filteredThreadGroups = computed<ThreadGroup[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return threadGroups.value;
    return threadGroups.value
        .map(g => ({ ...g, threads: g.threads.filter(t => t.name.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) }))
        .filter(g => g.threads.length);
});

// DM : tout membre de l'org (hors soi-même) qui a une clé publique E2EE —
// sans elle on ne peut pas chiffrer le message à son attention.
const filteredMembers = computed(() => {
    const org = openedOrg.value;
    if (!org) return [];
    const q = query.value.trim().toLowerCase();
    return (org.members || []).filter(m => {
        if (!m.user?.publicKey || m.user.id === user.value?.id) return false;
        if (!q) return true;
        return m.user.name.toLowerCase().includes(q) || (m.user.pseudo || '').toLowerCase().includes(q);
    });
});

const isSelectedThread = (threadId: string) => selectedTarget.value?.kind === 'thread' && selectedTarget.value.threadId === threadId;
const isSelectedDM = (userId: string) => selectedTarget.value?.kind === 'dm' && selectedTarget.value.recipientId === userId;

const selectedLabel = computed(() => {
    const target = selectedTarget.value;
    if (!target) return '';
    if (target.kind === 'thread') {
        for (const g of threadGroups.value) {
            const t = g.threads.find(t => t.id === target.threadId);
            if (t) return `#${t.name}`;
        }
        return 'ce salon';
    }
    const member = (openedOrg.value?.members || []).find(m => m.user?.id === target.recipientId);
    return member?.user?.name || 'ce contact';
});

const select = (target: ShareTarget) => { selectedTarget.value = target; };

const confirmSend = async () => {
    if (!selectedTarget.value || sending.value) return;
    sending.value = true;
    try {
        const result = await props.send(selectedTarget.value, note.value);
        if (!result.ok) {
            toast.show(result.error || 'Échec du transfert.', 'error');
            return;
        }
        toast.show('Transféré avec succès.', 'success');
        emit('close');
    } catch (err) {
        console.error('[ShareToTargetModal] send failed:', err);
        toast.show('Échec du transfert.', 'error');
    } finally {
        sending.value = false;
    }
};

</script>

<style scoped>

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

.scale-animation {
  animation: modalScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes modalScale {
  from { opacity: 0; transform: scale(0.9) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

</style>
