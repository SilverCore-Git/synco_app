<template>
  <ul class="flex flex-col gap-3">
    <li
      v-for="link in links"
      :key="link.id"
      class="p-4 rounded-xl border border-(--border-color) bg-(--bg2)/20 flex flex-col gap-3"
      :class="{ 'opacity-60': statusOf(link).dead }"
    >
      <!-- Ligne principale -->
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" :class="modeStyle[link.mode].bg">
            <i :class="modeStyle[link.mode].icon" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-sm font-bold text-(--text)">{{ modeStyle[link.mode].label }}</span>
              <span class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md" :class="statusOf(link).class">{{ statusOf(link).label }}</span>
            </div>
            <p class="text-[11px] text-(--text2) truncate">
              <template v-if="showTarget">
                <i :class="link.folderId ? 'bi bi-folder' : 'bi bi-file-earmark'" class="mr-0.5" />{{ link.targetName ?? (link.folderId ? 'Dossier' : 'Fichier') }} ·
              </template>
              Par {{ $p(link.createdBy.name) }} · {{ formatDate(link.createdAt) }}
            </p>
          </div>
        </div>
        <div class="text-right text-[11px] text-(--text2) leading-relaxed">
          <div><i class="bi bi-clock mr-1" />{{ isExpired(link) ? 'Expiré le' : 'Expire le' }} {{ formatDate(link.expiresAt) }}</div>
          <div><i class="bi bi-download mr-1" />{{ link.downloadCount }}{{ link.maxDownloads ? ` / ${link.maxDownloads}` : '' }} téléchargement{{ link.downloadCount > 1 ? 's' : '' }}</div>
        </div>
      </div>

      <!-- Destinataires -->
      <div v-if="link.mode === 'USERS'" class="flex flex-wrap gap-1.5">
        <span
          v-for="r in link.recipients"
          :key="r.userId"
          class="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-(--text)/5 text-xs text-(--text)"
        >
          <img v-if="r.avatarUrl" :src="r.avatarUrl" class="w-5 h-5 rounded-full object-cover" />
          <span v-else class="w-5 h-5 rounded-full bg-(--primary)/20 text-(--primary) text-[10px] font-bold flex items-center justify-center uppercase">{{ r.name?.charAt(0) }}</span>
          {{ $p(r.name) }}
          <button
            v-if="!statusOf(link).dead && link.recipients.length > 1"
            class="text-(--text2) hover:text-red-500 ml-0.5"
            :title="`Retirer l'accès de ${r.name}`"
            @click="askRemoveRecipient(link, r.userId, r.name)"
          >
            <i class="bi bi-x" />
          </button>
        </span>
        <button
          v-if="!statusOf(link).dead && link.wrappedSecret"
          class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-dashed border-(--border-color) text-xs text-(--text2) hover:text-(--primary) hover:border-(--primary)"
          @click="addingTo = addingTo === link.id ? null : link.id"
        >
          <i class="bi bi-plus" />Ajouter
        </button>
      </div>
      <div v-if="addingTo === link.id" class="p-3 rounded-xl bg-(--bg2)/40 flex flex-col gap-2">
        <RecipientPicker v-model="newRecipients" :org-id="orgId" :exclude="link.recipients.map(r => r.userId)" />
        <div class="flex justify-end gap-2">
          <button class="px-3 py-1.5 rounded-lg text-xs text-(--text2) hover:bg-(--text)/5" @click="addingTo = null; newRecipients = []">Annuler</button>
          <button
            :disabled="!newRecipients.length || busy === link.id"
            class="px-3 py-1.5 rounded-lg bg-(--primary) text-white text-xs font-semibold disabled:opacity-40"
            @click="confirmAddRecipients(link)"
          >
            Donner l'accès
          </button>
        </div>
      </div>

      <!-- Éléments à mettre à jour -->
      <div v-if="!statusOf(link).dead && link.staleCount > 0" class="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-amber-500/10 text-xs text-(--text)">
        <span v-if="link.staleCount === 1"><i class="bi bi-arrow-repeat mr-1 text-amber-500" />1 fichier a été modifié depuis le partage et n'est plus servi : mettez le lien à jour.</span>
        <span v-else><i class="bi bi-arrow-repeat mr-1 text-amber-500" />{{ link.staleCount }} fichiers ont été modifiés depuis le partage et ne sont plus servis : mettez le lien à jour.</span>
      </div>

      <!-- Actions -->
      <div v-if="!statusOf(link).dead" class="flex flex-wrap items-center gap-1.5">
        <button
          class="action"
          :disabled="link.mode !== 'USERS' && !link.wrappedSecret"
          :title="link.mode !== 'USERS' && !link.wrappedSecret ? 'Réservé aux membres de l\'espace du fichier.' : ''"
          @click="copyLink(link)"
        >
          <i class="bi bi-clipboard" />Copier le lien
        </button>
        <button
          v-if="link.wrappedSecret && (link.staleCount > 0 || link.folderId)"
          class="action"
          :disabled="busy === link.id"
          @click="sync(link)"
        >
          <i class="bi bi-arrow-repeat" :class="{ 'animate-spin': busy === link.id }" />{{ link.folderId ? 'Synchroniser le dossier' : 'Mettre à jour' }}
        </button>
        <button class="action" @click="toggleJournal(link)">
          <i class="bi bi-journal-text" />Journal
        </button>
        <button class="action text-red-500! hover:bg-red-500/10!" @click="askRevoke(link)">
          <i class="bi bi-slash-circle" />Révoquer
        </button>
      </div>
      <div v-else>
        <button class="action" @click="toggleJournal(link)"><i class="bi bi-journal-text" />Journal</button>
      </div>

      <!-- Journal -->
      <div v-if="journalOf === link.id" class="rounded-lg bg-(--bg2)/40 p-3 max-h-48 overflow-y-auto">
        <div v-if="!journal" class="text-xs text-(--text2)">Chargement…</div>
        <div v-else-if="journal.length === 0" class="text-xs text-(--text2)">Aucun accès pour l'instant.</div>
        <ul v-else class="flex flex-col gap-1">
          <li v-for="(e, i) in journal" :key="i" class="flex items-center justify-between gap-3 text-xs">
            <span class="text-(--text)"><i :class="eventStyle[e.type]?.icon" class="mr-1.5" />{{ eventStyle[e.type]?.label ?? e.type }}<template v-if="e.userId"> · {{ nameOf(link, e.userId) }}</template></span>
            <span class="text-(--text2) shrink-0">{{ formatDateTime(e.createdAt) }}</span>
          </li>
        </ul>
      </div>
    </li>
  </ul>

  <ConfirmDelete
    :show="!!confirm"
    :item-name="confirm?.itemName ?? ''"
    :title="confirm?.title"
    :message="confirm?.message"
    :button-text="confirm?.button"
    :loading="confirmBusy"
    @cancel="confirm = null"
    @confirm="runConfirm"
  />
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { useToast } from '@/composables/useToast';
import { shareLinksApi, type RecipientCandidate, type ShareLinkEvent, type ShareLinkMode, type ShareLinkSummary } from '@/services/shareLinks/api';
import { addRecipients, revealLinkUrl, syncLinkItems } from '@/services/shareLinks/manage';
import RecipientPicker from './RecipientPicker.vue';

