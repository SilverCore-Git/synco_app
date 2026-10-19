<template>

    <div class="space-y-4">
        <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Appareils</h4>

        <div class="p-6 bg-(--bg2) border border-(--border-color) rounded-xl space-y-4">
            <div class="flex items-start gap-4">
                <i class="bi bi-phone-flip text-3xl text-(--primary)" />
                <div class="flex-1">
                    <p class="font-bold text-(--text)">Chiffrement multi-appareil</p>
                    <ul class="text-sm text-(--text2) mt-2 space-y-1.5 leading-relaxed">
                        <li>• Vos clés ne dépendent plus d'un code PIN connu du serveur : elles sont protégées par vos appareils (biométrie, passkey, trousseau du système).</li>
                        <li>• Ajoutez vos autres appareils par QR code et déconnectez à distance un appareil perdu.</li>
                        <li>• Une clé de récupération vous est proposée en cas de perte de tous vos appareils.</li>
                        <li>• Vos messages, fichiers et conversations restent lisibles : vos clés ne changent pas.</li>
                    </ul>
                </div>
            </div>

            <p v-if="!eligible" class="text-xs text-amber-500 leading-relaxed">
                <i class="bi bi-info-circle-fill mr-1" />
                {{ notEligibleReason }}
            </p>
            <div v-else class="flex flex-wrap items-center gap-3">
                <button class="primary text-sm" @click="open">Passer au chiffrement multi-appareil</button>
                <p class="text-[11px] text-(--text2)">Les anciennes versions de l'application ne sauront plus ouvrir ce compte.</p>
            </div>
        </div>

        <Popup :isOpen="state.open" @close="close">
            <template #title>Passer au chiffrement multi-appareil</template>

            <div v-if="state.step === 'pin'" class="flex flex-col items-center">
                <p class="text-sm text-(--text2) mb-6 text-center">Saisissez votre code PIN actuel pour confirmer.</p>
                <p v-if="lockoutSeconds > 0" class="text-amber-500 text-sm mb-4">Trop de tentatives. Réessayez dans {{ lockoutSeconds }} s.</p>
                <PinPad v-else v-model="state.pin" auto-submit :disabled="state.busy" :error-tick="state.errorTick" @submit="submitPin" />
            </div>

            <div v-else-if="state.step === 'choose-pin'" class="flex flex-col items-center">
                <p class="text-sm text-(--text2) mb-6 text-center max-w-sm">
                    {{ state.firstPin ? 'Confirmez ce code.' : "Ce navigateur ne propose pas de passkey compatible : choisissez le code PIN local de cet appareil (4 chiffres). Il ne quittera jamais l'appareil." }}
                </p>
                <PinPad v-model="state.pin" :error-tick="state.errorTick" @submit="submitLocalPin" />
            </div>

            <div v-else-if="state.step === 'working'" class="py-10 flex flex-col items-center gap-3">
                <SpinLoader />
                <p class="text-sm text-(--text2)">Protection de vos clés sur cet appareil…</p>
            </div>

            <div v-else-if="state.step === 'recovery'" class="space-y-4">
                <p class="text-sm text-(--text2)">Voici votre <strong class="text-(--text)">clé de récupération</strong>. Si vous perdez tous vos appareils, c'est le seul moyen de retrouver vos messages.</p>
                <RecoveryKeyPanel :key-text="state.recoveryText" :account-label="accountLabel" @saved="state.saved = true" />
                <label class="flex items-start gap-2 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="state.saved" class="mt-1" />
                    <span>J'ai conservé ma clé de récupération en lieu sûr.</span>
                </label>
            </div>

            <template #footer>
                <button class="default" :disabled="state.busy" @click="close">Annuler</button>
                <template v-if="state.step === 'recovery'">
                    <button class="second" :disabled="state.busy" @click="state.skipConfirm = true">Sans clé de récupération</button>
                    <button class="primary" :class="{ loader: state.busy }" :disabled="!state.saved || state.busy" @click="finish(true)">Terminer</button>
                </template>
            </template>
        </Popup>

        <ConfirmDelete
            :show="state.skipConfirm"
            title="Continuer sans clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="Sans clé de récupération, la perte de tous vos appareils rend vos messages définitivement illisibles. Vous pourrez en créer une plus tard."
            button-text="Continuer sans clé"
            :loading="state.busy"
            @confirm="state.skipConfirm = false; finish(false)"
            @cancel="state.skipConfirm = false"
        />
    </div>

