import { computed, ref, watch } from 'vue';
import isDesktopApp from '@/assets/isDesktopApp';
import { user } from '@/assets/var';
import useSettingsItem from '@/composables/useSettingsItem';
import useLiveKit from '@/composables/useLiveKit';

// Rich Presence Discord (app de bureau uniquement, commandes discord_presence_* de
// src-tauri/src/discord_presence.rs). Affiche « Sur Synco » ou « En appel vocal » avec la durée
// sur le profil Discord de l'utilisateur, s'il l'a activé dans Réglages > Apparence.
//
// Volontairement générique : ni organisation, ni salon, ni interlocuteur — ce serait faire fuiter
// vers Discord des métadonnées qu'on chiffre de bout en bout partout ailleurs. Rien non plus quand
// l'utilisateur se met en « Invisible » : Discord ne doit pas trahir qu'il est connecté.

/** Vrai si l'app de bureau a été compilée avec un ID d'application Discord (SYNCO_DISCORD_CLIENT_ID). */
export const discordPresenceAvailable = ref(false);

let started = false;

const invoke = async <T>(cmd: string, args?: Record<string, unknown>): Promise<T> => {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(cmd, args);
};

export const useDiscordPresenceSetting = () => useSettingsItem('discordPresence', false).Item;

/** À appeler une fois après le boot (App.vue). Sans effet hors de l'app de bureau. */
const useDiscordPresence = async () => {
    if (started || !isDesktopApp()) return;
    started = true;

    discordPresenceAvailable.value = await invoke<boolean>('discord_presence_available').catch(() => false);
    if (!discordPresenceAvailable.value) return;

    const enabled = useDiscordPresenceSetting();
    const { isConnected } = useLiveKit();

    const appStart = Math.floor(Date.now() / 1000);
    let callStart = 0;

    const wanted = computed(() => {
        if (enabled.value !== true) return null;
        if (user.value?.data?.status === 'offline') return null;
        if (isConnected.value) return { details: 'En appel vocal', start: callStart };
        return { details: 'Sur Synco', start: appStart };
    });

    watch(isConnected, (c) => { if (c) callStart = Math.floor(Date.now() / 1000); }, { immediate: true });

    watch(wanted, (p) => {
        const call = p
            ? invoke('discord_presence_set', { details: p.details, state: null, start: p.start })
            : invoke('discord_presence_clear');
        call.catch((e) => console.warn('[discord-presence]', e));
    }, { immediate: true, deep: true });
};

export default useDiscordPresence;
