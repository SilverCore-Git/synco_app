<template>

    <div class="space-y-10">

        <div class="flex items-start justify-between gap-4 flex-wrap">
            <div class="min-w-0">
                <h3 class="text-2xl font-black text-(--text) mb-1">Notifications</h3>
                <p class="text-sm text-(--text2) max-w-2xl">{{ summary }}</p>
            </div>
            <p class="saved-stamp text-sm" :class="saveState" aria-live="polite">
                <template v-if="saveState === 'saving'"><i class="bi bi-arrow-repeat animate-spin" aria-hidden="true" /> Enregistrement…</template>
                <template v-else-if="saveState === 'saved'"><i class="bi bi-check-circle-fill" aria-hidden="true" /> Enregistré</template>
            </p>
        </div>

        <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-8 items-start">

            <div class="space-y-10 min-w-0">

                <!-- NIVEAU : ce qui mérite une alerte, avant le comment. -->
                <section class="space-y-4" aria-labelledby="notif-level">
                    <h4 id="notif-level" class="text-base font-bold text-(--text)">Ce qui vous alerte</h4>
                    <div role="radiogroup" aria-labelledby="notif-level" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            v-for="level in levels"
                            :key="String(level.mentionsOnly)"
                            type="button"
                            role="radio"
                            :aria-checked="prefs.mentionsOnly === level.mentionsOnly"
                            class="choice-card"
                            :class="{ selected: prefs.mentionsOnly === level.mentionsOnly }"
                            @click="update('mentionsOnly', level.mentionsOnly)"
                        >
                            <i :class="level.icon" class="choice-icon" aria-hidden="true" />
                            <span class="flex-1 min-w-0 text-left">
                                <span class="block font-bold text-(--text)">{{ level.label }}</span>
                                <span class="block text-sm text-(--text2) mt-0.5">{{ level.description }}</span>
                            </span>
                            <span class="radio-dot" aria-hidden="true" />
                        </button>
                    </div>
                </section>

                <!-- CANAUX -->
                <section class="space-y-4" aria-labelledby="notif-channels">
                    <h4 id="notif-channels" class="text-base font-bold text-(--text)">Où elles arrivent</h4>
                    <div class="settings-panel">
                        <SettingToggleRow
                            :model-value="prefs.push"
                            @update:model-value="update('push', $event)"
                            icon="bi bi-phone-vibrate"
                            title="Push"
                            description="Sur votre téléphone et votre ordinateur, même quand Synco est fermé."
                        />

                        <SettingToggleRow
                            :model-value="prefs.email"
                            @update:model-value="update('email', $event)"
                            icon="bi bi-envelope"
                            title="E-mail"
                            :description="user?.email ? `À ${user.email}` : 'À l\'adresse de votre compte'"
                        >
                            <template v-if="prefs.email" #extra>
                                <div role="radiogroup" aria-label="Quels e-mails recevoir" class="segmented" :class="{ 'is-locked': prefs.mentionsOnly }">
                                    <button
                                        v-for="mode in emailModes"
                                        :key="mode.value"
                                        type="button"
                                        role="radio"
                                        :aria-checked="prefs.emailMode === mode.value"
                                        :disabled="prefs.mentionsOnly"
                                        :aria-describedby="prefs.mentionsOnly ? 'email-locked' : undefined"
                                        class="segment"
                                        :class="{ active: prefs.emailMode === mode.value }"
                                        @click="update('emailMode', mode.value)"
                                    >
                                        <span class="font-bold">{{ mode.label }}</span>
                                        <span class="segment-sub">{{ mode.description }}</span>
                                    </button>
                                </div>
                                <p v-if="prefs.mentionsOnly" id="email-locked" class="text-sm text-(--text2) mt-2 flex items-start gap-2">
                                    <i class="bi bi-at mt-0.5" aria-hidden="true" />
                                    Avec « Mentions seulement », seules les mentions partent par e-mail.
                                </p>
                            </template>
                        </SettingToggleRow>

                        <SettingToggleRow
                            :model-value="prefs.sound"
                            @update:model-value="update('sound', $event)"
                            icon="bi bi-volume-up"
                            title="Son"
                            description="Une bulle sonore à l'arrivée d'une notification, dans Synco comme sur le téléphone."
                        >
                            <template #extra>
                                <button type="button" class="mini-btn" @click="playSample">
                                    <i class="bi bi-play-fill" aria-hidden="true" />
                                    Écouter
                                </button>
                            </template>
                        </SettingToggleRow>
                    </div>
                </section>

                <!-- SALONS MUETS -->
                <section class="space-y-4" aria-labelledby="notif-mutes">
                    <div class="flex items-baseline justify-between gap-4 flex-wrap">
                        <h4 id="notif-mutes" class="text-base font-bold text-(--text)">Salons et espaces muets</h4>
                        <p v-if="muted.length" class="text-sm text-(--text2)">Une mention @ passe toujours.</p>
                    </div>

                    <ul v-if="muted.length" class="settings-panel">
                        <li v-for="item in muted" :key="`${item.kind}:${item.id}`" class="mute-row">
                            <i :class="item.kind === 'space' ? 'bi bi-grid-fill' : 'bi bi-hash'" class="text-(--text2) text-lg w-5 text-center shrink-0" aria-hidden="true" />
                            <span class="flex-1 min-w-0">
                                <span class="block font-bold text-(--text) truncate">{{ item.name }}</span>
                                <span class="block text-sm text-(--text2)">{{ item.context }} · {{ item.until }}</span>
                            </span>
                            <button
                                type="button"
                                class="mini-btn shrink-0"
                                :disabled="unmuting === item.id"
                                @click="onUnmute(item.kind, item.id)"
                            >
                                Réactiver
                            </button>
                        </li>
                    </ul>
                    <p v-else class="empty-mutes text-sm text-(--text2)">
                        Aucun salon muet. Pour en couper un, faites un clic droit sur un salon ou un espace, puis « Désactiver les notifications ».
                    </p>
                </section>

            </div>

            <!-- CE QUI VOUS PARVIENT : mêmes règles que le serveur (notificationService.ts). -->
            <aside class="xl:sticky xl:top-0 space-y-3" aria-labelledby="notif-matrix">
                <h4 id="notif-matrix" class="text-base font-bold text-(--text)">Ce qui vous parvient</h4>
                <div class="settings-panel">
                    <table class="w-full text-sm">
                        <thead>
                            <tr>
                                <th scope="col" class="text-left font-normal text-(--text2) py-3 pl-4">Événement</th>
                                <th scope="col" class="font-normal text-(--text2) py-3 w-16 text-center">Push</th>
                                <th scope="col" class="font-normal text-(--text2) py-3 pr-4 w-16 text-center">E-mail</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in matrix" :key="row.type" class="matrix-row">
                                <th scope="row" class="text-left font-semibold text-(--text) py-2.5 pl-4">
                                    <i :class="row.icon" class="text-(--text2) mr-2" aria-hidden="true" />{{ row.label }}
                                </th>
                                <td class="text-center py-2.5">
                                    <span class="mark" :class="row.push ? 'on' : 'off'">
                                        <i :class="row.push ? 'bi bi-check-lg' : 'bi bi-dash'" aria-hidden="true" />
                                        <span class="sr-only">{{ row.push ? 'oui' : 'non' }}</span>
                                    </span>
                                </td>
                                <td class="text-center py-2.5 pr-4">
                                    <span class="mark" :class="row.email ? 'on' : 'off'">
                                        <i :class="row.email ? 'bi bi-check-lg' : 'bi bi-dash'" aria-hidden="true" />
                                        <span class="sr-only">{{ row.email ? 'oui' : 'non' }}</span>
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p class="text-sm text-(--text2)">Quand Synco est ouvert, tout s'affiche aussi dans la cloche, en haut à droite.</p>
            </aside>

        </div>

    </div>

