<template>

    <div>

        <!-- ================= Onglet « Appareils » ================= -->
        <section v-if="view === 'devices'" class="space-y-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">
                    Appareils connectés <span v-if="!loading" class="ml-1 tabular-nums">· {{ devices.length }}</span>
                </h4>
                <button class="primary text-sm flex items-center gap-2" :disabled="!E2EEUnloked" @click="openAdd">
                    <i class="bi bi-plus-lg" aria-hidden="true" /> Ajouter un appareil
                </button>
            </div>

            <input v-if="devices.length > 6" v-model="search" type="search" placeholder="Rechercher un appareil…" aria-label="Rechercher un appareil" @keydown.stop
                class="w-full max-w-sm bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)" />

            <div v-if="loading" class="py-6 flex justify-center"><SpinLoader /></div>

            <!-- Une seule carte, une ligne par appareil : cet appareil d'abord, avec son verrou -->
            <ul v-else class="panel">
                <li v-for="d in orderedDevices" :key="d.id" class="device-row">
                    <div class="flex items-start gap-3.5">
                        <i class="bi row-ico" :class="[PLATFORM_ICONS[d.platform], { 'is-current': d.isThisDevice }]" aria-hidden="true" />
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 flex-wrap">
                                <template v-if="renamingId === d.id">
                                    <input v-model="renameValue" maxlength="64" aria-label="Nom de l'appareil" @keydown.stop @keyup.enter="saveRename(d)" @keyup.esc="renamingId = ''"
                                        class="bg-(--bg) border border-(--border-color) rounded-lg px-2 py-1 text-sm text-(--text) focus:outline-none focus:border-(--primary)" />
                                    <button class="text-(--primary) text-sm" title="Enregistrer" aria-label="Enregistrer" @click="saveRename(d)"><i class="bi bi-check-lg" /></button>
                                    <button class="text-(--text2) text-sm" title="Annuler" aria-label="Annuler" @click="renamingId = ''"><i class="bi bi-x-lg" /></button>
                                </template>
                                <template v-else>
                                    <span class="font-bold text-sm text-(--text) truncate">{{ d.name }}</span>
                                    <button class="rename-btn" title="Renommer" aria-label="Renommer" @click="startRename(d)"><i class="bi bi-pencil" /></button>
                                </template>
                                <span v-if="d.isThisDevice" class="pill pill-ok">Cet appareil</span>
                                <span v-if="!d.certified" class="pill pill-bad"
                                    title="Non signé par votre identité : cet appareil ne reçoit aucune clé et sera retiré au prochain renouvellement.">
                                    Non certifié
                                </span>
                            </div>
                            <p class="text-xs text-(--text2) mt-1">
                                {{ PLATFORM_LABELS[d.platform] }} · ajouté le {{ formatDate(d.createdAt) }} · {{ d.lastUsedAt ? `actif ${formatRelative(d.lastUsedAt)}` : 'jamais utilisé' }}
                            </p>
                        </div>
                        <button class="quiet-btn" :disabled="!E2EEUnloked || devices.length < 2"
                            :title="devices.length < 2 ? 'Impossible de déconnecter votre seul appareil' : ''" @click="askRemove(d)">
                            Déconnecter
                        </button>
                    </div>

                    <!-- Verrou : il appartient à cet appareil, pas à une section à part -->
                    <div v-if="d.isThisDevice && localKind" class="lock-panel">
                        <p class="text-sm text-(--text)">
                            Se déverrouille avec <strong>{{ VAULT_INFO[localKind].label }}</strong>
                        </p>
                        <p class="text-xs text-(--text2) mt-1 leading-relaxed">{{ VAULT_INFO[localKind].detail }}</p>
                        <details v-if="VAULT_INFO[localKind].limit" class="more">
                            <summary>Ce qu'il ne protège pas</summary>
                            <p>{{ VAULT_INFO[localKind].limit }}</p>
                        </details>
                        <div v-if="isWebVaultKind(localKind) && (localKind === 'web-pin' || switchOptions.length)" class="flex flex-wrap items-center gap-2 mt-3">
                            <button v-if="localKind === 'web-pin'" class="small-btn" :disabled="lockBusy" @click="openChangePin">Changer le code PIN</button>
                            <DropDown v-if="switchOptions.length">
                                <template #trigger>
                                    <button class="small-btn" :disabled="lockBusy">
                                        Changer de verrou <i class="bi bi-chevron-down text-[10px]" aria-hidden="true" />
                                    </button>
                                </template>
                                <template #content>
                                    <button v-for="k in switchOptions" :key="k" class="dropdown-item-style gap-3 text-left" @click="switchTarget = k">
                                        <i class="bi" :class="VAULT_INFO[k].icon" aria-hidden="true" />
                                        <span class="min-w-0">
                                            <span class="block font-semibold">{{ VAULT_INFO[k].label }}</span>
                                            <span class="block text-xs text-(--text2)">{{ VAULT_INFO[k].short }}</span>
                                        </span>
                                    </button>
                                </template>
                            </DropDown>
                        </div>
                    </div>
                </li>
                <li v-if="orderedDevices.length === 0" class="device-row text-sm text-(--text2)">Aucun appareil ne correspond.</li>
            </ul>

            <p v-if="!loading && devices.length === 1" class="text-xs text-(--text2) leading-relaxed">
                C'est votre seul appareil. Ajoutez-en un second : si celui-ci est perdu, vos messages restent accessibles.
            </p>
            <p class="text-xs text-(--text2) leading-relaxed">Chaque ajout ou retrait d'appareil vous est signalé par e-mail.</p>
        </section>

        <!-- ================= Onglet « Sécurité » : accès de secours et clés ================= -->
        <section v-else class="space-y-8">

            <div class="space-y-3">
                <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Si vous perdez vos appareils</h4>

                <div class="panel">
                    <!-- Clé de récupération -->
                    <div class="setting-row">
                        <i class="bi bi-key row-ico" aria-hidden="true" />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-(--text) flex items-center gap-2 flex-wrap">
                                Clé de récupération
                                <span class="pill" :class="hasRecovery ? 'pill-ok' : 'pill-warn'">{{ hasRecovery ? 'Active' : 'Absente' }}</span>
                            </p>
                            <p v-if="hasRecovery" class="text-xs text-(--text2) mt-1 leading-relaxed">Ouvre vos messages sur un nouvel appareil, si vous avez perdu les autres.</p>
                            <p v-else class="text-xs text-amber-500 mt-1 leading-relaxed">Sans elle, perdre tous vos appareils rend vos messages illisibles pour toujours.</p>
                        </div>
                        <button class="text-sm whitespace-nowrap" :class="hasRecovery ? 'second' : 'primary'" :disabled="!E2EEUnloked || recoveryBusy" @click="hasRecovery ? (confirmRegen = true) : regenerate()">
                            {{ hasRecovery ? 'Remplacer' : 'Créer une clé' }}
                        </button>
                    </div>

                    <!-- Récupération par code PIN -->
                    <div class="setting-row">
                        <i class="bi bi-123 row-ico" aria-hidden="true" />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-(--text) flex items-center gap-2 flex-wrap">
                                Code PIN de récupération
                                <span v-if="!pinRecoveryConfigured" class="pill pill-off">Non proposé</span>
                                <span v-else-if="!pinRec.reachable" class="pill pill-warn">Injoignable</span>
                                <span v-else-if="pinRec.enabled && pinRec.locked" class="pill pill-bad">Bloqué</span>
                                <span v-else-if="pinRec.enabled" class="pill pill-ok">Activé</span>
                                <span v-else class="pill pill-off">Désactivé</span>
                            </p>
                            <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                                <template v-if="!pinRecoveryConfigured">Non proposé sur ce serveur.</template>
                                <template v-else-if="!pinRec.reachable">Le service de récupération ne répond pas pour le moment.</template>
                                <template v-else-if="pinRec.enabled && pinRec.locked">Trop d'essais. Réactivez-le depuis cet appareil.</template>
                                <template v-else-if="pinRec.enabled">{{ pinRec.attemptsLeft }} essai(s) avant blocage.</template>
                                <template v-else>4 chiffres, si vous n'avez plus ni appareil ni clé. Moins sûr.</template>
                            </p>
                            <details v-if="pinRecoveryConfigured" class="more">
                                <summary>Pourquoi est-ce moins sûr ?</summary>
                                <p>{{ PIN_RECOVERY_WHY }}</p>
                            </details>
                        </div>
                        <div v-if="pinRecoveryConfigured && pinRec.reachable" class="flex gap-2">
                            <button class="text-sm whitespace-nowrap" :class="pinRec.enabled ? 'second' : 'primary'" :disabled="!E2EEUnloked || pinRec.busy" @click="openEnablePin">
                                {{ pinRec.enabled ? (pinRec.locked ? 'Réactiver' : 'Changer') : 'Activer' }}
                            </button>
                            <button v-if="pinRec.enabled" class="quiet-btn" :disabled="pinRec.busy" @click="confirmDisablePin = true">Désactiver</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="space-y-3">
                <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Avancé</h4>
                <div class="panel">
                    <div class="setting-row">
                        <i class="bi bi-arrow-repeat row-ico" aria-hidden="true" />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-(--text)">Renouveler mes clés de chiffrement</p>
                            <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                                Un appareil perdu était déverrouillé ? Il ne pourra plus lire ce qu'on vous enverra ensuite. Votre historique reste lisible.
                            </p>
                        </div>
                        <button class="second text-sm whitespace-nowrap" :disabled="!E2EEUnloked || rotating" @click="confirmRotate = true">Renouveler</button>
                    </div>
                </div>
            </div>
        </section>

        <!-- ================= Popups ================= -->

        <!-- Ajouter un appareil -->
        <Popup :isOpen="add.open" @close="closeAdd">
            <template #title>{{ add.step === 'done' ? 'Comparez les codes' : 'Ajouter un appareil' }}</template>

            <div v-if="add.step === 'scan'" class="space-y-4">
                <p class="text-sm text-(--text2)">Sur le nouvel appareil, connectez-vous à Synco : un QR code s'affiche. Scannez-le.</p>
                <QrScanner v-if="add.useCamera" @result="onScanned" @unavailable="add.useCamera = false" />
                <div>
                    <label for="add-code" class="field-label">{{ add.useCamera ? 'Ou saisissez le code affiché sous le QR code' : 'Code affiché sous le QR code' }}</label>
                    <input id="add-code" v-model="add.code" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" @keydown.stop @keyup.enter="submitCode"
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" class="field font-mono tracking-wider" />
                </div>
            </div>

            <div v-else-if="add.step === 'select'" class="space-y-3">
                <p class="text-sm text-(--text2)">Plusieurs demandes attendent. Laquelle est la vôtre ?</p>
                <div class="panel">
                    <button v-for="p in add.pending" :key="p.id" class="setting-row w-full text-left hover:bg-(--text)/5 transition-colors" @click="selectPending(p)">
                        <i class="bi row-ico" :class="PLATFORM_ICONS[p.platform]" aria-hidden="true" />
                        <span class="flex-1 min-w-0">
                            <span class="block text-sm font-bold text-(--text)">{{ p.name }}</span>
                            <span class="block text-xs text-(--text2)">{{ PLATFORM_LABELS[p.platform] }} · demande {{ formatRelative(p.createdAt) }}</span>
                        </span>
                        <i class="bi bi-chevron-right text-(--text2)" aria-hidden="true" />
                    </button>
                </div>
            </div>

            <div v-else-if="add.step === 'confirm' && add.target" class="space-y-4">
                <div class="panel">
                    <div class="setting-row">
                        <i class="bi row-ico" :class="PLATFORM_ICONS[add.target.platform]" aria-hidden="true" />
                        <div class="flex-1 min-w-0">
                            <p class="text-sm font-bold text-(--text)">{{ add.target.name }}</p>
                            <p class="text-xs text-(--text2)">{{ PLATFORM_LABELS[add.target.platform] }} · demande {{ formatRelative(add.target.createdAt) }}</p>
                        </div>
                    </div>
                </div>
                <p class="text-sm text-(--text)">Cet appareil pourra lire tous vos messages chiffrés.</p>
                <label class="flex items-start gap-2.5 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="add.ack" class="mt-1 accent-(--primary)" />
                    <span>C'est mon appareil, et je viens de lancer cette demande.</span>
                </label>
            </div>

            <div v-else-if="add.step === 'done'" class="space-y-5 text-center">
                <p class="text-sm text-(--text2)">Le nouvel appareil affiche un code. Il doit être identique :</p>
                <p class="sas" aria-label="Code de confirmation">
                    <span>{{ add.sas.replace(/\D/g, '').slice(0, 3) }}</span><span>{{ add.sas.replace(/\D/g, '').slice(3, 6) }}</span>
                </p>
                <p class="text-xs text-(--text2)">Identique : validez sur le nouvel appareil. Différent : refusez-y la connexion.</p>
            </div>

            <template #footer>
                <button class="default" @click="closeAdd">{{ add.step === 'done' ? 'Fermer' : 'Annuler' }}</button>
                <button v-if="add.step === 'scan'" class="primary" :disabled="add.busy || add.code.replace(/[\s-]/g, '').length < 28" @click="submitCode">Continuer</button>
                <button v-if="add.step === 'confirm'" class="primary" :class="{ loader: add.busy }" :disabled="!add.ack || add.busy" @click="authorize">Autoriser</button>
            </template>
        </Popup>

        <!-- Confirmation par le coffre (PIN local) -->
        <Popup :isOpen="stepUp.open" :zIndex="2200" @close="cancelStepUp">
            <template #title>Code PIN de cet appareil</template>
            <p class="text-sm text-(--text2) mb-6 text-center">{{ stepUp.reason }}</p>
            <PinPad v-if="stepUp.open" v-model="stepUp.pin" auto-submit :error-tick="stepUp.errorTick" @submit="submitStepUp" />
        </Popup>

        <!-- Nouvelle clé de récupération -->
        <Popup :isOpen="!!newRecovery" :zIndex="2100" @close="closeNewRecovery">
            <template #title>Nouvelle clé de récupération</template>
            <p class="text-sm text-(--text2) mb-4">L'ancienne ne fonctionne plus.</p>
            <RecoveryKeyPanel v-if="newRecovery" :key-text="newRecovery" :account-label="accountLabel" @saved="recoveryAck = true" />
            <template #footer>
                <button class="primary" :disabled="!recoveryAck" @click="closeNewRecovery">Terminer</button>
            </template>
        </Popup>

        <!-- Changer le PIN local / passer d'un autre verrou au PIN local -->
        <Popup :isOpen="pinChange.open" @close="pinChange.open = false">
            <template #title>{{ pinChange.mode === 'change' ? 'Changer le code PIN' : 'Utiliser un code PIN' }}</template>
            <div class="space-y-4">
                <div v-if="pinChange.mode === 'change'">
                    <label for="pin-current" class="field-label">Code actuel</label>
                    <input id="pin-current" v-model="pinChange.current" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop class="field pin-field" />
                </div>
                <div>
                    <label for="pin-next" class="field-label">Nouveau code (4 chiffres)</label>
                    <input id="pin-next" v-model="pinChange.next" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop class="field pin-field" />
                </div>
                <div>
                    <label for="pin-confirm" class="field-label">Confirmez le nouveau code</label>
                    <input id="pin-confirm" v-model="pinChange.confirm" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop @keyup.enter="submitPinChange" class="field pin-field" />
                </div>
                <p class="text-xs text-(--text2) leading-relaxed">Il ne quitte jamais cet appareil. Après 10 erreurs, ses clés sont effacées.</p>
                <p v-if="pinChange.mode === 'to-pin'" class="text-xs text-amber-500 leading-relaxed">{{ SWITCH_WARNING['web-pin'] }}</p>
            </div>
            <template #footer>
                <button class="default" @click="pinChange.open = false">Annuler</button>
                <button class="primary" :class="{ loader: lockBusy }" :disabled="!canSubmitPinChange || lockBusy" @click="submitPinChange">Enregistrer</button>
            </template>
        </Popup>

        <!-- Activer / changer le code de récupération -->
        <Popup :isOpen="enablePin.open" @close="closeEnablePin">
            <template #title>Code PIN de récupération</template>
            <div v-if="enablePin.step === 'warn'" class="space-y-4">
                <p class="text-sm text-(--text)">Un code à 4 chiffres protège moins bien que vos appareils ou votre clé de récupération.</p>
                <details class="more !ml-0">
                    <summary>Pourquoi ?</summary>
                    <p>{{ PIN_RECOVERY_WHY }}</p>
                </details>
                <label class="flex items-start gap-2.5 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="enablePin.ack" class="mt-1 accent-(--primary)" />
                    <span>Je veux quand même pouvoir retrouver mes messages avec un code.</span>
                </label>
            </div>
            <div v-else class="flex flex-col items-center">
                <p class="text-sm text-(--text2) mb-6 text-center max-w-sm">
                    {{ enablePin.step === 'choose' ? 'Choisissez 4 chiffres. Vous pouvez reprendre votre code habituel.' : 'Saisissez-le une seconde fois.' }}
                </p>
                <PinPad v-if="enablePin.open" v-model="enablePin.pin" :error-tick="enablePin.errorTick" :disabled="pinRec.busy" @submit="submitEnablePin" />
            </div>
            <template #footer>
                <button class="default" :disabled="pinRec.busy" @click="closeEnablePin">Annuler</button>
                <button v-if="enablePin.step === 'warn'" class="primary" :disabled="!enablePin.ack" @click="enablePin.step = 'choose'">Continuer</button>
            </template>
        </Popup>

        <!-- Code de récupération demandé lors d'un retrait d'appareil -->
        <Popup :isOpen="recPinAsk.open" :zIndex="2200" @close="answerRecPin(undefined)">
            <template #title>Garder le code PIN de récupération ?</template>
            <p class="text-sm text-(--text2) mb-6 text-center">Vos clés vont changer. Saisissez ce code pour qu'il reste valable.</p>
            <PinPad v-if="recPinAsk.open" v-model="recPinAsk.pin" auto-submit @submit="answerRecPin(recPinAsk.pin)" />
            <template #footer>
                <button class="default" @click="answerRecPin(undefined)">Annuler</button>
                <button class="second" @click="answerRecPin(null)">Ne pas le garder</button>
            </template>
        </Popup>

        <ConfirmDelete
            :show="!!switchTarget"
            :title="switchTarget ? SWITCH_TITLE[switchTarget] : ''"
            item-name="le verrou de cet appareil"
            item-type="le verrou de cet appareil"
            :message="switchMessage"
            :extra-warning="switchTarget ? SWITCH_WARNING[switchTarget] : ''"
            button-text="Changer de verrou"
            @confirm="confirmSwitch"
            @cancel="switchTarget = null"
        />

        <!-- Fenêtre de Synco Extension ouverte : la même barre d'attente que l'écran de verrouillage, au-dessus de tout -->
        <ExtensionScene :view="scene" @cancel="cancelExtensionWait" />

        <ConfirmDelete
            :show="confirmDisablePin"
            title="Désactiver le code PIN de récupération ?"
            item-name="la récupération par code PIN"
            item-type="la récupération par code PIN"
            message="Il ne permettra plus de retrouver vos messages. Vos appareils et votre clé de récupération restent valables."
            button-text="Désactiver"
            :loading="pinRec.busy"
            @confirm="disablePin"
            @cancel="confirmDisablePin = false"
        />

        <ConfirmDelete
            :show="!!removeTarget"
            title="Déconnecter cet appareil ?"
            :item-name="removeTarget?.name || ''"
            item-type="cet appareil"
            :message="removeMessage"
            :extra-warning="removeWarning"
            button-text="Déconnecter"
            :checkbox="!!removeTarget?.isThisDevice"
            checkbox-label="Je comprends que je devrai reconnecter cet appareil pour lire mes messages."
            extra-option-label="Renouveler aussi mes clés (si l'appareil était déverrouillé quand vous l'avez perdu)"
            v-model:extra-option-value="rotateWithRemoval"
            @confirm="confirmRemove"
            @cancel="removeTarget = null"
        />

        <ConfirmDelete
            :show="confirmRotate"
            title="Renouveler vos clés de chiffrement ?"
            item-name="vos clés de chiffrement"
            item-type="vos clés de chiffrement"
            message="Vos appareils et vos contacts recevront les nouvelles clés automatiquement. Votre historique reste lisible."
            :extra-warning="hasRecovery ? 'Vous recevrez aussi une nouvelle clé de récupération.' : ''"
            button-text="Renouveler"
            :loading="rotating"
            @confirm="confirmRotate = false; runRotation([], true)"
            @cancel="confirmRotate = false"
        />

        <ConfirmDelete
            :show="confirmRegen"
            title="Remplacer la clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="L'ancienne clé cessera aussitôt de fonctionner. La nouvelle s'affichera : gardez-la."
            button-text="Remplacer"
            :loading="recoveryBusy"
            @confirm="confirmRegen = false; regenerate()"
            @cancel="confirmRegen = false"
        />

    </div>

