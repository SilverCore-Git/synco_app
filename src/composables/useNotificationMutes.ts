import { computed } from 'vue';
import { user } from '@/assets/var';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from '@/composables/useToast';

// Salons et espaces rendus muets par l'utilisateur, stockés côté serveur dans
// notificationPreferences.mutedThreads / mutedSpaces — le serveur y filtre
// déjà push, e-mails et notifications persistées ; ce composable sert à
// l'affichage (menus, icône) et au filtrage des toasts in-app.
// Une mention (@) passe toujours, même dans un salon muet.

type MuteKind = 'thread' | 'space';

const prefs = computed<Record<string, any>>(() => {
    let raw = user.value?.notificationPreferences;
    if (typeof raw === 'string') {
        try { raw = JSON.parse(raw); } catch { raw = null; }
    }
    return raw && typeof raw === 'object' ? raw : {};
});

const mutedThreads = computed<string[]>(() => Array.isArray(prefs.value.mutedThreads) ? prefs.value.mutedThreads : []);
const mutedSpaces = computed<string[]>(() => Array.isArray(prefs.value.mutedSpaces) ? prefs.value.mutedSpaces : []);

const isThreadMuted = (threadId?: string | null) => !!threadId && mutedThreads.value.includes(threadId);
const isSpaceMuted = (spaceId?: string | null) => !!spaceId && mutedSpaces.value.includes(spaceId);

/** Vrai si un message de ce salon ne doit pas notifier (salon ou espace muet). */
const isMessageMuted = (threadId?: string | null, spaceId?: string | null) =>
    isThreadMuted(threadId) || isSpaceMuted(spaceId);

const setMuted = async (kind: MuteKind, id: string, muted: boolean): Promise<boolean> => {
    const toast = useToast();
    try {
        const response = await sfetch('/api/notifications/mutes', {
            method: 'PUT',
            body: JSON.stringify({ kind, id, muted })
        });
        if (!response.ok) {
            toast.show('Impossible de modifier les notifications', 'error');
            return false;
        }
        const { notificationPreferences } = await response.json();
        if (user.value) user.value = { ...user.value, notificationPreferences };
        toast.show(muted ? 'Notifications désactivées' : 'Notifications réactivées', 'success');
        return true;
    } catch (e) {
        console.error('[Mutes] Failed to update mute', e);
        toast.show('Erreur de connexion', 'error');
        return false;
    }
};

const toggleThreadMute = (threadId: string) => setMuted('thread', threadId, !isThreadMuted(threadId));
const toggleSpaceMute = (spaceId: string) => setMuted('space', spaceId, !isSpaceMuted(spaceId));

export function useNotificationMutes() {
    return {
        isThreadMuted,
        isSpaceMuted,
        isMessageMuted,
        toggleThreadMute,
        toggleSpaceMute,
    };
}
