<template>

    <div class="w-full h-full overflow-y-auto bg-(--bg2) select-none">
    <div class="min-h-full flex flex-col items-center justify-center p-6">

        <div class="mb-6 text-center max-w-lg">
            <img :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'" alt="Logo" class="h-16 mx-auto mb-3" />
            <h1 class="text-xl font-bold text-(--text)">{{ title }}</h1>
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

        <!-- Fenêtre du PIN de Synco Extension ouverte : scène « Synco ↔ extension » (déverrouillage ou inscription) -->
        <ExtensionScene :view="scene" @cancel="cancelExtensionWait" />

        <Transition :name="stepTransition" mode="out-in">
        <div v-if="step === 'loading'" key="loading" class="py-10"><SpinLoader /></div>

        <!-- ============ Déverrouillage quotidien ============ -->
        <div v-else-if="step === 'unlock'" key="unlock" class="flex flex-col items-center">
            <template v-if="lockoutSeconds > 0">
                <p class="text-amber-500 font-medium">{{ localKind === 'extension' ? "Trop d'essais ou trop de demandes." : 'Trop de tentatives incorrectes.' }}</p>
                <p class="text-(--text2) text-sm mt-1">Réessayez dans {{ formatDuration(lockoutSeconds) }}</p>
            </template>
            <!-- Appareil verrouillé par l'extension, qui ne répond pas : ses clés ne sont pas perdues -->
            <div v-else-if="extensionMissing" class="w-full max-w-sm flex flex-col items-center">
                <span class="method-ico ext-missing-ico" aria-hidden="true"><i class="bi bi-puzzle" /></span>

                <button class="primary w-full mt-6" :class="{ loader: busy }" :disabled="busy" @click="retryExtension">Réessayer</button>

                <!-- Une seule consigne, celle du navigateur utilisé, et seulement si on la demande -->
                <details class="ext-help w-full mt-4">
                    <summary>Comment la réactiver ?</summary>
                    <ol class="gate-card">
                        <li>Ouvrez <code>{{ extensionHelp.page }}</code> dans un nouvel onglet.</li>
                        <li>Activez <strong>Synco Extension</strong> et autorisez-la sur ce site.</li>
                        <li>Revenez ici et cliquez sur <strong>Réessayer</strong>.</li>
                    </ol>
                    <p>Désinstallée ? Ses clés sont effacées : utilisez une autre méthode ci-dessous.</p>
                </details>
            </div>
            <template v-else-if="unlockNeedsPin">
                <!-- Synco Extension présente mais pas utilisée : on propose d'y passer (une fois par lancement). Le PIN
                     saisi juste après sert aussi au changement de verrou : rien de plus à taper. -->
                <div v-if="extensionOffer" class="gate-card max-w-sm w-full p-4 mb-6 flex items-start gap-3">
                    <i class="bi bi-puzzle text-lg text-(--primary)" />
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-semibold text-(--text)">Synco Extension est installée</p>
                        <p class="text-xs text-(--text2) mt-1">Déverrouiller désormais avec l'extension ?</p>
                        <div class="flex items-center gap-3 mt-3">
                            <button class="primary text-xs" @click="acceptExtensionOffer">Oui</button>
                            <button class="text-xs text-(--text2) hover:text-(--text) transition-colors" @click="extensionOffer = false">Pas maintenant</button>
                        </div>
                    </div>
                </div>
                <PinPad v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="tryUnlock" />
            </template>
            <template v-else>
                <p v-if="localKind === 'extension' && extensionDetected && !extensionAutoTried" class="text-xs text-(--text2) mb-4">
                    <i class="bi bi-puzzle mr-1" /> Extension détectée : le code PIN se saisira dans sa fenêtre.
                </p>
                <button class="primary flex items-center gap-2" :class="{ loader: busy }" :disabled="busy || extensionWaiting" @click="tryUnlock">
                    <i class="bi" :class="unlockIcon" />
                    <span class="font-bold">{{ localKind === 'extension' && extensionAutoTried ? "Réessayer avec l'extension" : 'Déverrouiller' }}</span>
                </button>
            </template>

            <button v-if="unlockNeedsPin" class="mt-6 text-sm text-(--text2) hover:text-(--primary) transition-colors" @click="goConnect()">
                Code PIN oublié ?
            </button>
            <button v-else class="second text-sm flex items-center justify-center gap-2 mt-4" :class="extensionMissing ? 'w-full max-w-sm' : ''" @click="goConnect()">
                <i class="bi bi-phone" />
                <span>{{ localKind === 'extension' ? 'Utiliser un autre appareil ou une clé' : 'Utiliser une autre méthode' }}</span>
            </button>
        </div>

        <!-- ============ Liaison : QR code (chemin par défaut) ============ -->
        <div v-else-if="step === 'link'" key="link" class="w-full max-w-3xl">
            <button v-if="hasLocalRecord && !identityAlert" class="back-btn" @click="leaveLink">
                <i class="bi bi-arrow-left" /> {{ localKind === 'extension' ? 'Revenir à Synco Extension' : 'Revenir au déverrouillage' }}
            </button>
            <div class="gate-card grid gap-8 p-6 md:grid-cols-[auto_1fr] md:p-8">

                <div class="flex flex-col items-center gap-4">
                    <div class="qr-frame" :class="{ 'is-expired': linkExpired, 'is-ready': !!linkQr }">
                        <QrCode v-if="linkQr" :value="linkQr" label="QR code de liaison" class="qr-in" />
                        <div v-else class="qr-skeleton" aria-hidden="true" />
                        <Transition name="fade">
                            <div v-if="linkExpired" class="qr-expired">
                                <i class="bi bi-hourglass-bottom text-2xl" />
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


                    <ol class="how space-y-4">
                        <li style="--i: 0"><span class="how-n">1</span><p>Ouvrez Synco sur un appareil <strong>déjà connecté</strong> à votre compte.</p></li>
                        <li style="--i: 1"><span class="how-n">2</span><p>Allez dans <strong>Paramètres › Appareils</strong>, puis <strong>Ajouter un appareil</strong>.</p></li>
                        <li style="--i: 2"><span class="how-n">3</span><p>Scannez ce QR code, ou saisissez le code ci-dessous, puis comparez les deux codes à 6 chiffres.</p></li>
                    </ol>

                    <div class="code-line mt-5" aria-label="Code de liaison à recopier">
                        <i class="bi bi-keyboard text-(--text2)" />
                        <code>{{ linkCode }}</code>
                        <button class="copy-btn" :class="{ done: copied }" :title="copied ? 'Copié' : 'Copier le code'" @click="copyLinkCode">
                            <i class="bi" :class="copied ? 'bi-check2' : 'bi-clipboard'" />
                        </button>
                    </div>

                    <p class="mt-auto pt-6 text-xs leading-snug text-amber-500/90">
                        <i class="bi bi-shield-lock-fill me-1" /> Ne montrez ce code qu'à vos propres appareils : il donne accès à vos messages chiffrés.
                    </p>
                </div>
            </div>

            <button class="rescue-row" @click="openRescue">
                <span class="rescue-ico"><i class="bi bi-life-preserver" /></span>
                <span class="min-w-0 flex-1 text-left">
                    <strong>Je n'ai plus aucun appareil connecté</strong>
                    <small>Récupérer l'accès avec une clé ou un code de secours</small>
                </span>
                <i class="bi bi-arrow-right rescue-arrow" />
            </button>
        </div>

        <!-- ============ Liaison : code de confirmation ============ -->
        <div v-else-if="step === 'link-sas'" key="link-sas" class="w-full max-w-md">
            <div class="gate-card flex flex-col items-center gap-5 p-8 text-center">
                <span class="badge-ico"><i class="bi bi-phone-vibrate" /></span>
                <p class="max-w-xs text-sm leading-relaxed text-(--text2)">
                    L'autre appareil a validé la demande. Vérifiez qu'il affiche <strong class="text-(--text)">exactement le même code</strong> :
                </p>
                <div class="sas" aria-label="Code de confirmation">
                    <span v-for="(group, g) in [sasDigits.slice(0, 3), sasDigits.slice(3, 6)]" :key="g" class="sas-group">
                        <span v-for="(d, i) in group" :key="i" class="sas-digit" :style="{ '--i': g * 3 + i }">{{ d }}</span>
                    </span>
                </div>
                <p class="text-xs text-(--text2)">Deux codes différents signalent une tentative d'interception : refusez.</p>
                <div class="flex w-full gap-3">
                    <button class="default flex-1" :disabled="busy" @click="cancelLink()">Les codes diffèrent</button>
                    <button class="primary flex-1" :class="{ loader: busy }" :disabled="busy" @click="confirmLink">Les codes correspondent</button>
                </div>
            </div>
        </div>

        <!-- ============ Secours : plus aucun appareil connecté ============ -->
        <div v-else-if="step === 'connect'" key="connect" class="w-full max-w-md">
            <button class="back-btn" @click="beginLink"><i class="bi bi-arrow-left" /> Retour</button>

            <div class="stagger space-y-3">
                <button class="method" style="--i: 0" @click="step = 'recovery'">
                    <span class="method-ico"><i class="bi bi-key-fill" /></span>
                    <span class="min-w-0 flex-1">
                        <strong>Clé de récupération <em class="tag tag-ok">Recommandé</em></strong>
                        <small>La clé de 56 caractères proposée à la création de votre compte.</small>
                    </span>
                    <i class="bi bi-chevron-right method-arrow" />
                </button>

                <button v-if="pinRecovery.enabled && !pinRecovery.locked" class="method" style="--i: 1" @click="openPinRecovery">
                    <span class="method-ico"><i class="bi bi-123" /></span>
                    <span class="min-w-0 flex-1">
                        <strong>Code PIN de récupération <em class="tag tag-warn">Moins sûr</em></strong>
                        <small>Un code à 4 chiffres, vérifié par deux serveurs distincts.</small>
                        <span class="attempts" :class="{ low: pinRecovery.attemptsLeft <= 3 }" :aria-label="`${pinRecovery.attemptsLeft} essais restants`">
                            <i v-for="n in 10" :key="n" :class="{ on: n <= pinRecovery.attemptsLeft }" />
                            <span>{{ pinRecovery.attemptsLeft }} essai(s) restant(s)</span>
                        </span>
                    </span>
                    <i class="bi bi-chevron-right method-arrow" />
                </button>
                <div v-else class="method is-disabled" style="--i: 1" aria-disabled="true">
                    <span class="method-ico"><i class="bi bi-123" /></span>
                    <span class="min-w-0 flex-1">
                        <strong>Code PIN de récupération</strong>
                        <small>{{ pinRecoveryUnavailableText }}</small>
                    </span>
                    <i class="bi bi-lock-fill text-(--text2)" />
                </div>

                <div class="last-resort" style="--i: 2">
                    <p class="last-resort-label"><span>Dernier recours</span></p>
                    <button class="danger-row" @click="openReset">
                        <i class="bi bi-arrow-counterclockwise" />
                        <span class="min-w-0 flex-1 text-left">
                            <strong>Repartir de zéro</strong>
                            <small>Plus aucun appareil ni clé ? Vous perdrez vos anciens messages.</small>
                        </span>
                    </button>
                </div>
            </div>
        </div>

        <!-- ============ Clé de récupération ============ -->
        <div v-else-if="step === 'recovery'" key="recovery" class="w-full max-w-md">
            <button class="back-btn" :disabled="busy" @click="step = 'connect'"><i class="bi bi-arrow-left" /> Retour</button>
            <div class="gate-card space-y-4 p-6">
                <div class="flex items-center gap-3">
                    <span class="method-ico"><i class="bi bi-key-fill" /></span>
                    <p class="text-sm leading-snug text-(--text2)">Saisissez ou collez votre clé. Les tirets, les espaces et la casse n'ont pas d'importance.</p>
                </div>
                <textarea :value="recoveryInput" rows="3" spellcheck="false" autocomplete="off" autocapitalize="characters" autofocus
                    placeholder="XXXX-XXXX-XXXX-XXXX-…" @input="onRecoveryInput" @keydown.stop @keydown.enter.prevent="recoveryReady && submitRecovery()"
                    class="key-field" :class="{ ready: recoveryReady }" />
                <div>
                    <div class="expiry"><div class="expiry-fill" :class="{ ok: recoveryReady }" :style="{ transform: `scaleX(${Math.min(1, recoveryChars / 56)})` }" /></div>
                    <p class="mt-1.5 flex justify-between text-xs tabular-nums text-(--text2)">
                        <span>{{ recoveryReady ? 'Longueur correcte' : 'Une clé compte 56 caractères' }}</span>
                        <span>{{ recoveryChars }} / 56</span>
                    </p>
                </div>
                <button class="primary w-full" :class="{ loader: busy }" :disabled="busy || !recoveryReady" @click="submitRecovery">Connecter cet appareil</button>
            </div>
        </div>

        <!-- ============ Récupération par PIN ============ -->
        <div v-else-if="step === 'pin-recovery'" key="pin-recovery" class="flex w-full max-w-md flex-col items-center">
            <button class="back-btn self-start" :disabled="busy" @click="step = 'connect'"><i class="bi bi-arrow-left" /> Retour</button>
            <p class="mb-5 max-w-sm text-center text-sm leading-relaxed text-(--text2)">
                Saisissez votre <strong class="text-(--text)">code PIN de récupération</strong>.
            </p>
            <span class="attempts mb-6" :class="{ low: pinRecovery.attemptsLeft <= 3 }">
                <i v-for="n in 10" :key="n" :class="{ on: n <= pinRecovery.attemptsLeft }" />
                <span>{{ pinRecovery.attemptsLeft }} essai(s) avant blocage</span>
            </span>
            <PinPad v-model="pin" auto-submit :disabled="busy" :error-tick="errorTick" @submit="submitPinRecovery" />
        </div>

        <!-- ============ Choix du PIN local ============ -->
        <div v-else-if="step === 'choose-pin'" class="flex flex-col items-center">
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
                <button v-if="enrollCancelled && platform === 'web' && hasPinVault" class="text-xs text-(--text2) hover:text-(--primary)" @click="onboardWithPin">
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
        <div class="mt-8 flex items-center justify-center gap-6 text-xs font-bold uppercase tracking-widest text-(--text2)">
            <button v-if="step === 'choose-pin'" class="uppercase tracking-widest hover:text-(--primary) transition-colors" @click="abortChoosePin">
                Annuler
            </button>
            <button v-if="step === 'onboard-recovery' && !recoverySaved" class="uppercase tracking-widest hover:text-amber-500 transition-colors" :disabled="busy" @click="skipRecovery = true">
                Passer cette étape
            </button>
            <button class="uppercase tracking-widest hover:text-red-500 transition-colors disabled:opacity-50" :disabled="loggingOut" @click="logOut">
                <i class="bi bi-box-arrow-right mr-1" /> Se déconnecter
            </button>
        </div>

        <!-- ============ Confirmations ============ -->
        <ConfirmDelete
            :show="skipRecovery"
            title="Continuer sans clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="Sans clé de récupération, la perte de tous vos appareils rend vos messages définitivement illisibles. Vous pourrez en créer une plus tard dans Paramètres › Sécurité."
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
import useSettingsItem from '@/composables/useSettingsItem';
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
/** Coffre enregistré pour cet appareil, et état de Synco Extension (jamais de clé ici). */
const localKind = ref<VaultKind | null>(null);
const extensionDetected = ref(false);
/** Synco Extension vient d'être installée depuis la suggestion : le PIN saisi au déverrouillage sert aussi à basculer. */
const extensionUpgrade = ref(false);
/** Synco Extension répond mais l'appareil est au PIN local : proposer d'y passer, à chaque lancement. */
const extensionOffer = ref(false);

