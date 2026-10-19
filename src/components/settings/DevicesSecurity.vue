<template>

    <div class="space-y-8">

        <!-- ================= Appareils ================= -->
        <div class="space-y-4">
            <div class="flex items-center justify-between gap-3 flex-wrap">
                <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Appareils connectés</h4>
                <button class="primary text-sm flex items-center gap-2" :disabled="!E2EEUnloked" @click="openAdd">
                    <i class="bi bi-plus-lg" /> Ajouter un appareil
                </button>
            </div>

            <input v-if="devices.length > 6" v-model="search" type="search" placeholder="Rechercher un appareil…" @keydown.stop
                class="w-full max-w-sm bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2 text-sm text-(--text) focus:outline-none focus:border-(--primary)" />

            <div v-if="loading" class="py-6 flex justify-center"><SpinLoader /></div>

            <ul v-else class="divide-y divide-(--border-color) border border-(--border-color) rounded-xl bg-(--bg2) overflow-hidden">
                <li v-for="d in filteredDevices" :key="d.id" class="p-4 flex items-start gap-4">
                    <i class="bi text-2xl text-(--text2) mt-0.5" :class="PLATFORM_ICONS[d.platform]" />
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                            <template v-if="renamingId === d.id">
                                <input v-model="renameValue" maxlength="64" @keydown.stop @keyup.enter="saveRename(d)" @keyup.esc="renamingId = ''"
                                    class="bg-(--bg) border border-(--border-color) rounded-lg px-2 py-1 text-sm text-(--text) focus:outline-none focus:border-(--primary)" />
                                <button class="text-(--primary) text-sm" title="Enregistrer" @click="saveRename(d)"><i class="bi bi-check-lg" /></button>
                                <button class="text-(--text2) text-sm" title="Annuler" @click="renamingId = ''"><i class="bi bi-x-lg" /></button>
                            </template>
                            <template v-else>
                                <span class="font-bold text-sm text-(--text) truncate">{{ d.name }}</span>
                                <button class="text-(--text2) hover:text-(--text) text-xs" title="Renommer" @click="startRename(d)"><i class="bi bi-pencil" /></button>
                            </template>
                            <span v-if="d.isThisDevice" class="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold bg-(--primary)/20 text-(--primary)">Cet appareil</span>
                            <span v-if="!d.certified" class="px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-bold bg-red-500/20 text-red-500"
                                title="Ce certificat n'a pas été signé par votre identité : cet appareil ne recevra aucune clé et sera retiré au prochain renouvellement.">
                                Non certifié
                            </span>
                        </div>
                        <p class="text-xs text-(--text2) mt-1">
                            {{ PLATFORM_LABELS[d.platform] }} · ajouté le {{ formatDate(d.createdAt) }} · {{ d.lastUsedAt ? `actif ${formatRelative(d.lastUsedAt)}` : 'jamais utilisé' }}
                        </p>
                    </div>
                    <button class="second text-xs whitespace-nowrap" :disabled="!E2EEUnloked || devices.length < 2"
                        :title="devices.length < 2 ? 'Impossible de déconnecter votre seul appareil' : ''" @click="askRemove(d)">
                        Déconnecter
                    </button>
                </li>
                <li v-if="filteredDevices.length === 0" class="p-4 text-sm text-(--text2)">Aucun appareil.</li>
            </ul>
            <p class="text-xs text-(--text2) leading-relaxed">
                <i class="bi bi-envelope mr-1" /> Vous recevez un e-mail et une notification à chaque ajout ou retrait d'appareil, et à chaque changement de clé de récupération.
            </p>
        </div>

        <!-- ================= Clé de récupération ================= -->
        <div class="space-y-4">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Clé de récupération</h4>
            <div class="p-5 bg-(--bg2) border border-(--border-color) rounded-xl flex flex-col sm:flex-row sm:items-center gap-4">
                <div class="flex-1">
                    <p class="text-sm font-bold text-(--text) flex items-center gap-2">
                        <i class="bi" :class="hasRecovery ? 'bi-check-circle-fill text-(--primary)' : 'bi-exclamation-circle-fill text-amber-500'" />
                        {{ hasRecovery ? 'Clé de récupération active' : 'Aucune clé de récupération' }}
                    </p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                        Elle ouvre vos messages sur un nouvel appareil si vous n'avez plus accès à aucun des vôtres.
                        <template v-if="!hasRecovery"><strong class="text-amber-500">Sans elle, perdre tous vos appareils rend votre historique définitivement illisible.</strong></template>
                        <template v-else>Elle n'est pas réaffichable : en générer une nouvelle rend l'ancienne inutilisable.</template>
                    </p>
                </div>
                <button class="text-sm whitespace-nowrap" :class="hasRecovery ? 'second' : 'primary'" :disabled="!E2EEUnloked || recoveryBusy" @click="hasRecovery ? (confirmRegen = true) : regenerate()">
                    {{ hasRecovery ? 'Générer une nouvelle clé' : 'Créer une clé de récupération' }}
                </button>
            </div>
        </div>

        <!-- ================= Récupération par PIN ================= -->
        <div class="space-y-4">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Récupération par code PIN</h4>
            <div class="p-5 bg-(--bg2) border border-(--border-color) rounded-xl space-y-3" :class="{ 'opacity-80': !pinRecoveryConfigured }">
                <div class="flex items-center justify-between gap-4 flex-wrap">
                    <p class="text-sm font-bold text-(--text) flex items-center gap-2">
                        <template v-if="!pinRecoveryConfigured">
                            Retrouver mes messages avec un code PIN
                            <span class="px-2 py-0.5 rounded text-[10px] uppercase tracking-widest bg-(--text)/10 text-(--text2)">Non proposée sur ce serveur</span>
                        </template>
                        <template v-else-if="!pinRec.reachable">
                            <i class="bi bi-cloud-slash text-amber-500" /> Service de récupération injoignable pour le moment
                        </template>
                        <template v-else-if="pinRec.enabled && pinRec.locked">
                            <i class="bi bi-lock-fill text-red-500" /> Bloquée après trop d'essais
                        </template>
                        <template v-else-if="pinRec.enabled">
                            <i class="bi bi-check-circle-fill text-(--primary)" /> Activée · {{ pinRec.attemptsLeft }} essai(s) avant blocage
                        </template>
                        <template v-else>
                            <i class="bi bi-dash-circle text-(--text2)" /> Désactivée
                        </template>
                    </p>
                    <div v-if="pinRecoveryConfigured && pinRec.reachable" class="flex gap-2">
                        <button class="text-sm" :class="pinRec.enabled ? 'second' : 'primary'" :disabled="!E2EEUnloked || pinRec.busy" @click="openEnablePin">
                            {{ pinRec.enabled ? (pinRec.locked ? 'Réactiver' : 'Changer le code') : 'Activer' }}
                        </button>
                        <button v-if="pinRec.enabled" class="second text-sm" :disabled="pinRec.busy" @click="confirmDisablePin = true">Désactiver</button>
                    </div>
                </div>
                <p class="text-xs text-(--text2) leading-relaxed">
                    Option de secours pour qui n'a plus ni appareil ni clé de récupération. Elle est <strong class="text-amber-500">nettement moins sûre</strong> :
                    votre code n'est jamais envoyé, mais quiconque volerait à la fois les secrets de nos deux serveurs pourrait deviner un code à 4 chiffres en quelques secondes.
                    10 essais au plus, puis blocage ; chaque essai vous est signalé par e-mail.
                </p>
            </div>
        </div>

        <!-- ================= Clés de chiffrement ================= -->
        <div class="space-y-4">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Clés de chiffrement</h4>
            <div class="p-5 bg-(--bg2) border border-(--border-color) rounded-xl flex flex-col sm:flex-row sm:items-center gap-4">
                <div class="flex-1">
                    <p class="text-sm font-bold text-(--text)">Renouveler mes clés de chiffrement</p>
                    <p class="text-xs text-(--text2) mt-1 leading-relaxed">
                        À faire si un appareil perdu ou volé était déverrouillé : il ne pourra plus rien déchiffrer de ce qui vous sera envoyé ensuite.
                        Vos contacts reçoivent automatiquement vos nouvelles clés ; votre historique reste lisible sur vos appareils.
                    </p>
                </div>
                <button class="second text-sm whitespace-nowrap" :disabled="!E2EEUnloked || rotating" @click="confirmRotate = true">Renouveler</button>
            </div>
        </div>

        <!-- ================= Verrou de cet appareil ================= -->
        <div v-if="localKind" class="space-y-4">
            <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Verrou de cet appareil</h4>
            <div class="p-5 bg-(--bg2) border border-(--border-color) rounded-xl space-y-4">
                <p class="text-sm text-(--text) flex items-start gap-2">
                    <i class="bi mt-0.5" :class="VAULT_INFO[localKind].icon" />
                    <span>
                        <strong>{{ VAULT_INFO[localKind].label }}</strong>
                        <span class="block text-xs text-(--text2) mt-1 leading-relaxed">{{ VAULT_INFO[localKind].detail }}</span>
                    </span>
                </p>
                <div class="flex flex-wrap gap-2">
                    <button v-if="localKind === 'web-pin'" class="second text-sm" :disabled="lockBusy" @click="openChangePin">Changer le code PIN local</button>
                    <button v-if="localKind === 'web-pin' && prfPossible" class="primary text-sm" :disabled="lockBusy" @click="enablePasskey">
                        <i class="bi bi-fingerprint mr-1" /> Utiliser une passkey
                    </button>
                    <button v-if="localKind === 'webauthn-prf'" class="second text-sm" :disabled="lockBusy" @click="disablePasskey">
                        Revenir au code PIN local
                    </button>
                </div>
            </div>
        </div>

        <!-- ================= Popups ================= -->

        <!-- Ajouter un appareil -->
        <Popup :isOpen="add.open" @close="closeAdd">
            <template #title>Ajouter un appareil</template>

            <div v-if="add.step === 'scan'" class="space-y-4">
                <p class="text-sm text-(--text2)">
                    Sur le nouvel appareil, ouvrez Synco et choisissez « Depuis un autre appareil ». Scannez le QR code affiché,
                    ou saisissez le code de 28 caractères.
                </p>
                <QrScanner v-if="add.useCamera" @result="onScanned" @unavailable="add.useCamera = false" />
                <div class="space-y-2">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Code affiché sur le nouvel appareil</label>
                    <input v-model="add.code" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" @keydown.stop @keyup.enter="submitCode"
                        placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                        class="w-full bg-(--bg) border border-(--border-color) rounded-xl px-4 py-2 font-mono text-sm tracking-wider text-(--text) focus:outline-none focus:border-(--primary)" />
                </div>
            </div>

            <div v-else-if="add.step === 'select'" class="space-y-3">
                <p class="text-sm text-(--text2)">Quel appareil voulez-vous ajouter ?</p>
                <button v-for="p in add.pending" :key="p.id" class="w-full text-left p-3 rounded-xl border border-(--border-color) hover:border-(--primary) flex items-center gap-3"
                    @click="selectPending(p)">
                    <i class="bi text-xl" :class="PLATFORM_ICONS[p.platform]" />
                    <span class="flex-1">
                        <span class="block text-sm font-bold text-(--text)">{{ p.name }}</span>
                        <span class="block text-xs text-(--text2)">{{ PLATFORM_LABELS[p.platform] }} · demande {{ formatRelative(p.createdAt) }}</span>
                    </span>
                </button>
            </div>

            <div v-else-if="add.step === 'confirm' && add.target" class="space-y-4">
                <div class="p-4 rounded-xl border border-(--border-color) bg-(--bg2) flex items-center gap-3">
                    <i class="bi text-2xl" :class="PLATFORM_ICONS[add.target.platform]" />
                    <div>
                        <p class="text-sm font-bold text-(--text)">{{ add.target.name }}</p>
                        <p class="text-xs text-(--text2)">{{ PLATFORM_LABELS[add.target.platform] }} · demande {{ formatRelative(add.target.createdAt) }}</p>
                    </div>
                </div>
                <div class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <i class="bi bi-exclamation-triangle-fill text-amber-500 mt-0.5 shrink-0" />
                    <span class="text-xs text-amber-500 leading-snug">
                        Cet appareil pourra lire tous vos messages chiffrés. N'autorisez que vos propres appareils, que vous avez sous les yeux.
                    </span>
                </div>
                <label class="flex items-start gap-2 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="add.ack" class="mt-1" />
                    <span>C'est bien mon appareil, et c'est moi qui viens de lancer cette demande.</span>
                </label>
            </div>

            <div v-else-if="add.step === 'done'" class="space-y-4 text-center">
                <p class="text-sm text-(--text2)">Vérifiez que le nouvel appareil affiche le même code, puis validez-le là-bas :</p>
                <p class="font-mono text-4xl font-bold tracking-[0.3em] text-(--text)">{{ add.sas }}</p>
                <p class="text-xs text-(--text2)">Si les codes diffèrent, refusez sur le nouvel appareil et déconnectez-le d'ici s'il apparaît dans la liste.</p>
            </div>

            <template #footer>
                <button class="default" @click="closeAdd">{{ add.step === 'done' ? 'Fermer' : 'Annuler' }}</button>
                <button v-if="add.step === 'scan'" class="primary" :disabled="add.busy || add.code.replace(/[\s-]/g, '').length < 28" @click="submitCode">Continuer</button>
                <button v-if="add.step === 'confirm'" class="primary" :class="{ loader: add.busy }" :disabled="!add.ack || add.busy" @click="authorize">Autoriser cet appareil</button>
            </template>
        </Popup>

        <!-- Confirmation par le coffre (PIN local) -->
        <Popup :isOpen="stepUp.open" :zIndex="2200" @close="cancelStepUp">
            <template #title>Confirmez avec votre code PIN local</template>
            <p class="text-sm text-(--text2) mb-6">{{ stepUp.reason }}</p>
            <PinPad v-if="stepUp.open" v-model="stepUp.pin" auto-submit :error-tick="stepUp.errorTick" @submit="submitStepUp" />
        </Popup>

        <!-- Nouvelle clé de récupération -->
        <Popup :isOpen="!!newRecovery" :zIndex="2100" @close="closeNewRecovery">
            <template #title>Votre nouvelle clé de récupération</template>
            <p class="text-sm text-(--text2) mb-4">L'ancienne clé ne fonctionne plus. Conservez celle-ci : elle ne sera plus affichée.</p>
            <RecoveryKeyPanel v-if="newRecovery" :key-text="newRecovery" :account-label="accountLabel" @saved="recoveryAck = true" />
            <label class="flex items-start gap-2 mt-4 text-sm text-(--text) cursor-pointer">
                <input type="checkbox" v-model="recoveryAck" class="mt-1" />
                <span>J'ai conservé ma nouvelle clé de récupération.</span>
            </label>
            <template #footer>
                <button class="primary" :disabled="!recoveryAck" @click="closeNewRecovery">Terminer</button>
            </template>
        </Popup>

        <!-- Changer le PIN local / passer de la passkey au PIN -->
        <Popup :isOpen="pinChange.open" @close="pinChange.open = false">
            <template #title>{{ pinChange.mode === 'change' ? 'Changer le code PIN local' : 'Utiliser un code PIN local' }}</template>
            <p v-if="pinChange.mode === 'from-passkey'" class="text-xs text-amber-500 mb-4 leading-relaxed">
                <i class="bi bi-exclamation-triangle-fill mr-1" />
                Sur le web, un code PIN local protège moins bien qu'une passkey : quelqu'un qui copierait le profil de votre navigateur pourrait le deviner hors ligne.
            </p>
            <div class="space-y-3">
                <div v-if="pinChange.mode === 'change'" class="space-y-1">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Code actuel</label>
                    <input v-model="pinChange.current" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop class="pin-input" />
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Nouveau code (4 chiffres)</label>
                    <input v-model="pinChange.next" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop class="pin-input" />
                </div>
                <div class="space-y-1">
                    <label class="text-xs font-bold uppercase tracking-widest text-(--text2)">Confirmer</label>
                    <input v-model="pinChange.confirm" type="password" inputmode="numeric" maxlength="4" autocomplete="off" @keydown.stop @keyup.enter="submitPinChange" class="pin-input" />
                </div>
                <p class="text-[11px] text-(--text2)">Ce code ne quitte jamais cet appareil. 10 erreurs effacent les clés de cet appareil.</p>
            </div>
            <template #footer>
                <button class="default" @click="pinChange.open = false">Annuler</button>
                <button class="primary" :class="{ loader: lockBusy }" :disabled="!canSubmitPinChange || lockBusy" @click="submitPinChange">Enregistrer</button>
            </template>
        </Popup>

        <!-- Activer / changer le code de récupération -->
        <Popup :isOpen="enablePin.open" @close="closeEnablePin">
            <template #title>Récupération par code PIN</template>
            <div v-if="enablePin.step === 'warn'" class="space-y-4">
                <div class="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <i class="bi bi-exclamation-triangle-fill text-amber-500 mt-0.5 shrink-0" />
                    <span class="text-xs text-amber-500 leading-snug">
                        Un code à 4 chiffres protège moins bien que vos appareils ou votre clé de récupération. Votre code n'est jamais envoyé
                        (il est « aveuglé ») et deux serveurs séparés limitent les essais, mais quiconque compromettrait les deux pourrait retrouver vos messages.
                    </span>
                </div>
                <label class="flex items-start gap-2 text-sm text-(--text) cursor-pointer">
                    <input type="checkbox" v-model="enablePin.ack" class="mt-1" />
                    <span>J'ai compris et je veux tout de même pouvoir récupérer mes messages avec un code PIN.</span>
                </label>
            </div>
            <div v-else class="flex flex-col items-center">
                <p class="text-sm text-(--text2) mb-6 text-center max-w-sm">
                    {{ enablePin.step === 'choose' ? 'Choisissez votre code PIN de récupération (4 chiffres). Vous pouvez reprendre votre code habituel.' : 'Saisissez-le à nouveau pour confirmer.' }}
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
            <template #title>Conserver la récupération par code PIN</template>
            <p class="text-sm text-(--text2) mb-6">
                Une nouvelle clé de compte va être créée. Saisissez votre code PIN de récupération pour la conserver, ou désactivez-la.
            </p>
            <PinPad v-if="recPinAsk.open" v-model="recPinAsk.pin" auto-submit @submit="answerRecPin(recPinAsk.pin)" />
            <template #footer>
                <button class="default" @click="answerRecPin(undefined)">Annuler le retrait</button>
                <button class="second" @click="answerRecPin(null)">Désactiver la récupération par PIN</button>
            </template>
        </Popup>

        <ConfirmDelete
            :show="confirmDisablePin"
            title="Désactiver la récupération par code PIN ?"
            item-name="la récupération par code PIN"
            item-type="la récupération par code PIN"
            message="Vous ne pourrez plus retrouver vos messages avec un code PIN. Vos appareils et votre clé de récupération restent les moyens d'accès."
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
            :checkbox="true"
            checkbox-label="Je comprends que cet appareil perdra l'accès à mes nouveaux messages."
            extra-option-label="Renouveler aussi mes clés de chiffrement (recommandé si cet appareil était déverrouillé)"
            v-model:extra-option-value="rotateWithRemoval"
            @confirm="confirmRemove"
            @cancel="removeTarget = null"
        />

        <ConfirmDelete
            :show="confirmRotate"
            title="Renouveler vos clés de chiffrement ?"
            item-name="vos clés de chiffrement"
            item-type="vos clés de chiffrement"
            message="De nouvelles clés seront créées et distribuées à vos appareils. Vos contacts les recevront automatiquement ; votre historique reste lisible sur vos appareils. Les salons et espaces existants gardent leur clé tant qu'elle n'est pas renouvelée par leurs membres."
            :extra-warning="hasRecovery ? 'Votre clé de récupération sera renouvelée : la nouvelle s\'affichera ensuite.' : ''"
            button-text="Renouveler"
            :loading="rotating"
            @confirm="confirmRotate = false; runRotation([], true)"
            @cancel="confirmRotate = false"
        />

        <ConfirmDelete
            :show="confirmRegen"
            title="Générer une nouvelle clé de récupération ?"
            item-name="la clé de récupération"
            item-type="la clé de récupération"
            message="L'ancienne clé de récupération cessera immédiatement de fonctionner. Une nouvelle clé s'affichera : conservez-la."
            button-text="Générer"
            :loading="recoveryBusy"
            @confirm="confirmRegen = false; regenerate()"
            @cancel="confirmRegen = false"
        />

    </div>

