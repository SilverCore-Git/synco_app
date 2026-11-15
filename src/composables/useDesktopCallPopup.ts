import { computed, ref, watch } from 'vue';
import type { OrgMember } from '@/types/types';
import isDesktopApp, { isMacDesktop } from '@/assets/isDesktopApp';
import { openedOrg } from '@/assets/var';
import { defaultAvatar } from '@/assets/utils/defaultAvatar';
import { debugWarn } from '@/assets/utils/debugLog';
import router from '@/router';
import useSecurePeer from './useSecurePeer';
import usePrivateMeet from './usePrivatMeet';
import useNotifications from './useNotifications';
import useSettingsItem from './useSettingsItem';
import useTheme from './useTheme';
import {
    EV_ACTION, EV_DATA, EV_READY, POPUP_LABEL,
    type IncomingCallAction, type IncomingCallData, type IncomingCallKind,
} from '@/incomingCall/protocol';

/**
 * Pop-up d'appel entrant de l'app de bureau, façon Discord : quand un appel DM ou une invitation à une
 * session éphémère arrive alors que la fenêtre principale n'a pas le focus (autre app devant, réduite),
 * une petite fenêtre toujours au premier plan s'ouvre avec Répondre / Refuser. Fenêtre principale au
 * premier plan : la carte d'appel entrant habituelle suffit, la pop-up se ferme.
 *
 * Elle reflète l'état existant, sans en créer : `enteringCall` (useSecurePeer.ts) pour les appels, la
 * carte `notif:privateMeet` (useNotifications.ts) pour les invitations. Répondre / Refuser appellent les
 * mêmes fonctions que les boutons de la carte (Notifications.vue). Elle se ferme dès que l'appel n'est
 * plus en attente (réponse, refus, appelant qui raccroche).
 */

interface Incoming {
    kind: IncomingCallKind;
    callerId: string;
    member: OrgMember;
    /** Carte d'invitation à retirer (sessions éphémères). */
    notifId?: number;
    /** Simulation de dev : affichée même fenêtre principale au premier plan. */
    forced?: boolean;
}

const POPUP_WIDTH = 300;
const POPUP_HEIGHT = 360;

