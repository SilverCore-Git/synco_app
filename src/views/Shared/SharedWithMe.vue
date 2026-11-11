<template>
    <div class="h-full flex flex-col overflow-hidden bg-(--bg2) text-(--text)">

        <nav class="shrink-0 bg-(--bg)/80 backdrop-blur-xl border-b border-(--text)/5 px-6 py-4">
            <div class="max-w-4xl mx-auto flex items-center gap-4">
                <router-link :to="linkId ? '/shared' : '/'" class="p-2 hover:bg-(--text)/5 rounded-xl transition-colors">
                    <i class="bi bi-arrow-left text-xl" />
                </router-link>
                <h1 class="text-xl font-black uppercase tracking-wider">Partagés avec moi</h1>
            </div>
        </nav>

        <main class="flex-1 min-h-0 overflow-y-auto">
            <div class="max-w-4xl mx-auto p-6 flex flex-col gap-4">

                <div v-if="loading" class="flex justify-center py-10"><SpinLoader /></div>

                <p v-else-if="error" class="text-center py-16 text-(--text2)">
                    <i class="bi bi-link-45deg text-4xl block mb-3 opacity-40" />{{ error }}
                </p>

                <!-- Un lien ouvert -->
                <template v-else-if="linkId && opened">
                    <div class="flex flex-wrap items-center justify-between gap-3 bg-(--bg) border border-(--border-color) rounded-2xl p-5">
                        <div class="flex items-center gap-3 min-w-0">
                            <div class="w-11 h-11 rounded-xl bg-emerald-500/15 text-emerald-600 flex items-center justify-center shrink-0">
                                <i :class="opened.link.kind === 'folder' ? 'bi bi-folder2-open' : 'bi bi-file-earmark-lock2'" class="text-xl" />
                            </div>
                            <div class="min-w-0">
                                <h2 class="font-bold truncate">{{ received?.organization ? received.organization.name : 'Partage' }}</h2>
                                <p class="text-xs text-(--text2)">
                                    <template v-if="received">Partagé par {{ $p(received.sharedBy.name) }} · </template>
                                    Disponible jusqu'au {{ formatDate(opened.link.expiresAt) }}
                                </p>
                            </div>
                        </div>
                        <button
                            v-if="opened.items.length > 1"
                            class="primary flex items-center gap-2"
                            @click="downloadAll"
                        >
                            <i class="bi bi-download" /> Tout télécharger
                        </button>
                    </div>

                    <p v-if="opened.unreadable" class="text-xs text-amber-600">
                        <i class="bi bi-exclamation-triangle mr-1" />{{ opened.unreadable }} élément{{ opened.unreadable > 1 ? 's' : '' }} illisible{{ opened.unreadable > 1 ? 's' : '' }} : {{ opened.unreadable > 1 ? 'ils ont' : 'il a' }} été écarté{{ opened.unreadable > 1 ? 's' : '' }}.
                    </p>

                    <p v-if="opened.items.length === 0" class="text-center py-10 text-(--text2)">Ce partage ne contient plus aucun fichier disponible.</p>

                    <ul class="flex flex-col gap-2">
                        <li
                            v-for="item in opened.items"
                            :key="item.payload.id"
                            class="flex items-center gap-3 bg-(--bg) border border-(--border-color) rounded-xl p-3"
                        >
                            <i class="bi bi-file-earmark text-xl text-(--text2) shrink-0" />
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-semibold truncate">{{ item.meta.name }}</div>
                                <div class="text-[11px] text-(--text2) truncate">
                                    <template v-if="item.meta.path"><i class="bi bi-folder mr-0.5" />{{ item.meta.path }} · </template>{{ formatSize(item.meta.size) }}
                                </div>
                            </div>
                            <button class="p-2 rounded-lg hover:bg-(--primary)/10 hover:text-(--primary)" :title="`Télécharger ${item.meta.name}`" @click="download(item)">
                                <i class="bi bi-download text-lg" />
                            </button>
                        </li>
                    </ul>

                    <p class="text-[11px] text-(--text2) text-center mt-2">
                        <i class="bi bi-lock mr-1" />Déchiffré sur cet appareil : Synco n'a jamais accès au contenu.
                    </p>
                </template>

                <!-- Liste -->
                <template v-else>
                    <p v-if="links.length === 0" class="text-center text-(--text2) py-16">
                        <i class="bi bi-inbox text-4xl block mb-3 opacity-40" />Personne ne vous a encore partagé de fichier.
                    </p>
                    <router-link
                        v-for="l in links"
                        :key="l.id"
                        :to="`/shared/${l.id}`"
                        class="flex items-center gap-4 bg-(--bg) border border-(--border-color) rounded-xl p-4 hover:border-(--primary)/40 transition-colors"
                    >
                        <div class="w-10 h-10 rounded-xl bg-(--primary)/10 text-(--primary) flex items-center justify-center shrink-0">
                            <i :class="l.kind === 'folder' ? 'bi bi-folder2' : 'bi bi-file-earmark'" class="text-lg" />
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="font-bold truncate">{{ l.kind === 'folder' ? 'Dossier' : 'Fichier' }} de {{ l.organization.name }}</div>
                            <div class="text-xs text-(--text2)">Partagé par {{ $p(l.sharedBy.name) }} · {{ formatDate(l.sharedAt) }} · expire le {{ formatDate(l.expiresAt) }}</div>
                        </div>
                        <i class="bi bi-chevron-right text-(--text2)" />
                    </router-link>
                </template>
            </div>
        </main>
    </div>
