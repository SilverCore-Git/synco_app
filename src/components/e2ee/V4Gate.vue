<template>

    <div class="w-full h-full overflow-y-auto bg-(--bg2) select-none">
    <div class="min-h-full flex flex-col items-center justify-center p-6">

        <div class="mb-6 text-center max-w-lg">
            <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Logo" class="h-16 mx-auto mb-3" />
            <h2 class="text-xl font-bold text-(--text)">{{ title }}</h2>
            <p v-if="subtitle" class="text-sm text-(--text2) mt-2 leading-relaxed">{{ subtitle }}</p>
        </div>

        <!-- Alerte d'identité : rien ne se déverrouille -->
        <div v-if="identityAlert" class="max-w-md w-full rounded-lg border-2 border-red-500 bg-red-500/10 p-4 mb-6">
            <p class="text-red-500 font-bold text-sm"><i class="bi bi-shield-exclamation mr-1" /> Alerte de sécurité</p>
            <p class="text-(--text) text-sm mt-2">{{ identityAlert }}</p>
            <p class="text-(--text2) text-xs mt-2">Le chiffrement reste verrouillé. Contactez votre administrateur.</p>
        </div>

        <div v-if="notice" class="max-w-md w-full rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 mb-6 text-sm text-(--text)">
            <i class="bi bi-info-circle-fill text-amber-500 mr-1" /> {{ notice }}
        </div>

        <div v-if="step === 'loading'" class="py-10"><SpinLoader /></div>

        <!-- ============ Déverrouillage quotidien ============ -->
        <template v-else-if="step === 'unlock'">
            <template v-if="lockoutSeconds > 0">
                <p class="text-amber-500 font-medium">Trop de tentatives incorrectes.</p>
                <p class="text-(--text2) text-sm mt-1">Réessayez dans {{ formatDuration(lockoutSeconds) }}</p>
            </template>
            <PinPad v-else-if="unlockNeedsPin" v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="tryUnlock" />
            <button v-else class="primary flex items-center gap-2" :class="{ loader: busy }" :disabled="busy" @click="tryUnlock">
                <i class="bi" :class="unlockIcon" />
                <span class="font-bold">Déverrouiller</span>
            </button>

            <button class="mt-10 text-xs font-bold uppercase tracking-widest text-(--text2) hover:text-(--primary) transition-colors" @click="goConnect()">
                {{ unlockNeedsPin ? 'Code PIN oublié ?' : 'Autre méthode' }}
            </button>
        </template>

        <!-- ============ Connecter cet appareil ============ -->
        <div v-else-if="step === 'connect'" class="max-w-md w-full space-y-3">
            <button class="option" @click="beginLink">
                <i class="bi bi-qr-code-scan text-2xl text-(--primary)" />
                <span>
                    <strong>Depuis un autre appareil</strong>
                    <small>Un appareil déjà connecté à votre compte valide celui-ci (QR code ou code à recopier).</small>
                </span>
            </button>
            <button class="option" @click="step = 'recovery'">
                <i class="bi bi-key-fill text-2xl text-(--primary)" />
                <span>
                    <strong>Avec ma clé de récupération</strong>
                    <small>La clé de 56 caractères proposée à la création de votre compte.</small>
                </span>
            </button>
            <button v-if="pinRecovery.enabled && !pinRecovery.locked" class="option" @click="openPinRecovery">
                <i class="bi bi-123 text-2xl text-(--primary)" />
                <span>
                    <strong>Avec mon code PIN de récupération</strong>
                    <small>Secours moins sûr que les deux autres. {{ pinRecovery.attemptsLeft }} essai(s) restant(s) avant blocage.</small>
                </span>
            </button>
            <div v-else class="option opacity-60 cursor-not-allowed!" aria-disabled="true">
                <i class="bi bi-123 text-2xl" />
                <span>
                    <strong>Avec mon code PIN de récupération</strong>
                    <small>{{ pinRecoveryUnavailableText }}</small>
                </span>
            </div>

            <div class="pt-4 border-t border-(--border-color) flex flex-col items-center gap-3">
                <button v-if="hasLocalRecord && !identityAlert" class="text-xs text-(--text2) hover:text-(--primary)" @click="backToUnlock">
                    <i class="bi bi-arrow-left mr-1" /> Revenir au déverrouillage
                </button>
                <button class="text-xs text-red-500/80 hover:text-red-500" @click="openReset">
                    Je n'ai plus aucun appareil ni ma clé de récupération
                </button>
            </div>
        </div>

        <!-- ============ Liaison : QR code ============ -->
        <div v-else-if="step === 'link'" class="max-w-md w-full flex flex-col items-center gap-4 text-center">
            <template v-if="linkQr">
                <p class="text-sm text-(--text2)">
                    Sur un appareil déjà connecté : <strong class="text-(--text)">Paramètres › Appareils et sécurité › Ajouter un appareil</strong>, puis scannez ce code.
                </p>
                <QrCode :value="linkQr" label="QR code de liaison" />
                <div class="w-full">
                    <p class="text-xs text-(--text2) mb-1">Ou saisissez ce code sur l'autre appareil :</p>
                    <p class="font-mono text-base tracking-wider text-(--text) select-all">{{ linkCode }}</p>
                </div>
                <p class="text-xs text-(--text2)">
                    <i class="bi bi-hourglass-split mr-1" />
                    {{ linkSecondsLeft > 0 ? `Expire dans ${formatDuration(linkSecondsLeft)}` : 'Code expiré' }}
                </p>
                <p class="text-xs text-amber-500/90 max-w-sm">
                    Ne montrez ce code qu'à vos propres appareils : il donne accès à vos messages chiffrés.
                </p>
                <div class="flex gap-2">
                    <button class="default text-sm" @click="cancelLink">Annuler</button>
                    <button v-if="linkSecondsLeft <= 0" class="primary text-sm" @click="beginLink">Nouveau code</button>
                </div>
            </template>
            <SpinLoader v-else />
        </div>

        <!-- ============ Liaison : code de confirmation ============ -->
        <div v-else-if="step === 'link-sas'" class="max-w-md w-full flex flex-col items-center gap-4 text-center">
            <p class="text-sm text-(--text2)">L'autre appareil a validé la demande. Vérifiez qu'il affiche le même code :</p>
            <p class="font-mono text-4xl font-bold tracking-[0.3em] text-(--text)">{{ linkSas }}</p>
            <div class="flex gap-2">
                <button class="default text-sm" :disabled="busy" @click="cancelLink">Les codes diffèrent</button>
                <button class="primary text-sm" :class="{ loader: busy }" :disabled="busy" @click="confirmLink">Les codes correspondent</button>
            </div>
        </div>

        <!-- ============ Clé de récupération ============ -->
        <div v-else-if="step === 'recovery'" class="max-w-md w-full space-y-4">
            <p class="text-sm text-(--text2)">Saisissez votre clé de récupération (les tirets et les espaces sont facultatifs).</p>
            <textarea v-model="recoveryInput" rows="3" spellcheck="false" autocomplete="off" autocapitalize="characters"
                placeholder="XXXX-XXXX-XXXX-…" @keydown.stop
                class="w-full rounded-xl border border-(--border-color) bg-(--bg) px-4 py-3 font-mono text-sm tracking-wider text-(--text) focus:outline-none focus:border-(--primary)" />
            <div class="flex justify-between gap-2">
                <button class="default text-sm" :disabled="busy" @click="step = 'connect'">Retour</button>
                <button class="primary text-sm" :class="{ loader: busy }" :disabled="busy || recoveryInput.replace(/[\s-]/g, '').length < 56" @click="submitRecovery">
                    Connecter cet appareil
                </button>
            </div>
        </div>

        <!-- ============ Récupération par PIN ============ -->
        <div v-else-if="step === 'pin-recovery'" class="flex flex-col items-center">
            <p class="text-sm text-(--text2) mb-6 max-w-sm text-center leading-relaxed">
                Saisissez votre <strong class="text-(--text)">code PIN de récupération</strong>.
                Il reste {{ pinRecovery.attemptsLeft }} essai(s) ; ensuite, cette méthode sera bloquée.
            </p>
            <PinPad v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="submitPinRecovery" />
            <button class="mt-6 text-xs text-(--text2) hover:text-(--primary)" :disabled="busy" @click="step = 'connect'">Retour</button>
        </div>

        <!-- ============ Choix du PIN local ============ -->
        <div v-else-if="step === 'choose-pin'" class="flex flex-col items-center">
            <p class="text-sm text-(--text2) mb-6 max-w-sm text-center leading-relaxed">
                <template v-if="!pinFirst">
                    Ce navigateur ne propose pas de passkey compatible : choisissez un <strong>code PIN local</strong> à 4 chiffres.
                    Il ne quitte jamais cet appareil.
                </template>
                <template v-else>Saisissez à nouveau ce code pour le confirmer.</template>
            </p>
            <PinPad v-model="pin" :error-tick="errorTick" @submit="submitChosenPin" />
            <p class="text-[11px] text-(--text2) mt-6 max-w-sm text-center">
                Sur le web sans passkey, ce code est la seule barrière pour qui copierait le profil de votre navigateur.
                10 erreurs effacent les clés de cet appareil (il faudra le relier de nouveau).
            </p>
            <button class="mt-6 text-xs text-(--text2) hover:text-(--primary)" @click="abortChoosePin">Annuler</button>
        </div>

        <!-- ============ Création du compte ============ -->
        <div v-else-if="step === 'onboard-intro'" class="max-w-md w-full space-y-5">
            <ul class="space-y-3 text-sm text-(--text)">
                <li class="flex gap-3"><i class="bi bi-shield-lock-fill text-(--primary) text-lg" /><span>Vos messages sont chiffrés de bout en bout. Les clés restent sur vos appareils : même nous ne pouvons pas les lire.</span></li>
                <li class="flex gap-3"><i class="bi bi-fingerprint text-(--primary) text-lg" /><span>Cet appareil se déverrouille avec {{ vaultLabel }}.</span></li>
                <li class="flex gap-3"><i class="bi bi-phone text-(--primary) text-lg" /><span>Vous pourrez ajouter vos autres appareils depuis les paramètres.</span></li>
            </ul>
            <div v-if="resetMode" class="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-(--text)">
                <i class="bi bi-exclamation-triangle-fill text-red-500 mr-1" /> Nouvelles clés : vos anciens messages deviendront illisibles et vos autres appareils seront déconnectés.
            </div>
            <div class="flex flex-col items-center gap-3">
                <button class="primary" :class="{ loader: busy }" :disabled="busy" @click="startOnboarding()">
                    <span class="font-bold">{{ resetMode ? 'Créer de nouvelles clés' : 'Activer le chiffrement' }}</span>
                </button>
                <button v-if="enrollCancelled && platform === 'web' && hasPinVault" class="text-xs text-(--text2) hover:text-(--primary)" @click="onboardWithPin">
                    Utiliser plutôt un code PIN local
                </button>
            </div>
        </div>

        <div v-else-if="step === 'onboard-recovery'" class="max-w-md w-full space-y-5">
            <p class="text-sm text-(--text2) leading-relaxed">
                Voici votre <strong class="text-(--text)">clé de récupération</strong>. Si vous perdez tous vos appareils, c'est le seul moyen de retrouver vos messages.
            </p>
            <RecoveryKeyPanel :key-text="recoveryText" :account-label="accountLabel" @saved="recoverySaved = true" />
            <label class="flex items-start gap-2 text-sm text-(--text) cursor-pointer">
                <input type="checkbox" v-model="recoverySaved" class="mt-1" />
                <span>J'ai conservé ma clé de récupération en lieu sûr.</span>
            </label>
            <div class="flex flex-col items-center gap-3">
                <button class="primary" :class="{ loader: busy }" :disabled="busy || !recoverySaved" @click="finishOnboarding(true)">Terminer</button>
                <button class="text-xs text-(--text2) hover:text-amber-500" :disabled="busy" @click="skipRecovery = true">Continuer sans clé de récupération</button>
            </div>
        </div>

        <!-- ============ Confirmations ============ -->
        <ConfirmDelete
            :show="skipRecovery"
            title="Continuer sans clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="Sans clé de récupération, la perte de tous vos appareils rend vos messages définitivement illisibles. Vous pourrez en créer une plus tard dans Paramètres › Appareils et sécurité."
            button-text="Continuer sans clé"
            :loading="busy"
            @confirm="skipRecovery = false; finishOnboarding(false)"
            @cancel="skipRecovery = false"
        />

        <Popup :isOpen="showReset" @close="closeReset">
            <template #title>Réinitialiser le chiffrement</template>
            <template v-if="resetStep === 'warn'">
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
                    Si l'un de vos appareils est encore connecté, ou si vous retrouvez votre clé de récupération, annulez et utilisez-les plutôt.
                    Un code de confirmation sera envoyé à votre adresse e-mail.
                </p>
                <label class="flex items-start gap-2 mt-4 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="resetAckLoss" class="mt-1" />
                    <span>Je comprends que tous mes anciens messages seront perdus.</span>
                </label>
                <label class="flex items-start gap-2 mt-2 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="resetAckIrreversible" class="mt-1" />
                    <span>Je comprends que cette action est irréversible.</span>
                </label>
                <p class="text-(--text2) text-xs mt-4">Tapez <strong class="text-red-500">{{ RESET_PHRASE }}</strong> pour confirmer :</p>
                <input v-model="resetTyped" type="text" @keydown.stop autocomplete="off" spellcheck="false" :placeholder="RESET_PHRASE"
                    class="w-full mt-1 rounded-md border border-(--border) bg-transparent px-3 py-2 text-sm" />
            </template>
            <template v-else>
                <p class="text-(--text) text-sm">Saisissez le code à 6 chiffres envoyé à votre adresse e-mail. Il expire dans 15 minutes.</p>
                <input v-model="resetCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"
                    placeholder="000000" @keydown.stop @keyup.enter="confirmResetCode"
                    class="w-full mt-3 rounded-md border border-(--border) bg-transparent px-3 py-2 text-center text-xl tracking-[0.5em]" />
                <button @click="sendResetCode" :disabled="resetBusy" class="mt-3 text-xs text-(--text2) hover:text-(--primary) underline">Renvoyer un code</button>
            </template>
            <template #footer>
                <button @click="closeReset" class="default">Annuler</button>
                <button v-if="resetStep === 'warn'" @click="sendResetCode" :disabled="!canSendResetCode" class="danger">Envoyer le code par e-mail</button>
                <button v-else @click="confirmResetCode" :disabled="resetCode.length !== 6 || resetBusy" class="danger">Valider</button>
            </template>
        </Popup>

    </div>
    </div>