</template>

<script setup lang="ts">

import { computed, reactive, ref } from 'vue';
import Popup from '../Popup.vue';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import SpinLoader from '../SpinLoader.vue';
import PinPad from '../e2ee/PinPad.vue';
import RecoveryKeyPanel from '../e2ee/RecoveryKeyPanel.vue';
import { user } from '@/assets/var';
import { refetchUser } from '@/assets/init';
import sfetch from '@/assets/utils/sfetch';
import { SALT_V3_PREFIX, openV3IdentityForMigration } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import { VaultError } from '@/assets/deviceVault';
import { IdentityMismatchError, V4ApiError, prepareV4Account, type DeviceContext, type EnrollOptions, type PreparedAccount } from '@/assets/e2eeV4/session';
import { applyIdentityKeys, defaultDeviceName, detectPlatform, deviceContext, enrollmentVaults, sealedFrom, servedFrom } from '@/assets/e2eeV4/runtime';

/**
 * Migration v3 → v4 proposée à un compte v3 déverrouillé (doc/securite/13-e2ee-v4-multi-appareil.md §8).
 * Les MÊMES clés privées sont réenveloppées sous la clé de compte ; le serveur supprime alors le
 * matériel PIN (UserPinSecret). Pas de double écriture : l'ancien blob v3 est remplacé.
 */

const toast = useToast();
const accountLabel = computed(() => user.value?.email || user.value?.name || '');

const eligible = computed(() => !!user.value?.pinSalt?.startsWith(SALT_V3_PREFIX) && !!user.value?.publicSignKey && !!user.value?.encryptedSignPrivateKey);
const notEligibleReason = computed(() => {
    const salt = user.value?.pinSalt || '';
    if (salt.startsWith('v2:')) return "Pas encore disponible pour les comptes protégés par un code PIN long (6 à 10 chiffres).";
    if (!salt.startsWith(SALT_V3_PREFIX)) return 'Déverrouillez une fois votre session avec votre code PIN pour préparer la mise à niveau.';
    return 'Votre clé de signature est en cours de création : verrouillez puis déverrouillez votre session, puis revenez ici.';
});

const state = reactive({
    open: false,
    step: 'pin' as 'pin' | 'choose-pin' | 'working' | 'recovery',
    pin: '',
    firstPin: '',
    errorTick: 0,
    busy: false,
    recoveryText: '',
    saved: false,
    skipConfirm: false,
});
const lockoutSeconds = ref(0);
let lockoutTimer: ReturnType<typeof setInterval> | null = null;

let dev: DeviceContext | null = null;
let prepared: PreparedAccount | null = null;
let source: { rsaPkcs8: Uint8Array; signPkcs8: Uint8Array; verifier: string } | null = null;

function wipeSource() {
    source?.rsaPkcs8.fill(0);
    source?.signPkcs8.fill(0);
    source = null;
}

function open() {
    Object.assign(state, { open: true, step: 'pin', pin: '', firstPin: '', busy: false, recoveryText: '', saved: false, skipConfirm: false });
}

async function close() {
    if (state.busy) return;
    state.open = false;
    state.recoveryText = '';
    wipeSource();
    await prepared?.discard();
    prepared = null;
}

// Même aller-retour que le déverrouillage v3 (App.vue) : même verrou anti-force-brute côté serveur.
async function fetchWrapSecret(verifier: string): Promise<{ wrapSecret: string }> {
    const res = await sfetch('/api/users/me/pin/unlock', { method: 'POST', body: JSON.stringify({ verifier }) });
    if (res.status === 429) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error('locked'), { locked: true, retryAfterSeconds: body.retryAfterSeconds ?? 30 });
    }
    if (!res.ok) throw Object.assign(new Error('invalid'), { locked: false });
    return res.json();
}

