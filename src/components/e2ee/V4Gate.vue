<template>

    <div class="w-full h-full overflow-y-auto bg-(--bg2) select-none">
    <div class="min-h-full flex flex-col items-center justify-center p-6">

        <div class="mb-6 text-center max-w-md">
            <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Synco" class="h-14 mx-auto mb-4" />
            <h1 class="text-xl font-bold text-(--text)">{{ title }}</h1>
            <p v-if="subtitle" class="text-sm text-(--text2) mt-2 leading-relaxed">{{ subtitle }}</p>
        </div>

        <!-- Alerte d'identité : rien ne se déverrouille -->
        <div v-if="identityAlert" role="alert" class="gate-alert is-danger">
            <i class="bi bi-shield-exclamation" aria-hidden="true" />
            <div class="min-w-0">
                <p class="font-semibold">Alerte de sécurité</p>
                <p>{{ identityAlert }}</p>
                <p class="gate-alert-sub">Le chiffrement reste verrouillé. Contactez votre administrateur.</p>
            </div>
        </div>

        <div v-if="notice" class="gate-alert">
            <i class="bi bi-info-circle" aria-hidden="true" />
            <p class="min-w-0">{{ notice }}</p>
        </div>

        <!-- Fenêtre de Synco Extension ouverte : barre d'attente (déverrouillage ou inscription) -->
        <ExtensionScene :view="scene" @cancel="cancelExtensionWait" />

        <Transition :name="stepTransition" mode="out-in">
        <div v-if="step === 'loading'" key="loading" class="py-10"><SpinLoader /></div>

        <!-- ============ Déverrouillage quotidien ============ -->
        <div v-else-if="step === 'unlock'" key="unlock" class="flex w-full max-w-sm flex-col items-center">
            <p v-if="lockoutSeconds > 0" class="gate-lockout">
                {{ localKind === 'extension' ? "Trop d'essais." : 'Trop de codes incorrects.' }}
                Réessayez dans <strong>{{ formatDuration(lockoutSeconds) }}</strong>.
            </p>

            <!-- Appareil verrouillé par l'extension, qui ne répond pas : ses clés ne sont pas perdues -->
            <template v-else-if="extensionMissing">
                <button class="primary w-full" :class="{ loader: busy }" :disabled="busy" @click="retryExtension">Réessayer</button>
                <!-- Une seule consigne, celle du navigateur utilisé, et seulement si on la demande -->
                <details class="gate-help w-full mt-5">
                    <summary>Comment la réactiver ?</summary>
                    <ol>
                        <li>Ouvrez <code>{{ extensionHelp.page }}</code> dans un nouvel onglet.</li>
                        <li>Activez <strong>Synco Extension</strong> et autorisez-la sur ce site.</li>
                        <li>Revenez ici et cliquez sur <strong>Réessayer</strong>.</li>
                    </ol>
                    <p>Désinstallée ? Ses clés sont effacées : connectez cet appareil autrement, ci-dessous.</p>
                </details>
            </template>

            <template v-else-if="unlockNeedsPin">
                <!-- Synco Extension présente mais pas utilisée : on propose d'y passer (une fois par lancement). Le PIN
                     saisi juste après sert aussi au changement de verrou : rien de plus à taper. -->
                <div v-if="extensionOffer" class="gate-card offer">
                    <p class="text-sm text-(--text)"><strong>Synco Extension est installée.</strong> L'utiliser à la place du code ?</p>
                    <div class="flex items-center gap-4 mt-3">
                        <button class="primary text-xs" @click="acceptExtensionOffer">Oui</button>
                        <button class="text-link" @click="extensionOffer = false">Pas maintenant</button>
                    </div>
                </div>
                <PinPad v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="tryUnlock" />
            </template>

            <button v-else class="primary w-full flex items-center justify-center gap-2" :class="{ loader: busy }" :disabled="busy || extensionWaiting" @click="tryUnlock">
                <i class="bi" :class="unlockIcon" aria-hidden="true" />
                <span class="font-bold">{{ localKind === 'extension' && extensionAutoTried ? 'Réessayer' : 'Déverrouiller' }}</span>
            </button>

            <button class="text-link mt-6" @click="goConnect()">
                {{ unlockNeedsPin ? 'Code PIN oublié ?' : 'Utiliser un autre appareil ou une clé' }}
            </button>
        </div>

        <!-- ============ Liaison : QR code (chemin par défaut) ============ -->
        <div v-else-if="step === 'link'" key="link" class="w-full max-w-3xl">
            <button v-if="hasLocalRecord && !identityAlert" class="back-btn" @click="leaveLink">
                <i class="bi bi-arrow-left" /> {{ localKind === 'extension' ? 'Revenir à Synco Extension' : 'Revenir au déverrouillage' }}
            </button>
            <div class="gate-card grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8">

                <div class="flex flex-col items-center gap-3">
                    <div class="qr-frame" :class="{ 'is-expired': linkExpired }">
                        <QrCode v-if="linkQr" :value="linkQr" label="QR code de connexion" class="qr-in" />
                        <div v-else class="qr-skeleton" aria-hidden="true" />
                        <Transition name="fade">
                            <div v-if="linkExpired" class="qr-expired">
                                <span class="font-semibold text-sm">Code expiré</span>
                                <button class="primary text-sm" @click="beginLink">Nouveau code</button>
                            </div>
                        </Transition>
                    </div>
                    <div class="w-full max-w-52">
                        <div class="expiry" role="progressbar" aria-label="Validité du code" :aria-valuenow="linkSecondsLeft" aria-valuemin="0" :aria-valuemax="linkTotalSeconds">
                            <div class="expiry-fill" :class="{ warn: linkSecondsLeft <= 60 }" :style="{ transform: `scaleX(${linkProgress})` }" />
                        </div>
                        <p class="mt-2 text-center text-xs tabular-nums text-(--text2)">
                            {{ linkQr ? (linkExpired ? 'Expiré' : `Valable ${formatDuration(linkSecondsLeft)}`) : 'Préparation…' }}
                        </p>
                    </div>
                </div>

                <div class="flex min-w-0 flex-col">
                    <ol class="how">
                        <li><span class="how-n">1</span><p>Sur un appareil déjà connecté, ouvrez <strong class="whitespace-nowrap">Paramètres › Appareils</strong>.</p></li>
                        <li><span class="how-n">2</span><p>Choisissez <strong>Ajouter un appareil</strong> et scannez ce QR code.</p></li>
                    </ol>

                    <p class="mt-6 mb-2 text-xs text-(--text2)">Pas de caméra ? Saisissez plutôt ce code :</p>
                    <div class="code-line" aria-label="Code de connexion à recopier">
                        <code>{{ linkCode }}</code>
                        <button class="copy-btn" :class="{ done: copied }" :title="copied ? 'Copié' : 'Copier le code'" :aria-label="copied ? 'Code copié' : 'Copier le code'" @click="copyLinkCode">
                            <i class="bi" :class="copied ? 'bi-check2' : 'bi-copy'" />
                        </button>
                    </div>

                    <p class="mt-auto pt-6 text-xs leading-snug text-(--text2)">
                        <i class="bi bi-shield-lock me-1" aria-hidden="true" /> Ne le montrez qu'à vos propres appareils : il ouvre vos messages.
                    </p>
                </div>
            </div>

            <button class="rescue-row" @click="openRescue">
                <span class="min-w-0 flex-1 text-left">
                    <strong>Je n'ai plus aucun appareil connecté</strong>
                    <small>Utiliser un accès de secours</small>
                </span>
                <i class="bi bi-arrow-right rescue-arrow" aria-hidden="true" />
            </button>
        </div>

        <!-- ============ Liaison : code de confirmation ============ -->
        <div v-else-if="step === 'link-sas'" key="link-sas" class="w-full max-w-md">
            <div class="gate-card flex flex-col items-center gap-6 p-8 text-center">
                <div class="sas" aria-label="Code de confirmation">
                    <span v-for="(group, g) in [sasDigits.slice(0, 3), sasDigits.slice(3, 6)]" :key="g" class="sas-group">
                        <span v-for="(d, i) in group" :key="i" class="sas-digit" :style="{ '--i': g * 3 + i }">{{ d }}</span>
                    </span>
                </div>
                <div class="flex w-full gap-3">
                    <button class="default flex-1" :disabled="busy" @click="cancelLink()">Ils diffèrent</button>
                    <button class="primary flex-1" :class="{ loader: busy }" :disabled="busy" @click="confirmLink">Ils sont identiques</button>
                </div>
                <p class="text-xs text-(--text2)">Deux codes différents : quelqu'un tente peut-être d'intercepter la connexion.</p>
            </div>
        </div>

        <!-- ============ Secours : plus aucun appareil connecté ============ -->
        <div v-else-if="step === 'connect'" key="connect" class="w-full max-w-md">
            <button class="back-btn" @click="beginLink"><i class="bi bi-arrow-left" /> Retour</button>

            <div class="gate-card options">
                <button class="option" @click="step = 'recovery'">
                    <i class="bi bi-key option-ico" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <strong>Clé de récupération</strong>
                        <small>56 caractères, reçue à l'activation du chiffrement</small>
                    </span>
                    <i class="bi bi-chevron-right option-arrow" aria-hidden="true" />
                </button>

                <button v-if="pinRecovery.enabled && !pinRecovery.locked" class="option" @click="openPinRecovery">
                    <i class="bi bi-123 option-ico" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <strong>Code PIN de récupération</strong>
                        <small :class="{ 'is-low': pinRecovery.attemptsLeft <= 3 }">{{ attemptsText }}</small>
                    </span>
                    <i class="bi bi-chevron-right option-arrow" aria-hidden="true" />
                </button>
                <div v-else class="option is-disabled" aria-disabled="true">
                    <i class="bi bi-123 option-ico" aria-hidden="true" />
                    <span class="min-w-0 flex-1">
                        <strong>Code PIN de récupération</strong>
                        <small>{{ pinRecoveryUnavailableText }}</small>
                    </span>
                </div>
            </div>

            <div class="last-resort">
                <button class="danger-link" @click="openReset">Repartir de zéro</button>
                <p>Ni appareil ni clé ? Vous perdrez vos anciens messages.</p>
            </div>
        </div>

        <!-- ============ Clé de récupération ============ -->
        <div v-else-if="step === 'recovery'" key="recovery" class="w-full max-w-md">
            <button class="back-btn" :disabled="busy" @click="step = 'connect'"><i class="bi bi-arrow-left" /> Retour</button>
            <div class="gate-card p-6">
                <label for="recovery-key" class="field-label">Votre clé</label>
                <textarea id="recovery-key" :value="recoveryInput" rows="3" spellcheck="false" autocomplete="off" autocapitalize="characters" autofocus
                    placeholder="XXXX-XXXX-XXXX-XXXX-…" @input="onRecoveryInput" @keydown.stop @keydown.enter.prevent="recoveryReady && submitRecovery()"
                    class="key-field" :class="{ ready: recoveryReady }" />
                <p class="mt-2 flex justify-between gap-4 text-xs text-(--text2)">
                    <span>Tirets et espaces facultatifs</span>
                    <span class="tabular-nums" :class="{ 'text-(--primary)': recoveryReady }">{{ Math.min(recoveryChars, 56) }} / 56</span>
                </p>
                <button class="primary w-full mt-5" :class="{ loader: busy }" :disabled="busy || !recoveryReady" @click="submitRecovery">Connecter cet appareil</button>
            </div>
        </div>

        <!-- ============ Récupération par PIN ============ -->
        <div v-else-if="step === 'pin-recovery'" key="pin-recovery" class="flex w-full max-w-md flex-col items-center">
            <button class="back-btn self-start" :disabled="busy" @click="step = 'connect'"><i class="bi bi-arrow-left" /> Retour</button>
            <p class="mb-6 text-sm tabular-nums" :class="pinRecovery.attemptsLeft <= 3 ? 'text-red-500' : 'text-(--text2)'">{{ attemptsText }}</p>
            <PinPad v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="submitPinRecovery" />
        </div>

        <!-- ============ Choix du PIN local ============ -->
        <div v-else-if="step === 'choose-pin'" key="choose-pin" class="flex flex-col items-center">
            <PinPad v-model="pin" :error-tick="errorTick" @submit="submitChosenPin" />
        </div>

        <!-- ============ Création du compte (ou nouvelles clés) ============ -->
        <div v-else-if="step === 'onboard-intro'" key="onboard-intro" class="max-w-sm w-full">
            <ol class="onboard-steps" aria-label="Étapes">
                <li class="is-current" aria-current="step">Cet appareil</li>
                <li>Clé de récupération</li>
            </ol>
            <div class="gate-card onboard-fact">
                <i class="bi" :class="vaultMethod.icon" aria-hidden="true" />
                <div class="min-w-0">
                    <p class="onboard-fact-label">Pour ouvrir Synco</p>
                    <p class="onboard-fact-value">{{ vaultMethod.label }}</p>
                </div>
            </div>
            <p v-if="resetMode" class="onboard-warning">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true" /> Vos anciens messages ne pourront plus être lus.
            </p>
            <div class="flex flex-col items-center gap-3 mt-6">
                <button class="primary w-full" :class="{ loader: busy }" :disabled="busy" @click="startOnboarding()">
                    <span class="font-bold">Continuer</span>
                </button>
                <button v-if="enrollCancelled && platform === 'web' && hasPinVault" class="text-link" @click="onboardWithPin">
                    Utiliser plutôt un code PIN
                </button>
            </div>
        </div>

        <div v-else-if="step === 'onboard-recovery'" key="onboard-recovery" class="max-w-md w-full">
            <ol class="onboard-steps" aria-label="Étapes">
                <li class="is-done">Cet appareil</li>
                <li class="is-current" aria-current="step">Clé de récupération</li>
            </ol>
            <RecoveryKeyPanel :key-text="recoveryText" :account-label="accountLabel" @saved="recoverySaved = true" />
            <!-- Une seule action principale à la fois : Télécharger, puis Terminer une fois la clé gardée -->
            <button v-if="recoverySaved" class="primary w-full mt-4" :class="{ loader: busy }" :disabled="busy" @click="finishOnboarding(true)">Terminer</button>
        </div>

        </Transition>

        <!-- Actions secondaires, sur une seule ligne. « Se déconnecter » est toujours là : sans lui, un compte
             non déverrouillé reste bloqué sur cet écran. -->
        <div class="mt-10 flex items-center justify-center gap-6">
            <button v-if="step === 'choose-pin'" class="text-link" @click="abortChoosePin">Annuler</button>
            <button v-if="step === 'onboard-recovery' && !recoverySaved" class="text-link" :disabled="busy" @click="skipRecovery = true">
                Continuer sans clé
            </button>
            <button class="text-link is-quiet" :disabled="loggingOut" @click="logOut">
                <i class="bi bi-box-arrow-right mr-1" aria-hidden="true" /> Se déconnecter
            </button>
        </div>

        <!-- ============ Confirmations ============ -->
        <ConfirmDelete
            :show="skipRecovery"
            title="Continuer sans clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="Si vous perdez tous vos appareils, vos messages seront illisibles pour toujours. Vous pourrez créer une clé plus tard dans Paramètres › Sécurité."
            button-text="Continuer sans clé"
            :loading="busy"
            @confirm="skipRecovery = false; finishOnboarding(false)"
            @cancel="skipRecovery = false"
        />

        <E2eeResetDialog :isOpen="showReset" @close="showReset = false" @confirmed="beginReset" />

    </div>
    </div>

