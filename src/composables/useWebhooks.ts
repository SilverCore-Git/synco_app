// ============================================
// Composable pour la gestion des Webhooks
// ============================================

import { ref, computed } from 'vue';
import sfetch from '@/assets/utils/sfetch';
import { useToast } from './useToast';
import type {
  Webhook,
  WebhookPermission,
  WebhookMessage,
  WebhookAuditLog,
  WebhookStats,
  WebhookTargetChannel,
  CreateWebhookDTO,
  UpdateWebhookDTO,
  CreateWebhookResponse,
  ListWebhooksResponse,
  GetWebhookResponse,
  RegenerateTokenResponse,
  GetWebhookStatsResponse,
  TestWebhookPayload,
  TestWebhookResponse
} from '@/types/webhooks';
import {
  generateWebhookToken,
  generateWebhookSecret
} from '@/assets/utils/webhookCrypto';
import { user } from '@/assets/var';

// ============================================
// State principal
// ============================================

const webhooks = ref<Webhook[]>([]);
const loading = ref<boolean>(false);
const error = ref<string | null>(null);
const currentWebhook = ref<Webhook | null>(null);
const webhookMessages = ref<WebhookMessage[]>([]);
const webhookAuditLogs = ref<WebhookAuditLog[]>([]);
const webhookStats = ref<WebhookStats | null>(null);

// ============================================
// Getters
// ============================================

const activeWebhooks = computed(() => webhooks.value.filter(wh => wh.isActive));
const inactiveWebhooks = computed(() => webhooks.value.filter(wh => !wh.isActive));
const totalWebhooks = computed(() => webhooks.value.length);
const e2eeEnabledWebhooks = computed(() => webhooks.value.filter(wh => wh.e2eeEnabled));

// ============================================
// Fonctions API
// ============================================

/**
 * Crée un nouveau webhook
 */
async function createWebhook(
  spaceId: string,
  dto: CreateWebhookDTO
): Promise<CreateWebhookResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    // Générer les tokens et secrets
    const token = generateWebhookToken();
    const secret = generateWebhookSecret();
    
    const response = await sfetch(`/api/spaces/${spaceId}/webhooks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...dto,
        token,
        secret
      })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la création du webhook');
    }
    
    const data: CreateWebhookResponse = await response.json();
    
    // Ajouter le webhook à la liste locale
    if (data.success && data.webhook) {
      webhooks.value.push(data.webhook);
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la création: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Liste tous les webhooks d'un space
 */
async function listWebhooks(spaceId: string): Promise<ListWebhooksResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/spaces/${spaceId}/webhooks`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la récupération des webhooks');
    }
    
    const data: ListWebhooksResponse = await response.json();
    
    if (data.success) {
      webhooks.value = data.webhooks;
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère un webhook spécifique
 */
async function getWebhook(webhookId: string): Promise<GetWebhookResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la récupération du webhook');
    }
    
    const data: GetWebhookResponse = await response.json();
    
    if (data.success && data.webhook) {
      currentWebhook.value = data.webhook;
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Met à jour un webhook
 */
async function updateWebhook(
  webhookId: string,
  dto: UpdateWebhookDTO
): Promise<GetWebhookResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la mise à jour du webhook');
    }
    
    const data: GetWebhookResponse = await response.json();
    
    if (data.success && data.webhook) {
      // Mettre à jour dans la liste locale
      const index = webhooks.value.findIndex(wh => wh.id === webhookId);
      if (index !== -1) {
        webhooks.value[index] = data.webhook;
      }
      currentWebhook.value = data.webhook;
    }
    
    const toast = useToast();
    toast.show('Webhook mis à jour avec succès', 'success');
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Supprime un webhook
 */
async function deleteWebhook(webhookId: string): Promise<boolean> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la suppression du webhook');
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Supprimer de la liste locale
      webhooks.value = webhooks.value.filter(wh => wh.id !== webhookId);
      
      if (currentWebhook.value?.id === webhookId) {
        currentWebhook.value = null;
      }
      
      const toast = useToast();
      toast.show('Webhook supprimé avec succès', 'success');
      
      return true;
    }
    
    return false;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la suppression: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Régénère le token d'un webhook
 */
