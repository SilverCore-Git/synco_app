import { useToast } from "@/composables/useToast";
import type { DMMessage, Message, OrgMember } from "@/types/types";
import { ref, watch } from "vue";
import useWSocket, { waitForSocketConnection } from "./useWSocket";
import router from "@/router";


type NotificationType = 'toast' | 'notif:msg' | 'notif:dmmsg' | 'notif:call' | 'notif:privateMeet' | 'notif:privateMeetMsg' | 'notif:missedCall' | 'notif:missedMeet';

interface Notification {

    id: number;
    type: NotificationType;
    createdAt: Date;

    // if toast
    message?: string;
    toastType?: 'success' | 'error' | 'warning' | 'info';

    // if notif:msg
    msg?: Message;

    // if notif:dmmsg
    dmmsg?: DMMessage;

    // if notif:call
    call?: OrgMember;

    // if notif:privateMeet (invitation entrante) et notif:privateMeetMsg
    // (message reçu pendant qu'on n'est pas sur la session) — jamais le
    // contenu du message, juste qui a écrit (même règle que notif:dmmsg).
    privateMeet?: OrgMember;
    privateMeetMsg?: OrgMember;

    // if notif:missedCall / notif:missedMeet — laissé derrière quand un
    // appel DM ou une invitation à une session éphémère n'a jamais abouti
    // (annulé par l'appelant, ou personne n'a répondu), pour qu'il en reste
    // une trace visible même une fois la sonnerie/carte d'appel disparue.
    missedCall?: OrgMember;
    missedMeet?: OrgMember;

}

const { toasts } = useToast();
const callNotif = ref<OrgMember[]>([]);
const messageNotif = ref<Message[]>([]);
const notifications = ref<Notification[]>([]);

const removeAfter: number = 3000;

// Compteur monotone plutôt que `notifications.value.length + 1` (l'ancien
// schéma) : une fois qu'une notification est retirée entre-temps, `length`
// peut retomber sur une valeur déjà utilisée par une autre — deux
// notifications distinctes se retrouvant avec le même id, `remove(id)`
// (utilisé maintenant pour retirer une carte d'invitation précise dès
// l'annulation par l'appelant) risquerait alors de retirer la mauvaise.
let nextNotifId = 1;
const allocNotifId = () => nextNotifId++;

watch(callNotif, (newList) => {

    if (newList && newList.length > 0)
    {

        const lastCall = newList[newList.length - 1];

        const alreadyNotified = notifications.value.some(n => n.call?.id === lastCall?.id);

        if (!alreadyNotified)
        {

            notifications.value.push({
                id: allocNotifId(),
                type: 'notif:call',
                createdAt: new Date(),
                call: lastCall
            });

        }

    }

    // Un appel qui sort de callNotif (accepté, refusé, ou annulé par
    // l'appelant avant réponse) doit aussi faire disparaître sa carte de
    // notification : sinon elle reste affichée indéfiniment avec des
    // boutons "Répondre"/"Refuser" pointant vers un appel déjà terminé.
    const stillRinging = new Set((newList || []).map(m => m.id));
    notifications.value = notifications.value.filter(n => n.type !== 'notif:call' || stillRinging.has(n.call?.id));

}, { deep: true });


let lastMsgNotifLength: number = messageNotif.value.length;
watch(() => messageNotif.value, () => {

    if (messageNotif.value.length > lastMsgNotifLength)
    {

        const id: number = allocNotifId();

        notifications.value.push({
            id,
            type: 'notif:msg',
            createdAt: new Date(),
            msg: messageNotif.value[messageNotif.value.length - 1]
        });

        setTimeout(() => {
            remove(id);
        }, removeAfter);
        
    }

    lastMsgNotifLength = messageNotif.value.length;

}, { deep: true })


