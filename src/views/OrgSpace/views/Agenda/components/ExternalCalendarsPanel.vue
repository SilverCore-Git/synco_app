<template>
    <div class="calendars-section">
        <div class="calendars-header">
            <span class="calendars-title">Calendriers externes</span>
            <button type="button" class="icon-btn" title="Ajouter un calendrier externe" @click="openAddModal">
                <i class="bi bi-plus-lg"></i>
            </button>
        </div>

        <div v-if="connections.length === 0" class="empty-hint">
            Aucun calendrier externe connecté.
        </div>

        <label v-for="conn in connections" :key="conn.id" class="calendar-row">
            <input
                type="checkbox"
                :checked="isExternalCalendarVisible(props.orgId, conn.id)"
                @change="toggleExternalCalendarVisibility(props.orgId, conn.id); emit('changed')"
                class="w-3.5 h-3.5 rounded accent-(--primary) shrink-0"
            />
            <i class="bi shrink-0 text-[11px]" :class="[providerIcon(conn.provider), statusColorClass(conn.status)]"></i>
            <span class="calendar-name" :title="conn.externalAccountEmail || undefined">{{ displayName(conn) }}</span>
            <span
                v-if="conn.status !== 'ACTIVE'"
                class="level-badge"
                :class="conn.status === 'REVOKED' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'"
            >
                {{ conn.status === 'REVOKED' ? 'Déconnecté' : 'Erreur' }}
            </span>
            <DropDown align="right" content-iner-t-w="z-100 sdropdown min-w-[190px]">
                <template #trigger>
                    <!-- .prevent (pas .stop) : la ligne est un <label> associé à la
                         checkbox de visibilité (voir ci-dessus) — .stop empêcherait le
                         clic de remonter jusqu'au @click du DropDown lui-même (son
                         propre déclencheur d'ouverture, sur l'ancêtre triggerRef), donc
                         le menu ne s'ouvrirait jamais ; .prevent bloque uniquement
                         l'activation par défaut de la checkbox associée au <label>. -->
                    <button type="button" class="icon-btn shrink-0" @click.prevent title="Options">
                        <i class="bi bi-three-dots"></i>
                    </button>
                </template>

                <!-- #content, pas le slot par défaut : DropDown.vue ne rend que
                     <slot name="trigger"> et <slot name="content"> (voir DropDown.vue)
                     — du contenu passé sans template #content atterrit dans le slot
                     par défaut, que DropDown ne rend jamais nulle part. -->
                <template #content>
                    <template v-if="conn.provider === 'GOOGLE'">
                        <button v-if="conn.status === 'ACTIVE'" type="button" class="dropdown-item-style" @click="handleSync(conn.id)">
                            <i class="bi bi-arrow-repeat"></i> Synchroniser maintenant
                        </button>
                        <button v-else type="button" class="dropdown-item-style" @click="connectGoogle(props.orgId)">
                            <i class="bi bi-arrow-clockwise"></i> Reconnecter
                        </button>
                    </template>

                    <template v-else-if="conn.provider === 'ICS_URL'">
                        <button type="button" class="dropdown-item-style" @click="handleSync(conn.id)">
                            <i class="bi bi-arrow-repeat"></i> Synchroniser maintenant
                        </button>
                        <button type="button" class="dropdown-item-style" @click="openEditLink(conn)">
                            <i class="bi bi-pencil"></i> Modifier le lien
                        </button>
                    </template>

                    <button v-else type="button" class="dropdown-item-style" @click="triggerReplaceFile(conn.id)">
                        <i class="bi bi-upload"></i> Remplacer le fichier
                    </button>

                    <button type="button" class="dropdown-item-style" @click="handleDisconnect(conn.id)">
                        <i class="bi bi-x-circle"></i> Déconnecter
                    </button>
                </template>
            </DropDown>
        </label>

        <input
            ref="replaceFileInputEl"
            type="file"
            accept=".ics,text/calendar"
            class="hidden"
            @change="onReplaceFileChange"
        />

        <AddExternalCalendarModal
            :is-open="isAddModalOpen"
            :org-id="props.orgId"
            :edit-connection="editingConnection"
            @close="closeAddModal"
        />
    </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DropDown from '@/components/DropDown.vue';