async function regenerateWebhookToken(webhookId: string): Promise<RegenerateTokenResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}/regenerate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la régénération du token');
    }
    
    const data: RegenerateTokenResponse = await response.json();
    
    if (data.success && data.webhook) {
      // Mettre à jour dans la liste locale
      const index = webhooks.value.findIndex(wh => wh.id === webhookId);
      if (index !== -1) {
        webhooks.value[index] = data.webhook;
      }
      currentWebhook.value = data.webhook;
      
      const toast = useToast();
      toast.show('Token régénéré avec succès. Le nouvel URL est actif.', 'success');
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la régénération: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Active/Désactive un webhook
 */
async function toggleWebhookActive(webhookId: string, isActive: boolean): Promise<boolean> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive })
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la mise à jour du statut');
    }
    
    const data: GetWebhookResponse = await response.json();
    
    if (data.success && data.webhook) {
      // Mettre à jour dans la liste locale
      const index = webhooks.value.findIndex(wh => wh.id === webhookId);
      if (index !== -1) {
        webhooks.value[index] = data.webhook;
      }
      currentWebhook.value = data.webhook;
      
      const toast = useToast();
      toast.show(`Webhook ${isActive ? 'activé' : 'désactivé'} avec succès`, 'success');
      
      return true;
    }
    
    return false;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec de la mise à jour: ${error.value}`, 'error');
    return false;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère les statistiques d'un webhook
 */
async function getWebhookStats(webhookId: string): Promise<GetWebhookStatsResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}/stats`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la récupération des statistiques');
    }
    
    const data: GetWebhookStatsResponse = await response.json();
    
    if (data.success && data.stats) {
      webhookStats.value = data.stats;
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère les messages d'un webhook
 */
async function getWebhookMessages(webhookId: string, limit: number = 50, offset: number = 0): Promise<WebhookMessage[] | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}/messages?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la récupération des messages');
    }
    
    const data = await response.json();
    
    if (data.success && data.messages) {
      webhookMessages.value = data.messages;
      return data.messages;
    }
    
    return [];
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère les logs d'audit d'un webhook
 */
async function getWebhookAuditLogs(webhookId: string, limit: number = 50, offset: number = 0): Promise<WebhookAuditLog[] | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}/audit-logs?limit=${limit}&offset=${offset}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors de la récupération des logs');
    }
    
    const data = await response.json();
    
    if (data.success && data.logs) {
      webhookAuditLogs.value = data.logs;
      return data.logs;
    }
    
    return [];
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du chargement: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Envoie un message de test via un webhook
 */