const UPGRADE_NOTICE = "Saisissez votre code PIN actuel : Synco Extension vous proposera ensuite de choisir le sien.";

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
    unlock: extensionMissing.value ? 'Synco Extension ne répond pas' : 'Déverrouillez votre session',
    connect: "Récupérer l'accès",
    link: 'Connecter cet appareil',
    'link-sas': 'Confirmez la connexion',
    recovery: 'Clé de récupération',
    'pin-recovery': 'Récupération par code PIN',
    'choose-pin': pinFirst.value ? 'Confirmez votre code PIN' : 'Choisissez un code PIN',
    'onboard-intro': resetMode.value ? 'Repartir de zéro' : 'Protégez vos messages',
    'onboard-recovery': 'Clé de récupération',
}[step.value]));

const subtitle = computed(() => ({
    link: "Validez cet appareil depuis un appareil déjà connecté à votre compte.",
    connect: "Ces méthodes servent seulement quand aucun de vos appareils connectés n'est à portée.",
    'choose-pin': pinFirst.value ? 'Saisissez-le une seconde fois.' : '4 chiffres, pour déverrouiller Synco sur cet appareil.',
    'onboard-intro': 'Seuls vous et vos interlocuteurs pourront les lire, pas même Synco. C\'est le chiffrement de bout en bout.',
    'onboard-recovery': 'Gardez-la précieusement : elle vous rend vos messages si vous perdez votre téléphone.',
    ...(extensionMissing.value ? { unlock: 'Elle est sans doute désactivée. Vos clés sont toujours dedans : rien n\'est perdu.' } : {}),
} as Partial<Record<Step, string>>)[step.value] ?? '');

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

