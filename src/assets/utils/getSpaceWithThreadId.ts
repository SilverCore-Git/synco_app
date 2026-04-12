import type { Thread } from '@/types/types';
import { openedOrg } from '../var';


export default function getSpaceIdByThreadId(threadId: string): string | null 
{

    const org = openedOrg.value;
    if (!org) return null;

    const isInsideHomeThreads = org.home.threads.find((t: Thread) => t.id === threadId);
    const isInsideHomeCategories = org.home.categories?.find(cat => 
        cat.threads?.find((t: Thread) => t.id === threadId)
    );

    if (isInsideHomeThreads || isInsideHomeCategories) 
    {
        return "home";
    }

    if (org.spaces && org.spaces.length > 0) 
    {

        for (const space of org.spaces) 
        {

            const hasThreadDirectly = space.threads?.some((t: Thread) => t.id === threadId);
            
            const hasThreadInCategories = space.categories?.some(cat => 
                cat.threads?.some((t: Thread) => t.id === threadId)
            );

            if (hasThreadDirectly || hasThreadInCategories) 
            {
                return space.id;
            }

        }

    }

    return null;

}