</template>

<script setup lang="ts">

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { user, openedOrg } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';
import { useNotificationMutes, type MuteKind } from '@/composables/useNotificationMutes';
import { SoundService } from '@/services/SoundService';
import SettingToggleRow from './SettingToggleRow.vue';

type EmailMode = 'all' | 'mentions';
interface Prefs { push: boolean; email: boolean; sound: boolean; mentionsOnly: boolean; emailMode: EmailMode }

const toast = useToast();
const { mutedUntil, unmute } = useNotificationMutes();

// --- Préférences (mêmes valeurs par défaut que parseNotificationPrefs côté API)
const prefs = reactive<Prefs>({ push: true, email: true, sound: true, mentionsOnly: false, emailMode: 'mentions' });

const rawPrefs = computed<Record<string, any>>(() => {
    let raw = user.value?.notificationPreferences;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
    }
    return raw && typeof raw === 'object' ? raw : {};
});

watch(rawPrefs, (p) => {
    prefs.push = p.push ?? true;
    prefs.email = p.email ?? true;
    prefs.sound = p.sound ?? true;
    prefs.mentionsOnly = p.mentionsOnly ?? false;
    prefs.emailMode = p.emailMode === 'all' ? 'all' : 'mentions';
}, { immediate: true });

// --- Enregistrement : chaque réglage s'enregistre seul, un tampon « Enregistré » le confirme.
const saveState = ref<'idle' | 'saving' | 'saved'>('idle');
let savedTimer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(savedTimer));