</template>

<script setup lang="ts">

import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import DropDown from '../DropDown.vue';
import Popup from '../Popup.vue';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import SpinLoader from '../SpinLoader.vue';
import PinPad from '../e2ee/PinPad.vue';
import QrScanner from '../e2ee/QrScanner.vue';
import RecoveryKeyPanel from '../e2ee/RecoveryKeyPanel.vue';
import ExtensionScene from '../e2ee/ExtensionScene.vue';
import { createExtensionScene, type SceneMode, type SceneView } from '@/assets/e2eeV4/extensionScene';
import { user } from '@/assets/var';
import { refetchUser } from '@/assets/init';
import { E2EEUnloked, lockSecurity } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import { getLocalDevice, idbStore, switchVault, VaultError, type VaultContext, type VaultKind } from '@/assets/deviceVault';
import { PinVault } from '@/assets/deviceVault/pinVault';
import { isWebVaultKind, switchTargets } from '@/assets/deviceVault/selection';
import { E2eeV4Error, parseLinkSecret } from '@/assets/utils/e2eeV4';
import {
    IdentityMismatchError, V4ApiError, answerLink, checkDevices, parseLinkQr, regenerateRecoveryKey, removeDevices, rotateIdentity,
    type CheckedDevice, type DeviceContext, type PendingLink,
} from '@/assets/e2eeV4/session';
import { PinRecoveryFailure, disablePinRecovery, enablePinRecovery, keepPinRecovery, pinRecoveryStatus } from '@/assets/e2eeV4/pinRecovery';
import { pinRecoveryActors, pinRecoveryConfigured } from '@/assets/e2eeV4/pinRecoveryApi';
import { applyIdentityKeys, PLATFORM_ICONS, PLATFORM_LABELS, deviceContext, enrollmentVaults, sealedFrom, vaultFor } from '@/assets/e2eeV4/runtime';