async function submitPin() {
    if (state.busy || state.pin.length !== 4 || !user.value?.pinSalt) return;
    state.busy = true;
    const pin = state.pin;
    state.pin = '';
    try {
        source = await openV3IdentityForMigration(pin, user.value.pinSalt, sealedFrom(user.value), fetchWrapSecret);
    } catch (e) {
        state.errorTick++;
        const err = e as { locked?: boolean; retryAfterSeconds?: number };
        if (err?.locked) {
            lockoutSeconds.value = err.retryAfterSeconds ?? 30;
            if (lockoutTimer) clearInterval(lockoutTimer);
            lockoutTimer = setInterval(() => { if (--lockoutSeconds.value <= 0 && lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null; } }, 1000);
        } else {
            toast.show('Code PIN incorrect', 'error');
        }
        state.busy = false;
        return;
    }
    state.busy = false;
    await enroll();
}

async function enroll(localPin?: string) {
    if (!source) return;
    state.step = 'working';
    state.busy = true;
    try {
        dev ??= await deviceContext();
        const platform = await detectPlatform();
        const vaults = await enrollmentVaults();
        const opts: EnrollOptions = { name: defaultDeviceName(platform), platform, vaults, ...(localPin ? { ctx: { pin: localPin } } : {}) };
        // Copies : prepareV4Account efface les octets qu'on lui passe ; on garde l'original pour
        // pouvoir réessayer (PIN local à choisir, invite annulée) sans redemander le PIN v3.
        const migration = { rsaPkcs8: source.rsaPkcs8.slice(), signPkcs8: source.signPkcs8.slice(), verifier: source.verifier, served: servedFrom(user.value) };
        prepared = await prepareV4Account(dev, { ...opts, mode: 'migrate', migration });
        wipeSource();
        state.recoveryText = prepared.recoveryKeyText;
        state.saved = false;
        state.step = 'recovery';
    } catch (e) {
        if (e instanceof VaultError && e.code === 'pin-required' && !localPin) {
            state.firstPin = '';
            state.pin = '';
            state.step = 'choose-pin';
        } else if (e instanceof VaultError && e.code === 'cancelled') {
            toast.show('Opération annulée.', 'info');
            await close();
        } else if (e instanceof IdentityMismatchError) {
            toast.show(`Alerte de sécurité : ${e.message} La mise à niveau est annulée.`, 'error', 20000);
            await close();
        } else {
            console.error('[E2EE v4] migration :', e);
            toast.show(e instanceof VaultError && e.message !== e.code ? e.message : 'La mise à niveau a échoué.', 'error');
            await close();
        }
    } finally {
        state.busy = false;
    }
}

function submitLocalPin() {
    if (state.pin.length !== 4) return;
    if (!state.firstPin) {
        state.firstPin = state.pin;
        state.pin = '';
        return;
    }
    if (state.pin !== state.firstPin) {
        state.errorTick++;
        toast.show('Les deux codes ne correspondent pas.', 'error');
        state.firstPin = '';
        state.pin = '';
        return;
    }
    const chosen = state.pin;
    state.pin = '';
    state.firstPin = '';
    enroll(chosen);
}

async function finish(withRecovery: boolean) {
    if (!prepared) return;
    state.busy = true;
    try {
        await prepared.commit(withRecovery);
        const keys = prepared.keys;
        prepared = null;
        state.recoveryText = '';
        await refetchUser();
        applyIdentityKeys(keys);
        state.open = false;
        toast.show('Chiffrement multi-appareil activé. Vous pouvez maintenant ajouter vos autres appareils.', 'success', 8000);
    } catch (e) {
        prepared = null;
        state.open = false;
        state.recoveryText = '';
        if (e instanceof V4ApiError && e.status === 422) toast.show('Code PIN incorrect.', 'error');
        else if (e instanceof V4ApiError) toast.show(e.message, 'error', 8000);
        else toast.show('La mise à niveau a échoué.', 'error');
    } finally {
        state.busy = false;
    }
}

</script>
