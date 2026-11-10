<template>
    <Popup :isOpen="isOpen" @close="close">
        <template #title>Réinitialiser le chiffrement</template>
        <template v-if="step === 'warn'">
            <div class="rounded-lg border-2 border-red-500 bg-red-500/10 p-4">
                <p class="text-red-500 font-bold text-base uppercase tracking-wide">
                    <i class="bi bi-exclamation-triangle-fill mr-1" /> Action destructive et irréversible
                </p>
                <p class="text-(--text) text-sm mt-2">
                    De nouvelles clés seront créées : <strong>tous vos messages déjà envoyés et reçus deviendront illisibles</strong>,
                    et <strong>tous vos autres appareils seront déconnectés</strong>. Personne, pas même nous, ne pourra les récupérer.
                </p>
            </div>
            <p class="text-(--text2) text-xs mt-3">
                <template v-if="fromSettings">
                    Pour simplement changer de méthode de déverrouillage ou remplacer votre clé de récupération, annulez :
                    ces réglages n'effacent rien. Un code de confirmation sera envoyé à votre adresse e-mail.
                </template>
                <template v-else>
                    Si l'un de vos appareils est encore connecté, ou si vous retrouvez votre clé de récupération, annulez et utilisez-les plutôt.
                    Un code de confirmation sera envoyé à votre adresse e-mail.
                </template>
            </p>
            <label class="flex items-start gap-2 mt-4 text-sm text-(--text) cursor-pointer">
                <input type="checkbox" v-model="ackLoss" class="mt-1" />
                <span>Je comprends que tous mes anciens messages seront perdus.</span>
            </label>
            <label class="flex items-start gap-2 mt-2 text-sm text-(--text) cursor-pointer">
                <input type="checkbox" v-model="ackIrreversible" class="mt-1" />
                <span>Je comprends que cette action est irréversible.</span>
            </label>
            <p class="text-(--text2) text-xs mt-4">Tapez <strong class="text-red-500">{{ RESET_PHRASE }}</strong> pour confirmer :</p>
            <input v-model="typed" type="text" @keydown.stop autocomplete="off" spellcheck="false" :placeholder="RESET_PHRASE"
                class="w-full mt-1 rounded-md border border-(--border) bg-transparent px-3 py-2 text-sm" />
        </template>
        <template v-else>
            <p class="text-(--text) text-sm">Saisissez le code à 6 chiffres envoyé à votre adresse e-mail. Il expire dans 15 minutes.</p>
            <input v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"
                placeholder="000000" @keydown.stop @keyup.enter="confirmCode"
                class="w-full mt-3 rounded-md border border-(--border) bg-transparent px-3 py-2 text-center text-xl tracking-[0.5em]" />
            <button @click="sendCode" :disabled="busy" class="mt-3 text-xs text-(--text2) hover:text-(--primary) underline">Renvoyer un code</button>
        </template>
        <template #footer>
            <button @click="close" class="default">Annuler</button>
            <button v-if="step === 'warn'" @click="sendCode" :disabled="!canSendCode" class="danger">Envoyer le code par e-mail</button>
            <button v-else @click="confirmCode" :disabled="code.length !== 6 || busy" class="danger">Valider</button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
/**
 * Confirmation de la réinitialisation E2EE v4 : avertissement, phrase à taper, puis code reçu par e-mail.
 * Le code validé arme côté serveur la fenêtre que consomme POST /api/e2ee/v4/reset ; ce composant ne crée
 * aucune clé : l'appelant enchaîne (V4Gate passe en création de nouvelles clés).
 * Utilisé par l'écran de verrouillage (dernier recours) et par Paramètres › Sécurité › Zone de danger.
 */
import { computed, ref, watch } from 'vue';
import Popup from '../Popup.vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ isOpen: boolean; fromSettings?: boolean }>();
const emit = defineEmits<{ close: []; confirmed: [] }>();

const toast = useToast();

// Sans accent : tapable sur tous les claviers. La saisie est comparée sans accents ni casse (« réinitialiser » passe aussi).
const RESET_PHRASE = 'REINITIALISER';
const normalizePhrase = (s: string) => s.trim().normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

const step = ref<'warn' | 'code'>('warn');
const ackLoss = ref(false);
const ackIrreversible = ref(false);
const typed = ref('');
const code = ref('');
const busy = ref(false);
const canSendCode = computed(() =>
    ackLoss.value && ackIrreversible.value && normalizePhrase(typed.value) === RESET_PHRASE && !busy.value);

function resetState() {
    step.value = 'warn';
    ackLoss.value = false;
    ackIrreversible.value = false;
    typed.value = '';
    code.value = '';
}

// Chaque ouverture repart de l'avertissement.
watch(() => props.isOpen, open => { if (open) resetState(); });

function close() {
    resetState();
    emit('close');
}

async function sendCode() {
    if (step.value === 'warn' && !canSendCode.value) return;
    busy.value = true;
    try {
        const res = await sfetch('/api/users/me/pin/reset/request', { method: 'POST' });
        if (res.ok) {
            step.value = 'code';
            toast.show('Un code de confirmation vous a été envoyé par e-mail.', 'info', 8000);
        } else {
            toast.show((await res.json().catch(() => ({}))).error || "Impossible d'envoyer le code", 'error');
        }
    } finally {
        busy.value = false;
    }
}

async function confirmCode() {
    if (!/^\d{6}$/.test(code.value) || busy.value) return;
    busy.value = true;
    try {
        const res = await sfetch('/api/users/me/pin/reset/confirm', { method: 'POST', body: JSON.stringify({ code: code.value }) });
        if (!res.ok) {
            toast.show((await res.json().catch(() => ({}))).error || 'Code incorrect', 'error');
            code.value = '';
            return;
        }
        resetState();
        emit('confirmed');
    } finally {
        busy.value = false;
    }
}
</script>