</template>

<script lang="ts" setup>
import { ref, watch } from 'vue';
import SpinLoader from '@/components/SpinLoader.vue';
import { useToast } from '@/composables/useToast';
import { E2EEUnloked } from '@/assets/utils/crypto';
import { saveBlob } from '@/assets/utils/downloadFile';
import { safeFileName } from '@/assets/utils/linkCrypto';
import { shareLinksApi, type ReceivedLink } from '@/services/shareLinks/api';
import { openReceivedLink } from '@/services/shareLinks/manage';
import { downloadLinkItem, type OpenedLinkItem } from '@/services/shareLinks/linkDownload';
import { BlobSink, pickFileSystemSink, type DownloadSink } from '@/services/transfers/chunkedDownloadCore';
import { enqueueTransfer, isAbortError } from '@/services/transfers/transferManager';

const props = defineProps<{ linkId?: string }>();
const toast = useToast();

const loading = ref(true);
const error = ref('');
const links = ref<ReceivedLink[]>([]);
const received = ref<ReceivedLink | null>(null);
const opened = ref<Awaited<ReturnType<typeof openReceivedLink>> | null>(null);

const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso));
const formatSize = (bytes: number) => {
    const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: unit ? 1 : 0 })} ${units[unit]}`;
};

async function load() {
    loading.value = true;
    error.value = '';
    opened.value = null;
    try {
        links.value = await shareLinksApi.received();
        if (props.linkId) {
            received.value = links.value.find(l => l.id === props.linkId) ?? null;
            if (!E2EEUnloked.value) throw new Error('Déverrouillez le chiffrement de bout en bout pour ouvrir ce partage.');
            opened.value = await openReceivedLink(props.linkId);
        }
    } catch (e) {
        error.value = e instanceof Error && e.message ? e.message : 'Ce lien est invalide, expiré, ou ne vous est pas destiné.';
    } finally {
        loading.value = false;
    }
}

watch(() => [props.linkId, E2EEUnloked.value], () => { void load(); }, { immediate: true });

// Au-delà, écriture directe sur le disque si le navigateur le permet (comme downloadFile.ts).
const STREAM_TO_DISK_THRESHOLD = 256 * 1024 * 1024;

async function download(item: OpenedLinkItem) {
    if (!opened.value || !props.linkId) return;
    const { kek } = opened.value;
    const linkId = props.linkId;
    const name = safeFileName(item.meta.name);

    let fsSink: DownloadSink | null = null;
    if (item.meta.size >= STREAM_TO_DISK_THRESHOLD) {
        const picked = await pickFileSystemSink(name);
        if (picked === 'cancelled') return;
        fsSink = picked;
    }

    const { promise } = enqueueTransfer('download', name, item.meta.size, async (handle) => {
        const sink = fsSink ?? new BlobSink();
        try {
            await downloadLinkItem({
                linkId,
                kek,
                item,
                requestTicket: () => shareLinksApi.downloadReceived(linkId, item.payload.id),
                sink,
                signal: handle.signal,
                onProgress: (loaded) => handle.setLoaded(loaded),
            });
            handle.setFinalizing();
            await sink.close();
        } catch (e) {
            await sink.abort();
            throw e;
        }
        // Type générique : le contenu partagé n'est jamais interprété par le navigateur.
        if (sink instanceof BlobSink) saveBlob(sink.toBlob('application/octet-stream'), name);
    });

    promise.catch((e) => {
        if (isAbortError(e)) return;
        console.error('[shared] téléchargement :', e);
        toast.show(e instanceof Error && e.message ? e.message : `Erreur lors du téléchargement de « ${name} ».`, 'error', 5000);
    });
}

async function downloadAll() {
    for (const item of opened.value?.items ?? []) await download(item);
}
</script>
