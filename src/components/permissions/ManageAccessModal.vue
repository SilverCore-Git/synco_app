<template>
  <transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="transform scale-95 opacity-0"
    enter-to-class="transform scale-100 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="transform scale-100 opacity-100"
    leave-to-class="transform scale-95 opacity-0"
  >
    <div
      v-if="show"
      class="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
      @click.self="$emit('close')"
    >
      <div class="bg-(--bg) rounded-2xl border border-(--text)/10 shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col relative overflow-hidden" @click.stop>

        <!-- Header -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center shrink-0">
              <i class="bi bi-shield-lock text-(--primary) text-lg" />
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-(--text)">Gérer les accès</h2>
              <p class="text-xs text-(--text2) truncate">
                <i :class="itemType === 'folder' ? 'bi bi-folder' : 'bi bi-file-earmark'" class="mr-1" />{{ itemName }}
              </p>
            </div>
          </div>
          <button @click="$emit('close')" class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-(--text)/5">
            <i class="bi bi-x-lg text-xl" />
          </button>
        </header>

        <!-- Légende + recherche -->
        <div class="px-6 pt-4 pb-3 flex flex-col gap-3 shrink-0 border-b border-(--border-color)">
          <p class="text-xs text-(--text2) leading-relaxed">
            <template v-if="canManage">
              <b class="text-(--text)">Aucun</b> : ne voit pas {{ itemType === 'folder' ? 'le dossier ni son contenu' : 'le fichier' }}.
              <b class="text-(--text)">Voir</b> : peut l'ouvrir et le télécharger.
              <b class="text-(--text)">Modifier</b> : peut aussi le modifier{{ itemType === 'folder' ? ' et y déposer des fichiers' : '' }}.
              Sans réglage, chacun garde l'accès que lui donnent ses rôles et le space.
            </template>
            <template v-else>
              <i class="bi bi-eye mr-1" />Vous pouvez consulter ces accès, pas les modifier.
            </template>
          </p>
          <div v-if="members.length > 6" class="relative">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs" />
            <input
              v-model="search"
              type="search"
              placeholder="Rechercher un membre…"
              class="w-full pl-8 pr-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary) placeholder-(--text2)/50"
            />
          </div>
        </div>

        <!-- Main -->
        <main class="flex-1 overflow-y-auto p-6">
          <div v-if="isLoading" class="flex justify-center py-12">
            <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <div v-else class="flex flex-col gap-2">
            <div
              v-for="row in filteredRows"
              :key="row.userId"
              class="flex flex-wrap items-center justify-between gap-3 p-3 bg-(--bg2)/20 border border-(--border-color) rounded-xl"
            >
              <!-- Membre -->
              <div class="flex items-center gap-3 min-w-0">
                <img v-if="row.member?.user?.avatarUrl" :src="row.member.user.avatarUrl" class="w-9 h-9 rounded-full object-cover border border-(--text)/10 shrink-0" />
                <div v-else class="w-9 h-9 rounded-full bg-(--primary)/20 flex items-center justify-center text-(--primary) font-bold uppercase shrink-0">
                  {{ row.member?.user?.name?.charAt(0) || '?' }}
                </div>
                <div class="min-w-0">
                  <h4 class="text-sm font-semibold text-(--text) truncate">{{ $p(row.member?.user?.name) || 'Utilisateur inconnu' }}</h4>
                  <p class="text-[11px] text-(--text2) truncate">
                    <template v-if="row.locked === 'owner'">Propriétaire {{ itemType === 'folder' ? 'du dossier' : 'du fichier' }}</template>
                    <template v-else-if="row.locked === 'org-owner'">Propriétaire de l'organisation</template>
                    <template v-else-if="row.locked === 'superior'">Rôle égal ou supérieur au vôtre</template>
                    <template v-else-if="levelOf(row) === null">Par défaut · {{ LEVEL_LABEL[row.inherited] }}</template>
                    <template v-else>
                      Réglé ici
                      <button
                        v-if="canManage"
                        @click="setLevel(row.userId, null)"
                        class="ml-1 text-(--primary) hover:underline"
                        :title="`Revenir à l'accès par défaut : ${LEVEL_LABEL[row.inherited]}`"
                      >
                        <i class="bi bi-arrow-counterclockwise" /> par défaut ({{ LEVEL_LABEL[row.inherited] }})
                      </button>
                    </template>
                  </p>
                </div>
              </div>

              <!-- Aucun / Voir / Modifier -->
              <div
                class="flex items-center gap-0.5 p-0.5 rounded-lg bg-(--bg2) border border-(--border-color) shrink-0"
                :class="{ 'opacity-50': isDisabled(row) }"
              >
                <button
                  v-for="option in LEVEL_OPTIONS"
                  :key="option.value"
                  @click="setLevel(row.userId, option.value)"
                  :disabled="isDisabled(row)"
                  class="px-2.5 py-1 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 disabled:cursor-not-allowed"
                  :class="displayed(row) === option.value
                    ? (levelOf(row) === null && !row.locked ? option.inheritedClass : option.activeClass)
                    : 'text-(--text2) hover:text-(--text)'"
                >
                  <i :class="option.icon" />
                  {{ option.label }}
                </button>
              </div>
            </div>

            <div v-if="filteredRows.length === 0" class="text-center text-(--text2) py-8 text-sm">
              {{ members.length === 0 ? 'Aucun autre membre dans ce space.' : `Aucun membre ne correspond à « ${search} »` }}
            </div>
          </div>
        </main>

        <!-- Footer -->
        <footer class="flex items-center justify-between px-6 py-4 border-t border-(--border-color) shrink-0 bg-(--bg2)/50">
          <p v-if="hasChanges" class="text-xs text-amber-400 flex items-center gap-1.5">
            <i class="bi bi-exclamation-circle" />
            Modifications non sauvegardées
          </p>
          <div v-else />
          <div class="flex items-center gap-3">
            <button @click="$emit('close')" class="default">{{ canManage ? 'Annuler' : 'Fermer' }}</button>
            <button
              v-if="canManage"
              @click="save"
              class="primary"
              :class="{ 'loader': isSaving }"
              :disabled="!hasChanges || isSaving"
            >
              Enregistrer
            </button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