const update = async <K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    if (prefs[key] === value) return;
    const previous = prefs[key];
    prefs[key] = value;
    saveState.value = 'saving';
    clearTimeout(savedTimer);
    try {
        // Le serveur fusionne avec l'existant : les salons muets ne sont pas écrasés.
        const response = await sfetch('/api/users/me', {
            method: 'PATCH',
            body: JSON.stringify({ notificationPreferences: { ...prefs } })
        });
        if (!response.ok) throw new Error(String(response.status));
        const updatedUser = await response.json();
        user.value = { ...user.value, ...updatedUser };
        saveState.value = 'saved';
        savedTimer = setTimeout(() => { saveState.value = 'idle'; }, 2000);
    } catch (e) {
        console.error(e);
        prefs[key] = previous;
        saveState.value = 'idle';
        toast.show('Réglage non enregistré, vérifiez votre connexion', 'error');
    }
};

const levels = [
    { mentionsOnly: false, label: 'Tout', icon: 'bi bi-bell', description: 'Messages, mentions, tâches, invitations et appels manqués.' },
    { mentionsOnly: true, label: 'Mentions seulement', icon: 'bi bi-at', description: 'Uniquement quand quelqu\'un vous cite avec @.' },
] as const;

const emailModes = [
    { value: 'mentions', label: 'L\'essentiel', description: 'Mentions, tâches, événements' },
    { value: 'all', label: 'Tout', description: 'Messages compris' },
] as const;

// --- Phrase-résumé et tableau, dérivés des règles du serveur
// (shouldSendEmail / sendPushNotification dans synco_api/src/services/notificationService.ts).
const EMAILED_TYPES = new Set(['MENTION', 'EVENT_INVITE', 'EVENT_REMINDER', 'TASK_ASSIGNED']);

const reachesPush = (type: string) => prefs.push && (!prefs.mentionsOnly || type === 'MENTION');
const reachesEmail = (type: string) => prefs.email
    && (EMAILED_TYPES.has(type) || prefs.emailMode === 'all')
    && (!prefs.mentionsOnly || type === 'MENTION');

const matrix = computed(() => [
    { type: 'MESSAGE', label: 'Message', icon: 'bi bi-chat' },
    { type: 'MENTION', label: 'Mention @', icon: 'bi bi-at' },
    { type: 'TASK_ASSIGNED', label: 'Tâche assignée', icon: 'bi bi-check2-square' },
    { type: 'EVENT_INVITE', label: 'Invitation', icon: 'bi bi-calendar-plus' },
    { type: 'EVENT_REMINDER', label: 'Rappel d\'événement', icon: 'bi bi-alarm' },
    { type: 'MISSED_CALL', label: 'Appel manqué', icon: 'bi bi-telephone-x' },
].map(row => ({ ...row, push: reachesPush(row.type), email: reachesEmail(row.type) })));

const summary = computed(() => {
    const what = prefs.mentionsOnly ? 'vos mentions' : null;
    const push = prefs.push ? (what ?? 'tout') : null;
    const email = !prefs.email ? null
        : what ?? (prefs.emailMode === 'all' ? 'tout' : 'les mentions, tâches et événements');

    if (!push && !email) return 'Rien ne vous est envoyé hors de Synco : les notifications vous attendent dans l\'app.';
    if (push && email && push === email) return `Vous recevez ${push} en push et par e-mail.`;
    if (push && email) return `Vous recevez ${push} en push, et ${email} par e-mail.`;
    if (push) return `Vous recevez ${push} en push, rien par e-mail.`;
    return `Vous recevez ${email} par e-mail, rien en push.`;
});

// --- Son
const playSample = async () => {
    await SoundService.init();
    SoundService.play('notification', 0);
};

// --- Salons et espaces muets : noms résolus dans l'organisation ouverte.
const names = computed(() => {
    const threads = new Map<string, { name: string; context: string }>();
    const spaces = new Map<string, string>();
    const org = openedOrg.value as any;
    if (!org) return { threads, spaces };
    const addThreads = (list: any[] | undefined, context: string) => {
        for (const t of list ?? []) threads.set(t.id, { name: t.name, context });
    };
    addThreads(org.home?.threads, org.name);
    for (const c of org.home?.categories ?? []) addThreads(c.threads, org.name);
    for (const s of org.spaces ?? []) {
        spaces.set(s.id, s.name);
        addThreads(s.threads, s.name);
        for (const c of s.categories ?? []) addThreads(c.threads, s.name);
    }
    return { threads, spaces };
});

