<template>

  <div class="w-full h-full flex flex-col items-center justify-center bg-(--bg2) p-6 select-none">

    <div class="flex flex-col items-center text-center max-w-md">

      <img
        :src="theme === 'light' ? '/assets/logo/synco/light_banner_synco.svg' : '/banner.svg'"
        alt="Synco"
        class="h-12 mb-10 opacity-40 grayscale"
      />

      <div class="banned-icon">
        <i class="bi bi-slash-circle" />
      </div>

      <h2 class="text-xl font-bold text-(--text) mt-6">
        Votre compte a été banni
      </h2>

      <p class="text-sm text-(--text2) mt-3 leading-relaxed">
        L'accès à Synco vous a été retiré par un administrateur.
        Vous ne pouvez plus consulter vos organisations, vos messages ni vos fichiers.
      </p>

      <div v-if="banInfo.reason" class="mt-6 w-full text-left bg-(--bg) border border-(--text)/10 rounded-2xl p-4">
        <p class="text-[10px] font-black uppercase tracking-widest text-(--text2)">Motif</p>
        <p class="text-sm text-(--text) mt-1.5 leading-relaxed whitespace-pre-line break-words">{{ banInfo.reason }}</p>
      </div>

      <p v-if="formattedDate" class="text-xs text-(--text2) mt-5">
        Banni le {{ formattedDate }}
      </p>

      <p class="text-xs text-(--text2) mt-6 leading-relaxed">
        Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur de votre organisation.
      </p>

      <button @click="logout" class="danger mt-8">
        <i class="bi bi-box-arrow-right mr-2" />
        <span class="font-bold">Se déconnecter</span>
      </button>

    </div>

  </div>

</template>

<script setup lang="ts">
import { computed } from 'vue';
import { logoutEverywhere } from '@/assets/keycloak';
import { disconnectSocket } from '@/composables/useWSocket';
import useSettingsItem from '@/composables/useSettingsItem';
import { banInfo } from '@/composables/useBanStatus';

const { Item: theme } = useSettingsItem('theme', 'dark');

const formattedDate = computed(() => {
  if (!banInfo.value.bannedAt) return '';
  const date = new Date(banInfo.value.bannedAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

// Le socket est coupé explicitement : côté serveur la connexion est déjà
// refusée, mais sans ça le client continuerait ses tentatives de reconnexion
// en boucle derrière cet écran.
const logout = () => {
  disconnectSocket();
  logoutEverywhere();
};
</script>

<style scoped>

.banned-icon {
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.75rem;
  color: #ef4444;
  background: color-mix(in srgb, #ef4444 12%, transparent);
  border: 1px solid color-mix(in srgb, #ef4444 35%, transparent);
}

</style>