</template>

<script setup lang="ts">

import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import SpinLoader from '../SpinLoader.vue';
import E2eeResetDialog from './E2eeResetDialog.vue';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import PinPad from './PinPad.vue';
import QrCode from './QrCode.vue';
import RecoveryKeyPanel from './RecoveryKeyPanel.vue';
import ExtensionScene from './ExtensionScene.vue';
import { createExtensionScene, type SceneMode, type SceneView } from '@/assets/e2eeV4/extensionScene';
import { canAutoPrompt, mustWaitForVisible } from '@/assets/e2eeV4/extensionAuto';
import { consumeV4ResetRequest } from '@/assets/e2eeV4/pendingReset';
import { user } from '@/assets/var';
import { refetchUser } from '@/assets/init';
import { logoutEverywhere } from '@/assets/keycloak';
import { clearInstallPending, extensionBrowser, isInstallPending } from '@/assets/deviceVault/extensionInstall';
import useWSocket, { disconnectSocket } from '@/composables/useWSocket';
import { lockSecurity } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import useTheme from '@/composables/useTheme';
import { ExtensionVault, forgetThisDevice, getLocalDevice, idbStore, switchVault, VaultError, type DevicePlatform, type DeviceVault, type VaultContext, type VaultKind } from '@/assets/deviceVault';
import { EXTENSION_CANCELLED_HINT, unlockFailure } from '@/assets/e2eeV4/unlockFailure';
import {
    DeviceRevokedError, IdentityMismatchError, V4ApiError, prepareV4Account, recoverWithKey, startLink, unlockV4,
    type DeviceContext, type EnrollOptions, type OpenedLink, type PreparedAccount, type StartedLink,
} from '@/assets/e2eeV4/session';
import { E2eeV4Error } from '@/assets/utils/e2eeV4';
import { PinRecoveryFailure, pinRecoveryStatus, recoverWithPin } from '@/assets/e2eeV4/pinRecovery';
import { pinRecoveryActors, pinRecoveryConfigured } from '@/assets/e2eeV4/pinRecoveryApi';
import {
    applyIdentityKeys, autoUnlock, defaultDeviceName, detectPlatform, deviceContext, enrollmentVaults, freshIdentity,
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
const { resolvedTheme: theme } = useTheme();

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
/** Coffre enregistré pour cet appareil, et état de Synco Extension (jamais de clé ici). */
const localKind = ref<VaultKind | null>(null);
const extensionDetected = ref(false);
/** Synco Extension vient d'être installée depuis la suggestion : le PIN saisi au déverrouillage sert aussi à basculer. */
const extensionUpgrade = ref(false);
/** Synco Extension répond mais l'appareil est au PIN local : proposer d'y passer, à chaque lancement. */
const extensionOffer = ref(false);

const UPGRADE_NOTICE = "Saisissez votre code PIN actuel une dernière fois : Synco Extension prendra ensuite le relais, sans code.";

function acceptExtensionOffer() {
    extensionOffer.value = false;
    extensionUpgrade.value = true;
    notice.value = UPGRADE_NOTICE;
}
const extensionMissing = ref(false);
const extensionWaiting = ref(false);
/** Le déverrouillage par l'extension a déjà été lancé tout seul : le bouton propose alors de réessayer. */
const extensionAutoTried = ref(false);
/** Scène « Synco ↔ extension » affichée pendant que la fenêtre de l'extension attend le PIN. */
const scene = ref<SceneView | null>(null);
const sceneCtl = createExtensionScene({ onChange: v => { scene.value = v; } });

// Hors de l'état réactif : contexte, coffres, et objets qui détiennent AK le temps d'une étape.
let dev: DeviceContext | null = null;
let vaults: DeviceVault[] = [];
let prepared: PreparedAccount | null = null;
let started: StartedLink | null = null;
let opened: OpenedLink | null = null;
let extensionAbort: AbortController | null = null;
let onVisible: (() => void) | null = null;
function stopWaitingForVisible() {
    if (onVisible) document.removeEventListener('visibilitychange', onVisible);
    onVisible = null;
}
let extensionPrompted = false;

/**
 * Contexte d'une opération du coffre : la raison affichée, l'annulation côté page et le signal
 * « fenêtre de l'extension ouverte ». Le PIN de l'extension ne passe jamais par la page.
 */
function promptCtx(reason: string, mode: SceneMode): VaultContext {
    extensionAbort?.abort();
    extensionAbort = new AbortController();
    extensionPrompted = false;
    return {
        reason,
        signal: extensionAbort.signal,
        // La fonction renvoyée recevra 'ok' ou 'error' : la scène montre la réussite, ou s'efface devant l'erreur.
        onPrompt: () => { extensionPrompted = true; extensionWaiting.value = true; return sceneCtl.begin(mode); },
    };
}

function endPrompt() {
    extensionWaiting.value = false;
    extensionAbort = null;
}

/**
 * La page cesse d'attendre ; la fenêtre de l'extension, elle, reste ouverte (le protocole n'a pas d'annulation).
 * L'annulation vient de l'utilisateur : on ne lui explique pas ce qu'il vient de faire (pas de message d'erreur).
 */
function cancelExtensionWait() {
    sceneCtl.markUserCancel();
    extensionAbort?.abort();
}

const accountLabel = computed(() => user.value?.email || user.value?.name || '');
/** Comment cet appareil se déverrouillera : une icône et quelques mots, pas une phrase. */
const vaultMethod = computed(() => {
    const kind = vaults[0]?.capabilities.kind;
    if (kind === 'native-biometric') return { icon: 'bi-fingerprint', label: 'Empreinte ou code du téléphone' };
    if (kind === 'os-keyring') return { icon: 'bi-safe', label: 'Trousseau sécurisé du système' };
    if (kind === 'webauthn-prf') return { icon: 'bi-fingerprint', label: 'Passkey : empreinte, visage ou code' };
    if (kind === 'extension') return { icon: 'bi-puzzle', label: 'Synco Extension' };
    return { icon: 'bi-123', label: 'Code PIN à 4 chiffres' };
});

const title = computed(() => ({
    loading: 'Chargement…',
    unlock: extensionMissing.value ? 'Synco Extension ne répond pas' : 'Ouvrez vos messages',
    connect: "Récupérer l'accès",
    link: 'Connecter cet appareil',
    'link-sas': 'Comparez les codes',
    recovery: 'Clé de récupération',
    'pin-recovery': 'Code PIN de récupération',
    'choose-pin': pinFirst.value ? 'Confirmez votre code PIN' : 'Choisissez un code PIN',
    'onboard-intro': resetMode.value ? 'Repartir de zéro' : 'Protégez vos messages',
    'onboard-recovery': 'Clé de récupération',
}[step.value]));

/** Sous le titre du déverrouillage : comment on ouvre, en quelques mots, selon le verrou de cet appareil. */
const UNLOCK_HOW: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': 'Avec votre passkey : empreinte, visage ou code de l\'appareil.',
    'native-biometric': 'Avec votre empreinte, votre visage ou le code du téléphone.',
    'os-keyring': 'Avec le trousseau sécurisé de cet ordinateur.',
    'extension': 'Synco Extension vous demandera d\'autoriser l\'accès.',
    'web-pin': 'Saisissez le code PIN de cet appareil.',
};