let lastToastsLength: number = toasts.value.length;
watch(() => toasts.value, () => {

    if (toasts.value.length > lastToastsLength)
    {

        const id: number = allocNotifId();

        notifications.value.push({
            id,
            type: 'toast',
            createdAt: new Date(),
            message: toasts.value[toasts.value.length - 1]?.message,
            toastType: toasts.value[toasts.value.length - 1]?.type
        });

        setTimeout(() => {
            remove(id);
        }, removeAfter);

    }

    lastToastsLength = toasts.value.length;

}, { deep: true })


const remove = (id: number) => {
    notifications.value = notifications.value.filter(n => n.id !== id);
}

// Retourne l'id de la notification créée — utilisé notamment pour retirer
// précisément une carte d'invitation privateMeet (timeout: -1, donc pas
// d'auto-suppression) dès que l'appelant annule.
const notify = (type: NotificationType, payload: any, timeout?: number): number => {

    const id: number = allocNotifId();

    if (type === 'toast')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            message: payload.message,
            toastType: payload.toastType
        });
    }
    else if (type === 'notif:msg')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            msg: payload
        });
    }
    else if (type === 'notif:dmmsg')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            dmmsg: payload
        });
    }
    else if (type === 'notif:call')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            call: payload
        });
    }
    else if (type === 'notif:privateMeet')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            privateMeet: payload
        });
    }
    else if (type === 'notif:privateMeetMsg')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            privateMeetMsg: payload
        });
    }
    else if (type === 'notif:missedCall')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            missedCall: payload
        });
    }
    else if (type === 'notif:missedMeet')
    {
        notifications.value.push({
            id,
            type,
            createdAt: new Date(),
            missedMeet: payload
        });
    }

    if (timeout !== -1)
    {
        setTimeout(() => {
            remove(id);
        }, timeout || removeAfter);
    }

    return id;

};

// Référence du handler posé par ce composable (et lui seul), pour pouvoir le
// retirer sans toucher aux autres écouteurs de 'notif:new-message' sur le
// même socket partagé (ex: OrgLayout.vue en pose un aussi, pour tout autre chose).
let currentNewMessageHandler: ((payload: { message: Message, spaceId?: string, orgId?: string }) => void) | null = null;

const initListener = async () => {

    const socket = await useWSocket();

    const connected = await waitForSocketConnection(socket, 15000);
    if (!connected) {
        console.warn('[Notifications] Socket not connected, cannot setup listeners');
        return;
    }

    // initListener() est appelé depuis plusieurs endroits (Notifications.vue,
    // ChatView.vue, ThreadView.vue) sur le même socket singleton : on retire
    // notre propre ancien écouteur avant d'en poser un nouveau, pour ne jamais
    // en empiler plusieurs — sans jamais toucher aux écouteurs d'autres
    // composables (ex: OrgLayout.vue) sur ce même événement.
    if (currentNewMessageHandler) {
        socket.value?.off('notif:new-message', currentNewMessageHandler);
    }

    currentNewMessageHandler = async ({ message, spaceId, orgId, threadName }: { message: Message, spaceId?: string, orgId?: string, threadName?: string }) => {

        if (router.currentRoute.value.params.threadId == message.threadId) return;

        // Le contenu du message (en clair ou chiffré E2EE) ne doit jamais
        // apparaître dans une notification — uniquement qui l'a envoyé, où, et
        // sa photo de profil. On ne recopie donc jamais `content` ici ; seul
        // notif.msg.threadName (et notif.msg.sender/id/threadId, déjà présents
        // sur `message`) sert à construire le toast.
        const notifPayload = message as any;

        delete notifPayload.content;
        notifPayload.spaceId = spaceId;
        notifPayload.orgId = orgId;
        notifPayload.threadName = threadName;

        messageNotif.value.push(notifPayload);

    };

    socket.value?.on('notif:new-message', currentNewMessageHandler);

}



export default function () 
{
    return {
        messageNotif,
        callNotif,
        notifications,
        initListener,
        remove,
        notify
    }
}

export type { 
    Notification, 
    NotificationType 
};