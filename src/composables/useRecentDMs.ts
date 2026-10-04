import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';

export interface RecentDM {
    userId: string;
    lastInteraction: string;
}

// État module-level (partagé entre tous les appelants) plutôt que local à un
// composant : ThreadsBar.vue se démonte/remonte à chaque navigation vers/depuis
// Tasks/Agenda/Home (cf. OrgLayout.vue), et refaire l'appel réseau à chaque
// fois causait le délai visible + le "saut" de tri que l'utilisateur signalait
// ("ça recalcule à chaque ouverture"). Chargé une seule fois par session,
// tenu à jour ensuite par recordDMInteraction() (appelé depuis le listener
// socket persistant d'OrgLayout.vue, jamais démonté).
const recentDMUsers = ref<RecentDM[]>([]);
const loaded = ref(false);
let loadingPromise: Promise<void> | null = null;

async function fetchRecentDMs(): Promise<void> {
    if (loaded.value) return;
    if (loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
        try {
            const res = await sfetch('/api/users/me/dms/recent');
            if (res.ok) {
                recentDMUsers.value = await res.json();
            }
            loaded.value = true;
        } catch (e) {
            console.error('[useRecentDMs] Échec du chargement des DM récents:', e);
        } finally {
            loadingPromise = null;
        }
    })();

    return loadingPromise;
}

function recordDMInteraction(peerId: string, timestamp: string) {
    const existing = recentDMUsers.value.find(r => r.userId === peerId);
    if (existing) {
        existing.lastInteraction = timestamp;
    } else {
        recentDMUsers.value.push({ userId: peerId, lastInteraction: timestamp });
    }
}

/** Id du dernier utilisateur avec qui une conversation a eu lieu, ou null si aucune. */
function getMostRecentDMUserId(): string | null {
    if (recentDMUsers.value.length === 0) return null;
    return [...recentDMUsers.value].sort(
        (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime()
    )[0]!.userId;
}

export function useRecentDMs() {
    return { recentDMUsers, loaded, fetchRecentDMs, recordDMInteraction, getMostRecentDMUserId };
}