const subtitle = computed(() => ({
    unlock: extensionMissing.value
        ? 'Elle est sans doute désactivée. Vos clés sont toujours dedans : rien n\'est perdu.'
        : lockoutSeconds.value > 0 ? '' : (localKind.value ? UNLOCK_HOW[localKind.value] : ''),
    link: 'Validez-le depuis un appareil déjà connecté à votre compte.',
    'link-sas': 'Votre autre appareil affiche aussi un code : ils doivent être identiques.',
    connect: 'Aucun appareil connecté sous la main ? Utilisez un accès de secours.',
    recovery: 'Dans le fichier synco-cle-de-recuperation.txt, téléchargé à l\'activation.',
    'pin-recovery': 'Le code à 4 chiffres choisi dans vos paramètres.',
    'choose-pin': pinFirst.value ? 'Saisissez-le une seconde fois.' : '4 chiffres, pour déverrouiller Synco sur cet appareil.',
    'onboard-intro': 'Seuls vous et vos interlocuteurs pourront les lire, pas même Synco. C\'est le chiffrement de bout en bout.',
    'onboard-recovery': 'Gardez-la précieusement : elle vous rend vos messages si vous perdez votre téléphone.',
} as Partial<Record<Step, string>>)[step.value] ?? '');

const attemptsText = computed(() => {
    const n = pinRecovery.attemptsLeft;
    return n > 1 ? `${n} essais restants` : n === 1 ? 'Dernier essai' : 'Aucun essai restant';
});

