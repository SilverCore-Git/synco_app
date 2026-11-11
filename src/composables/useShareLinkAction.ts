import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { user } from '@/assets/var';
import { shareLinksApi } from '@/services/shareLinks/api';

/**
 * Faut-il proposer « Lien de téléchargement » sur un fichier ou un dossier ?
 * Partager est réservé au propriétaire et aux rôles au-dessus du sien
 * (règle de synco_api) : le propriétaire d'un fichier ordinaire le voit tout
 * de suite ; sinon on demande à l'API, une seule fois, à la première
 * ouverture du menu.
 */
export function useShareLinkAction(target: () => {
    kind: 'file' | 'folder';
    id: string;
    ownerId?: string | null;
    /** Pièce jointe (message, DM, tâche) : jamais partageable par lien. */
    attachment?: boolean;
}) {
    const route = useRoute();
    const canShareLink = ref(false);
    let checked = false;

    async function checkShareLink(): Promise<void> {
        if (checked) return;
        checked = true;
        const t = target();
        if (t.attachment) return;
        if (t.kind === 'file' && t.ownerId && t.ownerId === user.value?.id) {
            canShareLink.value = true;
            return;
        }
        const orgId = String(route.params.orgId ?? '');
        if (!orgId) return;
        try {
            const { canShare } = await shareLinksApi.canShare(orgId, t.kind === 'file' ? { fileId: t.id } : { folderId: t.id });
            canShareLink.value = canShare;
        } catch {
            checked = false; // nouvel essai à la prochaine ouverture
        }
    }

    return { canShareLink, checkShareLink };
}
