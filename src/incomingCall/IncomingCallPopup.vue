<template>
    <main v-if="data" class="popup" :class="{ 'popup--framed': framed }" data-tauri-drag-region>
        <div class="avatar-wrap" data-tauri-drag-region>
            <span class="ring" />
            <span class="ring ring--late" />
            <img :src="data.avatar" alt="" class="avatar" draggable="false" />
        </div>

        <p class="kind" data-tauri-drag-region>
            <i class="bi" :class="data.kind === 'meet' ? 'bi-shield-lock-fill' : 'bi-telephone-inbound-fill'" />
            {{ data.kind === 'meet' ? 'Session éphémère' : 'Appel entrant' }}
        </p>
        <h1 class="name" data-tauri-drag-region>{{ data.name }}</h1>

        <div class="actions">
            <button class="round round--decline" :disabled="sent" aria-label="Refuser" @click="act('decline')">
                <i class="bi bi-telephone-x-fill" />
            </button>
            <button class="round round--answer" :disabled="sent" aria-label="Répondre" @click="act('answer')">
                <i class="bi bi-telephone-fill" />
            </button>
        </div>
    </main>
</template>

<script setup lang="ts">
/**
 * Pop-up d'appel entrant (appel DM ou session éphémère) de l'app de bureau, façon Discord : petite
 * fenêtre toujours au premier plan, ouverte par desktopCallPopup.ts quand la fenêtre principale n'a pas
 * le focus. Elle affiche qui appelle et renvoie Répondre / Refuser ; la fenêtre principale fait le reste
 * et la ferme.
 */
import { onMounted, onUnmounted, ref } from 'vue';
import { emitTo, listen } from '@tauri-apps/api/event';
import { isMacDesktop } from '@/assets/isDesktopApp';
import {
    EV_ACTION, EV_DATA, EV_READY, MAIN_LABEL,
    type IncomingCallAction, type IncomingCallData,
} from './protocol';

const data = ref<IncomingCallData | null>(null);
const sent = ref(false);
// macOS : fenêtre opaque (la transparence y exige l'API privée), pas de cadre arrondi dessiné en CSS.
const framed = !isMacDesktop();

let unlisten: (() => void) | undefined;

onMounted(async () => {
    unlisten = await listen(EV_DATA, ({ payload }: { payload: IncomingCallData }) => {
        data.value = payload;
        sent.value = false;
        document.body.classList.toggle('dark', payload.theme === 'dark');
        document.body.classList.toggle('light', payload.theme === 'light');
    });
    await emitTo(MAIN_LABEL, EV_READY);
});

onUnmounted(() => unlisten?.());

async function act(action: IncomingCallAction['action']) {
    if (!data.value || sent.value) return;
    sent.value = true;
    await emitTo(MAIN_LABEL, EV_ACTION, { action, kind: data.value.kind, callerId: data.value.callerId } satisfies IncomingCallAction);
}
</script>

<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: transparent !important; user-select: none; }
#app { height: 100%; }
</style>

<style scoped>
.popup {
    height: 100%; box-sizing: border-box; display: flex; flex-direction: column; align-items: center;
    justify-content: center; gap: 0.35rem; padding: 1.5rem 1.25rem 1.4rem; color: var(--text);
    background:
        radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--primary) 22%, transparent), transparent 70%),
        var(--bg);
    cursor: default;
}
.popup--framed { border-radius: 14px; border: 1px solid var(--border-color); }

.avatar-wrap { position: relative; width: 96px; height: 96px; margin-bottom: 0.9rem; display: grid; place-items: center; }
.avatar {
    position: relative; width: 96px; height: 96px; border-radius: 50%; object-fit: cover;
    border: 3px solid color-mix(in srgb, var(--primary) 70%, transparent);
}
.ring {
    position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--primary);
    animation: ring 1.8s ease-out infinite;
}
.ring--late { animation-delay: 0.9s; }
@keyframes ring { from { transform: scale(1); opacity: 0.7; } to { transform: scale(1.55); opacity: 0; } }

.kind {
    display: flex; align-items: center; gap: 0.4rem; margin: 0;
    font-size: 0.7rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--primary);
}
.name {
    margin: 0; max-width: 100%; font-size: 1.25rem; font-weight: 700; line-height: 1.3;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.actions { display: flex; gap: 2.5rem; margin-top: 1.4rem; }
.round {
    width: 3.5rem; height: 3.5rem; border-radius: 50%; border: none; display: grid; place-items: center;
    font-size: 1.3rem; color: #fff; cursor: pointer; transition: transform 0.15s ease, filter 0.15s ease;
}
.round:hover:not(:disabled) { transform: scale(1.08); filter: brightness(1.08); }
.round:active:not(:disabled) { transform: scale(0.96); }
.round:disabled { opacity: 0.6; cursor: default; }
.round--decline { background: #e5484d; }
.round--answer { background: var(--primary); animation: nudge 1.4s ease-in-out infinite; }
@keyframes nudge { 0%, 70%, 100% { transform: rotate(0); } 75% { transform: rotate(-12deg); } 85% { transform: rotate(12deg); } }

@media (prefers-reduced-motion: reduce) {
    .ring, .round--answer { animation: none; }
}
</style>
