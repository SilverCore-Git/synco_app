<template>
  <main class="min-h-screen flex items-start sm:items-center justify-center px-4 py-10">
    <div class="w-full max-w-xl">

      <section class="rounded-3xl border border-(--border) bg-(--card) shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] overflow-hidden">

        <!-- En-tête -->
        <header class="px-7 pt-7 pb-5 flex items-center gap-4">
          <div class="w-12 h-12 rounded-2xl bg-(--primary)/12 text-(--primary) flex items-center justify-center shrink-0">
            <svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2.5" /><path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
          </div>
          <div class="min-w-0">
            <h1 class="text-lg font-bold tracking-tight">{{ title }}</h1>
            <p class="text-xs text-(--text2)">Chiffré de bout en bout · déchiffré sur votre appareil</p>
          </div>
        </header>

        <div class="px-7 pb-7">

          <!-- Chargement -->
          <div v-if="state === 'loading'" class="py-10 flex justify-center">
            <span class="w-7 h-7 border-2 border-(--primary)/25 border-t-(--primary) rounded-full animate-spin" />
          </div>

          <!-- Indisponible -->
          <p v-else-if="state === 'unavailable'" class="py-6 text-sm text-(--text2) leading-relaxed">
            {{ message || 'Ce lien est invalide ou a expiré.' }}
            Demandez un nouveau lien à la personne qui vous l'a envoyé.
          </p>

          <!-- Réservé à des comptes Synco -->
          <div v-else-if="state === 'users'" class="py-4 flex flex-col gap-4">
            <p class="text-sm text-(--text2) leading-relaxed">
              Ce partage est réservé à des comptes Synco précis. Connectez-vous à Synco avec le compte qui l'a reçu, puis ouvrez « Partagés avec moi ».
            </p>
            <a v-if="appUrl" :href="appUrl" rel="noopener noreferrer" class="self-start inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-(--primary) text-white text-sm font-semibold hover:opacity-90">
              Ouvrir dans Synco
            </a>
          </div>

          <!-- Mot de passe -->
          <form v-else-if="state === 'password'" class="py-2 flex flex-col gap-3" @submit.prevent="unlock">
            <label for="pw" class="text-sm text-(--text2)">Ce partage est protégé par un mot de passe.</label>
            <input
              id="pw"
              v-model="password"
              type="password"
              autocomplete="off"
              autofocus
              class="w-full px-4 py-3 rounded-xl bg-(--bg) border border-(--border) text-(--text) outline-none focus:border-(--primary)"
            />
            <p v-if="message" class="text-xs text-red-500">{{ message }}</p>
            <button
              type="submit"
              :disabled="!password || busy"
              class="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-(--primary) text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40"
            >
              <span v-if="busy" class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Déverrouiller
            </button>
          </form>

          <!-- Fichiers -->
          <div v-else-if="state === 'ready'" class="flex flex-col gap-4">
            <p v-if="unreadable" class="text-xs text-amber-600">{{ unreadable }} élément(s) illisible(s) ont été écartés.</p>
            <p v-if="items.length === 0" class="py-6 text-sm text-(--text2)">Ce partage ne contient plus aucun fichier disponible.</p>

            <ul class="flex flex-col divide-y divide-(--border) rounded-2xl border border-(--border) overflow-hidden">
              <li v-for="item in items" :key="item.payload.id" class="flex items-center gap-3 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-semibold truncate">{{ item.meta.name }}</div>
                  <div class="text-[11px] text-(--text2) truncate">
                    <template v-if="item.meta.path">{{ item.meta.path }} · </template>{{ formatSize(item.meta.size) }}
                    <template v-if="progress[item.payload.id]?.status === 'running'"> · {{ percent(item) }} %</template>
                    <template v-else-if="progress[item.payload.id]?.status === 'done'"> · téléchargé</template>
                  </div>
                  <p v-if="progress[item.payload.id]?.status === 'error'" class="text-[11px] text-red-500 mt-0.5">{{ progress[item.payload.id]?.error }}</p>
                  <div v-if="progress[item.payload.id]?.status === 'running'" class="h-1 mt-1.5 rounded-full bg-(--border) overflow-hidden">
                    <div class="h-full bg-(--primary) transition-[width]" :style="{ width: `${percent(item)}%` }" />
                  </div>
                </div>
                <button
                  class="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center hover:bg-(--primary)/10 hover:text-(--primary) disabled:opacity-40"
                  :disabled="progress[item.payload.id]?.status === 'running'"
                  :aria-label="`Télécharger ${item.meta.name}`"
                  @click="download(item)"
                >
                  <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />
                  </svg>
                </button>
              </li>
            </ul>

            <div class="flex items-center justify-between gap-3">
              <span class="text-[11px] text-(--text2)">Disponible jusqu'au {{ expiresLabel }}</span>
              <button
                v-if="items.length > 1"
                class="px-4 py-2.5 rounded-xl bg-(--primary) text-white text-sm font-semibold hover:opacity-90 disabled:opacity-40"
                :disabled="downloadingAll"
                @click="downloadAll"
              >
                Tout télécharger
              </button>
            </div>
          </div>
        </div>
      </section>

      <p class="text-center text-[11px] text-(--text2) mt-5 leading-relaxed px-6">
        Le serveur ne voit jamais le contenu ni les noms des fichiers. Ce contenu n'a pas été vérifié : n'ouvrez que des fichiers que vous attendiez.
      </p>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { deriveLinkKeys, derivePasswordKey, parseLinkLocation, safeFileName } from '@/assets/utils/linkCrypto';