const props = defineProps<{ orgId: string; links: ShareLinkSummary[]; showTarget?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const toast = useToast();

const modeStyle: Record<ShareLinkMode, { label: string; icon: string; bg: string }> = {
  USERS: { label: 'Utilisateurs Synco', icon: 'bi bi-people', bg: 'bg-emerald-500/15 text-emerald-600' },
  PASSWORD: { label: 'Mot de passe', icon: 'bi bi-key', bg: 'bg-sky-500/15 text-sky-600' },
  PUBLIC: { label: 'Public', icon: 'bi bi-globe2', bg: 'bg-amber-500/15 text-amber-600' },
};

const eventStyle: Record<string, { label: string; icon: string }> = {
  OPEN: { label: 'Ouvert', icon: 'bi bi-eye' },
  DOWNLOAD: { label: 'Fichier téléchargé', icon: 'bi bi-download' },
  AUTH_FAILED: { label: 'Accès refusé (mauvais lien ou mot de passe)', icon: 'bi bi-x-octagon text-red-500' },
  SUSPENDED: { label: 'Suspendu après trop de tentatives', icon: 'bi bi-pause-circle text-red-500' },
  REVOKED: { label: 'Révoqué', icon: 'bi bi-slash-circle' },
};

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));
const formatDateTime = (iso: string) => dateTimeFormat.format(new Date(iso));
const isExpired = (link: ShareLinkSummary) => new Date(link.expiresAt).getTime() <= Date.now();