type AccessLevel = 'none' | 'read' | 'write';

interface AccessRow {
  userId: string;
  /** Réglage posé sur cet élément pour ce membre, null = par défaut. */
  override: AccessLevel | null;
  /** Ce qu'il aurait sans réglage (rôles, space, dossiers parents). */
  inherited: AccessLevel;
  effective: AccessLevel;
  locked: 'owner' | 'org-owner' | 'superior' | null;
}

const props = defineProps<{
  show: boolean;
  itemType: 'file' | 'folder';
  itemId: string;
  itemName: string;
  spaceId: string;
}>();

const emit = defineEmits(['close', 'saved']);
const toast = useToast();

const LEVEL_LABEL: Record<AccessLevel, string> = { none: 'aucun accès', read: 'voir', write: 'modifier' };

const LEVEL_OPTIONS: Array<{ value: AccessLevel; label: string; icon: string; activeClass: string; inheritedClass: string }> = [
  { value: 'none',  label: 'Aucun',    icon: 'bi bi-eye-slash', activeClass: 'bg-red-500/15 text-red-400',         inheritedClass: 'bg-(--text)/5 text-red-400/70 ring-1 ring-inset ring-red-400/30' },
  { value: 'read',  label: 'Voir',     icon: 'bi bi-eye',       activeClass: 'bg-sky-500/15 text-sky-400',         inheritedClass: 'bg-(--text)/5 text-sky-400/70 ring-1 ring-inset ring-sky-400/30' },
  { value: 'write', label: 'Modifier', icon: 'bi bi-pencil',    activeClass: 'bg-emerald-500/15 text-emerald-400', inheritedClass: 'bg-(--text)/5 text-emerald-400/70 ring-1 ring-inset ring-emerald-400/30' },
];

const isLoading = ref(false);
const isSaving = ref(false);
const canManage = ref(false);
const rows = ref<AccessRow[]>([]);
/** Réglages en cours : userId → niveau, null = revenir au défaut. */
const pending = ref<Record<string, AccessLevel | null>>({});
const search = ref('');

const endpoint = computed(() =>
  `/api/orgs/${openedOrg.value?.id}/${props.itemType === 'file' ? 'files' : 'folders'}/${props.itemId}/access`);

const memberById = computed(() => new Map((openedOrg.value?.members ?? []).map(m => [m.userId, m])));

const members = computed(() => rows.value
  .map(row => ({ ...row, member: memberById.value.get(row.userId) }))
  .sort((a, b) => (a.member?.user?.name ?? '').localeCompare(b.member?.user?.name ?? '')));

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return members.value;
  return members.value.filter(r => (r.member?.user?.name ?? '').toLowerCase().includes(q)
    || (r.member?.user?.email ?? '').toLowerCase().includes(q));
});

/** Réglage propre à l'élément, modifications en cours comprises. */
const levelOf = (row: AccessRow): AccessLevel | null =>
  row.userId in pending.value ? pending.value[row.userId]! : row.override;

/** Niveau affiché : le réglage, sinon le défaut (propriétaires : modifier). */
const displayed = (row: AccessRow): AccessLevel => {
  if (row.locked === 'owner' || row.locked === 'org-owner') return 'write';
  return levelOf(row) ?? row.inherited;
};

const isDisabled = (row: AccessRow): boolean => !canManage.value || row.locked !== null;

const setLevel = (userId: string, level: AccessLevel | null) => {
  const row = rows.value.find(r => r.userId === userId);
  if (!row || isDisabled(row)) return;
  // Choisir la valeur par défaut revient à ne rien régler.
  const next = level !== null && row.override === null && level === row.inherited ? null : level;
  if (next === row.override) {
    const { [userId]: _, ...rest } = pending.value;
    pending.value = rest;
  } else {
    pending.value = { ...pending.value, [userId]: next };
  }
};

const hasChanges = computed(() => Object.keys(pending.value).length > 0);

const load = async () => {
  if (!openedOrg.value?.id) return;
  isLoading.value = true;
  pending.value = {};
  search.value = '';
  try {
    const res = await sfetch(endpoint.value);
    if (!res.ok) throw new Error();
    const data = await res.json();
    canManage.value = !!data.canManage;
    rows.value = data.members ?? [];
  } catch {
    toast.show('Erreur de chargement des accès', 'error');
    rows.value = [];
  } finally {
    isLoading.value = false;
  }
};

watch(() => [props.show, props.itemId] as const, ([show]) => { if (show) load(); }, { immediate: true });

const save = async () => {
  if (!hasChanges.value) return;
  isSaving.value = true;
  try {
    const access = Object.entries(pending.value).map(([userId, level]) => ({ userId, level: level ?? 'inherit' }));
    const res = await sfetch(endpoint.value, { method: 'PUT', body: JSON.stringify({ access }) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.show(err.error || 'Erreur de sauvegarde', 'error');
      return;
    }
    toast.show('Accès mis à jour', 'success');
    pending.value = {};
    emit('saved');
    emit('close');
  } catch {
    toast.show('Erreur de sauvegarde', 'error');
  } finally {
    isSaving.value = false;
  }
};
</script>