import { downloadLinkItem, openLinkItems, type OpenedLinkItem } from '@/services/shareLinks/linkDownload';
import { BlobSink, pickFileSystemSink, type DownloadSink } from '@/services/transfers/chunkedDownloadCore';
import { LinkUnavailableError, TooManyAttemptsError, publicApi } from './publicApi';

type State = 'loading' | 'unavailable' | 'users' | 'password' | 'ready';

const state = ref<State>('loading');
const message = ref('');
const busy = ref(false);
const password = ref('');
const appUrl = String(import.meta.env.VITE_APP_URL ?? '').replace(/\/+$/, '');

let linkId = '';
let secret: Uint8Array | null = null;
let kdf: { salt: string; iterations: number } | null = null;
let kek: CryptoKey | null = null;
let auth = '';

const items = ref<OpenedLinkItem[]>([]);
const unreadable = ref(0);
const expiresAt = ref('');
const kind = ref<'file' | 'folder'>('file');

const title = computed(() => {
  if (state.value !== 'ready') return 'Fichier partagé';
  return kind.value === 'folder' ? `${items.value.length} fichier${items.value.length > 1 ? 's' : ''} partagé${items.value.length > 1 ? 's' : ''}` : 'Fichier partagé';
});
const expiresLabel = computed(() => (expiresAt.value
  ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(expiresAt.value))
  : ''));

const formatSize = (bytes: number) => {
  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
};

function fail(error: unknown) {
  state.value = 'unavailable';
  message.value = error instanceof LinkUnavailableError ? '' : error instanceof Error ? error.message : '';
}

/** Dérive les clés, ouvre le lien ; le secret ne sert plus ensuite. */
async function openWith(passwordKey: Uint8Array | null) {
  const keys = await deriveLinkKeys(linkId, secret!, passwordKey);
  passwordKey?.fill(0);
  const opened = await publicApi.open(linkId, keys.auth);
  kek = keys.kek;
  auth = keys.auth;
  secret?.fill(0);
  secret = null;
  const result = await openLinkItems(opened.items, kek, linkId);
  items.value = result.opened;
  unreadable.value = result.unreadable;
  expiresAt.value = opened.expiresAt;
  kind.value = opened.kind;
  state.value = 'ready';
}

onMounted(async () => {
  const parsed = parseLinkLocation(window.location.pathname, window.location.hash);
  // Le secret quitte la barre d'adresse (historique, capture, copie) : il ne vit plus qu'en mémoire.
  if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  if (!parsed) return fail(new LinkUnavailableError());
  linkId = parsed.linkId;
  secret = parsed.secret;

  try {
    const info = await publicApi.info(linkId);
    if (info.mode === 'USERS') {
      state.value = 'users';
      return;
    }
    if (!secret) return fail(new LinkUnavailableError());
    if (info.mode === 'PASSWORD') {
      if (!info.kdf) return fail(new LinkUnavailableError());
      kdf = { salt: info.kdf.salt, iterations: info.kdf.iterations };
      state.value = 'password';
      return;
    }
    await openWith(null);
  } catch (error) {
    fail(error);
  }
});

async function unlock() {
  if (!password.value || busy.value || !secret || !kdf) return;
  busy.value = true;
  message.value = '';
  try {
    await openWith(await derivePasswordKey(password.value, kdf));
    password.value = '';
  } catch (error) {
    if (error instanceof LinkUnavailableError) message.value = 'Mot de passe incorrect, ou lien expiré.';
    else if (error instanceof TooManyAttemptsError) message.value = error.message;
    else message.value = error instanceof Error ? error.message : 'Déverrouillage impossible.';
  } finally {
    busy.value = false;
  }
}

// ── Téléchargements ──────────────────────────────────────────────────────
const progress = reactive<Record<string, { status: 'running' | 'done' | 'error'; loaded: number; error?: string }>>({});
const percent = (item: OpenedLinkItem) =>
  item.meta.size ? Math.min(100, Math.round(((progress[item.payload.id]?.loaded ?? 0) / item.meta.size) * 100)) : 100;

const STREAM_TO_DISK_THRESHOLD = 256 * 1024 * 1024;

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function download(item: OpenedLinkItem) {
  if (!kek) return;
  const id = item.payload.id;
  const name = safeFileName(item.meta.name);

  let sink: DownloadSink = new BlobSink();
  if (item.meta.size >= STREAM_TO_DISK_THRESHOLD) {
    const picked = await pickFileSystemSink(name);
    if (picked === 'cancelled') return;
    if (picked) sink = picked;
  }

  progress[id] = { status: 'running', loaded: 0 };
  try {
    await downloadLinkItem({
      linkId,
      kek,
      item,
      requestTicket: () => publicApi.download(linkId, id, auth),
      sink,
      signal: new AbortController().signal,
      onProgress: (loaded) => { progress[id]!.loaded = loaded; },
    });
    await sink.close();
    // Type générique : le navigateur enregistre, il n'interprète jamais le contenu.
    if (sink instanceof BlobSink) save(sink.toBlob('application/octet-stream'), name);
    progress[id] = { status: 'done', loaded: item.meta.size };
  } catch (error) {
    await sink.abort();
    progress[id] = {
      status: 'error',
      loaded: 0,
      error: error instanceof LinkUnavailableError ? 'Lien expiré ou limite de téléchargements atteinte.' : error instanceof Error ? error.message : 'Téléchargement impossible.',
    };
  }
}

const downloadingAll = ref(false);
async function downloadAll() {
  downloadingAll.value = true;
  try {
    for (const item of items.value) {
      if (progress[item.payload.id]?.status !== 'done') await download(item);
    }
  } finally {
    downloadingAll.value = false;
  }
}
</script>
