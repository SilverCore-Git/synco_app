import { computed, ref } from "vue";

// Durée par défaut quand l'API ne précise pas le délai (en-tête Retry-After
// absent ou illisible).
const DEFAULT_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 15 * 60;

// Horodatage (ms) de fin du blocage, ou null si aucun blocage actif.
const blockedUntil = ref<number | null>(null);
const now = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | null = null;

const secondsLeft = computed(() =>
    blockedUntil.value === null ? 0 : Math.max(0, Math.ceil((blockedUntil.value - now.value) / 1000))
);
const isRateLimited = computed(() => blockedUntil.value !== null);

const clear = () => {
    blockedUntil.value = null;
    if (tickTimer) {
        clearInterval(tickTimer);
        tickTimer = null;
    }
};

// Retry-After peut être un nombre de secondes ou une date HTTP.
const parseRetryAfter = (header: string | null): number => {
    if (!header) return DEFAULT_COOLDOWN_SECONDS;
    const asNumber = Number(header);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const asDate = Date.parse(header);
    if (!Number.isNaN(asDate)) return Math.max(1, Math.ceil((asDate - Date.now()) / 1000));
    return DEFAULT_COOLDOWN_SECONDS;
};

// Appelé par sfetch() sur un 429 : bloque l'UI (RateLimitOverlay.vue) jusqu'à
// la fin du délai plutôt que de laisser les écrans en chargement infini.
const reportRateLimited = (retryAfterHeader: string | null) => {
    const seconds = Math.min(parseRetryAfter(retryAfterHeader), MAX_COOLDOWN_SECONDS);
    const until = Date.now() + seconds * 1000;
    // Plusieurs requêtes en vol reçoivent le 429 en rafale : on garde le délai le plus long.
    if (blockedUntil.value === null || until > blockedUntil.value) blockedUntil.value = until;
    now.value = Date.now();
    if (!tickTimer) {
        tickTimer = setInterval(() => {
            now.value = Date.now();
            if (blockedUntil.value !== null && now.value >= blockedUntil.value) clear();
        }, 500);
    }
};

export { isRateLimited, secondsLeft, reportRateLimited, clear as dismissRateLimit };
