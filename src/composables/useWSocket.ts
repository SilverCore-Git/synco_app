import { keycloak, onTokenRefresh } from "@/assets/keycloak";
import { io, type Socket } from "socket.io-client";
import { ref, type Ref } from "vue";
import { debugLog, debugWarn } from "@/assets/utils/debugLog";

const socket = ref<Socket | null>(null);
const isConnecting = ref<boolean>(false);
let unsubscribeTokenRefresh: (() => void) | null = null;

// État de connexion exposé pour l'UI (cf. ConnectionStatusBanner.vue) — vrai
// dès l'événement 'connect', remis à faux sur tout 'disconnect'.
// connectionAttempted distingue "pas encore essayé de se connecter" (avant
// tout appel à useWSocket(), ex: pendant le login) de "en train de se
// (re)connecter" — sans lui, la bannière "Déconnecté" flasherait au tout
// premier chargement de l'appli avant même la première tentative.
const isConnected = ref<boolean>(false);
const connectionAttempted = ref<boolean>(false);

const getToken = () => keycloak.token || '';

// Keeps the live socket's session alive across Keycloak token refreshes.
// Previously this disconnected the socket to force a fresh handshake with
// the new token — but a client-initiated disconnect (reason "io client
// disconnect") never auto-reconnects in socket.io, so every token refresh
// permanently killed the connection until something incidentally called
// useWSocket() again. The server already exposes 'auth:refresh' for exactly
// this (see ws.ts) — use it to push the new token in place, no disconnect.
const forceReconnect = async () => {
    if (socket.value?.connected) {
        socket.value.emit('auth:refresh', getToken(), (res: { ok?: boolean }) => {
            if (!res?.ok) {
                console.warn('[WS] auth:refresh rejected, forcing reconnect');
                socket.value?.disconnect().connect();
            }
        });
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
    
    // Return any existing instance, connected or still connecting — not just
    // connected ones. Checking `.connected` here left a window between
    // `io()` being called (which releases isConnecting, see below) and the
    // 'connect' event firing where a concurrent caller would pass both
    // checks and spin up a second, redundant socket instance.
    if (socket.value) return socket as Ref<Socket | null>;

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
    connectionAttempted.value = true;

    try {

        // Wait for Keycloak token to be available (auth may still be in progress)
        let token = getToken();
        if (!token) {
            debugLog('[WS] Token not yet available, waiting for Keycloak authentication...');
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
        
        if (isDev) console.warn('[WS] Connecting to:', socketUrl, 'with path:', socketPath);
        
        // Diagnostic: test if the proxy/backend is reachable
        if (isDev) {
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
        }
        
        socket.value = io(socketUrl || undefined, {
            path: socketPath,
            auth: (cb) => {
                const t = getToken();
                cb({ token: t });
            },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            // 'websocket' en premier ne "tente puis retombe sur polling" que
            // si tryAllTransports:true est aussi activé (vérifié dans
            // engine.io-client : _onError ne fait shift()+réessaie sur le
            // transport suivant que sous cette condition, jamais par défaut).
            // Sans ce flag — absent ici avant ce fix — un réseau qui bloque
            // purement le handshake WebSocket (proxy d'entreprise, certains
            // réseaux publics/mobiles) fait échouer identiquement CHAQUE
            // tentative de reconnexion, indéfiniment, même serveur up et
            // atteignable en HTTP classique. 'polling' en premier est le
            // comportement par défaut de socket.io (le plus éprouvé,
            // compatible partout) — le passage à 'websocket' se fait ensuite
            // automatiquement dès que la connexion est stable, au prix d'un
            // aller-retour de négociation en plus au tout premier connect.
            transports: ['polling', 'websocket'],
            withCredentials: false, // Not needed — we use token auth, not cookies
            timeout: 20000,
        });
        
        // Socket instance created — release the lock so other callers get this socket
        isConnecting.value = false;

        socket.value.on("connect", () => {
            debugWarn("[WS] ✅ Connected with ID:", socket.value?.id);
            isConnected.value = true;
        });

        socket.value.on("connect_error", async (err) => {
            isConnected.value = false;
            console.error("[WS] ❌ Connection Error:", err.message);
            console.error("[WS] Token present:", !!getToken());

            if (keycloak.authenticated) {
                try {
                    await keycloak.updateToken(-1);
                } catch (e) {
                    console.error("[WS] Failed to force refresh token after connection error", e);
                }
            }

            // `active` (propriété publique documentée de socket.io-client)
            // dit si CE Socket écoute toujours les tentatives de reconnexion
            // du Manager. Un connect_error "ordinaire" (timeout réseau,
            // websocket temporairement injoignable) laisse active à true :
            // reconnection:true fait déjà tout le travail tout seul, l'appel
            // à connect() ci-dessous ferait juste doublon avec sa propre
            // boucle de retry en cours — voire pire, la perturberait.
            // En revanche, un connect_error causé par un paquet CONNECT_ERROR
            // renvoyé par le serveur (ex: notre middleware io.use() a rejeté
            // le token au moment précis de la tentative — le genre de course
            // qu'on limite déjà côté serveur, mais qui reste possible dans un
            // cas limite comme un onglet resté en veille très longtemps) fait
            // passer active à false : socket.io-client appelle destroy() en
            // interne AVANT même d'émettre cet événement (cf. onpacket() dans
            // node_modules/socket.io-client/build/cjs/socket.js), désabonnant
            // définitivement ce Socket du Manager "pour éviter les
            // reconnexions". Le Manager continue bien de rouvrir le transport
            // en arrière-plan, mais plus personne n'écoute ce succès pour
            // notre namespace — dans CE cas précis seulement, il faut
            // explicitement rappeler connect() nous-mêmes, sans quoi la
            // connexion reste cassée pour de bon même une fois le token
            // corrigé.
            if (socket.value && !socket.value.active) {
                setTimeout(() => socket.value?.connect(), 1000);
            }
        });

        socket.value.on("disconnect", async (reason) => {
            isConnected.value = false;
            console.warn("[WS] Disconnected:", reason);
            // socket.io does not auto-reconnect after "io server disconnect"
            // (server called socket.disconnect(), e.g. the token-expiry
            // revalidation in ws.ts) or "io client disconnect" — every other
            // reason (transport close, ping timeout, ...) already retries via
            // the `reconnection` option. Without this the socket stays dead
            // until some unrelated component happens to call useWSocket()
            // again. Refresh the token first so we don't immediately hit the
            // same expired-token wall on the next attempt.
            if (reason === "io server disconnect" || reason === "io client disconnect") {
                if (keycloak.authenticated) {
                    try {
                        await keycloak.updateToken(-1);
                    } catch (e) {
                        console.error("[WS] Failed to refresh token before reconnect", e);
                    }
                }
                socket.value?.connect();
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
    // Déconnexion volontaire (ex: logout) — pas une coupure à signaler,
    // la bannière ne doit pas s'afficher tant que personne n'a redemandé
    // de connexion.
    isConnected.value = false;
    connectionAttempted.value = false;
};

const waitForSocketConnection = async (socketRef: Ref<Socket | null>, timeoutMs: number = 15000): Promise<boolean> => {
    if (socketRef.value?.connected) return true;
    if (!socketRef.value) return false;
    
    debugLog('[WS] Waiting for socket connection...');
    
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
            debugLog('[WS] Socket connected successfully');
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

export { disconnectSocket, waitForSocketConnection, isConnected, connectionAttempted };
export default useWSocket;