async function testWebhook(
  webhookId: string,
  payload: TestWebhookPayload
): Promise<TestWebhookResponse | null> {
  loading.value = true;
  error.value = null;
  
  try {
    const response = await sfetch(`/api/webhooks/${webhookId}/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Erreur lors du test du webhook');
    }
    
    const data: TestWebhookResponse = await response.json();
    
    if (data.success) {
      const toast = useToast();
      toast.show('Message de test envoyé avec succès!', 'success');
    } else {
      const toast = useToast();
      toast.show(`Échec du test: ${data.error || data.message}`, 'error');
    }
    
    return data;
  } catch (err: any) {
    error.value = err.message || 'Erreur inconnue';
    const toast = useToast();
    toast.show(`Échec du test: ${error.value}`, 'error');
    return null;
  } finally {
    loading.value = false;
  }
}

/**
 * Récupère les channels (threads) disponibles pour un space
 * Utilise les threads depuis le store local (openedOrg) au lieu de faire un appel API
 * Note: Les threads sont chargés via WebSocket au démarrage de l'application
 */
async function getSpaceChannels(spaceId: string): Promise<WebhookTargetChannel[] | null> {
  try {
    const { openedOrg } = await import('@/assets/var');
    
    // Attendre que openedOrg soit chargé si nécessaire
    if (!openedOrg?.value) {
      console.warn('[Webhooks] openedOrg non chargé, attente...');
      // Attendre un peu et réessayer
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    const space = openedOrg?.value?.spaces?.find(s => s.id === spaceId);
    
    if (!space) {
      console.warn(`[Webhooks] Space ${spaceId} non trouvé dans openedOrg`);
      return null;
    }
    
    if (!space.threads || space.threads.length === 0) {
      console.warn(`[Webhooks] Aucun thread trouvé pour le space ${spaceId}`);
      return [];
    }
    
    // Mapper les threads vers le format attendu par les webhooks
    return space.threads.map(thread => ({
      id: thread.id,
      name: thread.name,
      type: thread.type
    }));
  } catch (err: any) {
    console.error('[Webhooks] Erreur lors de la récupération des channels:', err);
    return null;
  }
}

/**
 * Copie l'URL du webhook dans le clipboard
 */
async function copyWebhookUrl(webhook: Webhook): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(webhook.url);
    const toast = useToast();
    toast.show('URL copiée dans le clipboard!', 'success');
    return true;
  } catch (err) {
    console.error('Erreur lors de la copie:', err);
    const toast = useToast();
    toast.show('Échec de la copie dans le clipboard', 'error');
    return false;
  }
}

/**
 * Copie le secret HMAC dans le clipboard
 */
async function copyWebhookSecret(webhook: Webhook): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(webhook.secret);
    const toast = useToast();
    toast.show('Secret copié dans le clipboard!', 'success');
    return true;
  } catch (err) {
    console.error('Erreur lors de la copie:', err);
    const toast = useToast();
    toast.show('Échec de la copie dans le clipboard', 'error');
    return false;
  }
}

/**
 * Copie la clé publique E2EE dans le clipboard
 */
async function copyWebhookPublicKey(webhook: Webhook): Promise<boolean> {
  if (!webhook.publicKey) {
    const toast = useToast();
    toast.show('Aucune clé publique disponible', 'warning');
    return false;
  }
  
  try {
    await navigator.clipboard.writeText(webhook.publicKey);
    const toast = useToast();
    toast.show('Clé publique copiée dans le clipboard!', 'success');
    return true;
  } catch (err) {
    console.error('Erreur lors de la copie:', err);
    const toast = useToast();
    toast.show('Échec de la copie dans le clipboard', 'error');
    return false;
  }
}

// ============================================
// Fonctions utilitaires
// ============================================

/**
 * Vérifie si l'utilisateur a la permission de gérer un webhook
 */
function canManageWebhook(webhook: Webhook): boolean {
  // Vérifier si l'utilisateur actuel est le créateur ou un admin du space
  // Cette logique dépend de l'implémentation des permissions dans Synco
  // Pour l'instant, on suppose que le créateur peut gérer
  return webhook.creatorId === user.value?.id;
}

/**
 * Vérifie si une permission est active pour un webhook
 */
function hasPermission(webhook: Webhook, permission: WebhookPermission): boolean {
  return webhook.permissions.includes(permission);
}

/**
 * Formate une permission pour l'affichage
 */
function formatPermission(permission: WebhookPermission): string {
  const labels: Record<WebhookPermission, string> = {
    send_messages: 'Envoyer des messages',
    send_embeds: 'Envoyer des embeds',
    send_files: 'Envoyer des fichiers',
    mention_everyone: 'Mentionner tout le monde (@everyone)',
    mention_roles: 'Mentionner des rôles',
    manage_webhook: 'Gérer le webhook'
  };
  return labels[permission] || permission;
}

/**
 * Génère un payload de test par défaut
 */
function generateDefaultTestPayload(): TestWebhookPayload {
  return {
    content: '✅ Test du webhook depuis Synco',
    username: 'Test Bot',
    avatar_url: 'https://cdn.silvercore.fr/static/files/silverteams/avatar/default.png',
    embeds: [
      {
        title: 'Test de Webhook',
        description: 'Ce message a été envoyé automatiquement pour vérifier que votre webhook fonctionne correctement.',
        color: '#22c55e',
        fields: [
          { name: 'Statut', value: '✅ Fonctionnel', inline: true },
          { name: 'Timestamp', value: new Date().toISOString(), inline: true }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  };
}

/**
 * Rafraîchit la liste des webhooks
 */
async function refreshWebhooks(spaceId: string): Promise<void> {
  await listWebhooks(spaceId);
}

/**
 * Réinitialise le state
 */
function resetState(): void {
  webhooks.value = [];
  currentWebhook.value = null;
  webhookMessages.value = [];
  webhookAuditLogs.value = [];
  webhookStats.value = null;
  error.value = null;
}

// ============================================
// Export du composable
// ============================================

export function useWebhooks() {
  return {
    // State
    webhooks,
    loading,
    error,
    currentWebhook,
    webhookMessages,
    webhookAuditLogs,
    webhookStats,
    
    // Getters
    activeWebhooks,
    inactiveWebhooks,
    totalWebhooks,
    e2eeEnabledWebhooks,
    
    // Fonctions API
    createWebhook,
    listWebhooks,
    getWebhook,
    updateWebhook,
    deleteWebhook,
    regenerateWebhookToken,
    toggleWebhookActive,
    getWebhookStats,
    getWebhookMessages,
    getWebhookAuditLogs,
    testWebhook,
    getSpaceChannels,
    
    // Fonctions utilitaires
    copyWebhookUrl,
    copyWebhookSecret,
    copyWebhookPublicKey,
    canManageWebhook,
    hasPermission,
    formatPermission,
    generateDefaultTestPayload,
    refreshWebhooks,
    resetState
  };
}

// Export des types pour utilisation externe
export type {
  Webhook,
  WebhookPermission,
  WebhookMessage,
  WebhookAuditLog,
  WebhookStats,
  WebhookTargetChannel,
  CreateWebhookDTO,
  UpdateWebhookDTO
};
