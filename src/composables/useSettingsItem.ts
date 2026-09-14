import { ref, watch, nextTick, type Ref } from "vue";
import { sdb } from '@/assets/settingsDB';
import { keycloak } from "@/assets/keycloak";

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

        setTimeout(async () => {

            if (currentUser)
            {

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

            }

        }, 1);

    }

    return {
        Item: settingsCache[item]!.Item,
        isLoaded: settingsCache[item]!.isLoaded
    };
    
};

export default useSettingsItem;