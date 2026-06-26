// ============================================
// Types pour le système de Webhooks
// ============================================

// ============================================
// Permissions des Webhooks
// ============================================
export type WebhookPermission = 
  | 'send_messages'
  | 'send_embeds'
  | 'send_files'
  | 'mention_everyone'
  | 'mention_roles'
  | 'manage_webhook';

export const ALL_WEBHOOK_PERMISSIONS: WebhookPermission[] = [
  'send_messages',
  'send_embeds',
  'send_files',
  'mention_everyone',
  'mention_roles',
  'manage_webhook'
];

// ============================================
// Statut des Messages Webhook
// ============================================
export type WebhookMessageStatus = 'pending' | 'processed' | 'failed';

// ============================================
// Actions d'Audit
// ============================================
export type WebhookAuditAction = 
  | 'create'
  | 'update'
  | 'delete'
  | 'call'
  | 'regenerate_token'
  | 'activate'
  | 'deactivate';

// ============================================
// Embed Field
// ============================================
export interface WebhookEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// ============================================
// Embed Author/Footer
// ============================================
export interface WebhookEmbedAuthor {
  name?: string;
  icon_url?: string;
}

export interface WebhookEmbedFooter {
  text?: string;
  icon_url?: string;
}

// ============================================
// Embed
// ============================================
export interface WebhookEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: string;
  author?: WebhookEmbedAuthor;
  footer?: WebhookEmbedFooter;
  fields?: WebhookEmbedField[];
  timestamp?: string;
}

// ============================================
// Attachment
// ============================================
export interface WebhookAttachment {
  url: string;
  filename?: string;
  size?: number;
}

// ============================================
// Synco-specific extensions
// ============================================
export interface WebhookSyncoExtensions {
  encrypted?: boolean;
  targetChannelId?: string;
  rawPayload?: any;
  mappings?: Record<string, any>;
}

// ============================================
// Payload principal
// ============================================
export interface WebhookPayload {
  content?: string;
  embeds?: WebhookEmbed[];
  mentions?: string[];
  attachments?: WebhookAttachment[];
  username?: string;
  avatar_url?: string;
  encrypted?: boolean;
  nonce?: string;
  ephemeral?: boolean;
  // Extensions pour compatibilité
  _synco?: WebhookSyncoExtensions;
}

// ============================================
// Réponse après réception d'un message
// ============================================
export interface WebhookReceiveResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  receivedAt?: string;
  error?: string;
  message?: string;
  retryAfter?: number;
}

// ============================================
// Webhook (entité principale)
// ============================================
export interface Webhook {
  id: string;
  spaceId: string;
  creatorId: string;
  
  // Métadonnées
  name: string;
  description?: string;
  
  // Sécurité
  token: string;
  secret: string;
  
  // Chiffrement E2EE
  e2eeEnabled: boolean;
  publicKey?: string; // Clé publique (PEM format)
  privateKey?: string; // Clé privée chiffrée
  keyIv?: string; // IV pour déchiffrer la clé privée
  
  // Permissions
  permissions: WebhookPermission[];
  
  // Statut
  isActive: boolean;
  isRateLimited: boolean;
  rateLimitReset?: string | Date;
  
  // Statistiques
  lastUsedAt?: string | Date;
  usageCount: number;
  lastErrorAt?: string | Date;
  errorCount: number;
  
  // URLs
  url: string;
  
  // Timestamps
  createdAt: string | Date;
  updatedAt: string | Date;
  
  // Relations (optionnelles, pour le frontend)
  creator?: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  space?: {
    id: string;
    name: string;
  };
}

// ============================================
// Message Webhook (historique)
// ============================================
export interface WebhookMessage {
  id: string;
  webhookId: string;
  
  // Contenu
  rawPayload: any; // Payload brut reçu
  content?: string; // Contenu déchiffré
  nonce?: string; // IV pour déchiffrement
  isEncrypted: boolean;
  
  // Métadonnées
  senderName?: string;
  senderAvatar?: string;
  senderIp?: string;
  userAgent?: string;
  
  // Statut
  status: WebhookMessageStatus;
  errorMessage?: string;
  
  // Timestamps
  receivedAt: string | Date;
  processedAt?: string | Date;
  
  // Webhook associé (optionnel)
  webhook?: Webhook;
}

// ============================================
// Audit Log
// ============================================
export interface WebhookAuditLog {
  id: string;
  webhookId: string;
  
  // Action
  action: WebhookAuditAction;
  
  // Contexte
  ipAddress?: string;
  userAgent?: string;
  userId?: string; // Si action par utilisateur authentifié
  
  // Données
  metadata?: Record<string, any>;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  
  // Statut
  success: boolean;
  errorMessage?: string;
  
  // Timestamps
  timestamp: string | Date;
  
  // Webhook associé (optionnel)
  webhook?: Webhook;
}

// ============================================
// DTO pour création
// ============================================
export interface CreateWebhookDTO {
  name: string;
  description?: string;
  permissions: WebhookPermission[];
  e2eeEnabled: boolean;
  targetChannelId?: string; // Optionnel: channel cible par défaut
}

// ============================================
// DTO pour mise à jour
// ============================================
export interface UpdateWebhookDTO {
  name?: string;
  description?: string;
  permissions?: WebhookPermission[];
  e2eeEnabled?: boolean;
  isActive?: boolean;
  targetChannelId?: string;
}

// ============================================
// Réponse API pour création
// ============================================
export interface CreateWebhookResponse {
  success: boolean;
  webhook: Webhook;
  error?: string;
  message?: string;
}

// ============================================
// Réponse API pour liste
// ============================================
export interface ListWebhooksResponse {
  success: boolean;
  webhooks: Webhook[];
  total: number;
  error?: string;
}

// ============================================
// Réponse API pour détails
// ============================================
export interface GetWebhookResponse {
  success: boolean;
  webhook: Webhook;
  error?: string;
}

// ============================================
// Réponse API pour régénération du token
// ============================================
export interface RegenerateTokenResponse {
  success: boolean;
  webhook: Webhook;
  oldToken?: string;
  newToken: string;
  error?: string;
}

// ============================================
// Statistiques d'utilisation
// ============================================
export interface WebhookStats {
  id: string;
  usageCount: number;
  errorCount: number;
  lastUsedAt?: string | Date;
  lastErrorAt?: string | Date;
  createdAt: string | Date;
  // Stats par période
  dailyUsage?: Record<string, number>;
  weeklyUsage?: Record<string, number>;
}

// ============================================
// Réponse API pour statistiques
// ============================================
export interface GetWebhookStatsResponse {
  success: boolean;
  stats: WebhookStats;
  error?: string;
}

// ============================================
// Payload pour test
// ============================================
export interface TestWebhookPayload {
  content?: string;
  embeds?: WebhookEmbed[];
  username?: string;
  avatar_url?: string;
}

// ============================================
// Réponse API pour test
// ============================================
export interface TestWebhookResponse {
  success: boolean;
  messageId?: string;
  threadId?: string;
  error?: string;
  message?: string;
}

// ============================================
// Channel (pour la sélection de la cible)
// ============================================
export interface WebhookTargetChannel {
  id: string;
  name: string;
  type: 'text' | 'vocal';
}

// ============================================
// Événement WebSocket pour notifications temps réel
// ============================================
export interface WebhookWebSocketEvent {
  type: 'webhook:created' | 'webhook:updated' | 'webhook:deleted' | 'webhook:message';
  data: Webhook | WebhookMessage | any;
  spaceId: string;
  timestamp: string;
}
