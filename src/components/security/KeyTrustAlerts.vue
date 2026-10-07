<template>
    <Popup :isOpen="!!current" @close="later">
        <template #title>Clé de sécurité modifiée</template>

        <div v-if="current" class="flex flex-col gap-4">
            <div class="flex items-start gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <i class="bi bi-exclamation-triangle-fill text-red-400 mt-0.5" />
                <p class="text-xs text-red-400 leading-relaxed">
                    La clé de sécurité de {{ $p(name) }} a changé depuis votre dernier échange chiffré.
                    Aucune clé de salon, d'espace ou de conversation ne lui est transmise tant que vous ne l'avez pas vérifiée.
                    Cela peut signifier que {{ $p(name) }} a réinitialisé son code PIN — ou qu'un tiers tente d'intercepter vos échanges.
                </p>
            </div>

            <p class="text-sm text-(--text2) leading-relaxed">
                Comparez ce code avec {{ $p(name) }} par un autre moyen (appel, en personne) avant de lui faire confiance.
            </p>

            <div class="px-4 py-3 rounded-xl bg-(--bg2) border border-(--border-color) text-center">
                <span class="text-sm font-mono tracking-wider break-all text-(--text)">{{ fingerprint }}</span>
            </div>
        </div>

        <template #footer>
            <button @click="later" class="default">Plus tard</button>
            <button @click="trust" class="danger">J'ai vérifié, faire confiance</button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Popup from '@/components/Popup.vue';
import { openedOrg } from '@/assets/var';
import { keyTrustAlerts, dismissKeyTrustAlert, trustKey, computeKeyFingerprint } from '@/assets/utils/keyTrust';

/**
 * Clés publiques refusées par un chemin automatique de partage de clés
 * (keyTrust.ts, audit FC1) : présentées une à une pour vérification de
 * l'empreinte. Composant maison, jamais de dialogue natif.
 */
const current = computed(() => keyTrustAlerts.value[0] ?? null);
const name = computed(() =>
    openedOrg.value?.members?.find((m: any) => m.userId === current.value?.userId)?.user?.name || 'ce membre'
);
const fingerprint = ref('');

watch(current, async (alert) => {
    fingerprint.value = alert ? await computeKeyFingerprint(alert.publicKey).catch(() => '—') : '';
}, { immediate: true });

const later = () => { if (current.value) dismissKeyTrustAlert(current.value.userId); };
const trust = async () => {
    if (!current.value) return;
    await trustKey(current.value.userId, current.value.publicKey);
    dismissKeyTrustAlert(current.value.userId);
};
</script>