</template>

<script setup lang="ts">

import { computed, onMounted, reactive, ref } from 'vue';
import Popup from '../Popup.vue';
import ConfirmDelete from '../common/ConfirmDelete.vue';
import SpinLoader from '../SpinLoader.vue';
import PinPad from '../e2ee/PinPad.vue';
import QrScanner from '../e2ee/QrScanner.vue';
import RecoveryKeyPanel from '../e2ee/RecoveryKeyPanel.vue';
import { user } from '@/assets/var';
import { refetchUser } from '@/assets/init';
import { E2EEUnloked, lockSecurity } from '@/assets/utils/crypto';
import { useToast } from '@/composables/useToast';
import { getLocalDevice, idbStore, switchVault, VaultError, type VaultContext, type VaultKind } from '@/assets/deviceVault';
import { PinVault } from '@/assets/deviceVault/pinVault';
import { E2eeV4Error, parseLinkSecret } from '@/assets/utils/e2eeV4';
import {
    IdentityMismatchError, V4ApiError, answerLink, checkDevices, parseLinkQr, regenerateRecoveryKey, removeDevices, rotateIdentity,
    type CheckedDevice, type DeviceContext, type PendingLink,
} from '@/assets/e2eeV4/session';
import { PinRecoveryFailure, disablePinRecovery, enablePinRecovery, keepPinRecovery, pinRecoveryStatus } from '@/assets/e2eeV4/pinRecovery';
import { pinRecoveryActors, pinRecoveryConfigured } from '@/assets/e2eeV4/pinRecoveryApi';
import { applyIdentityKeys, PLATFORM_ICONS, PLATFORM_LABELS, deviceContext, enrollmentVaults, sealedFrom, vaultFor } from '@/assets/e2eeV4/runtime';

