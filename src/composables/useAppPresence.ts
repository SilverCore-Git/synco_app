import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import useWSocket from '@/composables/useWSocket';

// How long the mobile app can sit in the background before we tell the
// server to show the user as "Absent" (idle). A quick app-switch (checking
// a notification, answering a call) shouldn't flip the status.
const BACKGROUND_IDLE_DELAY_MS = 60_000;

let started = false;
let backgroundTimer: ReturnType<typeof setTimeout> | null = null;
let wentIdle = false;

const clearBackgroundTimer = () => {
    if (backgroundTimer) {
        clearTimeout(backgroundTimer);
        backgroundTimer = null;
    }
};

// Starts listening for the app going to/returning from the background on
// native platforms (Android/iOS). A no-op on web/Tauri, and a no-op if
// called more than once. Only affects the live status when the user's
// manual preference is "online" — a manual dnd/idle/offline is never
// overridden (enforced server-side, see synco_api services/presence.ts).
const useAppPresence = () => {
    if (started || !Capacitor.isNativePlatform()) return;
    started = true;

    App.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
            clearBackgroundTimer();
            if (wentIdle) {
                wentIdle = false;
                const socket = await useWSocket();
                socket.value?.emit('presence:foreground');
            }
            return;
        }

        clearBackgroundTimer();
        backgroundTimer = setTimeout(async () => {
            backgroundTimer = null;
            wentIdle = true;
            const socket = await useWSocket();
            socket.value?.emit('presence:background');
        }, BACKGROUND_IDLE_DELAY_MS);
    });
};

export default useAppPresence;
