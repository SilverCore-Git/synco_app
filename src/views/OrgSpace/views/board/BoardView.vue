<template>

    <div class="flex flex-col h-full overflow-hidden">

        <div v-if="loading" class="flex-1 flex items-center justify-center">
            <SpinLoader />
        </div>

        <template v-else>

            <div class="flex items-center gap-1 px-4 pt-3 border-b border-(--border-color) overflow-x-auto">
                <button
                    v-for="s in STEPS"
                    :key="s.key"
                    @click="activeStep = s.key"
                    class="px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors"
                    :class="activeStep === s.key ? 'border-(--primary) text-(--text)' : 'border-transparent text-(--text2) hover:text-(--text)'"
                >
                    <i :class="s.icon" class="mr-1.5" />
                    {{ s.label }}
                    <span v-if="cardsForStep(s.key).length" class="ml-1 text-xs text-(--text2)">({{ cardsForStep(s.key).length }})</span>
                </button>

                <div class="ml-auto flex items-center gap-2 py-1.5 shrink-0">
                    <button @click="findDuplicates" :disabled="duplicatesLoading" class="text-xs px-2.5 py-1.5 rounded-lg text-(--text2) hover:text-(--text) hover:bg-white/5 transition-colors">
                        <i class="bi bi-copy mr-1" />
                        {{ duplicatesLoading ? 'Recherche...' : 'Détecter les doublons' }}
                    </button>
                    <button @click="openSynthesis" class="text-xs px-2.5 py-1.5 rounded-lg bg-(--primary)/15 text-(--primary) hover:bg-(--primary)/25 transition-colors font-medium">
                        <i class="bi bi-file-earmark-text mr-1" />
                        Générer le cahier des charges
                    </button>
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-4 space-y-4">

                <div v-if="thread.isReadOnly" class="text-xs text-(--text2) bg-white/5 border border-white/10 rounded-lg p-2">
                    <i class="bi bi-lock-fill mr-1" /> Ce cahier des charges est en lecture seule.
                </div>

                <div v-if="!thread.isReadOnly" class="flex gap-2">
                    <input
                        v-model="newCardText"
                        @keydown.enter="submitNewCard"
                        type="text"
                        placeholder="Proposer une idée pour cette étape..."
                        class="flex-1 bg-(--bg2)/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-(--text) placeholder:text-(--text2) focus:outline-none focus:border-(--primary)/50"
                    />
                    <button
                        @click="submitNewCard"
                        :disabled="!newCardText.trim() || creatingCard"
                        class="primary px-4 shrink-0"
                        :class="!newCardText.trim() ? 'opacity-50 pointer-events-none' : ''"
                    >
                        Ajouter
                    </button>
                    <button
                        @click="requestAiSuggestions"
                        :disabled="suggestLoading"
                        title="Demander des idées à l'IA"
                        class="shrink-0 px-3 rounded-xl border border-(--primary)/30 text-(--primary) hover:bg-(--primary)/10 transition-colors"
                    >
                        <i class="bi bi-stars" :class="suggestLoading ? 'animate-pulse' : ''" />
                    </button>
                </div>

                <div v-if="aiSuggestions.length" class="space-y-2">
                    <div v-for="(s, i) in aiSuggestions" :key="i" class="flex items-start gap-2 bg-(--primary)/5 border border-(--primary)/20 rounded-xl p-3">
                        <i class="bi bi-stars text-(--primary) mt-0.5" />
                        <div class="flex-1 text-sm">
                            <p class="text-(--text)">{{ s.content }}</p>
                            <p class="text-xs text-(--text2) mt-0.5">{{ s.reason }}</p>
                        </div>
                        <button @click="acceptAiSuggestion(s)" class="text-xs px-2 py-1 rounded-lg bg-(--primary)/20 text-(--primary) hover:bg-(--primary)/30 shrink-0">
                            Ajouter
                        </button>
                        <button @click="aiSuggestions.splice(i, 1)" class="text-(--text2) hover:text-(--text) shrink-0">
                            <i class="bi bi-x" />
                        </button>
                    </div>
                </div>

                <div v-if="cardsForStep(activeStep).length === 0" class="text-sm text-(--text2) text-center py-8">
                    Aucune carte pour cette étape encore.
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <BoardCard
                        v-for="card in cardsForStep(activeStep)"
                        :key="card.id"
                        :card="card"
                        :is-owner="isOwner"
                        :current-user-id="user?.id"
                        :similar-card-text="card.similarToCardId ? cardTextById(card.similarToCardId) : undefined"
                        @vote="(v: 1 | -1) => voteCard(card, v)"
                        @validate="moderateCard(card, 'VALIDATED')"
                        @reject="moderateCard(card, 'REJECTED')"
                        @delete-card="deleteCard(card)"
                        @merge="mergeCard(card)"
                        @ignore-duplicate="ignoreDuplicate(card)"
                    />
                </div>

            </div>

        </template>

    </div>

    <Popup :is-open="showSynthesis" @close="showSynthesis = false">

        <template #title>Cahier des charges</template>

        <div class="min-h-[200px] max-h-[60vh] overflow-y-auto">
            <div v-if="synthesisLoading" class="flex justify-center py-10">
                <SpinLoader />
            </div>
            <p v-else-if="!synthesisMarkdown" class="text-sm text-(--text2)">
                Aucune carte validée pour le moment : validez des cartes puis générez le document.
            </p>
            <MarkdownRender v-else :content="synthesisMarkdown" />
        </div>

        <template #footer>
            <button @click="showSynthesis = false" class="default">Fermer</button>
            <button
                v-if="synthesisMarkdown"
                @click="copySynthesis"
                class="default"
            >
                <i class="bi bi-clipboard mr-1" /> Copier
            </button>
            <button
                v-if="synthesisMarkdown && validatedCards.length"
                @click="convertToTasks"
                :disabled="convertingTasks"
                class="primary"
            >
                Convertir en tâches ({{ validatedCards.length }})
            </button>
        </template>

    </Popup>

