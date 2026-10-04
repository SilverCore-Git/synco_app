// ============================================
// Composable pour les rapports d'activité
// ============================================

import { ref } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type { ActivityReport } from '@/types/activityReports';

const reports = ref<ActivityReport[]>([]);
const loading = ref<boolean>(false);

/** Corps envoyé à l'API : les champs dérivés côté serveur n'en font pas partie. */
type ReportPayload = Omit<
    ActivityReport,
    'id' | 'organization' | 'space' | 'nextRunAt' | 'lastSentAt'
>;

export const useActivityReports = () => {
    const toast = useToast();

    const handleError = async (response: Response, fallback: string): Promise<never> => {
        let message = fallback;
        try {
            const body = await response.json();
            if (body?.error) message = body.error;
        } catch {
            // Corps non-JSON : on garde le message générique.
        }
        toast.show(message, 'error');
        throw new Error(message);
    };

    const fetchReports = async (): Promise<ActivityReport[]> => {
        loading.value = true;
        try {
            const response = await sfetch('/api/activity-reports');
            if (!response.ok) return await handleError(response, 'Chargement des rapports impossible');
            reports.value = await response.json();
            return reports.value;
        } finally {
            loading.value = false;
        }
    };

    const createReport = async (payload: ReportPayload): Promise<ActivityReport> => {
        const response = await sfetch('/api/activity-reports', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return await handleError(response, 'Création du rapport impossible');

        const created: ActivityReport = await response.json();
        reports.value.push(created);
        toast.show('Rapport créé');
        return created;
    };

    const updateReport = async (id: string, payload: Omit<ReportPayload, 'organizationId'>): Promise<ActivityReport> => {
        const response = await sfetch(`/api/activity-reports/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) return await handleError(response, 'Enregistrement impossible');

        const updated: ActivityReport = await response.json();
        const index = reports.value.findIndex(r => r.id === id);
        if (index !== -1) reports.value[index] = updated;
        toast.show('Rapport enregistré');
        return updated;
    };

    /** Bascule depuis la liste, sans ouvrir l'éditeur. */
    const toggleReport = async (id: string, enabled: boolean): Promise<void> => {
        const response = await sfetch(`/api/activity-reports/${id}/enabled`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled }),
        });
        if (!response.ok) {
            await handleError(response, 'Changement impossible');
            return;
        }

        const updated: ActivityReport = await response.json();
        const index = reports.value.findIndex(r => r.id === id);
        if (index !== -1) reports.value[index] = updated;
    };

    const deleteReport = async (id: string): Promise<void> => {
        const response = await sfetch(`/api/activity-reports/${id}`, { method: 'DELETE' });
        if (!response.ok) {
            await handleError(response, 'Suppression impossible');
            return;
        }
        reports.value = reports.value.filter(r => r.id !== id);
        toast.show('Rapport supprimé');
    };

    /** Rend l'e-mail sans l'envoyer — même chemin de code que l'envoi réel. */
    const previewReport = async (id: string): Promise<{ subject: string; html: string; totalItems: number }> => {
        const response = await sfetch(`/api/activity-reports/${id}/preview`, { method: 'POST' });
        if (!response.ok) return await handleError(response, 'Aperçu impossible');
        return await response.json();
    };

    const sendTestReport = async (id: string): Promise<void> => {
        const response = await sfetch(`/api/activity-reports/${id}/test`, { method: 'POST' });
        if (!response.ok) {
            await handleError(response, "L'envoi de test a échoué");
            return;
        }
        toast.show('E-mail de test envoyé');
    };

    return {
        reports,
        loading,
        fetchReports,
        createReport,
        updateReport,
        toggleReport,
        deleteReport,
        previewReport,
        sendTestReport,
    };
};
