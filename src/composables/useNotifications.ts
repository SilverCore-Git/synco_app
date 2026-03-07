import { useToast } from "@/composables/useToast";
import type { Message, OrgMember } from "@/types/types";
import { ref, watch } from "vue";
import useWSocket from "./useWSocket";


type NotificationType = 'toast' | 'notif:msg' | 'notif:call';

interface Notification {

    id: number;
    type: NotificationType;
    createAt: Date;

    // if toast
    message?: string;
    toastType?: 'success' | 'error' | 'warning' | 'info';

    // if notif:msg
    msg?: Message;

    // if notif:call
    call?: OrgMember;

}


const { toasts } = useToast();
const callNotif = ref<OrgMember[]>([]);
const messageNotif = ref<Message[]>([]);
const notifications = ref<Notification[]>([]);


let lastCallNotifLength: number = callNotif.value.length;
watch(() => callNotif.value, () => {

    if (callNotif.value.length > lastCallNotifLength)
    {
        notifications.value.push({
            id: notifications.value.length + 1,
            type: 'notif:call',
            createAt: new Date(),
            call: callNotif.value[callNotif.value.length - 1]
        });
    }

    lastCallNotifLength = callNotif.value.length;

})


let lastMsgNotifLength: number = messageNotif.value.length;
watch(() => messageNotif.value, () => {

    if (messageNotif.value.length > lastMsgNotifLength)
    {
        notifications.value.push({
            id: notifications.value.length + 1,
            type: 'notif:msg',
            createAt: new Date(),
            msg: messageNotif.value[messageNotif.value.length - 1]
        });
    }

    lastMsgNotifLength = messageNotif.value.length;

})


let lastToastsLength: number = toasts.value.length;
watch(() => toasts.value, () => {

    if (toasts.value.length > lastToastsLength)
    {
        notifications.value.push({
            id: notifications.value.length + 1,
            type: 'toast',
            createAt: new Date(),
            message: toasts.value[toasts.value.length - 1]?.message,
            toastType: toasts.value[toasts.value.length - 1]?.type
        });
    }

    lastToastsLength = toasts.value.length;

})


const remove = (id: number) => {
    notifications.value = notifications.value.filter(n => n.id !== id);
}


const initListener = async () => {

    const socket = await useWSocket();

    socket.value?.on('notif:new-message', ({ message }: { message: Message }) => {
        messageNotif.value.push(message);
    })

}



export default function () 
{
    return {
        messageNotif,
        callNotif,
        notifications,
        initListener,
        remove
    }
}

export type { 
    Notification, 
    NotificationType 
};