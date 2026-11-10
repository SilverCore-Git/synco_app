<template>

    <div class="space-y-4">

        <!-- La clé, en groupes de 4 caractères : plus facile à lire et à recopier -->
        <div class="relative rounded-xl border border-(--border-color) bg-(--bg2) py-4 pl-4 pr-12">
            <div class="grid grid-cols-4 sm:grid-cols-7 gap-x-3 gap-y-2 font-mono text-sm sm:text-base tracking-wider text-(--text) text-center select-all">
                <span v-for="(group, i) in groups" :key="i">{{ group }}</span>
            </div>
            <button type="button" class="absolute top-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center text-(--text2) hover:text-(--primary) hover:bg-(--text)/5 transition-colors"
                :title="copied ? 'Copiée' : 'Copier'" :aria-label="copied ? 'Clé copiée' : 'Copier la clé'" @click="copy">
                <i class="bi" :class="copied ? 'bi-check2 text-(--primary)' : 'bi-copy'" />
            </button>
        </div>

        <button type="button" class="w-full text-sm flex items-center justify-center gap-2" :class="saved ? 'second' : 'primary'" @click="download">
            <i class="bi" :class="saved ? 'bi-check2' : 'bi-download'" /> {{ saved ? 'Clé enregistrée' : 'Télécharger la clé' }}
        </button>

        <p class="text-xs text-(--text2) text-center">
            À garder en lieu sûr. Elle ne sera plus affichée.
        </p>

        <p v-if="!saved" class="text-center">
            <button type="button" class="text-xs text-(--text2) hover:text-(--primary) underline underline-offset-2 transition-colors" @click="markSaved">
                Je l'ai notée autrement
            </button>
        </p>

    </div>

</template>

<script setup lang="ts">

import { computed, ref } from 'vue';
import { recoveryKeyFile } from '@/assets/e2eeV4/session';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ keyText: string; accountLabel: string }>();
/** Émis dès que la clé a été téléchargée, copiée ou déclarée notée : l'écran peut laisser continuer. */
const emit = defineEmits<{ saved: [] }>();
const toast = useToast();
const copied = ref(false);
const saved = ref(false);

const groups = computed(() => props.keyText.split('-'));

const markSaved = () => {
    saved.value = true;
    emit('saved');
};

const download = () => {
    const blob = new Blob([recoveryKeyFile(props.keyText, props.accountLabel)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'synco-cle-de-recuperation.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markSaved();
};

const copy = async () => {
    try {
        await navigator.clipboard.writeText(props.keyText);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
        markSaved();
    } catch {
        toast.show('Copie impossible : sélectionnez la clé et copiez-la à la main.', 'error');
    }
};

</script>
