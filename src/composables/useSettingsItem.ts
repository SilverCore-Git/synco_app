import { ref, watch, nextTick, type Ref } from "vue";
import { sdb } from '@/assets/settingsDB';
import { keycloak } from "@/assets/keycloak";
import waitFor from "@/assets/utils/waitfor";

const settingsCache: Partial<Record<string, {
    Item: Ref<any>,
    isLoaded: Ref<boolean>
}>> = {};


const useSettingsItem = (item: string, defaultValue: any) => {
    
    if (!settingsCache[item]) 
    {
        
        settingsCache[item] = {
            Item: ref<any>(undefined),
            isLoaded: ref<boolean>(false)
        };

        const currentUser = keycloak;

        (async () => {

            // keycloak.init() (App.vue) runs async and is typically still in flight
            // when this composable is called at component setup time. Reading/writing
            // settings before it resolves hits the API unauthenticated, silently falls
            // back to defaultValue, and never retries — so a saved preference (e.g.
            // theme) never loads and looks like it "didn't stick" after every refresh.
            const authenticated = await waitFor(() => !!currentUser.authenticated, 10_000);
            if (!authenticated) return;

            const cacheEntry = settingsCache[item]!;

            const value = await sdb.get(currentUser, item);

            if (value === undefined || value === null)
            {
                cacheEntry.Item.value = defaultValue;
                // `defaultValue === undefined` veut dire "pas de valeur par
                // défaut à retenir" (ex: dépend du device au moment de la
                // lecture) — ne rien persister tant que l'utilisateur n'a
                // pas fait de choix explicite (voir useAgendaViewMode.ts).
                if (defaultValue !== undefined) {
                    await sdb.set(currentUser, item, defaultValue);
                }
            }
            else
            {
                cacheEntry.Item.value = value;
            }

            await nextTick();

            watch(cacheEntry.Item, async (newVal) => {
                await sdb.set(currentUser, item, newVal);
            }, { deep: true });

            cacheEntry.isLoaded.value = true;

        })();

    }

    return {
        Item: settingsCache[item]!.Item,
        isLoaded: settingsCache[item]!.isLoaded
    };
    
};

export default useSettingsItem;