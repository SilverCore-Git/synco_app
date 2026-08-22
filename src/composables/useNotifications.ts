import { useToast } from "@/composables/useToast";
import type { DMMessage, Message, OrgMember } from "@/types/types";
import { ref, watch } from "vue";
import useWSocket, { waitForSocketConnection } from "./useWSocket";
import { useRoute } from "vue-router";


type NotificationType = 'toast' | 'notif:msg' | 'notif:dmmsg' | 'notif:call' | 'notif:privateMeet';

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

    // if notif:privateMeet
    privateMeet?: OrgMember;

}

const { toasts } = useToast();
const callNotif = ref<OrgMember[]>([]);
const messageNotif = ref<Message[]>([]);
const notifications = ref<Notification[]>([]);

const removeAfter: number = 3000;

watch(callNotif, (newList) => {

    if (!newList || newList.length === 0) return;

    const lastCall = newList[newList.length - 1];

    const alreadyNotified = notifications.value.some(n => n.call?.id === lastCall?.id);

    if (!alreadyNotified) 
    {
    
        notifications.value.push({
            id: Date.now(), 
            type: 'notif:call',
            createdAt: new Date(),
            call: lastCall
        });
        
    }

}, { deep: true });


let lastMsgNotifLength: number = messageNotif.value.length;
watch(() => messageNotif.value, () => {

    if (messageNotif.value.length > lastMsgNotifLength)
    {

        const id: number = notifications.value.length + 1;

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

        const id: number = notifications.value.length + 1;

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

const notify = (type: NotificationType, payload: any, timeout?: number) => {
    
    const id: number = notifications.value.length + 1;

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

    if (timeout !== -1)
    {
        setTimeout(() => {
            remove(id);
        }, timeout || removeAfter);
    }

};

// Référence du handler posé par ce composable (et lui seul), pour pouvoir le
// retirer sans toucher aux autres écouteurs de 'notif:new-message' sur le
// même socket partagé (ex: OrgLayout.vue en pose un aussi, pour tout autre chose).
let currentNewMessageHandler: ((payload: { message: Message, spaceId?: string, orgId?: string }) => void) | null = null;

const initListener = async () => {

    const route = useRoute();
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

    currentNewMessageHandler = async ({ message, spaceId, orgId }: { message: Message, spaceId?: string, orgId?: string }) => {

        if (route.params.threadId == message.threadId) return;

        let decryptedMessage = message as any;

        decryptedMessage.content = message.content;
        decryptedMessage.spaceId = spaceId;
        decryptedMessage.orgId = orgId;

        messageNotif.value.push(decryptedMessage);

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