/* ---------- carte ---------- */
.gate-card {
    border-radius: 1.25rem;
    border: 1px solid var(--border-color);
    background: var(--bg);
    box-shadow: 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent), 0 24px 48px -24px rgb(0 0 0 / 0.35);
}
.method-ico.ext-missing-ico { width: 3.5rem; border-radius: 1.1rem; height: 3.5rem; font-size: 1.6rem; }
.ext-help summary {
    cursor: pointer; text-align: center; list-style: none;
    font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
    color: var(--text2); transition: color 0.15s ease;
}
.ext-help summary::-webkit-details-marker { display: none; }
.ext-help summary:hover, .ext-help[open] summary { color: var(--primary); }
.ext-help ol { margin-top: 0.9rem; padding: 1rem 1.1rem 1rem 2.2rem; list-style: decimal; font-size: 0.8125rem; color: var(--text2); line-height: 1.6; }
.ext-help ol strong { color: var(--text); font-weight: 600; }
.ext-help code { font-size: 0.78rem; color: var(--text); }
.ext-help p { margin-top: 0.6rem; font-size: 0.75rem; color: var(--text2); text-align: center; }

.back-btn {
    display: inline-flex; align-items: center; gap: 0.4rem;
    margin-bottom: 1rem; padding: 0.25rem 0.5rem 0.25rem 0.25rem;
    font-size: 0.8125rem; color: var(--text2); border-radius: 0.5rem;
    transition: color 0.15s ease, transform 0.15s ease;
}
.back-btn:hover:not(:disabled) { color: var(--primary); transform: translateX(-2px); }