</template>

<script setup lang="ts">

import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { Card, BoardStep, Thread } from '@/types/types';
import { openedOrg, user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import useWSocket, { waitForSocketConnection } from '@/composables/useWSocket';
import { privateKey, decryptThreadKeyWithRsa, encryptMessageWithContentKey, decryptMessageWithContentKey } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import SpinLoader from '@/components/SpinLoader.vue';
import Popup from '@/components/Popup.vue';
import MarkdownRender from '../MarkdownRender.vue';
import BoardCard from './BoardCard.vue';

const props = defineProps<{ thread: Thread }>();
const route = useRoute();
const toast = useToast();

const STEPS: { key: BoardStep; label: string; icon: string }[] = [
    { key: 'CONTEXT', label: 'Contexte & Vision', icon: 'bi bi-compass' },
    { key: 'SCOPE', label: 'Périmètre & Utilisateurs', icon: 'bi bi-people' },
    { key: 'FUNCTIONAL', label: 'Spécifications Fonctionnelles', icon: 'bi bi-list-check' },
    { key: 'TECHNICAL', label: 'Spécifications Techniques', icon: 'bi bi-cpu' },
    { key: 'CONSTRAINTS', label: 'Contraintes & Livrables', icon: 'bi bi-flag' },
];

const activeStep = ref<BoardStep>('CONTEXT');
const loading = ref(true);
const cards = ref<Card[]>([]);
const newCardText = ref('');
const creatingCard = ref(false);
const suggestLoading = ref(false);
const duplicatesLoading = ref(false);
const aiSuggestions = ref<{ content: string; reason: string }[]>([]);
const showSynthesis = ref(false);
const synthesisLoading = ref(false);
const synthesisMarkdown = ref('');
const convertingTasks = ref(false);

const socket = ref<any>(null);
const currentThreadKey = ref<CryptoKey | null>(null);

const orgId = computed(() => route.params.orgId as string);
const spaceId = computed(() => route.params.spaceId as string | undefined);
const isOwner = computed(() => props.thread.ownerId === user.value?.id);

const apiBase = computed(() => `/api/orgs/${orgId.value}/boards/${props.thread.id}`);

const cardsForStep = (step: BoardStep) => cards.value.filter(c => c.step === step);
const cardTextById = (id: string) => cards.value.find(c => c.id === id)?.clearContent;
const validatedCards = computed(() => cards.value.filter(c => c.status === 'VALIDATED'));

watch(activeStep, () => { aiSuggestions.value = []; });

async function decryptCard(card: Card): Promise<Card> {
    if (!currentThreadKey.value || !card.content || !card.iv) {
        return { ...card, clearContent: '[⚠️ Contenu chiffré indisponible]' };
    }
    const clearContent = await decryptMessageWithContentKey(card.content, card.iv, currentThreadKey.value);
    return { ...card, clearContent };
}

async function fetchCards() {
    const res = await sfetch(`${apiBase.value}/cards`).then(r => r.json());
    if (Array.isArray(res)) {
        cards.value = await Promise.all(res.map((c: Card) => decryptCard(c)));
    }
}

function applyIncomingCard(raw: Card) {
    decryptCard(raw).then((decrypted) => {
        const idx = cards.value.findIndex(c => c.id === decrypted.id);
        if (idx === -1) cards.value.push(decrypted);
        else cards.value[idx] = decrypted;
    });
}

async function joinBoard() {
    loading.value = true;
    cards.value = [];
    currentThreadKey.value = null;

    const s = await useWSocket();
    socket.value = s.value;
    if (!socket.value) { loading.value = false; return; }

    const connected = await waitForSocketConnection(socket, 15000);
    if (!connected) {
        toast.show('[E2EE] Impossible de se connecter au serveur. Vérifiez votre connexion et rechargez la page.', 'error');
        loading.value = false;
        return;
    }

    socket.value.off('board:card_created').off('board:card_updated').off('board:card_deleted');

    socket.value.on('board:card_created', ({ threadId, card }: { threadId: string; card: Card }) => {
        if (threadId === props.thread.id) applyIncomingCard(card);
    });

    socket.value.on('board:card_updated', ({ threadId, card }: { threadId: string; card: Partial<Card> & { id: string } }) => {
        if (threadId !== props.thread.id) return;
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx === -1) return;
        if (card.content !== undefined) {
            applyIncomingCard(card as Card);
        } else {
            cards.value[idx] = { ...cards.value[idx], ...card };
        }
    });

    socket.value.on('board:card_deleted', ({ threadId, cardId }: { threadId: string; cardId: string }) => {
        if (threadId === props.thread.id) cards.value = cards.value.filter(c => c.id !== cardId);
    });

    if (!privateKey.value) {
        toast.show('[E2EE] Votre clé privée est introuvable. Déverrouillez votre espace sécurisé (PIN).', 'error');
        loading.value = false;
        return;
    }

    socket.value.emit('get-thread-access', { threadId: props.thread.id }, async (response: { encryptedKey?: string; error?: string }) => {
        if (response.error || !response.encryptedKey) {
            toast.show(response.error || '[E2EE] Impossible de récupérer la clé du cahier des charges.', 'error');
            loading.value = false;
            return;
        }
        try {
            currentThreadKey.value = await decryptThreadKeyWithRsa(response.encryptedKey, privateKey.value!);
            socket.value.emit('join-thread', { threadId: props.thread.id });
            await fetchCards();
        } catch (e) {
            console.error('[Board] decrypt key error', e);
            toast.show('[E2EE] Échec du déchiffrement de la clé.', 'error');
        } finally {
            loading.value = false;
        }
    });
}