export default function useDesktopCallPopup(): void {
    if (!isDesktopApp()) return;

    const { enteringCall, acceptCall, rejectCall } = useSecurePeer();
    const { acceptIncomingMeet, declineIncomingMeet } = usePrivateMeet();
    const { notifications, remove } = useNotifications();
    const { Item: privacyMode } = useSettingsItem('privacyMode', false);
    const { resolvedTheme } = useTheme();

    // Mode dev seulement (retiré des builds) : appel simulé pour tester la pop-up sans second compte.
    const simulated = ref<Incoming | null>(null);

    const incoming = computed<Incoming | null>(() => {
        if (simulated.value) return simulated.value;
        const call = enteringCall.value;
        if (call) {
            const member = openedOrg.value?.members?.find(m => m.user?.id === call.peer);
            if (member) return { kind: 'call', callerId: call.peer, member };
        }
        const meet = notifications.value.find(n => n.type === 'notif:privateMeet' && n.privateMeet?.userId);
        if (meet?.privateMeet?.userId) {
            return { kind: 'meet', callerId: meet.privateMeet.userId, member: meet.privateMeet, notifId: meet.id };
        }
        return null;
    });

    /** Ce que la pop-up affiche en ce moment (null : fermée). */
    let shown: IncomingCallData | null = null;
    let mainFocused = true;

    const toPopupData = ({ kind, callerId, member }: Incoming): IncomingCallData => {
        const fullName = member.user?.name || 'Utilisateur inconnu';
        // Même règle que $p (main.ts) : en mode confidentialité, seulement l'initiale.
        const name = privacyMode.value ? fullName.charAt(0).toUpperCase() : fullName;
        return {
            kind,
            callerId,
            name,
            avatar: (!privacyMode.value && member.user?.avatarUrl) || defaultAvatar(name),
            theme: resolvedTheme.value,
        };
    };

    const tauri = Promise.all([
        import('@tauri-apps/api/webviewWindow'),
        import('@tauri-apps/api/window'),
        import('@tauri-apps/api/event'),
    ]).then(([webview, window, event]) => ({ ...webview, ...window, ...event }));

    async function openPopup(inc: Incoming) {
        const { WebviewWindow, emitTo } = await tauri;
        shown = toPopupData(inc);
        const existing = await WebviewWindow.getByLabel(POPUP_LABEL);
        if (existing) {
            await emitTo(POPUP_LABEL, EV_DATA, shown);
            await existing.show();
            return;
        }
        // Créée cachée : elle s'affiche une fois son contenu reçu (EV_READY), sans flash vide. Pas de
        // focus : on ne vole pas le clavier à ce que l'utilisateur est en train de taper.
        const popup = new WebviewWindow(POPUP_LABEL, {
            url: '/incoming-call.html',
            title: 'Appel entrant',
            width: POPUP_WIDTH,
            height: POPUP_HEIGHT,
            resizable: false,
            maximizable: false,
            minimizable: false,
            decorations: false,
            transparent: !isMacDesktop(),
            shadow: isMacDesktop(),
            alwaysOnTop: true,
            skipTaskbar: true,
            center: true,
            focus: false,
            visible: false,
        });
        void popup.once('tauri://error', (e: unknown) => debugWarn('[call-popup] ouverture impossible', e));
    }

    async function closePopup() {
        shown = null;
        const { WebviewWindow } = await tauri;
        const popup = await WebviewWindow.getByLabel(POPUP_LABEL);
        await popup?.close().catch(() => {});
    }

    async function bringMainToFront() {
        const { getCurrentWindow } = await tauri;
        const main = getCurrentWindow();
        await main.unminimize().catch(() => {});
        await main.show().catch(() => {});
        await main.setFocus().catch(() => {});
    }

    function sync() {
        const inc = incoming.value;
        if (!inc || (mainFocused && !inc.forced)) {
            if (shown) void closePopup();
            return;
        }
        if (!shown || shown.callerId !== inc.callerId || shown.kind !== inc.kind) void openPopup(inc);
    }

    async function onAction({ action, kind, callerId }: IncomingCallAction) {
        const inc = incoming.value;
        // Synco d'abord, la pop-up ensuite : sous Wayland (GNOME), c'est le clic tout juste reçu par la
        // pop-up qui autorise l'activation d'une autre fenêtre de l'app ; une fois la pop-up fermée, le
        // compositeur refuse de passer Synco au premier plan.
        if (action === 'answer') await bringMainToFront();
        await closePopup();
        if (!inc || inc.kind !== kind || inc.callerId !== callerId) return;

        if (import.meta.env.DEV && inc === simulated.value) {
            simulated.value = null;
            console.info(`[call-popup] simulation : ${action === 'answer' ? 'Répondre' : 'Refuser'} (${kind})`);
            return;
        }

        if (action === 'answer') {
            if (kind === 'call') {
                void router.push({ name: 'OrgThreadChat', params: { userId: inc.member.id } });
                void acceptCall();
            } else {
                if (inc.notifId !== undefined) remove(inc.notifId);
                void acceptIncomingMeet(inc.member);
            }
        } else if (kind === 'call') {
            rejectCall();
        } else {
            if (inc.notifId !== undefined) remove(inc.notifId);
            void declineIncomingMeet(inc.member);
        }
    }

    void (async () => {
        try {
            const { listen, emitTo, getCurrentWindow, WebviewWindow } = await tauri;
            await listen(EV_READY, async () => {
                const popup = await WebviewWindow.getByLabel(POPUP_LABEL);
                if (!shown) {
                    await popup?.close().catch(() => {});
                    return;
                }
                await emitTo(POPUP_LABEL, EV_DATA, shown);
                await popup?.show();
            });
            await listen(EV_ACTION, ({ payload }: { payload: IncomingCallAction }) => void onAction(payload));

            const main = getCurrentWindow();
            mainFocused = await main.isFocused();
            await main.onFocusChanged(({ payload: focused }: { payload: boolean }) => {
                mainFocused = focused;
                sync();
            });
        } catch (e) {
            debugWarn('[call-popup] initialisation impossible', e);
        }
        sync();
    })();

    watch(() => (incoming.value ? `${incoming.value.kind}:${incoming.value.callerId}` : null), sync);

    // Mode dev : Ctrl+Alt+K simule un appel, Ctrl+Alt+J une session éphémère, 3 s plus tard (le temps de
    // passer sur une autre fenêtre : la pop-up ne s'ouvre que si Synco n'a pas le focus). Raccroche seul
    // au bout de 30 s, comme l'appelant.
    // Depuis un terminal, `target/debug/app "fr.silvercore.synco://dev/simulate-call?kind=meet"` : le
    // lien arrive par l'instance unique et affiche la pop-up même si Synco a le focus.
    if (import.meta.env.DEV) {
        const simulate = (kind: IncomingCallKind, delay: number, forced: boolean) => {
            const member = openedOrg.value?.members?.find(m => m.user?.id && m.user.avatarUrl) ?? openedOrg.value?.members?.[0];
            if (!member) return console.info('[call-popup] simulation : aucune organisation ouverte');
            console.info(`[call-popup] simulation de ${kind} dans ${delay / 1000} s`);
            setTimeout(() => {
                const fake: Incoming = { kind, callerId: `simulated-${Date.now()}`, member, forced };
                simulated.value = fake;
                setTimeout(() => { if (simulated.value === fake) simulated.value = null; }, 30000);
            }, delay);
        };
        window.addEventListener('keydown', (e) => {
            if (!e.ctrlKey || !e.altKey || (e.code !== 'KeyK' && e.code !== 'KeyJ')) return;
            simulate(e.code === 'KeyJ' ? 'meet' : 'call', 3000, false);
        });
        void tauri.then(({ listen }) => listen('single-instance', ({ payload }: { payload: string[] }) => {
            const link = payload.find(a => a.startsWith('fr.silvercore.synco://dev/simulate-call'));
            if (!link) return;
            simulate(new URL(link).searchParams.get('kind') === 'meet' ? 'meet' : 'call', 1000, true);
        }));
    }
}
