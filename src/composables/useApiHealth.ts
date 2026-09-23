import { ref } from "vue";

// Optimiste par défaut : tant qu'aucune requête REST n'a encore échoué, on ne
// veut pas afficher la bannière avant même d'avoir observé une vraie coupure
// (même logique que connectionAttempted dans useWSocket.ts).
const isApiConnected = ref<boolean>(true);

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

const HEALTH_CHECK_INTERVAL_MS = 5000;

// Contrairement à socket.io (qui retente tout seul en continu), les appels
// REST sont ponctuels — sans ce polling, une coupure resterait affichée
// indéfiniment dans la bannière tant que rien ne relance spontanément un
// appel vers l'API, même une fois le serveur revenu.
const startHealthPolling = () => {
    if (healthCheckTimer) return;
    healthCheckTimer = setInterval(async () => {
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/health`);
            if (res.ok) reportApiSuccess();
        } catch {
            // Toujours down, on retente au prochain tick.
        }
    }, HEALTH_CHECK_INTERVAL_MS);
};

const stopHealthPolling = () => {
    if (healthCheckTimer) {
        clearInterval(healthCheckTimer);
        healthCheckTimer = null;
    }
};

// Appelé par sfetch() sur une erreur réseau ou un 502/503/504 (passerelle
// injoignable — pas une erreur applicative comme 401/404, qui prouve au
// contraire que le serveur a bien répondu).
const reportApiFailure = () => {
    if (isApiConnected.value) {
        console.warn('[API] Connectivité perdue');
    }
    isApiConnected.value = false;
    startHealthPolling();
};

const reportApiSuccess = () => {
    if (!isApiConnected.value) {
        console.warn('[API] Connectivité rétablie');
    }
    isApiConnected.value = true;
    stopHealthPolling();
};

export { isApiConnected, reportApiFailure, reportApiSuccess };