async function submitNewCard() {
    const text = newCardText.value.trim();
    if (!text || !currentThreadKey.value) return;
    creatingCard.value = true;
    try {
        await createCard(activeStep.value, text, false);
        newCardText.value = '';
    } finally {
        creatingCard.value = false;
    }
}

async function createCard(step: BoardStep, text: string, isAiGenerated: boolean) {
    if (!currentThreadKey.value) return;
    const { ciphertext, iv } = await encryptMessageWithContentKey(text, currentThreadKey.value);
    const res = await sfetch(`${apiBase.value}/cards`, {
        method: 'POST',
        body: JSON.stringify({ step, content: ciphertext, iv, nonce: 'n_' + Date.now(), isAiGenerated }),
    }).then(r => r.json());
    if (res?.id) {
        cards.value.push({ ...res, clearContent: text });
    } else if (res?.error) {
        toast.show(res.error, 'error');
    }
}

async function voteCard(card: Card, value: 1 | -1) {
    const res = await sfetch(`${apiBase.value}/cards/${card.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ value }),
    }).then(r => r.json());
    if (res?.id) {
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) cards.value[idx] = { ...cards.value[idx], score: res.score, myVote: res.myVote };
    }
}

async function moderateCard(card: Card, status: 'VALIDATED' | 'REJECTED') {
    const res = await sfetch(`${apiBase.value}/cards/${card.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    }).then(r => r.json());
    if (res?.id) {
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) cards.value[idx] = { ...cards.value[idx], status: res.status };
    } else if (res?.error) {
        toast.show(res.error, 'error');
    }
}