/**
 * Paramètres › Appareils (view="devices") et › Sécurité (view="security") (E2EE v4, doc/securite/13-e2ee-v4-multi-appareil.md §11).
 * Toute action qui touche à la clé de compte redemande le coffre de cet appareil (biométrie,
 * passkey ou PIN local) : la clé n'est jamais gardée en mémoire pendant la session.
 */

defineProps<{ view: 'devices' | 'security' }>();

const toast = useToast();

/**
 * Verrous de cet appareil, en langage simple : `detail` est toujours visible (une ligne), `limit` (ce que le verrou
 * ne protège pas) est replié sous « Ce qu'il ne protège pas ».
 */
const VAULT_INFO: Record<VaultKind, { icon: string; label: string; short: string; detail: string; limit?: string }> = {
    'webauthn-prf': {
        icon: 'bi-fingerprint', label: 'Passkey', short: 'La plus sûre, même en cas de vol',
        detail: "Empreinte, visage ou code de l'appareil. Les essais sont limités par le matériel.",
    },
    'extension': {
        icon: 'bi-puzzle', label: 'Synco Extension', short: 'Sans code, clés hors de la page',
        detail: "Un clic sur « Autoriser » dans sa fenêtre, à chaque ouverture.",
        limit: "Elle empêche un script de la page de copier vos clés. Elle ne protège ni contre le vol de l'ordinateur, ni contre quelqu'un qui utilise votre session ouverte : une passkey, si.",
    },
    'web-pin': {
        icon: 'bi-123', label: 'Code PIN local', short: 'Le moins protecteur',
        detail: "4 chiffres gardés dans ce navigateur, jamais envoyés au serveur.",
        limit: "Un script malveillant ou une copie du profil du navigateur permettrait de deviner le code hors ligne. Il ne protège pas contre le vol de l'ordinateur : une passkey, si.",
    },
    'native-biometric': { icon: 'bi-fingerprint', label: 'Biométrie du téléphone', short: '', detail: "Face ID, Touch ID ou empreinte, avec le code du téléphone en repli." },
    'os-keyring': { icon: 'bi-safe', label: 'Trousseau du système', short: '', detail: "Protégé par votre session sur cet ordinateur (trousseau macOS, Windows ou Linux)." },
};