</template>

<script setup lang="ts">

import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import SpinLoader from '../SpinLoader.vue';
import Popup from '../Popup.vue';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import PinPad from './PinPad.vue';
import QrCode from './QrCode.vue';
import RecoveryKeyPanel from './RecoveryKeyPanel.vue';
import { user } from '@/assets/var';
import { refetchUser } from '@/assets/init';
import sfetch from '@/assets/utils/sfetch';
import { lockSecurity } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import useSettingsItem from '@/composables/useSettingsItem';
import { forgetThisDevice, getLocalDevice, idbStore, VaultError, type DevicePlatform, type DeviceVault } from '@/assets/deviceVault';
import {
    DeviceRevokedError, IdentityMismatchError, V4ApiError, prepareV4Account, recoverWithKey, startLink, unlockV4,
    type DeviceContext, type EnrollOptions, type OpenedLink, type PreparedAccount, type StartedLink,
} from '@/assets/e2eeV4/session';
import { E2eeV4Error } from '@/assets/utils/e2eeV4';
import { PinRecoveryFailure, pinRecoveryStatus, recoverWithPin } from '@/assets/e2eeV4/pinRecovery';
import { pinRecoveryActors, pinRecoveryConfigured } from '@/assets/e2eeV4/pinRecoveryApi';
import {
    applyIdentityKeys, autoUnlock, defaultDeviceName, detectPlatform, deviceContext, enrollmentVaults, sealedFrom, servedFrom,
} from '@/assets/e2eeV4/runtime';