/**
 * Paramètres › Appareils et sécurité (E2EE v4, doc/securite/13-e2ee-v4-multi-appareil.md §11).
 * Toute action qui touche à la clé de compte redemande le coffre de cet appareil (biométrie,
 * passkey ou PIN local) : la clé n'est jamais gardée en mémoire pendant la session.
 */

const toast = useToast();

const VAULT_INFO: Record<VaultKind, { icon: string; label: string; detail: string }> = {
    'webauthn-prf': { icon: 'bi-fingerprint', label: 'Passkey', detail: "Vos clés s'ouvrent avec votre passkey (empreinte, visage, code de l'appareil ou de la clé de sécurité, ou gestionnaire de passkeys compatible PRF)." },
    'web-pin': { icon: 'bi-123', label: 'Code PIN local', detail: "Ce code n'est jamais envoyé au serveur. Sur le web, il est la seule barrière pour qui copierait le profil de votre navigateur : utilisez une passkey si votre appareil ou votre gestionnaire de passkeys le permet." },
    'native-biometric': { icon: 'bi-fingerprint', label: 'Biométrie du téléphone', detail: "Face ID, Touch ID ou empreinte, avec le code de l'appareil en repli. Gérée par les réglages de votre téléphone." },
    'os-keyring': { icon: 'bi-safe', label: 'Trousseau du système', detail: "Vos clés sont protégées par votre session sur cet ordinateur (Trousseau macOS, Gestionnaire d'identifiants Windows, Secret Service Linux)." },
};

