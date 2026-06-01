import keycloak from "@/assets/keycloak";
import isDesktopApp from "@/assets/isDesktopApp";
import { io, type Socket } from "socket.io-client";
import { ref, type Ref } from "vue";

const socket = ref<Socket | null>(null);
const isConnecting = ref<boolean>(false);

const useWSocket = async (): Promise<Ref<Socket | null>> => {
    
    if (socket.value?.connected) return socket as Ref<Socket | null>;

    if (isConnecting.value)
    {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if (socket.value) {
                    clearInterval(check);
                    resolve(socket as Ref<Socket | null>);
                }
            }, 100);
        });
    }

    isConnecting.value = true;

    try {

        const token = keycloak.token;

        if (!token) throw new Error("No token found");

        // Adapt Socket.io URL for Tauri (may use different hostname/port)
        const socketUrl = isDesktopApp()
          ? (import.meta.env?.VITE_SOCKET_URL_DESKTOP || import.meta.env?.VITE_SOCKET_URL || 'localhost:3467')
          : (import.meta.env?.VITE_SOCKET_URL || 'localhost:3467');

        socket.value = io(socketUrl, {
            path: import.meta.env?.VITE_SOCKET_PATH || '/socket.io',
            auth: { token },
            reconnection: true,
            reconnectionAttempts: 5,
            protocols: import.meta.env.DEV == false ? ["websocket"] : ["websocket", "polling"],
            // In Tauri (desktop), we don't need secure flag since it's local
            ...(isDesktopApp() ? { secure: false } : {}),
        });

        socket.value.on("connect", () => {
            console.log("[WS] Connected with ID:", socket.value?.id);
            isConnecting.value = false;
        });

        socket.value.on("connect_error", (err) => {
            console.error("[WS] Connection Error:", err.message);
            isConnecting.value = false;
        });

    } 
    catch (error) 
    {
        console.error("[WS] Auth Error:", error);
        isConnecting.value = false;
    }

    return socket as Ref<Socket | null>;
    
};

export default useWSocket;