// --- transitions entre écrans : on avance (→) ou on revient (←) dans l'arborescence --------

const STEP_DEPTH: Partial<Record<Step, number>> = { 'link-sas': 1, connect: 1, recovery: 2, 'pin-recovery': 2 };
const stepDirection = ref<'fwd' | 'back'>('fwd');
watch(step, (now, before) => { stepDirection.value = (STEP_DEPTH[now] ?? 0) >= (STEP_DEPTH[before] ?? 0) ? 'fwd' : 'back'; });
const stepTransition = computed(() => `step-${stepDirection.value}`);

const formatDuration = (s: number) => s < 60 ? `${s} s` : s < 3600 ? `${Math.ceil(s / 60)} min` : `${Math.ceil(s / 3600)} h`;

// --- compte à rebours (verrou du PIN local, expiration de la liaison) -----

const lockoutSeconds = ref(0);
const linkSecondsLeft = ref(0);
const linkTotalSeconds = ref(300);
const linkProgress = computed(() => linkTotalSeconds.value > 0 ? Math.max(0, Math.min(1, linkSecondsLeft.value / linkTotalSeconds.value)) : 0);
const copied = ref(false);

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
    const base: EnrollOptions = { name: defaultDeviceName(platform.value), platform: platform.value, vaults, ctx: promptCtx('Protéger les clés de cet appareil', 'enroll') };
    if (!forcePin) {
        try {
            return await run(base);
        } catch (e) {
            if (!(e instanceof VaultError && e.code === 'pin-required')) throw e;
        } finally {
            endPrompt();
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
        if (sceneCtl.takeUserCancel()) return true; // « Annuler » cliqué dans la scène : rien à ajouter
        toast.show(extensionPrompted ? EXTENSION_CANCELLED_HINT : "Opération annulée.", 'info', extensionPrompted ? 8000 : undefined);
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
    localKind.value = record?.vaultKind ?? null;
    const vault = record ? dev.vaultFor(record.vaultKind) : undefined;
    unlockNeedsPin.value = !!vault?.capabilities.needsPin;
    unlockIcon.value = vault?.capabilities.biometric ? 'bi-fingerprint' : record?.vaultKind === 'extension' ? 'bi-puzzle' : 'bi-unlock-fill';
    return { record, vault };
}

async function tryUnlock() {
    if (!dev || busy.value) return;
    busy.value = true;
    const typedPin = unlockNeedsPin.value ? pin.value : '';
    try {
        const { sealed, served } = await freshIdentity();
        const keys = await unlockV4(dev, sealed, served, {
            ...promptCtx('Déverrouiller vos messages chiffrés', 'unlock'),
            ...(unlockNeedsPin.value ? { pin: pin.value } : {}),
        });
        extensionMissing.value = false;
        if (extensionUpgrade.value && localKind.value === 'web-pin' && typedPin) await upgradeToExtension(typedPin);
        applyIdentityKeys(keys);
    } catch (e) {
        if (e instanceof VaultError) {
            const failure = unlockFailure(localKind.value ?? undefined, e);
            switch (failure.action) {
                case 'wrong-pin':
                    errorTick.value++;
                    toast.show('Code PIN incorrect', 'error');
                    if (failure.retryAfterSeconds) { lockoutSeconds.value = failure.retryAfterSeconds; ensureTicker(); }
                    break;
                case 'lockout':
                    lockoutSeconds.value = failure.retryAfterSeconds;
                    ensureTicker();
                    if (failure.message) toast.show(failure.message, 'error', 8000);
                    break;
                case 'reconnect':
                    notice.value = failure.notice;
                    await goConnect(true);
                    break;
                case 'extension-unavailable':
                    // Les clés sont toujours dans l'extension : on n'oublie pas l'appareil.
                    extensionDetected.value = false;
                    extensionMissing.value = true;
                    break;
                case 'cancelled':
                    if (failure.message && !sceneCtl.takeUserCancel()) toast.show(failure.message, 'info', 8000);
                    break;
                case 'error':
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
        endPrompt();
        pin.value = '';
        busy.value = false;
    }
}

/**
 * Bascule du PIN local vers Synco Extension juste après un déverrouillage réussi : le PIN qui vient
 * d'ouvrir le coffre sert à le rouvrir pour le rescellement, l'extension ouvre sa fenêtre pour le sien.
 * Un échec ne bloque rien : le déverrouillage aboutit et le PIN local reste le verrou.
 */
async function upgradeToExtension(currentPin: string) {
    if (!dev) return;
    clearInstallPending(sessionStorage);
    extensionUpgrade.value = false;
    notice.value = '';
    const from = dev.vaultFor('web-pin');
    const to = dev.vaultFor('extension');
    if (!from || !to) return;
    try {
        await switchVault({
            userId: dev.userId, store: idbStore, from, to,
            fromCtx: { pin: currentPin },
            toCtx: promptCtx('Protéger les clés de cet appareil avec Synco Extension', 'enroll'),
        });
        toast.show('Cet appareil se déverrouille désormais avec Synco Extension.', 'success');
    } catch (e) {
        console.warn('[E2EE v4] passage à Synco Extension :', e);
        if (!(e instanceof VaultError && e.code === 'cancelled' && sceneCtl.takeUserCancel())) {
            toast.show("Synco Extension n'a pas été configurée : le code PIN local reste actif. Vous pourrez réessayer dans Paramètres › Appareils.", 'info', 8000);
        }
    } finally {
        endPrompt();
    }
}

/** Refait le handshake avec Synco Extension (réactivée, accès au site rendu) puis déverrouille. */
async function retryExtension() {
    if (!dev || busy.value) return;
    const vault = dev.vaultFor('extension');
    busy.value = true;
    const found = vault instanceof ExtensionVault ? await vault.detect(true) : false;
    extensionDetected.value = found;
    if (found) {
        busy.value = false;
        extensionMissing.value = false;
        await tryUnlock();
        return;
    }
    // Une extension réactivée n'est injectée qu'aux pages chargées après coup (Chrome) : on recharge.
    location.reload();
}

/** Consigne de réactivation pour le navigateur utilisé, et seulement lui. */
const extensionHelp = computed(() => {
    const browser = extensionBrowser(navigator.userAgent);
    return { page: browser === 'firefox' ? 'about:addons' : browser === 'edge' ? 'edge://extensions' : 'chrome://extensions' };
});

/** Passe à l'écran de connexion ; `forget` : les clés locales sont inutilisables, on les oublie. */
async function goConnect(forget = false) {
    if (forget && dev) {
        await forgetThisDevice(dev.userId, idbStore, dev.vaultFor).catch(() => {});
        await refreshLocalState();
    }
    // Chemin par défaut : validation depuis un autre appareil (QR code / code à recopier).
    await beginLink();
}

// --- liaison depuis un autre appareil ---------------------------------------

let pollTimer: ReturnType<typeof setTimeout> | null = null;
const linkQr = ref('');
const linkCode = ref('');
const linkSas = ref('');
const sasDigits = computed(() => linkSas.value.replace(/\D/g, ''));
const linkExpired = computed(() => !!linkQr.value && linkSecondsLeft.value <= 0);

async function copyLinkCode() {
    try {
        await navigator.clipboard.writeText(linkCode.value);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    } catch {
        toast.show('Copie impossible : sélectionnez le code à la main.', 'error');
    }
}

const stopPolling = () => { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } };
const stopListening = () => { stopPolling(); socketOff?.(); };

async function beginLink() {
    if (!dev) return;
    stopListening();
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
        linkTotalSeconds.value = Math.max(1, linkSecondsLeft.value);
        ensureTicker();
        poll();
        void listenLinkAnswer();
    } catch (e) {
        step.value = 'connect';
        toast.show(e instanceof V4ApiError ? e.message : 'Impossible de créer la demande de connexion.', 'error');
    }
}

// La réponse de l'appareil connecté arrive par WebSocket (« e2ee-link-answered ») ; l'interrogation
// périodique n'est qu'un filet de sécurité (socket coupé, événement manqué). À 2 s elle épuisait le
// quota de l'API (120 requêtes / 15 min) avant même l'expiration de la demande.
const POLL_FALLBACK_MS = 20_000;
let checking = false;
let socketOff: (() => void) | null = null;

/** Lit la réponse une fois. `true` : la liaison n'a plus rien à attendre (réponse, expiration ou échec). */
async function checkLink(): Promise<boolean> {
    if (!started || step.value !== 'link' || checking) return false;
    if (linkSecondsLeft.value <= 0) return true;
    checking = true;
    try {
        const result = await started.poll();
        if (result) {
            opened = result;
            linkSas.value = result.sas;
            notice.value = '';
            linkQr.value = '';
            step.value = 'link-sas';
            return true;
        }
    } catch (e) {
        if (e instanceof V4ApiError && e.status === 404) { linkSecondsLeft.value = 0; return true; }
        if (e instanceof E2eeV4Error) {
            // Réponse qui ne s'ouvre pas avec notre secret : mauvais code saisi, ou réponse forgée.
            toast.show("La réponse reçue n'a pas pu être vérifiée. Recommencez la connexion.", 'error', 8000);
            await cancelLink();
            return true;
        }
    } finally {
        checking = false;
    }
    return false;
}

function poll() {
    stopPolling();
    pollTimer = setTimeout(async () => {
        if (!(await checkLink()) && started && step.value === 'link') poll();
    }, POLL_FALLBACK_MS);
}

async function listenLinkAnswer() {
    socketOff?.();
    try {
        const socket = (await useWSocket()).value;
        if (!socket) return;
        const onAnswered = (payload: { requestId?: string }) => {
            if (payload?.requestId && payload.requestId === started?.requestId) {
                void checkLink().then(done => { if (done) stopListening(); });
            }
        };
        // Après une coupure, l'événement a pu être manqué : on relit une fois à la reconnexion.
        const onReconnect = () => { void checkLink().then(done => { if (done) stopListening(); }); };
        socket.on('e2ee-link-answered', onAnswered);
        socket.on('connect', onReconnect);
        socketOff = () => { socket.off('e2ee-link-answered', onAnswered); socket.off('connect', onReconnect); socketOff = null; };
    } catch { /* le filet de sécurité prend le relais */ }
}

/** Abandonne la demande en cours, puis en relance une (`link`) ou va à l'écran indiqué. */
async function cancelLink(next: 'link' | 'connect' | 'unlock' = 'link') {
    stopListening();
    await opened?.dispose();
    opened = null;
    await started?.cancel();
    started = null;
    linkQr.value = '';
    linkSas.value = '';
    linkExpiresAt = 0;
    if (next === 'link') { await beginLink(); return; }
    notice.value = '';
    step.value = next;
}

const openRescue = () => cancelLink('connect');
function leaveLink() {
    cancelLink('unlock');
    // Retour vers l'extension : on vérifie de nouveau si elle répond (elle a pu être réactivée entre-temps).
    if (localKind.value === 'extension' && dev) {
        const vault = dev.vaultFor('extension');
        if (vault instanceof ExtensionVault) {
            void vault.detect(true).then((found) => { extensionDetected.value = found; extensionMissing.value = !found; });
        }
    }
}

async function confirmLink() {
    if (!dev || !opened || busy.value) return;
    busy.value = true;
    try {
        const link = opened;
        const { sealed, served } = await freshIdentity();
        const keys = await withPinFallback(opts => link.confirm(sealed, served, opts));
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
const recoveryChars = computed(() => recoveryInput.value.replace(/[\s-]/g, '').length);
const recoveryReady = computed(() => recoveryChars.value >= 56);

/** Regroupe la saisie par 4 caractères (XXXX-XXXX-…) au fil de la frappe et du collage. */
function onRecoveryInput(e: Event) {
    const field = e.target as HTMLTextAreaElement;
    const raw = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 80);
    recoveryInput.value = raw.match(/.{1,4}/g)?.join('-') ?? '';
    field.value = recoveryInput.value;
}

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
        const { sealed, served } = await freshIdentity();
        const keys = await withPinFallback(opts => recoverWithPin(dev!, pinRecoveryActors, code, sealed, served, opts));
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
        const { sealed, served } = await freshIdentity();
        const keys = await withPinFallback(opts => recoverWithKey(dev!, text, sealed, served, opts));
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
            toast.show("La protection n'a pas pu être activée. Réessayez.", 'error');
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
        if (resetMode.value) toast.show('C\'est fait : vos nouveaux messages sont protégés.', 'success', 8000);
        resetMode.value = false;
    } catch (e) {
        prepared = null;
        recoveryText.value = '';
        step.value = 'onboard-intro';
        if (!handleEnrollError(e)) toast.show("La protection n'a pas pu être activée. Réessayez.", 'error');
    } finally {
        busy.value = false;
    }
}