const PIN_RECOVERY_WHY = "Votre code n'est jamais envoyé. Mais quelqu'un qui volerait les secrets de nos deux serveurs pourrait deviner 4 chiffres en quelques secondes. 10 essais au plus, chacun signalé par e-mail.";

const SWITCH_TITLE: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': 'Passer à une passkey ?',
    'extension': 'Passer à Synco Extension ?',
    'web-pin': 'Passer à un code PIN local ?',
};

/** Ce que l'utilisateur fera, avec le verrou actuel (ouvrir) et le nouveau (créer). */
const OPEN_WITH: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': 'votre passkey',
    'extension': "un clic sur « Autoriser », dans la fenêtre de Synco Extension",
    'web-pin': 'votre code PIN local',
};
const CREATE_WITH: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': 'vous créerez la passkey',
    'extension': "vous cliquerez sur « Autoriser » dans la fenêtre de l'extension",
    'web-pin': 'vous choisirez un nouveau code PIN local',
};

const SWITCH_WARNING: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': "Certaines passkeys ne conviennent pas au chiffrement : dans ce cas, rien ne change.",
    'extension': "Désinstaller l'extension efface les clés : il faudrait alors reconnecter cet appareil.",
    'web-pin': "Un code PIN local protège moins bien qu'une passkey ou que Synco Extension.",
};

const SWITCH_DONE: Partial<Record<VaultKind, string>> = {
    'webauthn-prf': 'Passkey activée : cet appareil se déverrouille avec elle.',
    'extension': 'Cet appareil se déverrouille désormais avec Synco Extension.',
    'web-pin': 'Cet appareil se déverrouille désormais avec un code PIN local.',
};

let dev: DeviceContext | null = null;