/* ---------- QR code ---------- */
.qr-frame {
    position: relative; border-radius: 1.25rem; padding: 0.375rem; background: #fff;
    box-shadow: 0 0 0 1px var(--border-color), 0 12px 32px -12px color-mix(in srgb, var(--primary) 45%, transparent);
    transition: box-shadow 0.4s ease;
}
.qr-frame.is-expired { box-shadow: 0 0 0 1px var(--border-color); }
.qr-frame.is-expired .qr-in { filter: blur(7px) grayscale(1); opacity: 0.45; }
.qr-in { transition: filter 0.4s ease, opacity 0.4s ease; animation: pop-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; }
.qr-frame :deep(.qr) { padding: 0.5rem; }
.qr-skeleton {
    width: 14rem; height: 14rem; border-radius: 0.9rem;
    background: linear-gradient(100deg, #eceef0 30%, #f8f9fa 50%, #eceef0 70%) 0 0 / 200% 100%;
    animation: shimmer 1.2s linear infinite;
}
.qr-expired {
    position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.5rem; border-radius: 1.25rem; color: #1f2937; text-align: center;
}

.expiry { height: 0.3125rem; border-radius: 999px; background: color-mix(in srgb, var(--text) 10%, transparent); overflow: hidden; }
.expiry-fill {
    height: 100%; width: 100%; border-radius: inherit; background: var(--primary); transform-origin: left;
    transition: transform 1s linear, background-color 0.4s ease;
}
.expiry-fill.warn { background: #f59e0b; }
.expiry-fill.ok { background: var(--primary); transition: transform 0.2s ease, background-color 0.4s ease; }
.expiry-fill:not(.ok):not(.warn) { transition: transform 1s linear, background-color 0.4s ease; }

/* ---------- mode d'emploi ---------- */
.how li { display: flex; gap: 0.875rem; align-items: flex-start; font-size: 0.875rem; line-height: 1.45; color: var(--text2); animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 80ms + 120ms); }
.how li strong { color: var(--text); font-weight: 600; }
.how-n {
    flex: none; width: 1.5rem; height: 1.5rem; border-radius: 50%; display: grid; place-items: center;
    font-size: 0.75rem; font-weight: 700; color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent);
}

