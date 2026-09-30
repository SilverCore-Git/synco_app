import { computed, ref } from 'vue';
import { user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

// Salons et espaces rendus muets par l'utilisateur, stockés côté serveur dans
// notificationPreferences.mutedThreads / mutedSpaces sous la forme
// { id: fin ISO | null } (null = jusqu'à réactivation). Le serveur y filtre
// déjà push, e-mails et notifications persistées ; ce composable sert à
// l'affichage (menus, icône) et au filtrage des toasts in-app.
// Une mention (@) passe toujours, même dans un salon muet.

export type MuteKind = 'thread' | 'space';
export type MuteDuration = '8h' | '7d' | '30d' | 'forever';

type MuteMap = Record<string, string | null>;

// Horloge partagée : fait disparaître l'icône « muet » d'elle-même quand un
// mode muet temporaire arrive à échéance, sans recharger l'utilisateur.
const now = ref(Date.now());
setInterval(() => { now.value = Date.now(); }, 60_000);

const prefs = computed<Record<string, any>>(() => {
    let raw = user.value?.notificationPreferences;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
    }
    return raw && typeof raw === 'object' ? raw : {};
});

const activeMutes = (raw: unknown): MuteMap => {
    const out: MuteMap = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const [id, until] of Object.entries(raw as Record<string, unknown>)) {
        if (until === null) out[id] = null;
        else if (typeof until === 'string' && Date.parse(until) > now.value) out[id] = until;
    }
    return out;
};

const mutedThreads = computed(() => activeMutes(prefs.value.mutedThreads));
const mutedSpaces = computed(() => activeMutes(prefs.value.mutedSpaces));

const mapFor = (kind: MuteKind) => kind === 'thread' ? mutedThreads.value : mutedSpaces.value;

const isMuted = (kind: MuteKind, id?: string | null) => !!id && id in mapFor(kind);
const isThreadMuted = (threadId?: string | null) => isMuted('thread', threadId);
const isSpaceMuted = (spaceId?: string | null) => isMuted('space', spaceId);

/** Fin du mode muet (Date), null si « jusqu'à réactivation », undefined si non muet. */
const mutedUntil = (kind: MuteKind, id: string): Date | null | undefined => {
    const map = mapFor(kind);
    if (!(id in map)) return undefined;
    const until = map[id];
    return until ? new Date(until) : null;
};

/** Vrai si un message de ce salon ne doit pas notifier (salon ou espace muet). */
const isMessageMuted = (threadId?: string | null, spaceId?: string | null) =>
    isThreadMuted(threadId) || isSpaceMuted(spaceId);

const setMute = async (kind: MuteKind, id: string, duration: MuteDuration | null): Promise<boolean> => {
    const toast = useToast();
    try {
        const response = await sfetch('/api/notifications/mutes', {
            method: 'PUT',
            body: JSON.stringify(duration
                ? { kind, id, muted: true, duration }
                : { kind, id, muted: false })
        });
        if (!response.ok) {
            toast.show('Impossible de modifier les notifications', 'error');
            return false;
        }
        const { notificationPreferences } = await response.json();
        if (user.value) user.value = { ...user.value, notificationPreferences };
        now.value = Date.now();
        toast.show(duration ? 'Notifications désactivées' : 'Notifications réactivées', 'success');
        return true;
    } catch (e) {
        console.error('[Mutes] Failed to update mute', e);
        toast.show('Erreur de connexion', 'error');
        return false;
    }
};

const mute = (kind: MuteKind, id: string, duration: MuteDuration) => setMute(kind, id, duration);
const unmute = (kind: MuteKind, id: string) => setMute(kind, id, null);

export function useNotificationMutes() {
    return {
        isThreadMuted,
        isSpaceMuted,
        isMessageMuted,
        isMuted,
        mutedUntil,
        mute,
        unmute,
    };
}