import AddExternalCalendarModal from './AddExternalCalendarModal.vue';
import { useExternalCalendars } from '@/composables/useExternalCalendars';
import { useToast } from '@/composables/useToast';
import type { ExternalCalendarConnectionSummary, ExternalCalendarProvider, ExternalConnectionStatus } from '@/types/agenda';

const props = defineProps<{ orgId: string }>();
const emit = defineEmits<{ changed: [] }>();

const {
    connections, fetchConnections, connectGoogle, syncNow, disconnect, replaceIcsFile,
    isExternalCalendarVisible, toggleExternalCalendarVisibility
} = useExternalCalendars();

const route = useRoute();
const router = useRouter();

const isAddModalOpen = ref(false);
const editingConnection = ref<ExternalCalendarConnectionSummary | null>(null);
const replaceFileInputEl = ref<HTMLInputElement | null>(null);
const replaceTargetConnectionId = ref<string | null>(null);

function openAddModal() {
    editingConnection.value = null;
    isAddModalOpen.value = true;
}

function openEditLink(conn: ExternalCalendarConnectionSummary) {
    editingConnection.value = conn;
    isAddModalOpen.value = true;
}

function closeAddModal() {
    isAddModalOpen.value = false;
    editingConnection.value = null;
}

function statusColorClass(status: ExternalConnectionStatus): string {
    if (status === 'ACTIVE') return 'text-(--text2)';
    if (status === 'ERROR') return 'text-amber-500';
    return 'text-red-500';
}

function providerIcon(provider: ExternalCalendarProvider): string {
    if (provider === 'GOOGLE') return 'bi-google';
    if (provider === 'ICS_URL') return 'bi-link-45deg';
    return 'bi-file-earmark-text';
}

function displayName(conn: { label: string | null; externalAccountEmail: string | null; provider: ExternalCalendarProvider }): string {
    if (conn.label) return conn.label;
    if (conn.externalAccountEmail) return conn.externalAccountEmail;
    return conn.provider === 'GOOGLE' ? 'Compte Google' : 'Calendrier ICS';
}

async function handleSync(connectionId: string) {
    await syncNow(props.orgId, connectionId);
    emit('changed');
}

async function handleDisconnect(connectionId: string) {
    const ok = await disconnect(props.orgId, connectionId);
    if (ok) emit('changed');
}

function triggerReplaceFile(connectionId: string) {
    replaceTargetConnectionId.value = connectionId;
    replaceFileInputEl.value?.click();
}

async function onReplaceFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    const connectionId = replaceTargetConnectionId.value;
    input.value = '';
    replaceTargetConnectionId.value = null;
    if (!file || !connectionId) return;

    const ok = await replaceIcsFile(props.orgId, connectionId, file);
    if (ok) emit('changed');
}

// Retour de la redirection OAuth Google (voir googleCalendarIntegration.ts
// côté API, qui redirige ici avec ?googleCalendarConnected=1 ou
// ?googleCalendarError=...) — jamais montré deux fois, la query est nettoyée
// dès qu'elle a été lue.
onMounted(async () => {
    await fetchConnections(props.orgId);

    const connected = route.query.googleCalendarConnected;
    const error = route.query.googleCalendarError;

    if (connected) {
        useToast().show('Google Calendar connecté', 'success');
        await fetchConnections(props.orgId);
        emit('changed');
    } else if (error) {
        useToast().show(`Connexion Google Calendar échouée (${String(error)})`, 'error');
    }

    if (connected || error) {
        const { googleCalendarConnected, googleCalendarError, ...rest } = route.query;
        router.replace({ query: rest });
    }
});
</script>

<style scoped>
.calendars-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border-color);
}

.calendars-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 4px;
}

.calendars-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text2);
}

.empty-hint {
    font-size: 11px;
    color: var(--text2);
    padding: 4px 2px;
}

.icon-btn {
    color: var(--text2);
    padding: 4px;
    border-radius: 6px;
    font-size: 12px;
}
.icon-btn:hover {
    color: var(--text);
    background: rgba(255, 255, 255, 0.06);
}

.calendar-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 2px;
    cursor: pointer;
}

.calendar-name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.level-badge {
    font-size: 9px;
    font-weight: 700;
    border-radius: 999px;
    padding: 1px 6px;
    flex-shrink: 0;
}
</style>
