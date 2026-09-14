<template>
    <div class="calendars-section">
        <div class="calendars-header">
            <span class="calendars-title">Mes agendas</span>
            <div class="flex items-center gap-1">
                <button type="button" class="icon-btn" title="Partager mon agenda" @click="openShareModal">
                    <i class="bi bi-share"></i>
                </button>
                <button type="button" class="icon-btn" title="Demander l'accès à un agenda" @click="openRequestModal">
                    <i class="bi bi-plus-lg"></i>
                </button>
            </div>
        </div>

        <label class="calendar-row">
            <input type="checkbox" checked disabled class="w-3.5 h-3.5 rounded accent-(--primary)" />
            <span class="calendar-dot" style="background: var(--primary)"></span>
            <span class="calendar-name">Mon agenda</span>
        </label>

        <label v-for="(grant, index) in acceptedSharedCalendars" :key="grant.id" class="calendar-row">
            <input
                type="checkbox"
                :checked="isVisible(orgId, grant.id)"
                @change="toggleVisibility(orgId, grant.id); emit('changed')"
                class="w-3.5 h-3.5 rounded accent-(--primary)"
            />
            <span class="calendar-dot" :style="{ background: colorFor(grant, index) }"></span>
            <span class="calendar-name">{{ p(grant.owner.name) || grant.owner.pseudo }}</span>
            <span class="level-badge">{{ grant.level === 'WRITE' ? 'Modif.' : 'Lecture' }}</span>
            <DropDown align="right" content-iner-t-w="z-100 sdropdown min-w-[160px]">
                <template #trigger>
                    <button type="button" class="icon-btn shrink-0" @click.stop title="Options">
                        <i class="bi bi-three-dots"></i>
                    </button>
                </template>
                <button type="button" class="dropdown-item-style" @click="leaveShared(grant.id)">
                    <i class="bi bi-box-arrow-left"></i> Quitter le partage
                </button>
            </DropDown>
        </label>

        <div v-if="pendingCount > 0" class="calendars-header pending-header">
            <span class="calendars-title">Demandes</span>
            <span class="pending-count">{{ pendingCount }}</span>
        </div>

        <div v-for="grant in incomingRequests" :key="grant.id" class="pending-row">
            <span class="pending-text">
                <strong>{{ p(grant.grantee.name) || grant.grantee.pseudo }}</strong> demande l'accès à votre agenda
                ({{ grant.level === 'WRITE' ? 'modification' : 'lecture seule' }})
            </span>
            <div class="pending-actions">
                <button type="button" class="default !text-[11px] !px-2 !py-1" @click="respond(grant.id, 'DECLINE')">Refuser</button>
                <button type="button" class="primary !text-[11px] !px-2 !py-1" @click="respond(grant.id, 'ACCEPT', grant.level)">Accepter</button>
            </div>
        </div>

        <div v-for="grant in incomingInvites" :key="grant.id" class="pending-row">
            <span class="pending-text">
                <strong>{{ p(grant.owner.name) || grant.owner.pseudo }}</strong> vous propose l'accès à son agenda
                ({{ grant.level === 'WRITE' ? 'modification' : 'lecture seule' }})
            </span>
            <div class="pending-actions">
                <button type="button" class="default !text-[11px] !px-2 !py-1" @click="respond(grant.id, 'DECLINE')">Refuser</button>
                <button type="button" class="primary !text-[11px] !px-2 !py-1" @click="respond(grant.id, 'ACCEPT')">Accepter</button>
            </div>
        </div>

        <div v-for="grant in outgoingRequests" :key="grant.id" class="pending-row">
            <span class="pending-text">Demande envoyée à {{ p(grant.owner.name) || grant.owner.pseudo }}</span>
            <button type="button" class="default !text-[11px] !px-2 !py-1" @click="cancelOutgoing(grant.id)">Annuler</button>
        </div>

        <div v-for="grant in outgoingInvites" :key="grant.id" class="pending-row">
            <span class="pending-text">Proposition envoyée à {{ p(grant.grantee.name) || grant.grantee.pseudo }}</span>
            <button type="button" class="default !text-[11px] !px-2 !py-1" @click="cancelOutgoing(grant.id)">Annuler</button>
        </div>
    </div>

    <Popup :isOpen="showRequestModal" @close="showRequestModal = false">
        <template #title>Demander l'accès à un agenda</template>

        <div class="relative mb-3">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
            <input v-model="memberSearch" placeholder="Rechercher une personne..." class="field-input-sm pl-8 w-full" />
        </div>
        <div class="member-list">
            <label v-for="member in filteredMembers" :key="member.userId" class="member-row">
                <input type="radio" :value="member.userId" v-model="pickedUserId" class="accent-(--primary)" />
                <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                    {{ (p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                </div>
                <span class="text-xs font-medium text-(--text)">{{ p(member.user?.name) || member.userId }}</span>
            </label>
            <div v-if="filteredMembers.length === 0" class="text-[11px] text-center text-(--text2) py-2">Aucun résultat</div>
        </div>

        <div class="level-picker">
            <label class="level-option" :class="{ 'is-active': pickedLevel === 'READ' }">
                <input type="radio" value="READ" v-model="pickedLevel" class="accent-(--primary)" />
                Lecture seule
            </label>
            <label class="level-option" :class="{ 'is-active': pickedLevel === 'WRITE' }">
                <input type="radio" value="WRITE" v-model="pickedLevel" class="accent-(--primary)" />
                Modification
            </label>
        </div>

        <template #footer>
            <button type="button" class="default" @click="showRequestModal = false">Annuler</button>
            <button type="button" class="primary" :disabled="!pickedUserId" @click="submitRequest">Envoyer la demande</button>
        </template>
    </Popup>

    <Popup :isOpen="showShareModal" @close="showShareModal = false">
        <template #title>Partager mon agenda</template>

        <div class="relative mb-3">
            <i class="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-(--text2) text-xs"></i>
            <input v-model="memberSearch" placeholder="Rechercher une personne..." class="field-input-sm pl-8 w-full" />
        </div>
        <div class="member-list">
            <label v-for="member in filteredMembers" :key="member.userId" class="member-row">
                <input type="radio" :value="member.userId" v-model="pickedUserId" class="accent-(--primary)" />
                <img v-if="member.user?.avatarUrl" :src="member.user.avatarUrl" class="w-6 h-6 rounded-full object-cover">
                <div v-else class="w-6 h-6 rounded-full bg-(--primary)/20 text-(--primary) flex items-center justify-center text-[10px] font-bold">
                    {{ (p(member.user?.name) || member.userId).substring(0, 2).toUpperCase() }}
                </div>
                <span class="text-xs font-medium text-(--text)">{{ p(member.user?.name) || member.userId }}</span>
            </label>
            <div v-if="filteredMembers.length === 0" class="text-[11px] text-center text-(--text2) py-2">Aucun résultat</div>
        </div>

        <div class="level-picker">
            <label class="level-option" :class="{ 'is-active': pickedLevel === 'READ' }">
                <input type="radio" value="READ" v-model="pickedLevel" class="accent-(--primary)" />
                Lecture seule
            </label>
            <label class="level-option" :class="{ 'is-active': pickedLevel === 'WRITE' }">
                <input type="radio" value="WRITE" v-model="pickedLevel" class="accent-(--primary)" />
                Modification
            </label>
        </div>

        <template #footer>
            <button type="button" class="default" @click="showShareModal = false">Annuler</button>
            <button type="button" class="primary" :disabled="!pickedUserId" @click="submitShare">Envoyer l'invitation</button>
        </template>
    </Popup>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import DropDown from '@/components/DropDown.vue';
import Popup from '@/components/Popup.vue';
import useSettingsItem from '@/composables/useSettingsItem';
import { useCalendarAccess } from '@/composables/useCalendarAccess';
import { openedOrg, user } from '@/assets/var';
import type { OrgMember } from '@/types/types';
import type { CalendarAccessLevel } from '@/types/agenda';

const props = defineProps<{ orgId: string }>();
const emit = defineEmits<{ changed: [] }>();

const {
    acceptedSharedCalendars,
    incomingRequests,
    incomingInvites,
    outgoingRequests,
    outgoingInvites,
    isVisible,
    toggleVisibility,
    colorFor,
    requestAccess,
    inviteAccess,
    respondToGrant,
    revokeGrant
} = useCalendarAccess();

const pendingCount = computed(() =>
    incomingRequests.value.length + incomingInvites.value.length + outgoingRequests.value.length + outgoingInvites.value.length
);

const { Item: privacyMode } = useSettingsItem('privacyMode', false);
function p(name: any): string {
    if (!name || typeof name !== 'string') return name;
    return privacyMode.value ? name.charAt(0).toUpperCase() : name;
}

async function respond(grantId: string, action: 'ACCEPT' | 'DECLINE', level?: CalendarAccessLevel) {
    const accepted = await respondToGrant(props.orgId, grantId, action, level);
    if (accepted) emit('changed');
}

async function leaveShared(grantId: string) {
    await revokeGrant(props.orgId, grantId);
    emit('changed');
}

async function cancelOutgoing(grantId: string) {
    await revokeGrant(props.orgId, grantId);
}

// ── Modales (demande / partage) ────────────────────────────────────────
const showRequestModal = ref(false);
const showShareModal = ref(false);
const memberSearch = ref('');
const pickedUserId = ref<string | null>(null);
const pickedLevel = ref<CalendarAccessLevel>('READ');

const availableMembers = computed<OrgMember[]>(() => (openedOrg.value?.members || []).filter(m => m.userId !== user.value?.id));
const filteredMembers = computed<OrgMember[]>(() => {
    if (!memberSearch.value.trim()) return availableMembers.value;
    const s = memberSearch.value.toLowerCase();
    return availableMembers.value.filter(m => (m.user?.name || m.userId).toLowerCase().includes(s));
});

function openRequestModal() {
    memberSearch.value = '';
    pickedUserId.value = null;
    pickedLevel.value = 'READ';
    showRequestModal.value = true;
}

function openShareModal() {
    memberSearch.value = '';
    pickedUserId.value = null;
    pickedLevel.value = 'READ';
    showShareModal.value = true;
}

async function submitRequest() {
    if (!pickedUserId.value) return;
    const ok = await requestAccess(props.orgId, pickedUserId.value, pickedLevel.value);
    if (ok) showRequestModal.value = false;
}

async function submitShare() {
    if (!pickedUserId.value) return;
    const ok = await inviteAccess(props.orgId, pickedUserId.value, pickedLevel.value);
    if (ok) showShareModal.value = false;
}
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

.pending-header {
    margin-top: 6px;
}

.calendars-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    color: var(--text2);
}

.pending-count {
    font-size: 10px;
    font-weight: 700;
    background: color-mix(in srgb, var(--primary) 20%, transparent);
    color: var(--primary);
    border-radius: 999px;
    padding: 1px 7px;
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

.calendar-dot {
    width: 9px;
    height: 9px;
    border-radius: 999px;
    flex-shrink: 0;
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
    color: var(--text2);
    background: rgba(255, 255, 255, 0.06);
    border-radius: 999px;
    padding: 1px 6px;
    flex-shrink: 0;
}

.pending-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    background: color-mix(in srgb, var(--bg2) 50%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 0.6rem;
    padding: 8px 10px;
    margin: 2px 0;
}

.pending-text {
    color: var(--text2);
}
.pending-text strong {
    color: var(--text);
}

.pending-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
}

.field-input-sm {
    background: color-mix(in srgb, var(--bg2) 30%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.5rem;
    padding: 0.4rem 0.6rem;
    color: var(--text);
    font-size: 0.75rem;
}

.member-list {
    background: color-mix(in srgb, var(--bg2) 30%, transparent);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.75rem;
    padding: 8px;
    max-height: 220px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.member-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 4px;
    border-radius: 0.5rem;
    cursor: pointer;
}
.member-row:hover {
    background: rgba(255, 255, 255, 0.05);
}

.level-picker {
    display: flex;
    gap: 8px;
    margin-top: 12px;
}

.level-option {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text2);
    border: 1px solid var(--border-color);
    border-radius: 0.6rem;
    padding: 8px 10px;
    cursor: pointer;
}
.level-option.is-active {
    color: var(--text);
    border-color: var(--primary);
    background: color-mix(in srgb, var(--primary) 10%, transparent);
}
</style>