// --- réinitialisation de dernier recours ---------------------------------------

const showReset = ref(false);

function openReset() {
    showReset.value = true;
}

/** Code e-mail validé (ici, ou depuis Paramètres › Sécurité) : on oublie cet appareil et on crée de nouvelles clés. */
async function beginReset() {
    showReset.value = false;
    if (dev) await forgetThisDevice(dev.userId, idbStore, dev.vaultFor).catch(() => {});
    resetMode.value = true;
    notice.value = '';
    step.value = 'onboard-intro';
}

// --- cycle de vie -----------------------------------------------------------

onMounted(async () => {
    try {
        platform.value = await detectPlatform();
        dev = await deviceContext();
        vaults = await enrollmentVaults();
        hasPinVault.value = vaults.some(v => v.capabilities.needsPin);
        if (props.mode === 'onboard') { step.value = 'onboard-intro'; return; }
        if (consumeV4ResetRequest()) { await beginReset(); return; }
        refreshPinRecovery();
        const local = await refreshLocalState();
        if (!local?.record) { await beginLink(); return; }
        if (local.record.vaultKind === 'extension') {
            const vault = dev.vaultFor('extension');
            extensionDetected.value = vault instanceof ExtensionVault && await vault.detect();
            extensionMissing.value = !extensionDetected.value;
        }
        step.value = 'unlock';
        // Synco Extension répond alors que l'appareil est au PIN local. Retour de la boutique (l'extension a
        // rechargé cet onglet) : l'utilisateur a déjà dit oui, on enchaîne. Sinon : on lui propose d'y passer.
        if (local.record.vaultKind === 'web-pin' && vaults.some(v => v.capabilities.kind === 'extension')) {
            if (isInstallPending(sessionStorage, dev.userId)) {
                extensionUpgrade.value = true;
                notice.value = `Synco Extension est installée. ${UPGRADE_NOTICE}`;
            } else {
                extensionOffer.value = true;
            }
        }
        // Trousseau du système et biométrie native : on propose l'invite tout de suite. Une passkey
        // exige un geste de l'utilisateur (bouton), le PIN local une saisie.
        const kind = local.record.vaultKind;
        if ((kind === 'os-keyring' || kind === 'native-biometric') && !autoUnlock.tried) {
            autoUnlock.tried = true;
            tryUnlock();
        }
        // Synco Extension : pas de bouton à presser, la fenêtre du PIN s'ouvre d'elle-même (la scène permet d'annuler
        // et de choisir une autre méthode). Une fois par chargement de la page.
        // Strictement bornée (extensionAuto.ts) : onglet visible, rien en cours, pas d'attente après trop d'essais,
        // une seule fois par session de page. Un onglet chargé en arrière-plan attend d'être affiché.
        const auto = () => ({
            kind, detected: extensionDetected.value, tried: autoUnlock.tried, step: step.value, busy: busy.value,
            waiting: extensionWaiting.value, lockoutSeconds: lockoutSeconds.value, missing: extensionMissing.value,
            visible: document.visibilityState === 'visible',
        });
        const launchExtension = () => {
            if (!canAutoPrompt(auto())) return;
            autoUnlock.tried = true;
            extensionAutoTried.value = true;
            void tryUnlock();
        };
        if (mustWaitForVisible(auto())) {
            onVisible = () => {
                if (document.visibilityState !== 'visible') return;
                stopWaitingForVisible();
                launchExtension();
            };
            document.addEventListener('visibilitychange', onVisible);
        } else {
            launchExtension();
        }
    } catch (e) {
        console.error('[E2EE v4] initialisation :', e);
        toast.show("Impossible d'initialiser le chiffrement sur cet appareil.", 'error');
        step.value = props.mode === 'onboard' ? 'onboard-intro' : 'connect';
    }
});