/**
 * Écran de verrouillage E2EE v4 (doc/securite/13-e2ee-v4-multi-appareil.md §4) :
 * - compte v4 avec cet appareil enregistré : déverrouillage (coffre local, PIN local en repli) ;
 * - compte v4 sans cet appareil : connexion par un autre appareil (QR) ou par la clé de récupération,
 *   réinitialisation en dernier recours ;
 * - compte neuf : création de l'identité, de la clé de compte et du premier appareil.
 * Les comptes legacy / v2 / v3 n'arrivent jamais ici (App.vue garde leur écran PIN).
 */
const props = defineProps<{ mode: 'unlock' | 'onboard' }>();

const toast = useToast();
const { Item: theme } = useSettingsItem('theme', 'dark');

type Step = 'loading' | 'unlock' | 'connect' | 'link' | 'link-sas' | 'recovery' | 'pin-recovery' | 'choose-pin' | 'onboard-intro' | 'onboard-recovery';
const step = ref<Step>('loading');
const busy = ref(false);
const pin = ref('');
const errorTick = ref(0);
const notice = ref('');
const identityAlert = ref('');
const platform = ref<DevicePlatform>('web');
const hasLocalRecord = ref(false);
const unlockNeedsPin = ref(false);
const unlockIcon = ref('bi-unlock-fill');
const hasPinVault = ref(false);
const resetMode = ref(false);
const enrollCancelled = ref(false);

