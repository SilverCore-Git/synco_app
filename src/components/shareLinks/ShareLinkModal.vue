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
      @click.self="close"
    >
      <div class="bg-(--bg) rounded-2xl border border-(--text)/10 shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col relative overflow-hidden" @click.stop>

        <!-- En-tête -->
        <header class="flex items-center justify-between px-6 py-4 border-b border-(--border-color) shrink-0">
          <div class="flex items-center gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl bg-(--primary)/10 flex items-center justify-center shrink-0">
              <i class="bi bi-link-45deg text-(--primary) text-xl" />
            </div>
            <div class="min-w-0">
              <h2 class="text-lg font-bold text-(--text)">Liens de téléchargement</h2>
              <p class="text-xs text-(--text2) truncate">
                <i :class="itemType === 'folder' ? 'bi bi-folder' : 'bi bi-file-earmark'" class="mr-1" />{{ itemName }}
              </p>
            </div>
          </div>
          <button class="text-(--text2) hover:text-(--text) transition-colors p-2 rounded-lg hover:bg-(--text)/5" @click="close">
            <i class="bi bi-x-lg text-xl" />
          </button>
        </header>

        <!-- Onglets -->
        <nav class="flex gap-1 px-6 pt-3 shrink-0">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
            :class="tab === t.id ? 'bg-(--primary)/10 text-(--primary)' : 'text-(--text2) hover:bg-(--text)/5'"
            @click="tab = t.id"
          >
            <i :class="t.icon" class="mr-1.5" />{{ t.label }}
          </button>
        </nav>

        <main class="flex-1 overflow-y-auto p-6">

          <!-- ═══ Nouveau lien ═══ -->
          <section v-if="tab === 'create'">

            <!-- Lien créé -->
            <div v-if="created" class="flex flex-col gap-4">
              <div class="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <i class="bi bi-check-circle-fill text-emerald-500 text-xl" />
                <div class="text-sm text-(--text)">
                  <b>Lien créé</b> — {{ created.itemCount }} fichier{{ created.itemCount > 1 ? 's' : '' }}.
                  <template v-if="created.mode === 'USERS'">Les destinataires ont été prévenus.</template>
                </div>
              </div>

              <div>
                <label class="block text-xs font-semibold text-(--text2) mb-1.5">Adresse du lien</label>
                <div class="flex gap-2">
                  <input :value="created.url" readonly class="flex-1 min-w-0 px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) font-mono" @focus="($event.target as HTMLInputElement).select()" />
                  <button class="px-3 py-2 rounded-lg bg-(--primary) text-white text-sm font-semibold hover:opacity-90" @click="copy(created.url)">
                    <i class="bi bi-clipboard mr-1" />Copier
                  </button>
                </div>
                <p v-if="created.mode === 'PUBLIC'" class="text-[11px] text-(--text2) mt-1.5">
                  <i class="bi bi-exclamation-triangle mr-1 text-amber-500" />Toute personne qui a cette adresse peut télécharger. Ne la publiez pas.
                </p>
                <p v-else-if="created.mode === 'PASSWORD'" class="text-[11px] text-(--text2) mt-1.5">
                  <i class="bi bi-key mr-1" />Transmettez le mot de passe par un autre canal que l'adresse.
                </p>
                <p v-else class="text-[11px] text-(--text2) mt-1.5">
                  <i class="bi bi-shield-check mr-1" />Cette adresse ne contient aucun secret : seuls les destinataires choisis peuvent l'ouvrir, connectés à Synco.
                </p>
              </div>

              <div v-if="created.excluded || created.failed.length || created.truncated" class="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-(--text) flex flex-col gap-1">
                <span v-if="created.excluded"><i class="bi bi-person-lock mr-1" />{{ created.excluded }} fichier{{ created.excluded > 1 ? 's' : '' }} non inclus : ils appartiennent à quelqu'un dont le rôle est au-dessus du vôtre.</span>
                <span v-if="created.failed.length"><i class="bi bi-exclamation-octagon mr-1" />Non inclus (clé illisible) : {{ created.failed.join(', ') }}</span>
                <span v-if="created.truncated"><i class="bi bi-scissors mr-1" />Le dossier dépasse 500 fichiers : seuls les 500 premiers sont partagés.</span>
              </div>

              <div class="flex justify-end gap-2">
                <button class="px-4 py-2 rounded-lg text-sm text-(--text2) hover:bg-(--text)/5" @click="resetForm">Créer un autre lien</button>
                <button class="px-4 py-2 rounded-lg text-sm font-semibold bg-(--text)/5 text-(--text) hover:bg-(--text)/10" @click="tab = 'links'">Voir les liens</button>
              </div>
            </div>

            <!-- Formulaire -->
            <form v-else class="flex flex-col gap-5" @submit.prevent="create">

              <div>
                <label class="block text-xs font-semibold text-(--text2) mb-2">Qui peut télécharger ?</label>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    v-for="m in modes"
                    :key="m.id"
                    type="button"
                    class="text-left p-3 rounded-xl border transition-all"
                    :class="mode === m.id ? 'border-(--primary) bg-(--primary)/8 ring-2 ring-(--primary)/20' : 'border-(--border-color) hover:border-(--text)/20'"
                    @click="mode = m.id"
                  >
                    <i :class="[m.icon, mode === m.id ? 'text-(--primary)' : 'text-(--text2)']" class="text-lg" />
                    <div class="text-sm font-bold text-(--text) mt-1">{{ m.label }}</div>
                    <div class="text-[11px] text-(--text2) leading-snug mt-0.5">{{ m.hint }}</div>
                  </button>
                </div>
              </div>

              <!-- Mot de passe -->
              <div v-if="mode === 'PASSWORD'" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-(--text2) mb-1.5">Mot de passe</label>
                  <input v-model="password" type="password" autocomplete="new-password" minlength="10" class="w-full px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary)" />
                </div>
                <div>
                  <label class="block text-xs font-semibold text-(--text2) mb-1.5">Confirmation</label>
                  <input v-model="passwordConfirm" type="password" autocomplete="new-password" class="w-full px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary)" />
                </div>
                <p class="sm:col-span-2 text-[11px]" :class="passwordError ? 'text-red-500' : 'text-(--text2)'">
                  {{ passwordError || 'Au moins 10 caractères. Il n\'est jamais envoyé à Synco : sans lui, le contenu reste illisible, même pour nous.' }}
                </p>
              </div>

              <!-- Destinataires -->
              <div v-if="mode === 'USERS'">
                <RecipientPicker v-model="recipients" :org-id="orgId" />
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-semibold text-(--text2) mb-1.5">Expire dans</label>
                  <select v-model.number="expiryDays" class="w-full px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary)">
                    <option v-for="d in expiryChoices" :key="d.days" :value="d.days">{{ d.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-(--text2) mb-1.5">Téléchargements maximum</label>
                  <input v-model.number="maxDownloads" type="number" min="1" max="10000" placeholder="Illimité" class="w-full px-3 py-2 bg-(--bg2) border border-(--border-color) rounded-lg text-sm text-(--text) outline-none focus:border-(--primary)" />
                </div>
              </div>

              <p v-if="formError" class="text-sm text-red-500"><i class="bi bi-exclamation-circle mr-1" />{{ formError }}</p>

              <div class="flex items-center justify-between gap-3">
                <p class="text-[11px] text-(--text2) leading-snug">
                  <i class="bi bi-lock mr-1" />Chiffré de bout en bout : la clé du lien est créée sur cet appareil et Synco ne la reçoit jamais.
                </p>
                <button
                  type="submit"
                  :disabled="!canSubmit || creating"
                  class="shrink-0 px-4 py-2 rounded-lg bg-(--primary) text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <span v-if="creating" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <i v-else class="bi bi-link-45deg" />
                  Créer le lien
                </button>
              </div>
            </form>
          </section>

          <!-- ═══ Liens existants ═══ -->
          <section v-else>
            <div v-if="loadingLinks" class="flex justify-center py-12">
              <div class="w-8 h-8 border-2 border-(--primary)/30 border-t-(--primary) rounded-full animate-spin" />
            </div>
            <div v-else-if="links.length === 0" class="text-center py-12 text-sm text-(--text2)">
              <i class="bi bi-link-45deg text-3xl block mb-2 opacity-40" />
              Aucun lien pour {{ itemType === 'folder' ? 'ce dossier' : 'ce fichier' }}.
            </div>
            <ShareLinkList v-else :org-id="orgId" :links="links" @changed="loadLinks" />
          </section>

        </main>
      </div>
    </div>
  </transition>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useToast } from '@/composables/useToast';
import { shareLinksApi, type RecipientCandidate, type ShareLinkMode, type ShareLinkSummary } from '@/services/shareLinks/api';
import { createShareLink, type CreatedShareLink } from '@/services/shareLinks/manage';
import RecipientPicker from './RecipientPicker.vue';
import ShareLinkList from './ShareLinkList.vue';

const props = defineProps<{
  show: boolean;
  orgId: string;
  itemType: 'file' | 'folder';
  itemId: string;
  itemName: string;
}>();
const emit = defineEmits<{ close: [] }>();
const toast = useToast();

const tabs = [
  { id: 'create' as const, label: 'Nouveau lien', icon: 'bi bi-plus-lg' },
  { id: 'links' as const, label: 'Liens existants', icon: 'bi bi-list-ul' },
];
const tab = ref<'create' | 'links'>('create');

const modes: { id: ShareLinkMode; label: string; hint: string; icon: string }[] = [
  { id: 'USERS', label: 'Utilisateurs Synco', hint: 'Les comptes choisis, connectés. Le plus sûr.', icon: 'bi bi-people' },
  { id: 'PASSWORD', label: 'Mot de passe', hint: 'Le lien et le mot de passe.', icon: 'bi bi-key' },
  { id: 'PUBLIC', label: 'Public', hint: 'Toute personne qui a le lien.', icon: 'bi bi-globe2' },
];
const expiryChoices = [
  { days: 1, label: '1 jour' },
  { days: 7, label: '7 jours' },
  { days: 30, label: '30 jours' },
  { days: 90, label: '90 jours (maximum)' },
];

const mode = ref<ShareLinkMode>('USERS');
const password = ref('');
const passwordConfirm = ref('');
const recipients = ref<RecipientCandidate[]>([]);
const expiryDays = ref(7);
const maxDownloads = ref<number | ''>('');
const creating = ref(false);
const formError = ref('');
const created = ref<(CreatedShareLink & { mode: ShareLinkMode }) | null>(null);

const passwordError = computed(() => {
  if (mode.value !== 'PASSWORD' || !password.value) return '';
  if (password.value.length < 10) return 'Au moins 10 caractères.';
  if (passwordConfirm.value && passwordConfirm.value !== password.value) return 'Les deux mots de passe diffèrent.';
  return '';
});

const canSubmit = computed(() => {
  if (mode.value === 'PASSWORD') return password.value.length >= 10 && password.value === passwordConfirm.value;
  if (mode.value === 'USERS') return recipients.value.length > 0;
  return true;
});

const target = computed(() => (props.itemType === 'file' ? { fileId: props.itemId } : { folderId: props.itemId }));

function resetForm() {
  password.value = '';
  passwordConfirm.value = '';
  recipients.value = [];
  maxDownloads.value = '';
  expiryDays.value = 7;
  formError.value = '';
  created.value = null;
}

async function create() {
  if (!canSubmit.value || creating.value) return;
  creating.value = true;
  formError.value = '';
  try {
    const result = await createShareLink({
      orgId: props.orgId,
      target: target.value,
      mode: mode.value,
      expiresAt: new Date(Date.now() + expiryDays.value * 24 * 3600 * 1000),
      maxDownloads: typeof maxDownloads.value === 'number' && maxDownloads.value > 0 ? maxDownloads.value : null,
      password: mode.value === 'PASSWORD' ? password.value : undefined,
      recipients: mode.value === 'USERS' ? recipients.value : undefined,
    });
    created.value = { ...result, mode: mode.value };
    password.value = '';
    passwordConfirm.value = '';
    void loadLinks();
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'Le lien n\'a pas pu être créé.';
  } finally {
    creating.value = false;
  }
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.show('Lien copié', 'success');
  } catch {
    toast.show('Copie impossible : sélectionnez l\'adresse et copiez-la.', 'warning');
  }
}

const links = ref<ShareLinkSummary[]>([]);
const loadingLinks = ref(false);

async function loadLinks() {
  loadingLinks.value = links.value.length === 0;
  try {
    links.value = await shareLinksApi.list(props.orgId, { ...target.value, scope: 'all' });
  } catch (error) {
    toast.show(error instanceof Error ? error.message : 'Liens indisponibles.', 'error');
  } finally {
    loadingLinks.value = false;
  }
}

watch(() => props.show, (open) => {
  if (!open) return;
  resetForm();
  tab.value = 'create';
  links.value = [];
  void loadLinks();
}, { immediate: true });

function close() {
  password.value = '';
  passwordConfirm.value = '';
  emit('close');
}
</script>
