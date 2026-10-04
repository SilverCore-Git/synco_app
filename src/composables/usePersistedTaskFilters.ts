import { ref, watch, type Ref } from 'vue';

export interface TaskFilters {
    userId: string | null;
    tagIds: string[];
    spaceId: string | null;
}

const DEFAULTS: TaskFilters = { userId: null, tagIds: [], spaceId: null };

function read(key: string): TaskFilters {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return { ...DEFAULTS, tagIds: [] };
        const parsed = JSON.parse(raw);
        return {
            userId: typeof parsed.userId === 'string' ? parsed.userId : null,
            tagIds: Array.isArray(parsed.tagIds) ? parsed.tagIds.filter((t: unknown) => typeof t === 'string') : [],
            spaceId: typeof parsed.spaceId === 'string' ? parsed.spaceId : null,
        };
    } catch {
        return { ...DEFAULTS, tagIds: [] };
    }
}

function write(key: string, filters: TaskFilters) {
    try {
        if (!filters.userId && !filters.tagIds.length && !filters.spaceId) {
            localStorage.removeItem(key);
        } else {
            localStorage.setItem(key, JSON.stringify(filters));
        }
    } catch {
        // localStorage indisponible : filtres non persistés, sans impact fonctionnel
    }
}

/**
 * Filtres du gestionnaire de tâches persistés par appareil (localStorage),
 * pour qu'on les retrouve en revenant sur la page. `getKey` est réévalué :
 * le composant est réutilisé d'un espace à l'autre (RouterView keyé par
 * route.name dans OrgLayout.vue), donc on recharge les filtres propres au
 * nouvel espace quand la clé change.
 */
export function usePersistedTaskFilters(getKey: () => string) {
    const filterUserId: Ref<string | null> = ref(null);
    const filterTagIds: Ref<string[]> = ref([]);
    const filterSpaceId: Ref<string | null> = ref(null);

    let loading = false;
    const load = (key: string) => {
        loading = true;
        const f = read(key);
        filterUserId.value = f.userId;
        filterTagIds.value = f.tagIds;
        filterSpaceId.value = f.spaceId;
        loading = false;
    };

    watch(getKey, load, { immediate: true });

    watch([filterUserId, filterTagIds, filterSpaceId], () => {
        if (loading) return;
        write(getKey(), {
            userId: filterUserId.value,
            tagIds: filterTagIds.value,
            spaceId: filterSpaceId.value,
        });
    }, { deep: true, flush: 'sync' });

    return { filterUserId, filterTagIds, filterSpaceId };
}