// Hors de l'état réactif : contexte, coffres, et objets qui détiennent AK le temps d'une étape.
let dev: DeviceContext | null = null;
let vaults: DeviceVault[] = [];
let prepared: PreparedAccount | null = null;
let started: StartedLink | null = null;
let opened: OpenedLink | null = null;

const accountLabel = computed(() => user.value?.email || user.value?.name || '');
const vaultLabel = computed(() => {
    const kind = vaults[0]?.capabilities.kind;
    if (kind === 'native-biometric') return 'la biométrie de votre téléphone (ou son code de verrouillage)';
    if (kind === 'os-keyring') return 'le trousseau sécurisé de votre système';
    if (kind === 'webauthn-prf') return 'une passkey (empreinte, visage ou code de l\'appareil) ou, à défaut, un code PIN local';
    return 'un code PIN local à 4 chiffres';
});

const title = computed(() => ({
    loading: 'Chargement…',
    unlock: 'Déverrouillez votre session',
    connect: 'Connecter cet appareil',
    link: 'Connecter depuis un autre appareil',
    'link-sas': 'Confirmez la connexion',
    recovery: 'Clé de récupération',
    'pin-recovery': 'Récupération par code PIN',
    'choose-pin': pinFirst.value ? 'Confirmez votre code PIN' : 'Choisissez un code PIN local',
    'onboard-intro': resetMode.value ? 'Réinitialiser le chiffrement' : 'Configurez votre accès sécurisé',
    'onboard-recovery': 'Votre clé de récupération',
}[step.value]));