const loading = ref(true);
const devices = ref<CheckedDevice[]>([]);
const search = ref('');
const hasRecovery = ref(false);
const localKind = ref<VaultKind | null>(null);
const prfPossible = ref(false);
/** Synco Extension a répondu au handshake (« détectée », jamais « vérifiée »). */
const extensionAvailable = ref(false);

const accountLabel = computed(() => user.value?.email || user.value?.name || '');
const filteredDevices = computed(() => {
    const q = search.value.trim().toLowerCase();
    return q ? devices.value.filter(d => d.name.toLowerCase().includes(q) || PLATFORM_LABELS[d.platform].toLowerCase().includes(q)) : devices.value;
});

/** Cet appareil d'abord (il porte le verrou local), puis les autres. */
const orderedDevices = computed(() => [...filteredDevices.value].sort((x, y) => Number(y.isThisDevice) - Number(x.isThisDevice)));

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
function formatRelative(iso: string) {
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
    if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
    if (s < 86400 * 30) return `il y a ${Math.floor(s / 86400)} j`;
    return `le ${formatDate(iso)}`;
}

async function reload() {
    if (!dev) return;
    try {
        const [list, recovery, record] = await Promise.all([checkDevices(dev), dev.api.getRecovery(), getLocalDevice(idbStore, dev.userId)]);
        devices.value = list;
        hasRecovery.value = recovery !== null;
        localKind.value = record?.vaultKind ?? null;
    } catch (e) {
        console.error('[E2EE v4] appareils :', e);
        toast.show('Impossible de charger vos appareils.', 'error');
    } finally {
        loading.value = false;
    }
}

onMounted(async () => {
    dev = await deviceContext();
    const available = await enrollmentVaults();
    prfPossible.value = available.some(v => v.capabilities.kind === 'webauthn-prf');
    extensionAvailable.value = available.some(v => v.capabilities.kind === 'extension');
    await reload();
    await refreshPinRec();
});

onUnmounted(() => { cancelExtensionWait(); sceneCtl.dispose(); });

// --- fenêtre de Synco Extension -------------------------------------------------------

/** Barre d'attente partagée avec l'écran de verrouillage (ExtensionScene) tant que la fenêtre de l'extension est ouverte. */
const scene = ref<SceneView | null>(null);
const sceneCtl = createExtensionScene({ onChange: v => { scene.value = v; } });
let extensionAbort: AbortController | null = null;

/**
 * Contexte d'une opération du coffre : raison affichée, annulation côté page, barre d'attente tant que la fenêtre
 * de l'extension est ouverte. `op` partage l'annulation entre les deux étapes d'un changement de verrou. Aucune clé
 * ni aucun PIN ne passe par cet état.
 */
function promptCtx(reason: string, op = new AbortController(), mode: SceneMode = 'confirm'): VaultContext {
    return {
        reason, signal: op.signal,
        onPrompt: () => {
            extensionAbort = op;
            const end = sceneCtl.begin(mode);
            return (outcome) => {
                if (extensionAbort === op) extensionAbort = null;
                end(outcome);
            };
        },
    };
}

/** La page cesse d'attendre et demande à l'extension de fermer sa fenêtre. Pas de message : l'utilisateur sait ce qu'il a fait. */
function cancelExtensionWait() {
    sceneCtl.markUserCancel();
    extensionAbort?.abort();
}

// --- confirmation par le coffre ------------------------------------------------

const stepUp = reactive({ open: false, pin: '', reason: '', errorTick: 0 });
let stepUpResolver: { resolve: (ctx: VaultContext) => void; reject: (e: unknown) => void } | null = null;

/** Contexte du coffre pour une opération sensible : demande le PIN local si ce coffre l'exige. */
async function vaultCtx(reason: string, op?: AbortController): Promise<VaultContext> {
    const record = dev ? await getLocalDevice(idbStore, dev.userId) : undefined;
    const vault = record ? dev!.vaultFor(record.vaultKind) : undefined;
    if (!vault?.capabilities.needsPin) return promptCtx(reason, op);
    stepUp.pin = '';
    stepUp.reason = reason;
    stepUp.open = true;
    return new Promise((resolve, reject) => { stepUpResolver = { resolve, reject }; });
}

function submitStepUp() {
    const r = stepUpResolver;
    stepUpResolver = null;
    const pin = stepUp.pin;
    stepUp.open = false;
    stepUp.pin = '';
    r?.resolve({ pin });
}

function cancelStepUp() {
    const r = stepUpResolver;
    stepUpResolver = null;
    stepUp.open = false;
    stepUp.pin = '';
    r?.reject(new VaultError('cancelled'));
}

/** Erreurs communes aux opérations protégées. */
function reportError(e: unknown, fallback: string) {
    if (e instanceof VaultError) {
        if (e.code === 'cancelled') return;
        if (e.code === 'wrong-pin') return toast.show(e.retryAfterSeconds ? `Code PIN incorrect. Réessayez dans ${e.retryAfterSeconds} s.` : 'Code PIN incorrect.', 'error');
        if (e.code === 'locked') return toast.show(`Trop d'essais. Réessayez dans ${e.retryAfterSeconds ?? 30} s.`, 'error');
        if (e.code === 'wiped') { toast.show("Trop d'essais : les clés de cet appareil ont été effacées. Reconnectez-le.", 'error', 10000); lockSecurity(); return; }
        return toast.show(e.message && e.message !== e.code ? e.message : fallback, 'error');
    }
    if (e instanceof IdentityMismatchError) {
        lockSecurity();
        return toast.show(`Alerte de sécurité : ${e.message} Le chiffrement a été verrouillé.`, 'error', 20000);
    }
    if (e instanceof V4ApiError) return toast.show(e.message, 'error', 8000);
    console.error('[E2EE v4]', e);
    toast.show(fallback, 'error');
}

// --- renommer -------------------------------------------------------------------

const renamingId = ref('');
const renameValue = ref('');
function startRename(d: CheckedDevice) {
    renamingId.value = d.id;
    renameValue.value = d.name;
}
async function saveRename(d: CheckedDevice) {
    const name = renameValue.value.trim();
    if (!dev || !name || name === d.name) { renamingId.value = ''; return; }
    try {
        await dev.api.renameDevice(d.id, name);
        d.name = name;
        renamingId.value = '';
    } catch (e) {
        reportError(e, "Impossible de renommer l'appareil.");
    }
}

// --- déconnecter (rotation de la clé de compte) -----------------------------------

const removeTarget = ref<CheckedDevice | null>(null);
const newRecovery = ref('');
const recoveryAck = ref(false);

