// ============================================
// Types pour le système de Webhooks
// ============================================

// ============================================
// Permissions des Webhooks
// ============================================
export type WebhookPermission = 
  | 'send_messages'
  | 'send_embeds'
  | 'send_attachments'
  | 'manage_webhook'
  | 'view_stats';

export const ALL_WEBHOOK_PERMISSIONS: WebhookPermission[] = [
  'send_messages',
  'send_embeds',
  'send_attachments',
  'manage_webhook',
  'view_stats'
];

// Libellé, description et icône de chaque permission. Regroupés ici pour que
// l'UI n'ait plus à inventer un intitulé à partir du nom technique : la
// question posée à l'utilisateur n'est pas « veux-tu send_embeds ? » mais
// « ce webhook a-t-il le droit d'envoyer des cartes enrichies ? ».
export const WEBHOOK_PERMISSION_META: Record<WebhookPermission, {
  label: string;
  description: string;
  icon: string;
}> = {
  send_messages: {
    label: 'Envoyer des messages',
    description: 'Poster du texte dans le salon de destination.',
    icon: 'bi-chat-text'
  },
  send_embeds: {
    label: 'Envoyer des cartes enrichies',
    description: 'Poster des encarts avec titre, couleur et champs (embeds).',
    icon: 'bi-card-heading'
  },
  send_attachments: {
    label: 'Joindre des fichiers',
    description: 'Attacher des fichiers aux messages postés.',
    icon: 'bi-paperclip'
  },
  manage_webhook: {
    label: 'Se gérer lui-même',
    description: 'Autoriser l\'intégration à modifier ce webhook via l\'API.',
    icon: 'bi-sliders'
  },
  view_stats: {
    label: 'Lire ses statistiques',
    description: 'Autoriser l\'intégration à consulter son compteur d\'appels.',
    icon: 'bi-graph-up'
  }
};

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
  // Photo de profil du webhook, sous forme de data URL (même convention que
  // `User.avatarUrl` et `Organization.logo`). Reprise comme avatar par défaut
  // des messages qu'il poste, sauf `avatar_url` explicite dans le payload.
  avatarUrl?: string;
  
  // Salon de destination par défaut. Le backend le stocke sous le nom
  // `defaultThreadId` et le renvoie tel quel ; `targetChannelId` est le nom
  // employé côté DTO — on expose les deux pour que les formulaires puissent
  // se pré-remplir sans connaître la convention du serveur.
  defaultThreadId?: string;
  targetChannelId?: string;
  
  // Sécurité
  token: string;
  secret: string;
  // Signature HMAC obligatoire sur les requêtes entrantes.
  requireSignature?: boolean;
  
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
  // Aperçu masqué renvoyé à la place de `url` dans les listings (le jeton
  // n'y est jamais inclus, cf. audit H3 côté backend) : ex.
  // ".../api/webhooks/<id>/••••••••••••••••••••••••".
  urlPreview?: string;

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
  avatarUrl?: string; // Data URL de la photo de profil
  permissions: WebhookPermission[];
  e2eeEnabled: boolean;
  requireSignature?: boolean;
  targetChannelId?: string; // Optionnel: channel cible par défaut
}

// ============================================
// DTO pour mise à jour
// ============================================
export interface UpdateWebhookDTO {
  name?: string;
  description?: string;
  avatarUrl?: string | null; // `null` pour retirer la photo de profil
  permissions?: WebhookPermission[];
  e2eeEnabled?: boolean;
  requireSignature?: boolean;
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
// Espace couvert par l'écran de gestion
// ============================================
// L'écran sert aussi bien un seul workspace que toute une organisation : son
// périmètre est décrit par cette liste, et c'est sa longueur qui décide si
// l'appartenance d'un webhook à un espace mérite d'être affichée.
export interface WebhookScopeSpace {
  id: string;
  name: string;
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