const subtitle = computed(() => step.value === 'connect'
    ? "Cet appareil n'a pas encore accès à vos messages chiffrés."
    : '');

const formatDuration = (s: number) => s < 60 ? `${s} s` : s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.ceil(s / 3600)} h`;

// --- compte à rebours (verrou du PIN local, expiration de la liaison) -----

const lockoutSeconds = ref(0);
const linkSecondsLeft = ref(0);
let ticker: ReturnType<typeof setInterval> | null = null;
let linkExpiresAt = 0;
const ensureTicker = () => {
    if (ticker) return;
    ticker = setInterval(() => {
        if (lockoutSeconds.value > 0) lockoutSeconds.value--;
        if (linkExpiresAt) linkSecondsLeft.value = Math.max(0, Math.round((linkExpiresAt - Date.now()) / 1000));
    }, 1000);
};

// --- PIN local à choisir (coffre de repli) -------------------------------

const pinFirst = ref('');
let pinResolver: { resolve: (pin: string) => void; reject: (e: unknown) => void; back: Step } | null = null;

function askPin(): Promise<string> {
    pinFirst.value = '';
    pin.value = '';
    return new Promise((resolve, reject) => {
        pinResolver = { resolve, reject, back: step.value };
        step.value = 'choose-pin';
    });
}

function submitChosenPin() {
    if (pin.value.length !== 4) return;
    if (!pinFirst.value) {
        pinFirst.value = pin.value;
        pin.value = '';
        return;
    }
    if (pin.value !== pinFirst.value) {
        errorTick.value++;
        toast.show('Les deux codes ne correspondent pas.', 'error');
        pinFirst.value = '';
        pin.value = '';
        return;
    }
    const chosen = pin.value;
    pin.value = '';
    pinFirst.value = '';
    const r = pinResolver;
    pinResolver = null;
    if (r) { step.value = r.back; r.resolve(chosen); }
}

function abortChoosePin() {
    const r = pinResolver;
    pinResolver = null;
    pin.value = '';
    pinFirst.value = '';
    if (r) { step.value = r.back; r.reject(new VaultError('cancelled')); }
}

/** Lance une inscription ; si le coffre de repli demande un PIN local, le fait choisir puis recommence. */
async function withPinFallback<T>(run: (opts: EnrollOptions) => Promise<T>, forcePin = false): Promise<T> {
    const base: EnrollOptions = { name: defaultDeviceName(platform.value), platform: platform.value, vaults };
    if (!forcePin) {
        try {
            return await run(base);
        } catch (e) {
            if (!(e instanceof VaultError && e.code === 'pin-required')) throw e;
        }
    }
    const chosen = await askPin();
    return run({ ...base, ctx: { pin: chosen } });
}

// --- erreurs communes -------------------------------------------------------

function showIdentityAlert(e: IdentityMismatchError) {
    lockSecurity();
    identityAlert.value = e.kind === 'served'
        ? "La clé publique fournie par le serveur ne correspond pas à votre clé privée."
        : "Les clés de chiffrement reçues du serveur ne sont pas celles de votre compte sur cet appareil.";
}

/** Erreur d'une inscription (création, liaison, récupération). Renvoie true si elle a été traitée. */
function handleEnrollError(e: unknown): boolean {
    if (e instanceof VaultError && e.code === 'cancelled') {
        enrollCancelled.value = true;
        toast.show("Opération annulée.", 'info');
        return true;
    }
    if (e instanceof VaultError && e.code === 'unavailable') {
        toast.show(e.message && e.message !== 'unavailable' ? e.message : "Aucun coffre sécurisé n'est disponible sur cet appareil.", 'error', 8000);
        return true;
    }
    if (e instanceof IdentityMismatchError) { showIdentityAlert(e); return true; }
    if (e instanceof V4ApiError) { toast.show(e.message, 'error', 8000); return true; }
    return false;
}

// --- déverrouillage ---------------------------------------------------------

async function refreshLocalState() {
    if (!dev) return;
    const record = await getLocalDevice(idbStore, dev.userId);
    hasLocalRecord.value = !!record;
    const vault = record ? dev.vaultFor(record.vaultKind) : undefined;
    unlockNeedsPin.value = !!vault?.capabilities.needsPin;
    unlockIcon.value = vault?.capabilities.biometric ? 'bi-fingerprint' : 'bi-unlock-fill';
    return { record, vault };
}

async function tryUnlock() {
    if (!dev || busy.value) return;
    busy.value = true;
    try {
        const keys = await unlockV4(dev, sealedFrom(user.value), servedFrom(user.value), {
            ...(unlockNeedsPin.value ? { pin: pin.value } : {}),
            reason: 'Déverrouiller vos messages chiffrés',
        });
        applyIdentityKeys(keys);
    } catch (e) {
        if (e instanceof VaultError) {
            if (e.code === 'wrong-pin') {
                errorTick.value++;
                toast.show('Code PIN incorrect', 'error');
                if (e.retryAfterSeconds) { lockoutSeconds.value = e.retryAfterSeconds; ensureTicker(); }
            } else if (e.code === 'locked') {
                lockoutSeconds.value = e.retryAfterSeconds ?? 30;
                ensureTicker();
                if (!e.retryAfterSeconds) toast.show(e.message, 'error', 8000);
            } else if (e.code === 'wiped' || e.code === 'missing') {
                notice.value = e.code === 'wiped'
                    ? "Trop d'essais : les clés de cet appareil ont été effacées. Reconnectez-le."
                    : "Les clés de cet appareil sont introuvables. Reconnectez-le.";
                await goConnect(true);
            } else if (e.code === 'unavailable') {
                notice.value = e.message && e.message !== 'unavailable' ? e.message : "Le coffre sécurisé de cet appareil n'est plus disponible.";
                await goConnect(true);
            } else if (e.code !== 'cancelled') {
                toast.show('Déverrouillage impossible.', 'error');
            }
        } else if (e instanceof DeviceRevokedError) {
            notice.value = "Cet appareil a été déconnecté de votre compte depuis un autre appareil. Reconnectez-le pour retrouver vos messages.";
            await goConnect(true);
        } else if (e instanceof IdentityMismatchError) {
            showIdentityAlert(e);
        } else {
            console.error('[E2EE v4] déverrouillage :', e);
            toast.show('Erreur de déchiffrement', 'error');
        }
    } finally {
        pin.value = '';
        busy.value = false;
    }
}

/** Passe à l'écran de connexion ; `forget` : les clés locales sont inutilisables, on les oublie. */
async function goConnect(forget = false) {
    if (forget && dev) {
        await forgetThisDevice(dev.userId, idbStore, dev.vaultFor).catch(() => {});
        await refreshLocalState();
    }
    step.value = 'connect';
}

function backToUnlock() {
    notice.value = '';
    step.value = 'unlock';
}

// --- liaison depuis un autre appareil ---------------------------------------

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const linkQr = ref('');
const linkCode = ref('');
const linkSas = ref('');

const stopPolling = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };

async function beginLink() {
    if (!dev) return;
    stopPolling();
    await started?.cancel();
    started = null;
    linkQr.value = '';
    step.value = 'link';
    try {
        started = await startLink(dev, defaultDeviceName(platform.value), platform.value);
        linkQr.value = started.qrPayload;
        linkCode.value = started.codeText;
        linkExpiresAt = new Date(started.expiresAt).getTime() || Date.now() + 5 * 60_000;
        linkSecondsLeft.value = Math.round((linkExpiresAt - Date.now()) / 1000);
        ensureTicker();
        poll();
    } catch (e) {
        step.value = 'connect';
        toast.show(e instanceof V4ApiError ? e.message : 'Impossible de créer la demande de connexion.', 'error');
    }
}

function poll() {
    pollTimer = setTimeout(async () => {
        if (!started || step.value !== 'link') return;
        if (linkSecondsLeft.value <= 0) return;
        try {
            const result = await started.poll();
            if (result) {
                opened = result;
                linkSas.value = result.sas;
                linkQr.value = '';
                step.value = 'link-sas';
                return;
            }
        } catch (e) {
            if (e instanceof V4ApiError && e.status === 404) { linkSecondsLeft.value = 0; return; }
            if (e instanceof E2eeV4Error) {
                // Réponse qui ne s'ouvre pas avec notre secret : mauvais code saisi, ou réponse forgée.
                toast.show("La réponse reçue n'a pas pu être vérifiée. Recommencez la connexion.", 'error', 8000);
                await cancelLink();
                return;
            }
        }
        poll();
    }, 2000);
}

async function cancelLink() {
    stopPolling();
    await opened?.dispose();
    opened = null;
    await started?.cancel();
    started = null;
    linkQr.value = '';
    linkSas.value = '';
    linkExpiresAt = 0;
    step.value = 'connect';
}

async function confirmLink() {
    if (!dev || !opened || busy.value) return;
    busy.value = true;
    try {
        const link = opened;
        const keys = await withPinFallback(opts => link.confirm(sealedFrom(user.value), servedFrom(user.value), opts));
        opened = null;
        started = null;
        await finishConnected(keys);
    } catch (e) {
        if (!handleEnrollError(e)) {
            console.error('[E2EE v4] liaison :', e);
            toast.show("La connexion de cet appareil a échoué.", 'error');
            await cancelLink();
        }
    } finally {
        busy.value = false;
    }
}

// --- clé de récupération -----------------------------------------------------

const recoveryInput = ref('');

// --- récupération par PIN -----------------------------------------------------

const pinRecovery = reactive({ enabled: false, locked: false, attemptsLeft: 0, checked: false, reachable: true });
const pinRecoveryUnavailableText = computed(() => {
    if (!pinRecoveryConfigured) return 'Non proposée sur ce serveur.';
    if (!pinRecovery.checked) return 'Vérification…';
    if (!pinRecovery.reachable) return 'Service de récupération injoignable pour le moment.';
    if (pinRecovery.locked) return "Bloquée après trop d'essais. Elle se réactive depuis un appareil connecté.";
    return "Non activée sur votre compte.";
});

async function refreshPinRecovery() {
    if (!pinRecoveryConfigured || props.mode === 'onboard') return;
    try {
        const st = await pinRecoveryStatus(pinRecoveryActors);
        Object.assign(pinRecovery, { enabled: st.enabled, locked: st.locked, attemptsLeft: st.attemptsLeft, reachable: st.guardReachable });
    } catch {
        pinRecovery.enabled = false;
    } finally {
        pinRecovery.checked = true;
    }
}

function openPinRecovery() {
    pin.value = '';
    step.value = 'pin-recovery';
}

async function submitPinRecovery() {
    if (!dev || busy.value || pin.value.length !== 4) return;
    busy.value = true;
    const code = pin.value;
    pin.value = '';
    try {
        const keys = await withPinFallback(opts => recoverWithPin(dev!, pinRecoveryActors, code, sealedFrom(user.value), servedFrom(user.value), opts));
        await finishConnected(keys);
    } catch (e) {
        if (e instanceof PinRecoveryFailure) {
            errorTick.value++;
            if (e.reason === 'wrong-pin') {
                pinRecovery.attemptsLeft = e.attemptsLeft;
                toast.show(e.attemptsLeft > 0 ? `Code PIN incorrect. ${e.attemptsLeft} essai(s) restant(s).` : 'Code PIN incorrect. La récupération par PIN est maintenant bloquée.', 'error', 8000);
                if (e.attemptsLeft === 0) { pinRecovery.locked = true; step.value = 'connect'; }
            } else {
                pinRecovery.locked = e.reason === 'locked';
                pinRecovery.enabled = false;
                toast.show(e.reason === 'locked' ? "La récupération par PIN est bloquée après trop d'essais." : "La récupération par PIN n'est pas activée sur votre compte.", 'error', 8000);
                step.value = 'connect';
            }
        } else if (!handleEnrollError(e)) {
            console.error('[E2EE v4] récupération par PIN :', e);
            toast.show('La récupération par PIN a échoué.', 'error');
        }
    } finally {
        busy.value = false;
    }
}

async function submitRecovery() {
    if (!dev || busy.value) return;
    busy.value = true;
    try {
        const text = recoveryInput.value;
        const keys = await withPinFallback(opts => recoverWithKey(dev!, text, sealedFrom(user.value), servedFrom(user.value), opts));
        recoveryInput.value = '';
        await finishConnected(keys);
    } catch (e) {
        if (e instanceof E2eeV4Error) {
            toast.show(/checksum|length|character/i.test(e.message)
                ? "Cette clé contient une faute de frappe. Vérifiez-la."
                : "Cette clé de récupération n'ouvre pas votre compte (elle a peut-être été remplacée).", 'error', 8000);
        } else if (!handleEnrollError(e)) {
            console.error('[E2EE v4] récupération :', e);
            toast.show('La connexion par clé de récupération a échoué.', 'error');
        }
    } finally {
        busy.value = false;
    }
}

async function finishConnected(keys: Parameters<typeof applyIdentityKeys>[0]) {
    notice.value = '';
    await refreshLocalState();
    applyIdentityKeys(keys);
    toast.show('Cet appareil est connecté à votre compte.', 'success');
}

// --- création du compte (ou réinitialisation) ---------------------------------

const recoveryText = ref('');
const recoverySaved = ref(false);
const skipRecovery = ref(false);

async function startOnboarding(forcePin = false) {
    if (!dev || busy.value) return;
    busy.value = true;
    enrollCancelled.value = false;
    try {
        prepared = await withPinFallback(opts => prepareV4Account(dev!, { ...opts, mode: resetMode.value ? 'reset' : 'create' }), forcePin);
        recoveryText.value = prepared.recoveryKeyText;
        recoverySaved.value = false;
        step.value = 'onboard-recovery';
    } catch (e) {
        if (!handleEnrollError(e)) {
            console.error('[E2EE v4] création :', e);
            toast.show("Une erreur est survenue lors de l'initialisation du chiffrement.", 'error');
        }
    } finally {
        busy.value = false;
    }
}

const onboardWithPin = () => startOnboarding(true);

async function finishOnboarding(withRecovery: boolean) {
    if (!prepared || busy.value) return;
    busy.value = true;
    try {
        const p = prepared;
        await p.commit(withRecovery);
        prepared = null;
        recoveryText.value = '';
        await refetchUser();
        await refreshLocalState();
        applyIdentityKeys(p.keys);
        if (resetMode.value) toast.show('Chiffrement réinitialisé. Vos anciens messages sont désormais illisibles.', 'warning', 10000);
        resetMode.value = false;
    } catch (e) {
        prepared = null;
        recoveryText.value = '';
        step.value = 'onboard-intro';
        if (!handleEnrollError(e)) toast.show("Une erreur est survenue lors de l'initialisation du chiffrement.", 'error');
    } finally {
        busy.value = false;
    }
}

// --- réinitialisation de dernier recours ---------------------------------------

const RESET_PHRASE = 'RÉINITIALISER';
const showReset = ref(false);
const resetStep = ref<'warn' | 'code'>('warn');
const resetAckLoss = ref(false);
const resetAckIrreversible = ref(false);
const resetTyped = ref('');
const resetCode = ref('');
const resetBusy = ref(false);
const canSendResetCode = computed(() =>
    resetAckLoss.value && resetAckIrreversible.value && resetTyped.value.trim().toUpperCase() === RESET_PHRASE && !resetBusy.value);

function closeReset() {
    showReset.value = false;
    resetStep.value = 'warn';
    resetAckLoss.value = false;
    resetAckIrreversible.value = false;
    resetTyped.value = '';
    resetCode.value = '';
}

function openReset() {
    closeReset();
    showReset.value = true;
}

async function sendResetCode() {
    if (resetStep.value === 'warn' && !canSendResetCode.value) return;
    resetBusy.value = true;
    try {
        const res = await sfetch('/api/users/me/pin/reset/request', { method: 'POST' });
        if (res.ok) {
            resetStep.value = 'code';
            toast.show('Un code de confirmation vous a été envoyé par e-mail.', 'info', 8000);
        } else {
            toast.show((await res.json().catch(() => ({}))).error || "Impossible d'envoyer le code", 'error');
        }
    } finally {
        resetBusy.value = false;
    }
}

async function confirmResetCode() {
    if (!/^\d{6}$/.test(resetCode.value) || resetBusy.value) return;
    resetBusy.value = true;
    try {
        const res = await sfetch('/api/users/me/pin/reset/confirm', { method: 'POST', body: JSON.stringify({ code: resetCode.value }) });
        if (!res.ok) {
            toast.show((await res.json().catch(() => ({}))).error || 'Code incorrect', 'error');
            resetCode.value = '';
            return;
        }
        closeReset();
        if (dev) await forgetThisDevice(dev.userId, idbStore, dev.vaultFor).catch(() => {});
        resetMode.value = true;
        notice.value = '';
        step.value = 'onboard-intro';
    } finally {
        resetBusy.value = false;
    }
}

// --- cycle de vie -----------------------------------------------------------

onMounted(async () => {
    try {
        platform.value = await detectPlatform();
        dev = await deviceContext();
        vaults = await enrollmentVaults();
        hasPinVault.value = vaults.some(v => v.capabilities.needsPin);
        if (props.mode === 'onboard') { step.value = 'onboard-intro'; return; }
        refreshPinRecovery();
        const local = await refreshLocalState();
        if (!local?.record) { step.value = 'connect'; return; }
        step.value = 'unlock';
        // Trousseau du système et biométrie native : on propose l'invite tout de suite. Une passkey
        // exige un geste de l'utilisateur (bouton), le PIN local une saisie.
        const kind = local.record.vaultKind;
        if ((kind === 'os-keyring' || kind === 'native-biometric') && !autoUnlock.tried) {
            autoUnlock.tried = true;
            tryUnlock();
        }
    } catch (e) {
        console.error('[E2EE v4] initialisation :', e);
        toast.show("Impossible d'initialiser le chiffrement sur cet appareil.", 'error');
        step.value = props.mode === 'onboard' ? 'onboard-intro' : 'connect';
    }
});

onUnmounted(() => {
    stopPolling();
    if (ticker) clearInterval(ticker);
    opened?.dispose();
    started?.cancel();
    prepared?.discard();
    prepared = null;
    if (pinResolver) abortChoosePin();
});

</script>

<style scoped>
.option {
    width: 100%;
    display: flex;
    align-items: flex-start;
    gap: 0.875rem;
    padding: 1rem;
    border-radius: 0.75rem;
    border: 1px solid var(--border-color);
    background: var(--bg);
    text-align: left;
    transition: border-color 0.15s ease;
}
.option:not([aria-disabled="true"]):hover {
    border-color: var(--primary);
}
.option > span {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    color: var(--text);
    font-size: 0.875rem;
}
.option small {
    color: var(--text2);
    font-size: 0.75rem;
    line-height: 1.4;
}
</style>
