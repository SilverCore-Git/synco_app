<template>

    <div class="space-y-4">
        <h4 class="text-xs font-black uppercase tracking-widest text-(--text2)">Appareils</h4>

        <div class="rounded-xl border border-(--border-color) bg-(--bg2) p-5 space-y-4">
            <div>
                <p class="font-bold text-sm text-(--text)">Chiffrement multi-appareil</p>
                <p class="text-sm text-(--text2) mt-1">Ouvrez vos messages sur tous vos appareils, sans code PIN à retenir.</p>
            </div>
            <ul class="facts">
                <li><i class="bi bi-fingerprint" aria-hidden="true" /> Déverrouillage par empreinte, passkey ou Synco Extension</li>
                <li><i class="bi bi-qr-code" aria-hidden="true" /> Un nouvel appareil s'ajoute en scannant un QR code</li>
                <li><i class="bi bi-check2" aria-hidden="true" /> Vos messages et fichiers restent lisibles</li>
            </ul>

            <p v-if="!eligible" class="text-xs text-amber-500 leading-relaxed">{{ notEligibleReason }}</p>
            <div v-else class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <button class="primary text-sm" @click="open">Activer</button>
                <p class="text-xs text-(--text2)">Les anciennes versions de l'application ne pourront plus ouvrir ce compte.</p>
            </div>
        </div>

        <V4MigrationDialog ref="dialog" />
    </div>

</template>

<script setup lang="ts">

import { computed, ref } from 'vue';
import V4MigrationDialog from '../e2ee/V4MigrationDialog.vue';
import { user } from '@/assets/var';
import { SALT_V3_PREFIX } from '@/assets/utils/crypto';

/**
 * Proposition de migration v3 → v4 dans Paramètres › Appareils. La fenêtre elle-même est V4MigrationDialog.vue,
 * aussi proposée à chaque ouverture depuis l'écran de déverrouillage v3 (App.vue).
 */

const dialog = ref<InstanceType<typeof V4MigrationDialog> | null>(null);
const open = () => dialog.value?.open();

const eligible = computed(() => !!user.value?.pinSalt?.startsWith(SALT_V3_PREFIX) && !!user.value?.publicSignKey && !!user.value?.encryptedSignPrivateKey);
const notEligibleReason = computed(() => {
    const salt = user.value?.pinSalt || '';
    if (salt.startsWith('v2:')) return "Pas encore disponible pour les comptes protégés par un code PIN long (6 à 10 chiffres).";
    if (!salt.startsWith(SALT_V3_PREFIX)) return 'Déverrouillez une fois votre session avec votre code PIN pour préparer la mise à niveau.';
    return 'Votre clé de signature est en cours de création : verrouillez puis déverrouillez votre session, puis revenez ici.';
});

</script>

<style scoped>
.facts { display: grid; gap: 0.5rem; }
.facts li { display: flex; align-items: baseline; gap: 0.625rem; font-size: 0.8125rem; color: var(--text); }
.facts i { flex: none; width: 1rem; text-align: center; color: var(--text2); }
</style>
