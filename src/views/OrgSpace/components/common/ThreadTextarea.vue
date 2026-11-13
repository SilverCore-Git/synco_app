<template>

    <div class="relative w-full flex flex-col">
        
        <MentionsList
            :is-open="showMentions"
            :search-query="mentionQuery"
            :users="activeList"
            :active-index="activeMentionIndex"
            :kind="activeTriggerKind ?? 'user'"
            :loading="isSearchingRemote"
            @select="insertMention"
        />

        <textarea
            ref="textareaRef"
            :value="displayValue"
            @input="onInput"
            :placeholder="placeholder"
            rows="1"
            class="
                bg-transparent border-none outline-none 
                resize-none w-full text-sm text-(--text) 
                placeholder:text-(--text2)
                py-2 pr-8 overflow-hidden
                disabled:cursor-not-allowed disabled:text-(--text)/40
            "
            :disabled="disabled"
            @keydown.enter="handleEnter"
            @keydown="handleKeydown"
        />

    </div>

</template>

<script lang="ts" setup>

import MentionsList from '@/components/common/MentionsList.vue';
import { type MentionEntry } from '@/composables/useMentions';
import {
    TRIGGERS, TRIGGER_QUERY_REGEX, KIND_TO_TRIGGER_CHAR, buildReferenceToken,
    extractReferenceTokens, type ReferenceKind,
} from '@/composables/useReferences';
import { useMentionSource } from '@/composables/mentionSource';
import { ref, computed, watch, nextTick, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { autoFocus } from '@/assets/utils/autoFocus';

const props = withDefaults(defineProps<{
    modelValue: string;
    placeholder?: string;
    disabled?: boolean;
    // true (chat) : Entrée seule envoie. false (ex. description de tâche,
    // formulaire multi-ligne) : Entrée insère un saut de ligne normal, seul
    // Ctrl/Cmd+Entrée envoie.
    submitOnEnter?: boolean;
    // false quand un autre champ du même formulaire doit garder le focus
    // initial (ex. le titre dans CreateTaskModal) — sans quoi ce composant
    // volerait le focus à l'ouverture, comme le fait le composer de chat.
    autoFocus?: boolean;
}>(), {
    submitOnEnter: true,
    autoFocus: true
});

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
    (e: 'send', value: string): void;
    (e: 'input'): void;
    (e: 'edit-last'): void;
}>();

const route = useRoute();
const textareaRef = ref<HTMLTextAreaElement | null>(null);
// ----------------------------------

const showMentions = ref<boolean>(false);
const mentionQuery = ref<string>('');
const activeMentionIndex = ref<number>(0);
const startMentionIndex = ref<number>(-1);
const activeTriggerKind = ref<ReferenceKind | null>(null);

// Personnes/rôles citables et recherche des références : ceux de la
// conversation englobante (MessageChannel → ChatTimeline), sinon ceux de
// l'organisation ouverte (formulaires de tâche, DM, IA…).
const mentions = useMentionSource();
// Rôles susceptibles d'avoir changé depuis le dernier champ ouvert.
mentions.refresh?.();

const searchResults = ref<MentionEntry[]>([]);
// Affiche un spinner dans MentionsList pendant l'aller-retour /mentions/search
// débouncé (#/!/& : pas de filtrage local possible, voir searchRemote) — sans
// ça la liste restait vide et silencieuse pendant les ~200ms + réseau,
// donnant l'impression qu'aucun résultat n'existait.
const isSearchingRemote = ref<boolean>(false);

// --- Affichage lisible dans le <textarea> -----------------------------
// modelValue reste TOUJOURS le contenu brut avec tokens <kind:id> (c'est le
// contrat existant : les consumers — CreateTaskModal.handleSubmit,
// extractReferenceTokens, l'envoi du message... — lisent modelValue
// directement, pas l'event 'send'). Seul ce que montre le <textarea> change :
// pendingSubs mémorise les paires {display, token} des références insérées
// (ou déjà présentes au montage), et displayValue/toRaw font l'aller-retour.
// Round-trip idempotent (toPretty(toRaw(x)) === x tant que le texte affiché
// n'a pas été modifié À L'INTÉRIEUR d'un display existant) donc pas de
// conflit avec le curseur natif du textarea — si l'utilisateur édite un
// display en place, la sub ne matche plus et ce fragment redevient simple
// texte au lieu de rester lié (dégradation silencieuse, pas de corruption).
const pendingSubs = ref<{ display: string; token: string }[]>([]);