async function deleteCard(card: Card) {
    const res = await sfetch(`${apiBase.value}/cards/${card.id}`, { method: 'DELETE' });
    if (res.ok) {
        cards.value = cards.value.filter(c => c.id !== card.id);
    } else {
        const body = await res.json().catch(() => ({}));
        toast.show(body.error || 'Impossible de supprimer cette carte.', 'error');
    }
}

async function mergeCard(card: Card) {
    if (!card.similarToCardId) return;
    const res = await sfetch(`${apiBase.value}/cards/${card.id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ intoCardId: card.similarToCardId }),
    }).then(r => r.json());
    if (res?.id) {
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) cards.value[idx] = { ...cards.value[idx], status: res.status, mergedIntoId: res.mergedIntoId };
        toast.show('Cartes fusionnées.', 'success');
    } else if (res?.error) {
        toast.show(res.error, 'error');
    }
}

async function ignoreDuplicate(card: Card) {
    const res = await sfetch(`${apiBase.value}/cards/${card.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ similarToCardId: null }),
    }).then(r => r.json());
    if (res?.id) {
        const idx = cards.value.findIndex(c => c.id === card.id);
        if (idx !== -1) cards.value[idx] = { ...cards.value[idx], similarToCardId: null };
    }
}

async function requestAiSuggestions() {
    suggestLoading.value = true;
    aiSuggestions.value = [];
    try {
        const existingCards = cards.value
            .filter(c => c.status !== 'REJECTED' && c.status !== 'MERGED')
            .map(c => ({ step: c.step, content: c.clearContent || '' }));

        const res = await sfetch(`${apiBase.value}/ai/suggest`, {
            method: 'POST',
            body: JSON.stringify({ step: activeStep.value, existingCards }),
        }).then(r => r.json());

        if (res?.error) {
            toast.show(res.error, 'error');
        } else {
            aiSuggestions.value = res.suggestions || [];
            if (!aiSuggestions.value.length) toast.show("L'IA n'a pas de nouvelle suggestion pour cette étape.", 'info');
        }
    } catch (e) {
        console.error('[Board] ai/suggest error', e);
        toast.show("Erreur lors de la demande d'idées à l'IA.", 'error');
    } finally {
        suggestLoading.value = false;
    }
}