const untilLabel = (until: Date | null | undefined) => {
    if (!until) return 'jusqu\'à réactivation';
    return `jusqu'au ${until.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

const muted = computed(() => {
    const out: { kind: MuteKind; id: string; name: string; context: string; until: string }[] = [];
    const add = (kind: MuteKind, key: 'mutedThreads' | 'mutedSpaces') => {
        for (const id of Object.keys(rawPrefs.value[key] ?? {})) {
            const until = mutedUntil(kind, id);
            if (until === undefined) continue; // échu
            if (kind === 'thread') {
                const t = names.value.threads.get(id);
                out.push({ kind, id, name: t ? `#${t.name}` : 'Salon d\'une autre organisation', context: t?.context ?? 'Ailleurs', until: untilLabel(until) });
            } else {
                const s = names.value.spaces.get(id);
                out.push({ kind, id, name: s ?? 'Espace d\'une autre organisation', context: 'Espace entier', until: untilLabel(until) });
            }
        }
    };
    add('space', 'mutedSpaces');
    add('thread', 'mutedThreads');
    return out;
});

const unmuting = ref<string | null>(null);
const onUnmute = async (kind: MuteKind, id: string) => {
    unmuting.value = id;
    try { await unmute(kind, id); } finally { unmuting.value = null; }
};

</script>

<style scoped>

.settings-panel {
    background: var(--bg2);
    border: 1px solid var(--border-color);
    border-radius: 1rem;
    overflow: hidden;
}

.saved-stamp {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 1.5rem;
    color: var(--text2);
}
.saved-stamp.saved { color: var(--primary); }

/* --- Niveau d'alerte --- */
.choice-card {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    padding: 16px 18px;
    border-radius: 1rem;
    border: 2px solid var(--border-color);
    background: var(--bg2);
    cursor: pointer;
    transition: border-color .2s ease;
}
.choice-card:hover { border-color: color-mix(in srgb, var(--text) 25%, transparent); }
.choice-card:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.choice-card.selected {
    border-color: var(--primary);
    box-shadow: 0 0 20px var(--glow-primary-soft, transparent);
}
.choice-icon {
    font-size: 1.25rem;
    color: var(--text2);
    margin-top: 1px;
}
.choice-card.selected .choice-icon { color: var(--primary); }
.radio-dot {
    flex: none;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    border-radius: 999px;
    border: 2px solid var(--border-color);
    transition: all .2s ease;
}
.choice-card.selected .radio-dot {
    border-color: var(--primary);
    box-shadow: inset 0 0 0 4px var(--bg2);
    background: var(--primary);
}

/* --- Choix des e-mails --- */
.segmented {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 4px;
    border-radius: .85rem;
    background: var(--bg);
    border: 1px solid var(--border-color);
    max-width: 100%;
}
.segment {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 8px 14px;
    border-radius: .6rem;
    background: transparent;
    border: none;
    color: var(--text2);
    font-size: .875rem;
    cursor: pointer;
    transition: background-color .15s ease, color .15s ease;
}
.segment:hover:not(:disabled):not(.active) { color: var(--text); }
.segment:focus-visible { outline: 2px solid var(--primary); outline-offset: 1px; }
.segment.active {
    background: var(--bg2);
    color: var(--text);
    box-shadow: inset 0 0 0 1px var(--primary);
}
.segment-sub {
    font-size: .75rem;
    color: var(--text2);
}
.segmented.is-locked .segment { cursor: not-allowed; opacity: .55; }

/* --- Salons muets --- */
.mute-row {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 12px 16px 12px 20px;
}
.mute-row + .mute-row { border-top: 1px solid var(--border-color); }
.empty-mutes {
    padding: 14px 18px;
    border-radius: 1rem;
    border: 1px dashed var(--border-color);
}

/* Petit bouton secondaire à contour, pour les actions dans une ligne. */
.mini-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid var(--border-color);
    background: var(--bg);
    color: var(--text);
    font-size: .875rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color .15s ease, color .15s ease, transform .1s ease;
}
.mini-btn:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
.mini-btn:active:not(:disabled) { transform: scale(.95); }
.mini-btn:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.mini-btn:disabled { opacity: .6; cursor: wait; }

/* --- Tableau « ce qui vous parvient » --- */
.matrix-row { border-top: 1px solid var(--border-color); }
.mark {
    display: inline-grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    font-size: 14px;
    transition: background-color .2s ease, color .2s ease;
}
.mark.on {
    background: color-mix(in srgb, var(--primary) 18%, transparent);
    color: var(--primary);
}
.mark.off { color: var(--text2); }

:global(html.motion-off) .choice-card,
:global(html.motion-off) .radio-dot,
:global(html.motion-off) .mark,
:global(html.motion-off) .segment {
    transition: none;
}

</style>
