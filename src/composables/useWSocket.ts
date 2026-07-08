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
                if (!isConnecting.value) {
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
        const useHttps = import.meta.env?.VITE_USE_HTTPS !== 'false';
        
        // Use explicit socket URL based on HTTPS configuration
        let socketUrl = import.meta.env?.VITE_SOCKET_URL || 'https://localhost:3467';
        
        // Ensure we use https/http for socket.io instead of wss/ws to allow polling fallback
        if (useHttps) {
            socketUrl = socketUrl.replace(/^wss?:\/\//i, 'https://');
        } else {
            socketUrl = socketUrl.replace(/^wss?:\/\//i, 'http://');
        }
        
        console.log('[WS] Connecting to:', socketUrl || 'current origin via proxy', 'with path:', socketPath);
        
        socket.value = io(socketUrl || undefined, {
            path: socketPath,
            auth: () => ({ token: getToken() }),
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['polling', 'websocket'], // Allow polling fallback for dev proxy
            withCredentials: true,
            timeout: 20000, // Add explicit connection timeout (20s)
        });

        socket.value.on("connect", () => {
            console.log("[WS] Connected with ID:", socket.value?.id);
            isConnecting.value = false;
        });

        socket.value.on("connect_error", (err) => {
            console.error("[WS] Connection Error:", err.message, err.stack);
            console.error("[WS] Socket URL:", socketUrl);
            console.error("[WS] Token present:", !!getToken());
            
            // Check for self-signed certificate errors
            if (err.message && (
                err.message.includes('self-signed') ||
                err.message.includes('MOZILLA_PKIX_ERROR_SELF_SIGNED_CERT') ||
                err.message.includes('certificate') ||
                err.message.includes('NS_ERROR')
            )) {
                console.error(
                    "[WS] 🔒 SELF-SIGNED CERTIFICATE ERROR 🔒\n" +
                    "========================================\n" +
                    "The backend uses a self-signed certificate.\n" +
                    "To resolve this error:\n\n" +
                    
                    "🦊 Firefox:\n" +
                    "1. Open: https://192.168.1.73:3467 in a new tab\n" +
                    "2. Click 'Advanced' → 'Accept the Risk and Continue'\n" +
                    "   OR\n" +
                    "1. Go to about:config\n" +
                    "2. Accept the warning\n" +
                    "3. Search: security.cert_pinning.enforcement_level\n" +
                    "4. Set to 0 (disabled)\n\n" +
                    
                    "🌐 Chrome/Edge:\n" +
                    "Launch with command line flags:\n" +
                    "  --ignore-certificate-errors\n" +
                    "  --allow-running-insecure-content\n" +
                    "OR install mkcert for trusted local development certificates\n\n" +
                    
                    "💡 Recommended:\n" +
                    "Install mkcert to generate locally-trusted certificates:\n" +
                    "  brew install mkcert      # macOS\n" +
                    "  sudo apt install mkcert  # Debian/Ubuntu\n" +
                    "  mkcert -install\n" +
                    "  mkcert localhost 127.0.0.1 192.168.1.73\n" +
                    "Then replace certs/server.{key,crt} with the generated files\n"
                );
            }
            
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
        
        socket.value.on("connect_timeout", (timeout) => {
            console.error("[WS] Connection timeout after", timeout, "ms");
            isConnecting.value = false;
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
            console.error('[WS] Socket state:', {
                connected: socketRef.value?.connected,
                connecting: socketRef.value?.connecting,
                disconnected: socketRef.value?.disconnected,
                id: socketRef.value?.id
            });
            resolve(false);
        }, timeoutMs);
        
        const onConnect = () => {
            clearTimeout(timeout);
            console.log('[WS] Socket connected successfully');
            socketRef.value?.off('connect_error', onError);
            resolve(true);
        };
        
        const onError = (err: any) => {
            clearTimeout(timeout);
            console.error('[WS] Socket connection error while waiting:', err.message);
            socketRef.value?.off('connect', onConnect);
            resolve(false);
        };
        
        socketRef.value?.once('connect', onConnect);
        socketRef.value?.once('connect_error', onError);
    });
};

export { disconnectSocket, waitForSocketConnection };
export default useWSocket;