async function acceptAiSuggestion(s: { content: string; reason: string }) {
    await createCard(activeStep.value, s.content, true);
    aiSuggestions.value = aiSuggestions.value.filter(x => x !== s);
}

async function findDuplicates() {
    duplicatesLoading.value = true;
    try {
        const candidates = cards.value.filter(c => c.status === 'PENDING' || c.status === 'VALIDATED');
        if (candidates.length < 2) {
            toast.show('Pas assez de cartes pour comparer.', 'info');
            return;
        }
        const res = await sfetch(`${apiBase.value}/ai/duplicates`, {
            method: 'POST',
            body: JSON.stringify({ cards: candidates.map(c => ({ id: c.id, step: c.step, content: c.clearContent || '' })) }),
        }).then(r => r.json());

        if (res?.error) {
            toast.show(res.error, 'error');
            return;
        }

        const pairs = res.pairs || [];
        for (const pair of pairs) {
            await sfetch(`${apiBase.value}/cards/${pair.cardIdA}`, {
                method: 'PATCH',
                body: JSON.stringify({ similarToCardId: pair.cardIdB }),
            }).then(r => r.json()).then((updated) => {
                if (updated?.id) {
                    const idx = cards.value.findIndex(c => c.id === updated.id);
                    if (idx !== -1) cards.value[idx] = { ...cards.value[idx], similarToCardId: updated.similarToCardId };
                }
            });
        }
        toast.show(pairs.length ? `${pairs.length} doublon(s) potentiel(s) détecté(s).` : 'Aucun doublon détecté.', 'success');
    } catch (e) {
        console.error('[Board] ai/duplicates error', e);
        toast.show('Erreur lors de la détection des doublons.', 'error');
    } finally {
        duplicatesLoading.value = false;
    }
}

async function openSynthesis() {
    showSynthesis.value = true;
    synthesisMarkdown.value = '';
    if (validatedCards.value.length === 0) return;
    synthesisLoading.value = true;
    try {
        const res = await sfetch(`${apiBase.value}/ai/synthesize`, {
            method: 'POST',
            body: JSON.stringify({ cards: validatedCards.value.map(c => ({ step: c.step, content: c.clearContent || '' })) }),
        }).then(r => r.json());
        if (res?.error) toast.show(res.error, 'error');
        else synthesisMarkdown.value = res.markdown || '';
    } catch (e) {
        console.error('[Board] ai/synthesize error', e);
        toast.show('Erreur lors de la génération du document.', 'error');
    } finally {
        synthesisLoading.value = false;
    }
}

function copySynthesis() {
    navigator.clipboard.writeText(synthesisMarkdown.value);
    toast.show('Document copié.', 'success');
}

async function convertToTasks() {
    convertingTasks.value = true;
    try {
        const res = await sfetch(`${apiBase.value}/convert-to-tasks`, {
            method: 'POST',
            body: JSON.stringify({
                spaceId: spaceId.value,
                cards: validatedCards.value.map(c => ({
                    cardId: c.id,
                    title: (c.clearContent || '').slice(0, 80),
                    description: c.clearContent,
                })),
            }),
        }).then(r => r.json());

        if (res?.error) {
            toast.show(res.error, 'error');
        } else {
            toast.show(`${res.tasks?.length || 0} tâche(s) créée(s).`, 'success');
            showSynthesis.value = false;
        }
    } catch (e) {
        console.error('[Board] convert-to-tasks error', e);
        toast.show('Erreur lors de la conversion en tâches.', 'error');
    } finally {
        convertingTasks.value = false;
    }
}

watch(() => props.thread.id, (newId, oldId) => {
    if (newId && newId !== oldId) {
        socket.value?.emit('leave-thread', oldId);
        joinBoard();
    }
});

onMounted(joinBoard);

onUnmounted(() => {
    socket.value?.off('board:card_created').off('board:card_updated').off('board:card_deleted');
    socket.value?.emit('leave-thread', props.thread.id);
});

</script>