const removeMessage = computed(() => {
    const d = removeTarget.value;
    if (!d) return '';
    return d.isThisDevice
        ? 'Cet appareil sera retiré de votre compte et ses clés effacées.'
        : `« ${d.name} » ne pourra plus lire vos nouveaux messages.`;
});
/** Seulement ce qui va se passer en plus, une phrase par fait. */
const removeWarning = computed(() => {
    const parts: string[] = [];
    if (hasRecovery.value) parts.push('Vous recevrez une nouvelle clé de récupération.');
    if (pinRec.enabled) parts.push('Votre code PIN de récupération vous sera demandé.');
    const uncertified = devices.value.filter(x => !x.certified && x.id !== removeTarget.value?.id).length;
    if (uncertified) parts.push(`${uncertified} appareil(s) non certifié(s) seront aussi retirés.`);
    if (!removeTarget.value?.isThisDevice) parts.push('Appareil perdu ou volé ? Cochez le renouvellement des clés et changez votre mot de passe.');
    return parts.join(' ');
});

function askRemove(d: CheckedDevice) {
    removeTarget.value = d;
}

async function confirmRemove() {
    const d = removeTarget.value;
    if (!d) return;
    // La confirmation (z-index 3000) doit être fermée avant de demander le coffre : la fenêtre du PIN
    // local (2200) et celle du code de récupération s'ouvriraient sinon derrière elle, sans issue.
    const renewIdentity = rotateWithRemoval.value;
    removeTarget.value = null;
    rotateWithRemoval.value = false;
    await runRotation([d.id], renewIdentity, d.name);
}

const rotateWithRemoval = ref(false);
const confirmRotate = ref(false);
const rotating = ref(false);

/**
 * Nouvelle clé de compte (retrait d'appareils) et, si `newIdentity`, nouvelles clés d'identité.
 * Redemande le coffre, puis le code de récupération par PIN s'il faut la conserver.
 */
async function runRotation(removeIds: string[], newIdentity: boolean, deviceName?: string) {
    if (!dev) return;
    rotating.value = true;
    try {
        const ctx = await vaultCtx(deviceName ? `Confirmez la déconnexion de « ${deviceName} ».` : 'Confirmez le renouvellement de vos clés.');
        // Récupération par PIN active : on la conserve (code demandé) ou on la désactive, au choix.
        let keep: ReturnType<typeof keepPinRecovery> | undefined;
        if (pinRec.enabled && !pinRec.locked) {
            const recPin = await askRecoveryPin();
            if (recPin === undefined) return;
            if (recPin) keep = keepPinRecovery(pinRecoveryActors, dev.userId, recPin);
        }
        const fetchSealed = async () => { await refetchUser(); return sealedFrom(user.value); };
        const result = newIdentity
            ? await rotateIdentity(dev, removeIds, fetchSealed, ctx, keep)
            : await removeDevices(dev, removeIds, fetchSealed, ctx, keep);
        if (result.pinRecoveryDisabled) {
            await pinRecoveryActors.guard.disable().catch(() => {});
            toast.show('La récupération par code PIN a été désactivée.', 'info');
        }
        const extra = result.removed.length - removeIds.length;
        if (removeIds.length) toast.show(extra > 0 ? `Appareil déconnecté (et ${extra} appareil(s) non certifié(s) retiré(s)).` : 'Appareil déconnecté.', 'success');
        if (newIdentity) {
            await refetchUser();
            if (result.keys && !result.removedThisDevice) applyIdentityKeys(result.keys);
            toast.show('Clés de chiffrement renouvelées.', 'success');
        }
        if (result.recoveryKeyText) {
            recoveryAck.value = false;
            newRecovery.value = result.recoveryKeyText;
        }
        if (result.removedThisDevice) {
            // Plus d'enveloppe pour cet appareil : on verrouille, l'écran de connexion prend le relais.
            if (!result.recoveryKeyText) lockSecurity();
            pendingLockAfterRecovery = !!result.recoveryKeyText;
            return;
        }
        await reload();
    } catch (e) {
        if (e instanceof E2eeV4Error && /remain/.test(e.message)) toast.show('Impossible de déconnecter votre seul appareil.', 'error');
        else if (e instanceof PinRecoveryFailure) toast.show(e.reason === 'wrong-pin' ? `Code PIN de récupération incorrect (${e.attemptsLeft} essai(s) restant(s)). Rien n'a été modifié.` : `${e.message} Rien n'a été modifié.`, 'error', 8000);
        else reportError(e, newIdentity ? 'Le renouvellement des clés a échoué.' : "La déconnexion de l'appareil a échoué.");
    } finally {
        rotating.value = false;
        refreshPinRec();
    }
}

// --- récupération par code PIN ------------------------------------------------------

const pinRec = reactive({ enabled: false, locked: false, attemptsLeft: 0, reachable: true, busy: false });
const confirmDisablePin = ref(false);

async function refreshPinRec() {
    if (!pinRecoveryConfigured) return;
    try {
        const st = await pinRecoveryStatus(pinRecoveryActors);
        Object.assign(pinRec, { enabled: st.enabled, locked: st.locked, attemptsLeft: st.attemptsLeft, reachable: st.guardReachable });
    } catch {
        pinRec.reachable = false;
    }
}

const enablePin = reactive({ open: false, step: 'warn' as 'warn' | 'choose' | 'confirm', ack: false, pin: '', first: '', errorTick: 0 });

function openEnablePin() {
    Object.assign(enablePin, { open: true, step: pinRec.enabled ? 'choose' : 'warn', ack: false, pin: '', first: '' });
}

function closeEnablePin() {
    if (pinRec.busy) return;
    Object.assign(enablePin, { open: false, pin: '', first: '' });
}

async function submitEnablePin() {
    if (!dev || enablePin.pin.length !== 4) return;
    if (enablePin.step === 'choose') {
        enablePin.first = enablePin.pin;
        enablePin.pin = '';
        enablePin.step = 'confirm';
        return;
    }
    if (enablePin.pin !== enablePin.first) {
        enablePin.errorTick++;
        toast.show('Les deux codes ne correspondent pas.', 'error');
        Object.assign(enablePin, { step: 'choose', pin: '', first: '' });
        return;
    }
    const code = enablePin.pin;
    Object.assign(enablePin, { pin: '', first: '' });
    pinRec.busy = true;
    try {
        const ctx = await vaultCtx('Confirmez l\'activation de la récupération par code PIN.');
        await enablePinRecovery(dev, pinRecoveryActors, code, ctx);
        enablePin.open = false;
        toast.show('Récupération par code PIN activée.', 'success');
    } catch (e) {
        reportError(e, "Impossible d'activer la récupération par code PIN.");
        enablePin.step = 'choose';
    } finally {
        pinRec.busy = false;
        await refreshPinRec();
    }
}

async function disablePin() {
    if (!dev) return;
    pinRec.busy = true;
    try {
        const ctx = await vaultCtx('Confirmez la désactivation de la récupération par code PIN.');
        await disablePinRecovery(dev, pinRecoveryActors, ctx);
        toast.show('Récupération par code PIN désactivée.', 'success');
    } catch (e) {
        reportError(e, 'Impossible de désactiver la récupération par code PIN.');
    } finally {
        confirmDisablePin.value = false;
        pinRec.busy = false;
        await refreshPinRec();
    }
}

