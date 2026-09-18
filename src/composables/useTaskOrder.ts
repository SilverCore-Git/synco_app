import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { Task } from '@/types/types';

export function useTaskOrder(orgId: string) {
    const orderMap = ref<Record<string, number>>({});

    const fetchOrder = async () => {
        try {
            const res = await sfetch(`/api/tasks/${orgId}/task-order`);
            if (res.ok) {
                orderMap.value = await res.json();
            }
        } catch (e) {
            console.error('[useTaskOrder] Failed to fetch task order', e);
        }
    };

    const sortByOrder = (tasks: Task[]): Task[] => {
        return [...tasks].sort((a, b) => {
            const posA = orderMap.value[a.id];
            const posB = orderMap.value[b.id];

            if (posA !== undefined && posB !== undefined) return posA - posB;
            if (posA !== undefined) return -1;
            if (posB !== undefined) return 1;

            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    };

    const persistOrder = async (orderedTaskIds: string[]) => {
        orderedTaskIds.forEach((taskId, index) => {
            orderMap.value[taskId] = index;
        });

        try {
            const res = await sfetch(`/api/tasks/${orgId}/task-order`, {
                method: 'PUT',
                body: JSON.stringify({ orderedTaskIds })
            });
            if (!res.ok) throw new Error('API Error');
        } catch (e) {
            console.error('[useTaskOrder] Failed to persist task order', e);
            await fetchOrder();
        }
    };

    return { orderMap, fetchOrder, sortByOrder, persistOrder };
}
