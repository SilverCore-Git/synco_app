export type ThreadType = 'text' | 'vocal';
// export type UserStatus = 'online' | 'dnd' | 'idle' | 'offline';

export interface StoredFile {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  encoding?: string;
  hash?: string;
  isEncrypted: boolean;
  
  ownerId: string;
  orgId: string;
  workspaceId?: string;
  messageId?: string;
  dmMessageId?: string;
  folderId?: string;

  createdAt: string | Date;
  updatedAt: string | Date;
}


export interface Thread {
  id: string;
  categoryId: string;
  index: number;
  name: string;
  ownerId: string;
  membersId: string[];
  type: ThreadType;
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
  config: {
    maxNotesPerSpace: number;
    maxFileStoragePerSpace: number;
    maxUsersPerSpace: number;
    maxTotalUsers: number;
  };
  home: {
    categories: Category[];
    threads: Thread[];
  };
  members?: OrgMember[];
  spaces?: WorkSpace[];
  files?: StoredFile[];
  createdAt: string | Date;
  maxTotalUsers: number;
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
  avatarUrl?: string;

  publicKey?: string; // Format JWK (string JSON)
  encryptedPrivateKey?: string; // Base64
  keyIv?: string;           // Base64
  pinSalt?: string;           // String aléatoire

  data: {
    status: string;
    [key: string]: any;
  };
  files?: StoredFile[];
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
    senderId: string;
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
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  user?: User;
  role: 'admin' | 'member' | string | null;
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
}