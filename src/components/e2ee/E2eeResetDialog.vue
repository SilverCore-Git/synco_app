<template>
    <Popup :isOpen="isOpen" @close="close">
        <template #title>Réinitialiser le chiffrement</template>

        <template v-if="step === 'warn'">
            <ul class="reset-losses">
                <li><i class="bi bi-x-circle-fill" aria-hidden="true" /> Vos messages actuels deviennent illisibles</li>
                <li><i class="bi bi-x-circle-fill" aria-hidden="true" /> Vos autres appareils sont déconnectés</li>
            </ul>
            <p class="reset-note">Irréversible : personne ne pourra les récupérer, pas même nous.</p>

            <label for="reset-phrase" class="reset-label">Tapez <strong>{{ RESET_PHRASE }}</strong> pour confirmer</label>
            <input id="reset-phrase" v-model="typed" type="text" @keydown.stop @keyup.enter="sendCode"
                autocomplete="off" autocapitalize="characters" spellcheck="false"
                class="reset-input" />
        </template>

        <template v-else>
            <label for="reset-code" class="reset-label">
                Code envoyé à <strong>{{ maskedEmail }}</strong>
            </label>
            <input id="reset-code" v-model="code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"
                placeholder="000000" @keydown.stop @keyup.enter="confirmCode"
                class="reset-input reset-code" />
            <button @click="sendCode" :disabled="busy" class="reset-resend">Renvoyer le code</button>
        </template>

        <template #footer>
            <button @click="close" class="default">Annuler</button>
            <button v-if="step === 'warn'" @click="sendCode" :disabled="!canSendCode" class="danger">Recevoir le code</button>
            <button v-else @click="confirmCode" :disabled="code.length !== 6 || busy" class="danger">Réinitialiser</button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
/**
 * Confirmation de la réinitialisation E2EE v4 : les deux pertes, le mot à taper, puis le code reçu par e-mail.
 * Le code validé arme côté serveur la fenêtre que consomme POST /api/e2ee/v4/reset ; ce composant ne crée
 * aucune clé : l'appelant enchaîne (V4Gate passe en création de nouvelles clés).
 * Utilisé par l'écran de verrouillage (dernier recours) et par Paramètres › Sécurité › Zone de danger.
 */
import { computed, ref, watch } from 'vue';
import Popup from '../Popup.vue';
import sfetch from '@/assets/utils/sfetch';
import { user } from '@/assets/var';
import { useToast } from '@/composables/useToast';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: []; confirmed: [] }>();

const toast = useToast();

// Sans accent : tapable sur tous les claviers. La saisie est comparée sans accents ni casse (« réinitialiser » passe aussi).
const RESET_PHRASE = 'REINITIALISER';
const normalizePhrase = (s: string) => s.trim().normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();

const step = ref<'warn' | 'code'>('warn');
const typed = ref('');
const code = ref('');
const busy = ref(false);
const canSendCode = computed(() => normalizePhrase(typed.value) === RESET_PHRASE && !busy.value);

/** « m•••@gmail.com » : l'utilisateur reconnaît sa boîte sans que l'adresse s'affiche en entier. */
const maskedEmail = computed(() => {
    const email = user.value?.email || '';
    const at = email.indexOf('@');
    if (at < 1) return 'votre adresse e-mail';
    return `${email[0]}•••${email.slice(at)}`;
});

function resetState() {
    step.value = 'warn';
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
            code.value = '';
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
        // L'API de dev accepte un code de test (NODE_ENV=development) : on le dit clairement.
        const body = await res.json().catch(() => ({}));
        if (body.dev) toast.show(body.message || 'Mode développement : code de test accepté.', 'warning', 8000);
        resetState();
        emit('confirmed');
    } finally {
        busy.value = false;
    }
}
</script>

<style scoped>
.reset-losses { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.625rem; }
.reset-losses li { display: flex; align-items: center; gap: 0.625rem; font-size: 0.95rem; font-weight: 600; color: var(--text); }
.reset-losses i { flex: none; color: #ef4444; font-size: 1rem; }
.reset-note { margin-top: 0.75rem; font-size: 0.8125rem; color: var(--text2); }
.reset-label { display: block; margin-top: 1.5rem; margin-bottom: 0.5rem; font-size: 0.875rem; color: var(--text2); }
.reset-label strong { color: var(--text); font-weight: 600; }
.reset-input {
    width: 100%; border-radius: 0.75rem; padding: 0.625rem 0.875rem; font-size: 0.95rem; color: var(--text);
    background: var(--bg2); border: 1px solid var(--border-color); transition: border-color 0.15s ease;
}
.reset-input:focus { outline: none; border-color: #ef4444; }
.reset-code { text-align: center; font-size: 1.375rem; letter-spacing: 0.5em; font-variant-numeric: tabular-nums; }
.reset-resend { margin-top: 0.75rem; font-size: 0.8125rem; color: var(--text2); text-decoration: underline; text-underline-offset: 2px; }
.reset-resend:hover { color: var(--text); }
</style>
