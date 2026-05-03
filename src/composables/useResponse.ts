import type { Message } from "@/types/types";
import { ref } from "vue";


const messageWillBeResponded = ref<Message | null>(null);


const useResponse = () => {

    const setMessageWillBeResponded = (msg: Message | null) => {
        messageWillBeResponded.value = msg;
    };

    return {
        messageWillBeResponded,
        setMessageWillBeResponded
    };

}

export default useResponse;