/** Code de récupération pour une rotation : la chaîne, `null` = désactiver, `undefined` = annuler. */
const recPinAsk = reactive({ open: false, pin: '' });
let recPinResolver: ((v: string | null | undefined) => void) | null = null;

function askRecoveryPin(): Promise<string | null | undefined> {
    recPinAsk.pin = '';
    recPinAsk.open = true;
    return new Promise((resolve) => { recPinResolver = resolve; });
}

function answerRecPin(v: string | null | undefined) {
    const r = recPinResolver;
    recPinResolver = null;
    recPinAsk.open = false;
    recPinAsk.pin = '';
    r?.(v);
}

let pendingLockAfterRecovery = false;
function closeNewRecovery() {
    if (!recoveryAck.value) return;
    newRecovery.value = '';
    if (pendingLockAfterRecovery) { pendingLockAfterRecovery = false; lockSecurity(); }
}

// --- clé de récupération ------------------------------------------------------------

const recoveryBusy = ref(false);
const confirmRegen = ref(false);

async function regenerate() {
    if (!dev) return;
    recoveryBusy.value = true;
    try {
        const ctx = await vaultCtx('Confirmez la création d\'une clé de récupération.');
        const text = await regenerateRecoveryKey(dev, ctx);
        hasRecovery.value = true;
        recoveryAck.value = false;
        newRecovery.value = text;
    } catch (e) {
        reportError(e, 'Impossible de générer la clé de récupération.');
    } finally {
        recoveryBusy.value = false;
    }
}

// --- ajouter un appareil (côté appareil connecté) ----------------------------------

const add = reactive({
    open: false,
    step: 'scan' as 'scan' | 'select' | 'confirm' | 'done',
    useCamera: true,
    code: '',
    busy: false,
    pending: [] as PendingLink[],
    target: null as PendingLink | null,
    ack: false,
    sas: '',
});
// Secret de liaison : hors de l'état réactif, effacé dès qu'il a servi.
let linkSecret: Uint8Array | null = null;

function resetAdd() {
    linkSecret?.fill(0);
    linkSecret = null;
    Object.assign(add, { step: 'scan', useCamera: true, code: '', busy: false, pending: [], target: null, ack: false, sas: '' });
}

function openAdd() {
    resetAdd();
    add.open = true;
}

function closeAdd() {
    const wasDone = add.step === 'done';
    add.open = false;
    resetAdd();
    if (wasDone) setTimeout(reload, 1500);
}

async function pendingRequests(): Promise<PendingLink[]> {
    return dev ? dev.api.pendingLinks() : [];
}

async function onScanned(text: string) {
    const parsed = await parseLinkQr(text);
    if (!parsed) {
        toast.show("Ce QR code n'est pas un code de connexion Synco.", 'error');
        add.useCamera = false;
        return;
    }
    add.busy = true;
    try {
        const target = (await pendingRequests()).find(p => p.id === parsed.requestId);
        if (!target) {
            parsed.linkSecret.fill(0);
            toast.show('Demande introuvable ou expirée. Recommencez sur le nouvel appareil.', 'error');
            add.useCamera = false;
            return;
        }
        linkSecret = parsed.linkSecret;
        add.target = target;
        add.step = 'confirm';
    } finally {
        add.busy = false;
    }
}

async function submitCode() {
    add.busy = true;
    try {
        let secret: Uint8Array;
        try {
            secret = await parseLinkSecret(add.code);
        } catch {
            toast.show('Ce code contient une faute de frappe. Vérifiez-le.', 'error');
            return;
        }
        const pending = await pendingRequests();
        if (pending.length === 0) {
            secret.fill(0);
            toast.show('Aucune demande en attente. Recommencez sur le nouvel appareil.', 'error');
            return;
        }
        linkSecret = secret;
        add.code = '';
        if (pending.length === 1) {
            add.target = pending[0]!;
            add.step = 'confirm';
        } else {
            add.pending = pending;
            add.step = 'select';
        }
    } finally {
        add.busy = false;
    }
}

function selectPending(p: PendingLink) {
    add.target = p;
    add.step = 'confirm';
}

async function authorize() {
    if (!dev || !add.target || !linkSecret || !add.ack) return;
    add.busy = true;
    try {
        const ctx = await vaultCtx(`Confirmez l'ajout de « ${add.target.name} ».`);
        const secret = linkSecret;
        linkSecret = null;
        const { sas } = await answerLink(dev, add.target, secret, ctx);
        add.sas = sas;
        add.step = 'done';
    } catch (e) {
        if (e instanceof V4ApiError && e.status === 404) toast.show('La demande a expiré ou a déjà été traitée. Recommencez sur le nouvel appareil.', 'error');
        else reportError(e, "L'ajout de l'appareil a échoué.");
        if (!linkSecret) closeAdd();
    } finally {
        add.busy = false;
    }
}

// --- verrou de cet appareil ------------------------------------------------------------

const lockBusy = ref(false);
const pinChange = reactive({ open: false, mode: 'change' as 'change' | 'to-pin', current: '', next: '', confirm: '' });
const isPin = (s: string) => /^\d{4}$/.test(s);
const canSubmitPinChange = computed(() =>
    isPin(pinChange.next) && pinChange.next === pinChange.confirm && (pinChange.mode !== 'change' || isPin(pinChange.current)));

/** Verrous vers lesquels cet appareil peut passer (au plus deux sur le web). */
const switchOptions = computed(() => switchTargets(localKind.value, { prf: prfPossible.value, extension: extensionAvailable.value }));
const switchTarget = ref<VaultKind | null>(null);
const switchMessage = computed(() => {
    const from = localKind.value ? OPEN_WITH[localKind.value] : undefined;
    const to = switchTarget.value ? CREATE_WITH[switchTarget.value] : undefined;
    if (!from || !to) return '';
    return `Vous confirmerez avec ${from}, puis ${to}. Rien n'est envoyé au serveur.`;
});

function openChangePin() {
    Object.assign(pinChange, { open: true, mode: 'change', current: '', next: '', confirm: '' });
}

/** Après la confirmation : le PIN local se choisit d'abord dans la page, les autres verrous ouvrent leur invite. */
function confirmSwitch() {
    const target = switchTarget.value;
    switchTarget.value = null;
    if (!target) return;
    if (target === 'web-pin') Object.assign(pinChange, { open: true, mode: 'to-pin', current: '', next: '', confirm: '' });
    else void runSwitch(target);
}

/**
 * Change le verrou de cet appareil (switchVault) : ouverture avec le verrou actuel, création du
 * nouveau, rescellement local ; l'ancien n'est vidé qu'une fois le nouvel enregistrement écrit.
 */
