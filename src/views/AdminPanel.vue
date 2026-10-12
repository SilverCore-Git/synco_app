<template>
  <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text) font-sans">

    <!-- Top Navigation -->
    <nav class="shrink-0 z-50 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div class="flex items-center gap-4">
          <router-link to="/" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors">
            <i class="bi bi-arrow-left text-xl"></i>
          </router-link>
          <div>
            <h1 class="text-xl font-black uppercase tracking-wider flex items-center gap-3">
              Panel admin
            </h1>
          </div>
        </div>
      </div>
      <div class="max-w-7xl mx-auto flex items-center gap-2 mt-6">
        <router-link to="/root/users" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-(--text)/5 text-(--text) hover:bg-(--text)/10">
            <i class="bi bi-people-fill"></i> Utilisateurs
        </router-link>
        <router-link to="/root/orgs" exact-active-class="!bg-(--primary) !text-white" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-(--text)/5 text-(--text) hover:bg-(--text)/10">
            <i class="bi bi-building-fill"></i> Organisations
        </router-link>
        <!-- Pas un onglet de ce layout (le panel SAV a son propre espace,
             distinct visuellement du panel admin) : juste un accès rapide. -->
        <router-link to="/support-panel" class="px-4 py-2 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 bg-(--text)/5 text-(--text) hover:bg-(--text)/10 ml-auto">
            <i class="bi bi-headset"></i> Panel SAV
            <div v-if="getUnreadCountForSupportStaff > 0" class="w-2 h-2 bg-red-500 animate-pulse rounded-full shadow-[0_0_8px_var(--glow-danger-strong)]" />
        </router-link>
      </div>

      <!-- Clé de chiffrement du support (super-admin) : mise en place à
           l'ouverture du panel, rotation après un retrait de l'équipe. -->
      <div v-if="staffKeyAdmin.isSuperAdmin.value && staffKeyAdmin.state.value !== 'idle'"
           class="max-w-7xl mx-auto mt-4 flex items-center gap-3 text-xs rounded-xl px-4 py-2 border"
           :class="staffKeyBannerClass">
        <i class="bi" :class="staffKeyBannerIcon"></i>
        <span class="flex-1">{{ staffKeyBannerText }}</span>
        <button
          v-if="staffKeyAdmin.state.value === 'error' || staffKeyAdmin.state.value === 'locked' || staffKeyAdmin.rotationPending.value"
          class="default text-xs"
          :disabled="staffKeyAdmin.busy.value"
          @click="retryStaffKey"
        >
          Réessayer
        </button>
      </div>
    </nav>

    <main class="flex-1 min-h-0 overflow-y-auto">
      <div class="max-w-7xl mx-auto p-6 mt-4">
        <router-view></router-view>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
// Admin layout - child routes are rendered in <router-view>
import { computed, onMounted } from 'vue';
import { useStaffKeyAdmin } from '@/composables/useStaffKeyAdmin';
import { useNotification } from '@/composables/useNotification';

const { getUnreadCountForSupportStaff } = useNotification();

const staffKeyAdmin = useStaffKeyAdmin();

const staffKeyBannerText = computed(() => {
  const version = staffKeyAdmin.current.value?.version;
  switch (staffKeyAdmin.state.value) {
    case 'checking': return 'Clé du support : vérification…';
    case 'creating': return 'Clé du support : création et partage à l\'équipe…';
    case 'rotating': return 'Clé du support : renouvellement et partage aux membres restants…';
    case 'locked': return 'Clé du support : déverrouillez votre session (code PIN) pour la gérer.';
    case 'error': return `Clé du support : ${staffKeyAdmin.error.value ?? 'erreur'}`;
    case 'ready':
      return staffKeyAdmin.rotationPending.value
        ? 'Clé du support : un renouvellement est en attente après un retrait de l\'équipe.'
        : `Clé du support active${version ? ` (version ${version})` : ''}.`;
    default: return '';
  }
});

const staffKeyBannerClass = computed(() => {
  const s = staffKeyAdmin.state.value;
  if (s === 'error' || s === 'locked' || staffKeyAdmin.rotationPending.value) return 'border-amber-500/30 bg-amber-500/5 text-amber-500';
  if (s === 'ready') return 'border-(--text)/5 bg-(--bg2) text-(--text2)';
  return 'border-(--primary)/20 bg-(--primary)/5 text-(--primary)';
});

const staffKeyBannerIcon = computed(() => {
  const s = staffKeyAdmin.state.value;
  if (staffKeyAdmin.busy.value) return 'bi-arrow-repeat animate-spin';
  if (s === 'error' || s === 'locked' || staffKeyAdmin.rotationPending.value) return 'bi-exclamation-triangle-fill';
  return 'bi-shield-lock-fill';
});

const retryStaffKey = () => {
  if (staffKeyAdmin.rotationPending.value) void staffKeyAdmin.rotate();
  else void staffKeyAdmin.ensureSetup();
};

onMounted(() => { void staffKeyAdmin.ensureSetup(); });
</script>
