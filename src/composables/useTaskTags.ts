import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import type { Tag } from '@/types/types';
import { useToast } from '@/composables/useToast';

export function useTaskTags(orgId: string) {
    const tags = ref<Tag[]>([]);
    const loading = ref(false);
    const toast = useToast();

    const loadTags = async () => {
        loading.value = true;
        try {
            const res = await sfetch(`/api/tasks/${orgId}/tags`);
            if (res.ok) {
                tags.value = await res.json();
            }
        } catch (e) {
            console.error('[useTaskTags] Failed to load tags', e);
        } finally {
            loading.value = false;
        }
    };

    const createTag = async (name: string, color: string): Promise<Tag | null> => {
        try {
            const res = await sfetch(`/api/tasks/${orgId}/tags`, {
                method: 'POST',
                body: JSON.stringify({ name, color })
            });
            if (res.ok) {
                const tag: Tag = await res.json();
                tags.value.push(tag);
                tags.value.sort((a, b) => a.name.localeCompare(b.name));
                return tag;
            }
            const err = await res.json().catch(() => null);
            toast.show(err?.error || 'Erreur lors de la création du tag', 'error');
            return null;
        } catch (e) {
            toast.show('Erreur lors de la création du tag', 'error');
            return null;
        }
    };

    const updateTag = async (tagId: string, data: { name?: string; color?: string }): Promise<Tag | null> => {
        try {
            const res = await sfetch(`/api/tasks/${orgId}/tags/${tagId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            if (res.ok) {
                const updated: Tag = await res.json();
                const idx = tags.value.findIndex(t => t.id === tagId);
                if (idx !== -1) tags.value[idx] = updated;
                return updated;
            }
            const err = await res.json().catch(() => null);
            toast.show(err?.error || 'Erreur lors de la modification du tag', 'error');
            return null;
        } catch (e) {
            toast.show('Erreur lors de la modification du tag', 'error');
            return null;
        }
    };

    const deleteTag = async (tagId: string): Promise<boolean> => {
        try {
            const res = await sfetch(`/api/tasks/${orgId}/tags/${tagId}`, { method: 'DELETE' });
            if (res.ok) {
                tags.value = tags.value.filter(t => t.id !== tagId);
                return true;
            }
            const err = await res.json().catch(() => null);
            toast.show(err?.error || 'Erreur lors de la suppression du tag', 'error');
            return false;
        } catch (e) {
            toast.show('Erreur lors de la suppression du tag', 'error');
            return false;
        }
    };

    return { tags, loading, loadTags, createTag, updateTag, deleteTag };
}