let dev: DeviceContext | null = null;

const loading = ref(true);
const devices = ref<CheckedDevice[]>([]);
const search = ref('');
const hasRecovery = ref(false);
const localKind = ref<VaultKind | null>(null);
const prfPossible = ref(false);

const accountLabel = computed(() => user.value?.email || user.value?.name || '');
const filteredDevices = computed(() => {
    const q = search.value.trim().toLowerCase();
    return q ? devices.value.filter(d => d.name.toLowerCase().includes(q) || PLATFORM_LABELS[d.platform].toLowerCase().includes(q)) : devices.value;
});

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
    prfPossible.value = (await enrollmentVaults()).some(v => v.capabilities.kind === 'webauthn-prf');
    await reload();
    await refreshPinRec();
});

// --- confirmation par le coffre ------------------------------------------------

const stepUp = reactive({ open: false, pin: '', reason: '', errorTick: 0 });
let stepUpResolver: { resolve: (ctx: VaultContext) => void; reject: (e: unknown) => void } | null = null;

/** Contexte du coffre pour une opération sensible : demande le PIN local si ce coffre l'exige. */
async function vaultCtx(reason: string): Promise<VaultContext> {
    const record = dev ? await getLocalDevice(idbStore, dev.userId) : undefined;
    const vault = record ? dev!.vaultFor(record.vaultKind) : undefined;
    if (!vault?.capabilities.needsPin) return { reason };
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
        ? `« ${d.name} » (cet appareil) sera retiré de votre compte : vos clés seront effacées d'ici et une nouvelle clé de compte sera distribuée à vos autres appareils.`
        : `« ${d.name} » ne pourra plus déchiffrer vos nouveaux messages : une nouvelle clé de compte sera distribuée à vos autres appareils.`;
});
const removeWarning = computed(() => {
    const parts = ["Si cet appareil était déverrouillé au moment de sa perte, il conserve l'accès à ce qu'il a déjà pu ouvrir : changez aussi votre mot de passe."];
    if (hasRecovery.value) parts.push('Votre clé de récupération sera renouvelée : la nouvelle s\'affichera ensuite.');
    if (pinRec.enabled) parts.push('Votre code PIN de récupération vous sera demandé pour la conserver.');
    parts.push("Pour l'en priver aussi à l'avenir, cochez le renouvellement des clés ci-dessous.");
    const uncertified = devices.value.filter(x => !x.certified && x.id !== removeTarget.value?.id).length;
    if (uncertified) parts.push(`${uncertified} appareil(s) non certifié(s) seront aussi retirés.`);
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
const pinChange = reactive({ open: false, mode: 'change' as 'change' | 'from-passkey', current: '', next: '', confirm: '' });
const isPin = (s: string) => /^\d{4}$/.test(s);
const canSubmitPinChange = computed(() =>
    isPin(pinChange.next) && pinChange.next === pinChange.confirm && (pinChange.mode !== 'change' || isPin(pinChange.current)));

function openChangePin() {
    Object.assign(pinChange, { open: true, mode: 'change', current: '', next: '', confirm: '' });
}

function disablePasskey() {
    Object.assign(pinChange, { open: true, mode: 'from-passkey', current: '', next: '', confirm: '' });
}

async function submitPinChange() {
    if (!dev || !canSubmitPinChange.value) return;
    lockBusy.value = true;
    try {
        const record = await getLocalDevice(idbStore, dev.userId);
        if (!record) throw new VaultError('missing');
        if (pinChange.mode === 'change') {
            const vault = dev.vaultFor('web-pin');
            if (!(vault instanceof PinVault)) throw new VaultError('unavailable');
            await vault.changePin(record.deviceId, pinChange.current, pinChange.next);
            toast.show('Code PIN local modifié.', 'success');
        } else {
            const from = dev.vaultFor('webauthn-prf');
            const to = dev.vaultFor('web-pin') ?? await vaultFor('web-pin');
            if (!from || !to) throw new VaultError('unavailable');
            await switchVault({ userId: dev.userId, store: idbStore, from, to, fromCtx: { reason: 'Confirmez le changement de verrou.' }, toCtx: { pin: pinChange.next } });
            toast.show('Cet appareil se déverrouille désormais avec un code PIN local.', 'success');
        }
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

async function enablePasskey() {
    if (!dev) return;
    lockBusy.value = true;
    try {
        const from = dev.vaultFor('web-pin');
        const to = dev.vaultFor('webauthn-prf') ?? await vaultFor('webauthn-prf');
        if (!from || !to) throw new VaultError('unavailable', "Ce navigateur ne propose pas de passkey compatible.");
        const fromCtx = await vaultCtx('Saisissez votre code PIN local pour passer à une passkey.');
        await switchVault({ userId: dev.userId, store: idbStore, from, to, fromCtx });
        toast.show('Passkey activée : cet appareil se déverrouille avec elle.', 'success');
        await reload();
    } catch (e) {
        if (e instanceof VaultError && e.code === 'unavailable') {
            const detail = e.message && e.message !== 'unavailable' ? e.message : "Cette passkey ne fournit pas l'extension PRF nécessaire au chiffrement.";
            toast.show(`${detail} Vous pouvez la supprimer de votre gestionnaire ; le code PIN local reste actif.`, 'error', 12000);
        }
        else reportError(e, "Impossible d'activer la passkey.");
    } finally {
        lockBusy.value = false;
    }
}

</script>

<style scoped>
.pin-input {
    width: 100%;
    max-width: 10rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    padding: 0.5rem 1rem;
    font-size: 1.125rem;
    letter-spacing: 0.5em;
    color: var(--text);
}
.pin-input:focus {
    outline: none;
    border-color: var(--primary);
}
</style>
