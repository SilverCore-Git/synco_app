import type { DMMessage, Message } from "@/types/types";
import { inject, provide, ref, type InjectionKey, type Ref } from "vue";


interface ResponseState {
    messageWillBeResponded: Ref<Message | DMMessage | null>;
    setMessageWillBeResponded: (msg: Message | DMMessage | null) => void;
}

const createResponseState = (): ResponseState => {
    const messageWillBeResponded = ref<Message | DMMessage | null>(null);
    return {
        messageWillBeResponded,
        setMessageWillBeResponded: (msg) => { messageWillBeResponded.value = msg; },
    };
};

// État global historique, toujours utilisé par les DM (ChatView/ChatMessage).
const globalState = createResponseState();

const RESPONSE_KEY: InjectionKey<ResponseState> = Symbol('response');

/**
 * Donne à un sous-arbre (une ChatTimeline) sa propre réponse en cours : deux
 * timelines côte à côte (ex. canaux PUBLIC et INTERNAL d'un ticket) ne
 * doivent pas partager le message auquel on répond. À appeler dans le
 * `setup()` du composant qui possède la timeline.
 */
export const provideResponse = (): ResponseState => {
    const state = createResponseState();
    provide(RESPONSE_KEY, state);
    return state;
};

// Réponse de la timeline englobante si elle en fournit une, sinon l'état
// global (DM). Doit être appelé dans un `setup()`.
const useResponse = (): ResponseState => inject(RESPONSE_KEY, null) ?? globalState;

export default useResponse;
