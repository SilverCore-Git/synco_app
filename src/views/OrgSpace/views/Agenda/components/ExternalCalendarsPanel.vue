<template>
    <div class="calendars-section">
        <div class="calendars-header">
            <span class="calendars-title">Calendriers externes</span>
            <button type="button" class="icon-btn" title="Connecter Google Calendar" @click="connectGoogle(props.orgId)">
                <i class="bi bi-plus-lg"></i>
            </button>
        </div>

        <div v-if="connections.length === 0" class="empty-hint">
            Aucun calendrier externe connecté.
        </div>

        <div v-for="conn in connections" :key="conn.id" class="calendar-row">
            <i class="bi bi-google shrink-0 text-[11px]" :class="statusColorClass(conn.status)"></i>
            <span class="calendar-name" :title="conn.externalAccountEmail">{{ conn.label || conn.externalAccountEmail }}</span>
            <span
                v-if="conn.status !== 'ACTIVE'"
                class="level-badge"
                :class="conn.status === 'REVOKED' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'"
            >
                {{ conn.status === 'REVOKED' ? 'Déconnecté' : 'Erreur' }}
            </span>
            <DropDown align="right" content-iner-t-w="z-100 sdropdown min-w-[190px]">
                <template #trigger>
                    <button type="button" class="icon-btn shrink-0" @click.stop title="Options">
                        <i class="bi bi-three-dots"></i>
                    </button>
                </template>
                <button v-if="conn.status === 'ACTIVE'" type="button" class="dropdown-item-style" @click="handleSync(conn.id)">
                    <i class="bi bi-arrow-repeat"></i> Synchroniser maintenant
                </button>
                <button v-else type="button" class="dropdown-item-style" @click="connectGoogle(props.orgId)">
                    <i class="bi bi-arrow-clockwise"></i> Reconnecter
                </button>
                <button type="button" class="dropdown-item-style" @click="handleDisconnect(conn.id)">
                    <i class="bi bi-x-circle"></i> Déconnecter
                </button>
            </DropDown>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DropDown from '@/components/DropDown.vue';
import { useExternalCalendars } from '@/composables/useExternalCalendars';
import { useToast } from '@/composables/useToast';
import type { ExternalConnectionStatus } from '@/types/agenda';

const props = defineProps<{ orgId: string }>();
const emit = defineEmits<{ changed: [] }>();

const { connections, fetchConnections, connectGoogle, syncNow, disconnect } = useExternalCalendars();

const route = useRoute();
const router = useRouter();

function statusColorClass(status: ExternalConnectionStatus): string {
    if (status === 'ACTIVE') return 'text-(--text2)';
    if (status === 'ERROR') return 'text-amber-500';
    return 'text-red-500';
}

async function handleSync(connectionId: string) {
    await syncNow(props.orgId, connectionId);
    emit('changed');
}

async function handleDisconnect(connectionId: string) {
    const ok = await disconnect(props.orgId, connectionId);
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