async function runSwitch(target: VaultKind, newPin?: string): Promise<boolean> {
    if (!dev) return false;
    lockBusy.value = true;
    try {
        const record = await getLocalDevice(idbStore, dev.userId);
        if (!record) throw new VaultError('missing');
        const from = dev.vaultFor(record.vaultKind) ?? await vaultFor(record.vaultKind);
        const to = dev.vaultFor(target) ?? await vaultFor(target);
        if (!from || !to) throw new VaultError('unavailable', target === 'webauthn-prf' ? 'Ce navigateur ne propose pas de passkey compatible.' : undefined);
        const op = new AbortController();
        const fromCtx = await vaultCtx('Confirmez avec le verrou actuel pour changer le verrou de cet appareil.', op);
        const toCtx: VaultContext = target === 'web-pin' ? { pin: newPin } : promptCtx('Nouveau verrou de cet appareil', op, 'enroll');
        await switchVault({ userId: dev.userId, store: idbStore, from, to, fromCtx, toCtx });
        const done = SWITCH_DONE[target];
        if (done) toast.show(done, 'success');
        await reload();
        return true;
    } catch (e) {
        if (target === 'webauthn-prf' && e instanceof VaultError && e.code === 'unavailable') {
            const detail = e.message && e.message !== 'unavailable' ? e.message : "Cette passkey ne fournit pas l'extension PRF nécessaire au chiffrement.";
            toast.show(`${detail} Si une passkey inutilisable a été créée, vous pouvez la supprimer de votre gestionnaire. Le verrou actuel reste actif.`, 'error', 12000);
        } else {
            reportError(e, 'Impossible de changer le verrou de cet appareil. Le verrou actuel reste actif.');
        }
        return false;
    } finally {
        lockBusy.value = false;
    }
}

async function submitPinChange() {
    if (!dev || !canSubmitPinChange.value) return;
    if (pinChange.mode === 'to-pin') {
        const ok = await runSwitch('web-pin', pinChange.next);
        if (ok) pinChange.open = false;
        pinChange.next = '';
        pinChange.confirm = '';
        return;
    }
    lockBusy.value = true;
    try {
        const record = await getLocalDevice(idbStore, dev.userId);
        if (!record) throw new VaultError('missing');
        const vault = dev.vaultFor('web-pin');
        if (!(vault instanceof PinVault)) throw new VaultError('unavailable');
        await vault.changePin(record.deviceId, pinChange.current, pinChange.next);
        toast.show('Code PIN local modifié.', 'success');
        pinChange.open = false;
        await reload();
    } catch (e) {
        reportError(e, 'Impossible de modifier le verrou de cet appareil.');
    } finally {
        lockBusy.value = false;
        pinChange.current = '';
        pinChange.next = '';
        pinChange.confirm = '';
    }
}

</script>

<style scoped>
/* Une carte par groupe, une ligne par objet séparée d'un trait ; icônes grises sans pastille ; le vert de Synco sur
   l'état (« Cet appareil », « Active ») et sur l'action principale de chaque vue. */
.panel { border-radius: 0.75rem; border: 1px solid var(--border-color); background: var(--bg2); overflow: hidden; }
.panel > * + * { border-top: 1px solid var(--border-color); }

.device-row { padding: 1rem 1.125rem; }
.setting-row { display: flex; align-items: flex-start; gap: 0.875rem; padding: 1rem 1.125rem; }
/* Téléphone : le texte prend la ligne, l'action passe dessous, alignée sur le texte (icône 1.25rem + écart). */
@media (max-width: 639px) {
    .setting-row { flex-wrap: wrap; }
    .setting-row > .flex-1 { flex-basis: calc(100% - 2.125rem); }
    .setting-row > :last-child:not(.flex-1) { margin-left: 2.125rem; }
}

.row-ico { flex: none; width: 1.25rem; margin-top: 0.05rem; font-size: 1.05rem; text-align: center; color: var(--text2); }
.row-ico.is-current { color: var(--primary); }

.pill { padding: 0.125rem 0.5rem; border-radius: 999px; font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.pill-ok { color: var(--primary); background: color-mix(in srgb, var(--primary) 16%, transparent); }
.pill-warn { color: #f59e0b; background: rgb(245 158 11 / 0.15); }
.pill-bad { color: #ef4444; background: rgb(239 68 68 / 0.15); }
.pill-off { color: var(--text2); background: color-mix(in srgb, var(--text) 9%, transparent); }

.rename-btn { font-size: 0.75rem; color: var(--text2); opacity: 0; transition: opacity 0.15s ease, color 0.15s ease; }
.device-row:hover .rename-btn, .rename-btn:focus-visible { opacity: 1; }
.rename-btn:hover { color: var(--text); }
@media (hover: none) { .rename-btn { opacity: 1; } }

/* Action secondaire discrète (Déconnecter, Désactiver) : rouge seulement au survol. */
.quiet-btn { flex: none; align-self: center; padding: 0.4rem 0.7rem; border-radius: 0.6rem; font-size: 0.75rem; font-weight: 600; white-space: nowrap; color: var(--text2); transition: color 0.15s ease, background-color 0.15s ease; }
.quiet-btn:hover:not(:disabled) { color: #ef4444; background: rgb(239 68 68 / 0.1); }
.quiet-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* Bouton compact dans une ligne (verrou de cet appareil) : contour fin, pas le grand bouton de Synco. */
.small-btn {
    display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.4rem 0.75rem; border-radius: 0.6rem;
    border: 1px solid var(--border-color); font-size: 0.8125rem; font-weight: 500; color: var(--text); transition: border-color 0.15s ease;
}
.small-btn:hover:not(:disabled) { border-color: color-mix(in srgb, var(--text) 35%, transparent); }
.small-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.lock-panel { margin: 0.875rem 0 0 2.125rem; padding-top: 0.875rem; border-top: 1px solid var(--border-color); }

/* « En savoir plus » : le détail technique reste lisible pour qui le cherche, replié pour les autres. */
.more { margin-top: 0.5rem; font-size: 0.75rem; color: var(--text2); }
.more summary { cursor: pointer; width: fit-content; transition: color 0.15s ease; }
.more summary:hover, .more[open] summary { color: var(--text); }
.more p { margin-top: 0.375rem; line-height: 1.5; max-width: 40rem; }

.field-label { display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: var(--text); }
.field {
    width: 100%; background: var(--bg); border: 1px solid var(--border-color); border-radius: 0.75rem;
    padding: 0.55rem 0.875rem; font-size: 0.875rem; color: var(--text); transition: border-color 0.15s ease;
}
.field:focus { outline: none; border-color: var(--primary); }
.pin-field { max-width: 10rem; font-size: 1.125rem; letter-spacing: 0.5em; }

.sas { display: flex; justify-content: center; gap: 1rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 2.25rem; font-weight: 700; letter-spacing: 0.2em; color: var(--text); font-variant-numeric: tabular-nums; }
</style>