/* ---------- code à recopier (une seule ligne) ---------- */
.code-line {
    display: flex; align-items: center; gap: 0.6rem; max-width: 100%; padding: 0.35rem 0.4rem 0.35rem 0.8rem;
    border-radius: 0.8rem; border: 1px solid var(--border-color); background: color-mix(in srgb, var(--text) 5%, transparent);
}
.code-line code {
    flex: 1; min-width: 0; white-space: nowrap; overflow-x: auto; scrollbar-width: none; user-select: all; color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: clamp(0.62rem, 2.5vw, 0.8125rem); letter-spacing: 0.05em;
}
.code-line code::-webkit-scrollbar { display: none; }
.copy-btn {
    flex: none; width: 2.25rem; height: 2.25rem; border-radius: 0.6rem; display: grid; place-items: center;
    color: var(--text2); border: 1px solid var(--border-color); transition: all 0.2s ease;
}
.copy-btn:hover { color: var(--primary); border-color: var(--primary); }
.copy-btn.done { color: #fff; background: var(--primary); border-color: var(--primary); transform: scale(1.08); }

/* ---------- accès au secours ---------- */
.rescue-row {
    margin-top: 1rem; width: 100%; display: flex; align-items: center; gap: 0.875rem; padding: 0.875rem 1rem;
    border-radius: 1rem; border: 1px dashed var(--border-color); color: var(--text); text-align: left;
    transition: border-color 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}
.rescue-row:hover { border-style: solid; border-color: var(--primary); background: color-mix(in srgb, var(--primary) 6%, transparent); }
.rescue-row strong { display: block; font-size: 0.875rem; }
.rescue-row small { display: block; font-size: 0.75rem; color: var(--text2); margin-top: 0.125rem; }
.rescue-ico { flex: none; width: 2.25rem; height: 2.25rem; border-radius: 0.7rem; display: grid; place-items: center; color: var(--text2); background: color-mix(in srgb, var(--text) 7%, transparent); transition: all 0.2s ease; }
.rescue-row:hover .rescue-ico { color: #fff; background: var(--primary); }
.rescue-arrow { color: var(--text2); transition: transform 0.2s ease, color 0.2s ease; }
.rescue-row:hover .rescue-arrow { transform: translateX(4px); color: var(--primary); }

/* ---------- méthodes de secours ---------- */
.stagger > * { animation: rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i, 0) * 90ms + 60ms); }
.method {
    width: 100%; display: flex; align-items: center; gap: 0.875rem; padding: 1rem; text-align: left;
    border-radius: 1rem; border: 1px solid var(--border-color); background: var(--bg);
    transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}