function statusOf(link: ShareLinkSummary): { label: string; class: string; dead: boolean } {
  if (link.revokedAt) return { label: 'Révoqué', class: 'bg-(--text)/10 text-(--text2)', dead: true };
  if (link.suspendedAt) return { label: 'Suspendu', class: 'bg-red-500/15 text-red-600', dead: true };
  if (isExpired(link)) return { label: 'Expiré', class: 'bg-(--text)/10 text-(--text2)', dead: true };
  if (link.maxDownloads !== null && link.downloadCount >= link.maxDownloads) return { label: 'Limite atteinte', class: 'bg-(--text)/10 text-(--text2)', dead: false };
  return { label: 'Actif', class: 'bg-emerald-500/15 text-emerald-600', dead: false };
}

const nameOf = (link: ShareLinkSummary, userId: string) =>
  link.recipients.find(r => r.userId === userId)?.name ?? (link.createdBy.id === userId ? link.createdBy.name : 'Utilisateur');

const busy = ref<string | null>(null);

async function copyLink(link: ShareLinkSummary) {
  try {
    await navigator.clipboard.writeText(await revealLinkUrl(link));
    toast.show(link.mode === 'PASSWORD' ? 'Lien copié (le mot de passe n\'est pas inclus)' : 'Lien copié', 'success');
  } catch (error) {
    toast.show(error instanceof Error ? error.message : 'Copie impossible.', 'error');
  }
}

async function sync(link: ShareLinkSummary) {
  busy.value = link.id;
  try {
    const { updated, removed, failed } = await syncLinkItems(props.orgId, link);
    toast.show(updated || removed ? `Lien mis à jour (${updated} ajouté${updated > 1 ? 's' : ''} ou rafraîchi${updated > 1 ? 's' : ''}, ${removed} retiré${removed > 1 ? 's' : ''})` : 'Le lien était déjà à jour.', failed.length ? 'warning' : 'success', 4000);
    emit('changed');
  } catch (error) {
    toast.show(error instanceof Error ? error.message : 'Mise à jour impossible.', 'error');
  } finally {
    busy.value = null;
  }
}

const addingTo = ref<string | null>(null);
const newRecipients = ref<RecipientCandidate[]>([]);

async function confirmAddRecipients(link: ShareLinkSummary) {
  busy.value = link.id;
  try {
    await addRecipients(props.orgId, link, newRecipients.value);
    toast.show('Accès donné. Les destinataires ont été prévenus.', 'success');
    addingTo.value = null;
    newRecipients.value = [];
    emit('changed');
  } catch (error) {
    toast.show(error instanceof Error ? error.message : 'Ajout impossible.', 'error');
  } finally {
    busy.value = null;
  }
}

const journalOf = ref<string | null>(null);
const journal = ref<ShareLinkEvent[] | null>(null);

async function toggleJournal(link: ShareLinkSummary) {
  if (journalOf.value === link.id) {
    journalOf.value = null;
    return;
  }
  journalOf.value = link.id;
  journal.value = null;
  try {
    journal.value = (await shareLinksApi.get(props.orgId, link.id)).events;
  } catch {
    journal.value = [];
  }
}

// ── Confirmations (jamais confirm() natif) ─────────────────────────────
interface PendingConfirm {
  title: string;
  message: string;
  itemName: string;
  button: string;
  run: () => Promise<unknown>;
  done: string;
}
const confirm = ref<PendingConfirm | null>(null);
const confirmBusy = ref(false);

function askRevoke(link: ShareLinkSummary) {
  confirm.value = {
    title: 'Révoquer ce lien ?',
    message: 'Plus personne ne pourra l\'ouvrir, et les téléchargements en cours seront interrompus. Cette action est définitive.',
    itemName: modeStyle[link.mode].label,
    button: 'Révoquer',
    run: () => shareLinksApi.revoke(props.orgId, link.id),
    done: 'Lien révoqué',
  };
}

function askRemoveRecipient(link: ShareLinkSummary, userId: string, name: string) {
  confirm.value = {
    title: `Retirer l'accès de ${name} ?`,
    message: 'Cette personne ne pourra plus ouvrir le lien, et un téléchargement en cours sera interrompu.',
    itemName: name,
    button: 'Retirer',
    run: () => shareLinksApi.update(props.orgId, link.id, { recipients: { remove: [userId] } }),
    done: 'Accès retiré',
  };
}

async function runConfirm() {
  if (!confirm.value) return;
  confirmBusy.value = true;
  try {
    await confirm.value.run();
    toast.show(confirm.value.done, 'success');
    emit('changed');
  } catch (error) {
    toast.show(error instanceof Error ? error.message : 'Action impossible.', 'error');
  } finally {
    confirmBusy.value = false;
    confirm.value = null;
  }
}
</script>

<style scoped>
@reference "@/style.css";

.action {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-(--text) bg-(--text)/5 hover:bg-(--text)/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