const toRaw = (pretty: string): string => {
    let raw = pretty;
    for (const sub of pendingSubs.value) raw = raw.split(sub.display).join(sub.token);
    return raw;
};

const toPretty = (raw: string): string => {
    let pretty = raw;
    for (const sub of pendingSubs.value) pretty = pretty.split(sub.token).join(sub.display);
    return pretty;
};

const displayValue = computed(() => toPretty(props.modelValue));

// Résout les labels des tokens déjà présents dans modelValue (édition d'un
// message/description existant) pour peupler pendingSubs — sans ça
// displayValue afficherait les tokens bruts jusqu'à la prochaine insertion.
const primePendingSubsFromContent = async (raw: string) => {
    const refs = extractReferenceTokens(raw);
    if (!refs.length) return;

    try {
        const items = await mentions.resolve(refs);
        if (!items) return;
        for (const item of items) {
            if (!item.ok) continue; // pas de label sans accès — reste en token brut, pas de perte silencieuse
            const token = buildReferenceToken(item.type, item.id);
            if (pendingSubs.value.some(s => s.token === token)) continue;
            pendingSubs.value.push({ display: `${KIND_TO_TRIGGER_CHAR[item.type as ReferenceKind]}${item.label}`, token });
        }
    } catch (err) {
        console.error('[ThreadTextarea] Failed to prime reference display text:', err);
    }
};

const activeList = computed<MentionEntry[]>(() =>
    activeTriggerKind.value === 'user' || !activeTriggerKind.value
        ? mentions.entries.value
        : searchResults.value
);

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

// #/!/& n'ont pas de liste locale équivalente aux membres du salon — les
// noms sont chiffrés côté serveur (voir mentions.ts), impossible de filtrer
// sans un aller-retour réseau.
const searchRemote = (kind: ReferenceKind, query: string) => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    isSearchingRemote.value = true;
    searchDebounceTimer = setTimeout(async () => {
        if (!mentions.search) { searchResults.value = []; isSearchingRemote.value = false; return; }
        try {
            searchResults.value = await mentions.search(kind, query);
        } catch (err) {
            console.error('[ThreadTextarea] mentions/search failed:', err);
            searchResults.value = [];
        } finally {
            isSearchingRemote.value = false;
        }
    }, 200);
};

const updateMentionState = (text: string, selectionStart: number) => {

    if (text === '') {
        showMentions.value = false;
        return;
    }

    const textBeforeCursor = text.slice(0, selectionStart);
    const mentionMatch = textBeforeCursor.match(TRIGGER_QUERY_REGEX);

    if (mentionMatch)
    {
        const triggerChar = mentionMatch[1]!;
        const kind = TRIGGERS[triggerChar]?.kind ?? 'user';

        // Références #/!/& désactivées pour cette conversation (pas de
        // recherche fournie) : le caractère reste du texte ordinaire.
        if (kind !== 'user' && !mentions.search) {
            showMentions.value = false;
            return;
        }

        showMentions.value = true;
        activeTriggerKind.value = kind;
        mentionQuery.value = mentionMatch[2] || '';
        startMentionIndex.value = textBeforeCursor.lastIndexOf(triggerChar);

        if (kind !== 'user') searchRemote(kind, mentionQuery.value);
    }
    else
    {
        showMentions.value = false;
    }

};

const insertMention = (entry: MentionEntry) => {

    if (startMentionIndex.value === -1) return;

    // startMentionIndex/selectionStart sont mesurés sur le texte AFFICHÉ
    // (updateMentionState tourne sur target.value dans onInput) — il faut
    // donc découper displayValue ici, pas modelValue (brut, longueur
    // différente dès qu'une référence précède le point d'insertion).
    const pretty = displayValue.value;
    const beforeMention = pretty.slice(0, startMentionIndex.value);
    const afterMention = pretty.slice(textareaRef.value?.selectionStart || 0);

    // entry.kind : présent uniquement pour les entrées "rôle" du picker mixte
    // ouvert par '@' (voir orgRoles plus haut) — sinon le kind vient du
    // trigger lui-même (activeTriggerKind), identique pour toute la liste.
    const kind = entry.kind ?? activeTriggerKind.value ?? 'user';

    // @everyone/@here n'ont pas d'id réel derrière (pas une entité, un mot-clé
    // de diffusion) — on garde le texte littéral que l'ancien renderMentions
    // sait déjà résoudre, plutôt qu'un faux token <@:__everyone__>.
    let insertText: string;
    if (entry.special) {
        insertText = `@${entry.pseudo}`;
    } else {
        const token = buildReferenceToken(kind, entry.id);
        insertText = `${KIND_TO_TRIGGER_CHAR[kind]}${entry.name}`;
        pendingSubs.value.push({ display: insertText, token });
    }

    const updatedPretty = `${beforeMention}${insertText} ${afterMention}`;
    emit('update:modelValue', toRaw(updatedPretty));

    showMentions.value = false;
    activeMentionIndex.value = 0;

    nextTick(() => {
        textareaRef.value?.focus();
        adjustHeight();
    });

};