onUnmounted(() => {
    stopWaitingForVisible();
    cancelExtensionWait();
    sceneCtl.dispose();
    stopListening();
    if (ticker) clearInterval(ticker);
    opened?.dispose();
    started?.cancel();
    prepared?.discard();
    prepared = null;
    if (pinResolver) abortChoosePin();
});


const loggingOut = ref(false);
function logOut() {
    if (loggingOut.value) return;
    loggingOut.value = true;
    try { disconnectSocket(); } catch { /* socket absent */ }
    void logoutEverywhere();
}
</script>

<style scoped>
/* Écran de verrouillage : surfaces plates séparées par un trait, une ombre seulement sur ce qui flotte (la barre
   de l'extension), aucune icône dans une pastille teintée. Le vert de Synco est réservé à l'action principale et à
   l'état (progression, réussite). */

/* ---------- surfaces ---------- */
.gate-card { border-radius: 1.25rem; border: 1px solid var(--border-color); background: var(--bg); }

.gate-alert {
    width: 100%; max-width: 28rem; display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 1.5rem;
    padding: 0.875rem 1rem; border-radius: 0.875rem; border: 1px solid var(--border-color); background: var(--bg);
    font-size: 0.875rem; line-height: 1.45; color: var(--text);
}
.gate-alert > i { flex: none; margin-top: 0.1rem; color: #f59e0b; }
.gate-alert.is-danger { border-color: rgb(239 68 68 / 0.45); }
.gate-alert.is-danger > i, .gate-alert.is-danger .font-semibold { color: #ef4444; }
.gate-alert-sub { margin-top: 0.375rem; font-size: 0.8125rem; color: var(--text2); }

.gate-lockout { font-size: 0.9rem; color: var(--text2); text-align: center; }
.gate-lockout strong { color: #f59e0b; font-weight: 600; font-variant-numeric: tabular-nums; }

/* Lien texte : les actions secondaires, sans cadre ni capitales. */
.text-link { font-size: 0.875rem; color: var(--text2); text-underline-offset: 3px; transition: color 0.15s ease; }
.text-link:hover:not(:disabled) { color: var(--text); text-decoration: underline; }
.text-link.is-quiet { font-size: 0.8125rem; }
.text-link.is-quiet:hover:not(:disabled) { color: #ef4444; }
.text-link:disabled { opacity: 0.5; }

.offer { width: 100%; margin-bottom: 1.75rem; padding: 1rem 1.125rem; }

.gate-help summary {
    cursor: pointer; width: fit-content; margin: 0 auto; list-style: none;
    font-size: 0.875rem; color: var(--text2); transition: color 0.15s ease;
}
.gate-help summary::-webkit-details-marker { display: none; }
.gate-help summary:hover, .gate-help[open] summary { color: var(--text); }
.gate-help ol {
    margin-top: 0.875rem; padding: 1rem 1.1rem 1rem 2.2rem; list-style: decimal; border-radius: 0.875rem;
    border: 1px solid var(--border-color); background: var(--bg); font-size: 0.8125rem; color: var(--text2); line-height: 1.6;
}
.gate-help ol strong, .gate-help code { color: var(--text); font-weight: 600; }
.gate-help code { font-size: 0.78rem; }
.gate-help p { margin-top: 0.625rem; font-size: 0.8125rem; color: var(--text2); text-align: center; }

.back-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    margin-bottom: 1rem; padding: 0.25rem 0.5rem 0.25rem 0.25rem;
    font-size: 0.8125rem; color: var(--text2); border-radius: 0.5rem; transition: color 0.15s ease;
}
.back-btn:hover:not(:disabled) { color: var(--text); }

/* ---------- création : étapes et fait unique ---------- */
.onboard-steps { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 1.25rem; list-style: none; padding: 0; }
.onboard-steps li { padding-top: 0.625rem; font-size: 0.75rem; font-weight: 600; color: var(--text2); border-top: 3px solid color-mix(in srgb, var(--text) 12%, transparent); transition: border-color 0.3s ease, color 0.3s ease; }
.onboard-steps li.is-current { color: var(--text); border-top-color: var(--primary); }
.onboard-steps li.is-done { border-top-color: var(--primary); }
.onboard-fact { display: flex; align-items: center; gap: 0.875rem; padding: 1rem 1.125rem; }
.onboard-fact > i { flex: none; font-size: 1.25rem; color: var(--text2); }
.onboard-fact-label { font-size: 0.75rem; color: var(--text2); }
.onboard-fact-value { font-size: 0.95rem; font-weight: 600; color: var(--text); margin-top: 0.125rem; }
.onboard-warning { display: flex; align-items: center; gap: 0.5rem; margin-top: 0.875rem; font-size: 0.8125rem; color: #ef4444; }

/* ---------- transitions d'écran ---------- */
.step-fwd-enter-active, .step-back-enter-active { transition: opacity 0.28s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1); }
.step-fwd-leave-active, .step-back-leave-active { transition: opacity 0.14s ease, transform 0.14s ease; }
.step-fwd-enter-from { opacity: 0; transform: translateX(28px); }
.step-fwd-leave-to { opacity: 0; transform: translateX(-16px); }
.step-back-enter-from { opacity: 0; transform: translateX(-28px); }
.step-back-leave-to { opacity: 0; transform: translateX(16px); }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* ---------- QR code ---------- */
.qr-frame { position: relative; border-radius: 1.25rem; padding: 0.375rem; background: #fff; border: 1px solid var(--border-color); }
.qr-frame.is-expired .qr-in { filter: blur(7px) grayscale(1); opacity: 0.45; }
.qr-in { transition: filter 0.4s ease, opacity 0.4s ease; }
.qr-frame :deep(.qr) { padding: 0.5rem; }
.qr-skeleton { width: 14rem; height: 14rem; border-radius: 0.9rem; background: #eceef0; }
.qr-expired {
    position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.625rem; border-radius: 1.25rem; color: #1f2937; text-align: center;
}

.expiry { height: 0.25rem; border-radius: 999px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
.expiry-fill { height: 100%; width: 100%; border-radius: inherit; background: var(--primary); transform-origin: left; transition: transform 1s linear, background-color 0.4s ease; }
.expiry-fill.warn { background: #f59e0b; }

/* ---------- mode d'emploi ---------- */
.how { display: grid; gap: 1rem; }
.how li { display: flex; gap: 0.875rem; align-items: baseline; font-size: 0.9rem; line-height: 1.5; color: var(--text2); }
.how li strong { color: var(--text); font-weight: 600; }
.how-n { flex: none; width: 1.25rem; font-size: 0.875rem; font-weight: 700; color: var(--text); font-variant-numeric: tabular-nums; }

/* ---------- code à recopier : champ et bouton joints ---------- */
.code-line { display: flex; align-items: stretch; max-width: 100%; border-radius: 0.75rem; border: 1px solid var(--border-color); background: var(--bg2); overflow: hidden; }
.code-line code {
    flex: 1; min-width: 0; padding: 0.625rem 0.875rem; white-space: nowrap; overflow-x: auto; scrollbar-width: none; user-select: all; color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(0.62rem, 2.5vw, 0.8125rem); letter-spacing: 0.05em;
}
.code-line code::-webkit-scrollbar { display: none; }
.copy-btn { flex: none; width: 2.75rem; display: grid; place-items: center; color: var(--text2); border-left: 1px solid var(--border-color); transition: color 0.15s ease; }
.copy-btn:hover, .copy-btn.done { color: var(--primary); }

/* ---------- accès au secours ---------- */
.rescue-row {
    margin-top: 1rem; width: 100%; display: flex; align-items: center; gap: 0.875rem; padding: 0.875rem 1.125rem;
    border-radius: 1rem; border: 1px solid var(--border-color); color: var(--text); text-align: left; transition: border-color 0.2s ease;
}
.rescue-row:hover { border-color: color-mix(in srgb, var(--text) 30%, transparent); }
.rescue-row strong { display: block; font-size: 0.875rem; font-weight: 600; }
.rescue-row small { display: block; font-size: 0.8125rem; color: var(--text2); margin-top: 0.125rem; }
.rescue-arrow { color: var(--text2); transition: transform 0.2s ease; }
.rescue-row:hover .rescue-arrow { transform: translateX(3px); }

/* ---------- méthodes de secours : une seule carte, des lignes ---------- */
.options { overflow: hidden; }
.option { width: 100%; display: flex; align-items: center; gap: 0.875rem; padding: 1rem 1.125rem; text-align: left; transition: background-color 0.15s ease; }
.option + .option { border-top: 1px solid var(--border-color); }
.option:not(.is-disabled):hover { background: color-mix(in srgb, var(--text) 4%, transparent); }
.option.is-disabled { cursor: not-allowed; }
.option.is-disabled strong, .option.is-disabled .option-ico { opacity: 0.55; }
.option strong { display: block; font-size: 0.9rem; font-weight: 600; color: var(--text); }
.option small { display: block; margin-top: 0.125rem; font-size: 0.8125rem; line-height: 1.4; color: var(--text2); }
.option small.is-low { color: #ef4444; }
.option-ico { flex: none; width: 1.25rem; font-size: 1.1rem; text-align: center; color: var(--text2); }
.option-arrow { color: var(--text2); transition: transform 0.2s ease; }
.option:hover .option-arrow { transform: translateX(3px); }

.last-resort { margin-top: 1.75rem; text-align: center; }
.danger-link { font-size: 0.875rem; font-weight: 600; color: #ef4444; text-underline-offset: 3px; }
.danger-link:hover { text-decoration: underline; }
.last-resort p { margin-top: 0.25rem; font-size: 0.8125rem; color: var(--text2); }

/* ---------- saisie de la clé ---------- */
.field-label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: var(--text); }
.key-field {
    width: 100%; resize: none; border-radius: 0.875rem; padding: 0.875rem 1rem; color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; letter-spacing: 0.12em; line-height: 1.6;
    background: var(--bg2); border: 1px solid var(--border-color); transition: border-color 0.2s ease;
}
.key-field:focus { outline: none; border-color: var(--primary); }
.key-field.ready { border-color: var(--primary); }

/* ---------- code de confirmation ---------- */
.sas { display: flex; align-items: center; gap: 1.25rem; }
.sas-group { display: flex; gap: 0.4rem; }
.sas-digit {
    width: 2.6rem; height: 3.4rem; display: grid; place-items: center; border-radius: 0.75rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.75rem; font-weight: 700; color: var(--text);
    background: var(--bg2); border: 1px solid var(--border-color);
    animation: pop-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 60ms + 150ms);
}

/* ---------- animations ---------- */
@keyframes pop-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}
</style>
