<template>
    <div v-if="visible" class="inline-flex items-center">
        <button type="button" class="chip" :disabled="busy || switching" :title="onRuntime ? 'Reprendre cette conversation sur cet appareil' : 'Laisser le runtime de l\'organisation continuer cette conversation'" @click="onClick">
            <i class="bi text-(--primary)" :class="onRuntime ? 'bi-laptop' : 'bi-hdd-network'"></i>
            <span class="font-semibold">{{ onRuntime ? 'Revenir en local' : 'Faire tourner sur le runtime' }}</span>
            <span v-if="onRuntime" class="state" :class="online ? 'state-on' : 'state-off'"><span class="dot"></span>{{ online ? 'En ligne' : 'Hors ligne' }}</span>
        </button>

        <Popup :is-open="notice !== null" @close="notice = null">
            <template #title>{{ notice?.title }}</template>
            <div class="space-y-3 text-sm text-(--text) leading-relaxed">
                <p>{{ notice?.detail }}</p>
                <p v-if="notice?.pinnedFingerprint" class="text-xs text-(--text2)">Empreinte épinglée sur cet appareil : <code class="fpr">{{ notice.pinnedFingerprint }}</code></p>
                <p v-if="notice?.fingerprint" class="text-xs text-(--text2)">Empreinte présentée maintenant : <code class="fpr">{{ notice.fingerprint }}</code></p>
            </div>
            <template #footer>
                <button class="default px-5 py-2.5 rounded-xl text-sm font-medium" @click="notice = null">Fermer</button>
                <button v-if="notice?.action === 'confirm_first_seen'" class="primary px-5 py-2.5 rounded-xl text-sm font-medium" @click="retryConfirmed">Je reconnais cette empreinte</button>
                <button v-else-if="notice?.action === 'renew_delegation'" class="primary px-5 py-2.5 rounded-xl text-sm font-medium" @click="retryRenewed">Renouveler et basculer</button>
            </template>
        </Popup>

        <ConfirmDelete
            :show="confirmLocal" itemName="la conversation" title="Revenir en local ?" buttonText="Revenir en local" :loading="switching"
            message="Le runtime cesse de travailler sur cette conversation et perd l'accès à sa clé. Elle continue sur cet appareil et reste dans votre historique."
            @confirm="toLocal" @cancel="confirmLocal = false" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { openedOrg } from '@/assets/var';
import { useToast } from '@/composables/useToast';
import Popup from '@/components/Popup.vue';
import ConfirmDelete from '@/components/common/ConfirmDelete.vue';
import { activeSessionId, chatSessions, fetchSessions, loadSession } from '@/services/AIService';
import {
    canSwitchExistingConversation, explainRuntimeError, explainSwitchRefusal, previousPinnedFingerprint, runtimeAvailability, runtimeDeps,
    switchConversationToLocal, switchConversationToRuntime, SwitchRefusedError, SwitchUnavailableError, type RuntimeProblem,
} from '@/services/aiRuntimeUi';
import { installSwitchBodyBuilder } from '@/services/aiRuntimeSwitch';

installSwitchBodyBuilder();

const props = defineProps<{ busy?: boolean }>();
const toast = useToast();
const deps = runtimeDeps();

const orgId = computed(() => openedOrg.value?.id ?? '');
const availability = ref({ available: false, online: false });
const switching = ref(false);
const notice = ref<RuntimeProblem | null>(null);
const confirmLocal = ref(false);

const refreshAvailability = async () => { if (orgId.value) availability.value = await runtimeAvailability(deps, orgId.value); };
onMounted(refreshAvailability);
watch(orgId, refreshAvailability);

const session = computed(() => chatSessions.value.find((s: { id: string }) => s.id === activeSessionId.value));
const onRuntime = computed(() => session.value?.regime === 'runtime');
const online = computed(() => availability.value.online);
/** Seule une conversation déjà enregistrée peut basculer ; un moteur du navigateur n'a rien à confier. */
const visible = computed(() => !!session.value && (onRuntime.value || availability.value.available));

const explain = async (e: unknown): Promise<void> => {
    if (e instanceof SwitchUnavailableError) { toast.show(e.message, 'info', 6000); return; }
    if (e instanceof SwitchRefusedError) { toast.show(explainSwitchRefusal(e.code), 'error', 6000); return; }
    const p = explainRuntimeError(e, { pinnedFingerprint: await previousPinnedFingerprint(deps, orgId.value).catch(() => undefined) });
    if (p.action === 'none') toast.show(`${p.title}. ${p.detail}`, p.severity === 'info' ? 'info' : 'error', 6000);
    else notice.value = p;
};

const toRuntime = async (confirmFirstSeen: boolean, confirmedFingerprint?: string) => {
    const id = activeSessionId.value;
    if (!id) return;
    switching.value = true;
    try {
        await switchConversationToRuntime(deps, orgId.value, id, { confirmFirstSeen, confirmedFingerprint });
        notice.value = null;
        toast.show('Cette conversation tourne maintenant sur le runtime.', 'success');
        await fetchSessions();
    } catch (e) {
        await explain(e);
    } finally {
        switching.value = false;
    }
};
// Seule l'empreinte AFFICHÉE dans l'avis est confirmée : si le runtime en présente une autre, L10 refuse.
const retryConfirmed = () => { void toRuntime(true, notice.value?.fingerprint ?? ''); };
const retryRenewed = () => { void toRuntime(false); };

const toLocal = async () => {
    const id = activeSessionId.value;
    if (!id) return;
    switching.value = true;
    try {
        await switchConversationToLocal(deps, orgId.value, id, loadSession);
        confirmLocal.value = false;
        toast.show('Conversation revenue en local.', 'success');
        await fetchSessions();
    } catch (e) {
        confirmLocal.value = false;
        await explain(e);
    } finally {
        switching.value = false;
    }
};

const onClick = () => {
    if (props.busy || switching.value) return;
    if (onRuntime.value) confirmLocal.value = true;
    else if (!canSwitchExistingConversation()) toast.show("La bascule d'une conversation existante arrive avec le chiffrement de l'historique (lot suivant).", 'info', 6000);
    else void toRuntime(false);
};
</script>

<style scoped>
.chip {
    display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.7rem; border-radius: 0.75rem;
    font-size: 0.75rem; color: var(--text); background: var(--bg2); border: 1px solid var(--border-color);
    transition: border-color 0.15s;
}
.chip:hover:not(:disabled) { border-color: color-mix(in srgb, var(--primary) 50%, transparent); }
.chip:disabled { opacity: 0.5; cursor: not-allowed; }
.state { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 10px; font-weight: 700; }
.state-on { color: var(--primary); }
.state-off { color: var(--text2); }
.dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; background: currentColor; }
.fpr { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; word-break: break-all; }
</style>