const handleKeydown = (e: KeyboardEvent) => {

    if (e.key === 'ArrowUp' && !showMentions.value && props.modelValue === '') {
        emit('edit-last');
        return;
    }

    if (!showMentions.value) return;

    const query = mentionQuery.value?.toLowerCase() || '';
    // searchResults est déjà filtré côté serveur pour #/!/& — un second
    // filtre client sur un `label` déchiffré serait redondant.
    const filtered = activeTriggerKind.value === 'user' || !activeTriggerKind.value
        ? mentions.entries.value.filter(u => u.name.toLowerCase().includes(query) || (u.pseudo && u.pseudo.toLowerCase().includes(query)))
        : searchResults.value;

    if (!filtered.length) return;

    if (e.key === 'ArrowDown') 
    {
        e.preventDefault();
        activeMentionIndex.value = (activeMentionIndex.value + 1) % filtered.length;
    } 
    else if (e.key === 'ArrowUp') 
    {
        e.preventDefault();
        activeMentionIndex.value = (activeMentionIndex.value - 1 + filtered.length) % filtered.length;
    } 
    else if (e.key === 'Enter' || e.key === 'Tab') 
    {
        e.preventDefault();
        insertMention(filtered[activeMentionIndex.value]!);
    } 
    else if (e.key === 'Escape') 
    {
        e.preventDefault();
        showMentions.value = false;
    }

};

defineExpose({
  textarea: textareaRef
});

const adjustHeight = () => {
    const textarea = textareaRef.value;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, 200);
    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 200 ? 'auto' : 'hidden';
};

const onInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement;
    // Détection du trigger (@/#/!/&) et découpage insertMention opèrent sur
    // le texte affiché (target.value) — seul ce qui remonte au parent est
    // converti en brut.
    emit('update:modelValue', toRaw(target.value));
    emit('input');
    adjustHeight();
    updateMentionState(target.value, target.selectionStart ?? target.value.length);
};

const handleEnter = (event: KeyboardEvent) => {

    if (showMentions.value) return;
    if (event.shiftKey) return;
    // submitOnEnter=false : seule Ctrl/Cmd+Entrée envoie, Entrée seule doit
    // pouvoir insérer un saut de ligne normalement (pas de preventDefault).
    if (!props.submitOnEnter && !event.ctrlKey && !event.metaKey) return;

    event.preventDefault();
    if (props.modelValue.trim() !== '')
    {
        emit('send', props.modelValue);
    }

};

watch(() => props.modelValue, (newVal) => {
    if (newVal === '')
    {
        showMentions.value = false;
        pendingSubs.value = [];
        nextTick(() => {
            if (textareaRef.value) {
                textareaRef.value.style.height = 'auto';
                textareaRef.value.style.overflowY = 'hidden';
            }
        });
    }
});

// Contenu pré-rempli (édition d'une description/d'un message existant) ou
// modifié de l'extérieur : sans ça le textarea reste à rows="1" tant que
// l'utilisateur n'a pas tapé. Couvre aussi la résolution async des labels
// de références (primePendingSubsFromContent) qui change la longueur affichée.
watch(displayValue, () => nextTick(adjustHeight));

watch(() => route.params.threadId, async () => {
    showMentions.value = false;
    await nextTick();
    autoFocus(textareaRef.value);
});

onMounted(async () => {
    primePendingSubsFromContent(props.modelValue);
    await nextTick();
    adjustHeight();
    if (!props.autoFocus) return;
    await nextTick();
    autoFocus(textareaRef.value);
});

</script>