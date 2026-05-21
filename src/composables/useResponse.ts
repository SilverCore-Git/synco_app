import type { DMMessage, Message } from "@/types/types";
import { ref } from "vue";


const messageWillBeResponded = ref<Message | DMMessage | null>(null);


const useResponse = () => {

    const setMessageWillBeResponded = (msg: Message | DMMessage | null) => {
        messageWillBeResponded.value = msg;
    };

    return {
        messageWillBeResponded,
        setMessageWillBeResponded
    };

}

export default useResponse;