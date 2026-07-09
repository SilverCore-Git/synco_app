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

        // Wait for Keycloak token to be available (auth may still be in progress)
        let token = getToken();
        if (!token) {
            console.log('[WS] Token not yet available, waiting for Keycloak authentication...');
            token = await new Promise<string>((resolve, reject) => {
                let elapsed = 0;
                const interval = setInterval(() => {
                    const t = getToken();
                    if (t) {
                        clearInterval(interval);
                        resolve(t);
                    }
                    elapsed += 200;
                    if (elapsed >= 10000) {
                        clearInterval(interval);
                        reject(new Error("No token found after 10s wait"));
                    }
                }, 200);
            });
        }

        const socketPath = import.meta.env?.VITE_SOCKET_PATH || '/socket';
        const isDev = import.meta.env.VITE_DEV === 'true';
        const useHttps = import.meta.env?.VITE_USE_HTTPS !== 'false';
        
        // In development, route through Vite's proxy to avoid self-signed cert rejection
        // In production, connect directly to the socket server
        let socketUrl: string | undefined;
        if (isDev) {
            // Vite proxy at /socket forwards to https://localhost:3467/socket
            socketUrl = window.location.origin;
            console.log('[WS] Dev mode: routing through Vite proxy at', socketUrl);
        } else {
            socketUrl = import.meta.env?.VITE_SOCKET_URL || 'https://localhost:3467';
            if (socketUrl) {
                if (useHttps) {
                    socketUrl = socketUrl.replace(/^wss?:\/\//i, 'https://');
                } else {
                    socketUrl = socketUrl.replace(/^wss?:\/\//i, 'http://');
                }
            }
        }
        
        console.warn('[WS] Connecting to:', socketUrl, 'with path:', socketPath);
        
        // Diagnostic: test if the proxy/backend is reachable
        try {
            const testUrl = (socketUrl || '') + socketPath + '/?EIO=4&transport=polling';
            console.warn('[WS] Proxy test:', testUrl);
            const res = await fetch(testUrl);
            const text = await res.text();
            console.warn('[WS] Proxy test result:', res.status, text.substring(0, 120));
        } catch (proxyErr: any) {
            console.error('[WS] ❌ Proxy/backend unreachable:', proxyErr.message);
        }
        console.warn('[WS] Keycloak state:', { authenticated: keycloak.authenticated, tokenLength: keycloak.token?.length, subject: keycloak.subject });
        
        socket.value = io(socketUrl || undefined, {
            path: socketPath,
            auth: (cb) => {
                const t = getToken();
                cb({ token: t });
            },
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            transports: ['polling'], // Force polling only to bypass Vite proxy WebSocket drop issues
            withCredentials: false, // Not needed — we use token auth, not cookies
            timeout: 20000,
        });
        
        // Socket instance created — release the lock so other callers get this socket
        isConnecting.value = false;

        socket.value.on("connect", () => {
            console.warn("[WS] ✅ Connected with ID:", socket.value?.id);
        });

        socket.value.on("connect_error", (err) => {
            console.error("[WS] ❌ Connection Error:", err.message);
            console.error("[WS] Token present:", !!getToken());
        });

        socket.value.on("disconnect", (reason) => {
            console.warn("[WS] Disconnected:", reason);
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
    if (!socketRef.value) return false;
    
    console.log('[WS] Waiting for socket connection...');
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.error('[WS] Socket connection timeout after', timeoutMs, 'ms');
            console.error('[WS] Socket state:', {
                connected: socketRef.value?.connected,
                disconnected: socketRef.value?.disconnected,
                id: socketRef.value?.id
            });
            cleanup();
            resolve(false);
        }, timeoutMs);
        
        const cleanup = () => {
            clearTimeout(timeout);
            socketRef.value?.off('connect', onConnect);
            socketRef.value?.io?.off('reconnect_failed', onReconnectFailed);
        };
        
        const onConnect = () => {
            console.log('[WS] Socket connected successfully');
            cleanup();
            resolve(true);
        };
        
        const onReconnectFailed = () => {
            console.error('[WS] All reconnection attempts exhausted');
            cleanup();
            resolve(false);
        };
        
        socketRef.value?.on('connect', onConnect);
        // Only fail when ALL reconnection attempts are exhausted, not on first error
        socketRef.value?.io?.on('reconnect_failed', onReconnectFailed);
    });
};

export { disconnectSocket, waitForSocketConnection };
export default useWSocket;