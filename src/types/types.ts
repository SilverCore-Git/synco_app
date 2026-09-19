export type ThreadType = 'text' | 'vocal';
export type NotificationType =
  | 'MESSAGE' | 'CALL' | 'MENTION' | 'INVITATION' | 'CUSTOM' | 'TASK_ASSIGNED'
  | 'EVENT_INVITE' | 'EVENT_RSVP' | 'EVENT_REMINDER'
  | 'CALENDAR_ACCESS_REQUEST' | 'CALENDAR_ACCESS_INVITE'
  | 'CALENDAR_ACCESS_GRANTED' | 'CALENDAR_ACCESS_DECLINED' | 'CALENDAR_ACCESS_REVOKED'
  | 'MISSED_CALL' | 'MISSED_MEET' | 'WORKSPACE_ADDED';
// export type UserStatus = 'online' | 'dnd' | 'idle' | 'offline';

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  encoding?: string;
  hash?: string;
  isEncrypted: boolean;
  isE2EE?: boolean;
  encryptedFileKey?: string | null;
  keyVersion?: number | null;
  iv?: string | null;
  
  ownerId: string;
  orgId: string;
  workspaceId?: string;
  messageId?: string;
  dmMessageId?: string;
  folderId?: string;

  createdAt: string | Date;
  updatedAt: string | Date;

  _count?: {
    filePermissions: number;
  };
}


export interface Thread {
  id: string;
  categoryId: string;
  index: number;
  name: string;
  ownerId: string;
  membersId: string[];
  type: ThreadType;
  isReadOnly: boolean;
  isPrivate: boolean;
  writersId: string[];
  messages?: Message[];
  hasUnread: boolean;
}

export interface Category {
  id: string;
  index: number;
  name: string;
  ownerId: string;
  membersId: string[];
  threads?: Thread[];
}

export interface Org {
  id: string;
  name: string;
  logo: string | null;
  ownerId: string;
  stats: {
    memberCount: number;
    onlineCount: number;
  };
  maxUsers: number;
  maxStorage: number | string | bigint;
  features: string[];
  activeModules?: Record<string, any>;
  home: {
    categories: Category[];
    threads: Thread[];
  };
  members?: OrgMember[];
  spaces?: WorkSpace[];
  files?: StoredFile[];
  createdAt: string | Date;
}

export interface WorkSpace {
  id: string;
  orgId: string;
  name: string;
  logo: string | null;
  ownerId: string;
  membersId: string[];
  categories: Category[];
  threads: Thread[];
  files?: StoredFile[];
}

export interface ReactionUser {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  pseudo?: string;
  avatarUrl?: string;
  job?: string;
  description?: string;

  publicKey?: string; // Format JWK (string JSON)
  encryptedPrivateKey?: string; // Base64
  keyIv?: string;           // Base64
  pinSalt?: string;           // String aléatoire

  data: {
    status: string;
    [key: string]: any;
  };
  files?: StoredFile[];
  
  maxOrgs?: number;
  orgMaxUsers?: number;
  orgMaxStorage?: number | string | bigint;

  notificationPreferences?: any;

  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface MessageReaction {
    id: string;
    messageId: string;
    userId: string;
    emoji: string;
    createdAt: string | Date;
    user?: User;
}

export interface Message {
    id: string;
    threadId: string;
    senderId: string | null;
    replyToId: string | null;
    transferId: string | null;
    content: string;
    nonce: string;
    iv: string | null;
    edited: boolean | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    reactions?: Record<string, { count: number; users: ReactionUser[] }> | MessageReaction[] | any[];

    sender?: User;
    files?: StoredFile[];

    replyMessage?: Message | null;
    replies?: Message[];
    transferMessage?: Message | null;
    transferredIn?: Message[];

    isWebhook?: boolean;
    webhookId?: string | null;
    webhookCreatorId?: string | null;
    webhookName?: string | null;
    webhookAvatar?: string | null;
    embeds?: any[];
}

export interface DMMessageReaction {
    id: string;
    dmMessageId: string;
    userId: string;
    emoji: string;
    createdAt: string | Date;
    user?: User;
}

export interface DMMessage {
    id: string;
    recipientId: string;
    senderId: string;
    replyToId: string | null;
    isE2EE: boolean;
    content: string;
    nonce: string;
    encryptedAesKey: string | null;
    selfEncryptedAesKey: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    edited: boolean | null;
    reactions?: Record<string, { count: number; users: ReactionUser[] }> | DMMessageReaction[] | any[];

    sender?: User;
    recipient?: User;
    files?: StoredFile[];

    replyMessage?: DMMessage | null;
    replies?: DMMessage[];

    type?: 'text' | 'voice_invite';
    voiceInviteThreadId?: string | null;
    voiceInviteOrgId?: string | null;
    voiceInviteSpaceId?: string | null;
    voiceInviteThreadName?: string | null;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  user?: User;
  role: 'admin' | 'member' | string | null;
  memberRoles?: any[];
  createdAt: string | Date;
  updatedAt: string | Date;
}


export interface Folder {
  id: string;
  name: string;
  color?: string;
  
  orgId: string;
  workspaceId: string | null;
  
  parentId: string | null;
  
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;

  organization?: Org;
  workspace?: WorkSpace | null;
  parent?: Folder | null;
  subFolders?: Folder[];
  files?: StoredFile[];

  _count?: {
    folderPermissions: number;
  };
}

export interface TodoList {
  id: string;
  title: string;
  description?: string | null;
  creatorId: string;
  creator?: User;
  assigneeId?: string | null;
  assignee?: User | null;
  spaceId?: string | null;
  space?: WorkSpace | null;
  organizationId: string;
  organization?: Org;
  tasks?: Task[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  creatorId: string;
}

// Métadonnées légères d'une image attachée à une tâche — les champs E2EE
// complets sont récupérés à la demande via GET /api/cdn/meta/:id (comme
// FileCard.vue le fait déjà) plutôt que dupliqués dans la charge de la tâche.
export interface TaskAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string | Date;
}

// Fichier du gestionnaire de fichiers référencé par une tâche — le lien ne
// possède pas le fichier, le retirer ne le supprime jamais (voir TaskAttachment
// ci-dessus pour les images possédées par la tâche).
export interface TaskLinkedFile {
  id: string; // id du lien (TaskFileLink), pas du fichier
  taskId: string;
  fileId: string;
  file: {
    id: string;
    originalName: string;
    mimeType: string;
    size: number;
    folderId?: string | null;
  };
}

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  statusChangedAt?: string | Date;
  dueDate?: string | Date | null;
  archived?: boolean;
  archivedAt?: string | Date | null;
  assignees?: User[];
  creatorId: string;
  creator?: User;
  todoListId?: string | null;
  todoList?: TodoList | null;
  spaceId?: string | null;
  space?: WorkSpace | null;
  organizationId: string;
  organization?: Org;

  parentTaskId?: string | null;
  parentTask?: Task | null;
  subtasks?: Task[];

  tags?: Tag[];
  attachments?: TaskAttachment[];
  linkedFiles?: TaskLinkedFile[];
  _count?: { attachments?: number };

  createdAt: string | Date;
  updatedAt: string | Date;
}