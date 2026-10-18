<template>

    <div class="space-y-4">

        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-4">
            <p class="font-mono text-sm sm:text-base tracking-wider text-(--text) text-center leading-relaxed break-words select-all">
                {{ keyText }}
            </p>
        </div>

        <div class="flex flex-wrap gap-2 justify-center">
            <button type="button" class="primary text-sm flex items-center gap-2" @click="download">
                <i class="bi bi-download" /> Télécharger
            </button>
            <button type="button" class="second text-sm flex items-center gap-2" @click="copy">
                <i class="bi" :class="copied ? 'bi-check2' : 'bi-copy'" /> {{ copied ? 'Copiée' : 'Copier' }}
            </button>
        </div>

        <ul class="text-xs text-(--text2) space-y-1.5 leading-relaxed">
            <li><i class="bi bi-info-circle mr-1" />Elle ouvre vos messages sur un nouvel appareil quand aucun autre appareil n'est disponible.</li>
            <li><i class="bi bi-safe mr-1" />Gardez-la hors ligne (papier, gestionnaire de mots de passe). Elle ne sera plus affichée.</li>
            <li><i class="bi bi-exclamation-triangle mr-1 text-amber-500" />Quiconque la possède, avec l'accès à votre compte, peut lire vos messages.</li>
        </ul>

    </div>

</template>

<script setup lang="ts">

import { ref } from 'vue';
import { recoveryKeyFile } from '@/assets/e2eeV4/session';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ keyText: string; accountLabel: string }>();
const emit = defineEmits<{ saved: [] }>();
const toast = useToast();
const copied = ref(false);

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
    emit('saved');
};

const copy = async () => {
    try {
        await navigator.clipboard.writeText(props.keyText);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
        emit('saved');
    } catch {
        toast.show('Copie impossible : sélectionnez la clé et copiez-la à la main.', 'error');
    }
};

</script>
