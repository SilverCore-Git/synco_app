import keycloak, { onTokenRefresh } from "@/assets/keycloak";
import { io, type Socket } from "socket.io-client";
import { ref, type Ref } from "vue";

const socket = ref<Socket | null>(null);
const isConnecting = ref<boolean>(false);
let unsubscribeTokenRefresh: (() => void) | null = null;

const getToken = () => keycloak.token || '';

const forceReconnect = async () => {
    if (socket.value?.connected) {
        console.log('[WS] Forcing reconnection due to token refresh');
        socket.value.disconnect();
    }
};

const setupTokenRefreshListener = () => {
    if (unsubscribeTokenRefresh) {
        unsubscribeTokenRefresh();
    }
    unsubscribeTokenRefresh = onTokenRefresh(() => {
        forceReconnect();
    });
};

const useWSocket = async (): Promise<Ref<Socket | null>> => {
    
    if (socket.value?.connected) return socket as Ref<Socket | null>;

    if (isConnecting.value)
    {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (socket.value?.connected) {
                    clearInterval(check);
                    resolve(socket as Ref<Socket | null>);
                }
            }, 100);
        });
    }

    isConnecting.value = true;

    try {

        const token = getToken();

        if (!token) throw new Error("No token found");

        const socketPath = import.meta.env?.VITE_SOCKET_PATH || '/socket';
        const isDev = import.meta.env.VITE_DEV === 'true';
        
        const socketUrl = isDev ? undefined : (import.meta.env?.VITE_SOCKET_URL || 'https://localhost:3467');
        console.log('[WS] Connecting to:', socketUrl || 'window.location.origin', 'with path:', socketPath);
        
        socket.value = io(socketUrl, {
            path: socketPath,
            auth: () => ({ token: getToken() }),
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['websocket'],
            withCredentials: true,
        });

        socket.value.on("connect", () => {
            console.log("[WS] Connected with ID:", socket.value?.id);
            isConnecting.value = false;
        });

        socket.value.on("connect_error", (err) => {
            console.error("[WS] Connection Error:", err.message);
            isConnecting.value = false;
        });

        socket.value.on("disconnect", (reason) => {
            console.log("[WS] Disconnected:", reason);
            if (reason === "io server disconnect" || reason === "io client disconnect") {
                console.log("[WS] The disconnection was initiated by the server/client");
            } else {
                console.log("[WS] Attempting to reconnect...");
            }
        });

        setupTokenRefreshListener();

    } 
    catch (error) 
    {
        console.error("[WS] Auth Error:", error);
        isConnecting.value = false;
    }

    return socket as Ref<Socket | null>;
    
};

const disconnectSocket = () => {
    if (socket.value) {
        socket.value.disconnect();
        socket.value = null;
    }
    if (unsubscribeTokenRefresh) {
        unsubscribeTokenRefresh();
        unsubscribeTokenRefresh = null;
    }
};

const waitForSocketConnection = async (socketRef: Ref<Socket | null>, timeoutMs: number = 15000): Promise<boolean> => {
    if (socketRef.value?.connected) return true;
    
    console.log('[WS] Waiting for socket connection...');
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.error('[WS] Socket connection timeout after', timeoutMs, 'ms');
            resolve(false);
        }, timeoutMs);
        
        socketRef.value?.once('connect', () => {
            clearTimeout(timeout);
            console.log('[WS] Socket connected successfully');
            resolve(true);
        });
    });
};

export { disconnectSocket, waitForSocketConnection };
export default useWSocket;