.method:not(.is-disabled):hover { border-color: var(--primary); transform: translateY(-2px); box-shadow: 0 14px 28px -18px color-mix(in srgb, var(--primary) 70%, transparent); }
.method:not(.is-disabled):active { transform: translateY(0); }
.method.is-disabled { opacity: 0.6; cursor: not-allowed; }
.method strong, .danger-row strong { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; font-size: 0.9rem; color: var(--text); }
.method small, .danger-row small { display: block; margin-top: 0.2rem; font-size: 0.75rem; line-height: 1.4; color: var(--text2); }
.method-ico, .badge-ico {
    flex: none; width: 2.5rem; height: 2.5rem; border-radius: 0.8rem; display: grid; place-items: center; font-size: 1.15rem;
    color: var(--primary); background: color-mix(in srgb, var(--primary) 13%, transparent);
}
.badge-ico { width: 3.5rem; height: 3.5rem; border-radius: 1.1rem; font-size: 1.6rem; animation: pop-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
.is-disabled .method-ico { color: var(--text2); background: color-mix(in srgb, var(--text) 7%, transparent); }
.method-arrow { color: var(--text2); transition: transform 0.2s ease, color 0.2s ease; }
.method:hover .method-arrow { transform: translateX(3px); color: var(--primary); }
.tag { font-style: normal; font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; padding: 0.125rem 0.5rem; border-radius: 999px; }
.tag-ok { color: var(--primary); background: color-mix(in srgb, var(--primary) 14%, transparent); }
.tag-warn { color: #f59e0b; background: rgb(245 158 11 / 0.14); }

.attempts { display: flex; align-items: center; gap: 0.2rem; margin-top: 0.55rem; font-size: 0.6875rem; color: var(--text2); }
.attempts i { width: 0.4rem; height: 0.4rem; border-radius: 50%; background: color-mix(in srgb, var(--text) 15%, transparent); transition: background-color 0.3s ease; }
.attempts i.on { background: var(--primary); }
.attempts.low i.on { background: #ef4444; }
.attempts > span { margin-left: 0.4rem; }

.last-resort { padding-top: 0.75rem; }
.last-resort-label { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.6rem; font-size: 0.6875rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text2); }
.last-resort-label::before, .last-resort-label::after { content: ''; flex: 1; height: 1px; background: var(--border-color); }
.danger-row {
    width: 100%; display: flex; align-items: center; gap: 0.875rem; padding: 0.75rem 1rem; border-radius: 0.9rem;
    border: 1px solid transparent; color: #ef4444; text-align: left; transition: background-color 0.2s ease, border-color 0.2s ease;
}
.danger-row > i { font-size: 1.1rem; flex: none; width: 2.5rem; text-align: center; transition: transform 0.4s ease; }
.danger-row strong { color: #ef4444; }
.danger-row:hover { background: rgb(239 68 68 / 0.07); border-color: rgb(239 68 68 / 0.3); }
.danger-row:hover > i { transform: rotate(-120deg); }

/* ---------- saisie de la clé ---------- */
.key-field {
    width: 100%; resize: none; border-radius: 0.9rem; padding: 0.875rem 1rem; color: var(--text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9rem; letter-spacing: 0.12em; line-height: 1.6;
    background: var(--bg2); border: 1.5px solid var(--border-color); transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.key-field:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 15%, transparent); }
.key-field.ready { border-color: var(--primary); }

/* ---------- code de confirmation ---------- */
.sas { display: flex; align-items: center; gap: 1.25rem; }
.sas-group { display: flex; gap: 0.4rem; }
.sas-digit {
    width: 2.6rem; height: 3.4rem; display: grid; place-items: center; border-radius: 0.8rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 1.75rem; font-weight: 700; color: var(--text);
    background: color-mix(in srgb, var(--primary) 10%, transparent); border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
    animation: pop-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both; animation-delay: calc(var(--i) * 60ms + 150ms);
}

/* ---------- animations ---------- */
@keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes pop-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: none; } }
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-delay: 0ms !important; transition-duration: 0.01ms !important; }
}
</style>
