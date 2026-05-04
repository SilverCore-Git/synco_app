export type ThreadType = 'text' | 'vocal';

export interface Thread {
  id: string;
  categoryId: string;
  index: number;
  name: string;
  type: ThreadType;
  hasUnread?: boolean; // front end var
}

export interface Category {
  id: string;
  index: number;
  name: string;
  ownerId: String;
  membersId: String[];
  threads?: Thread[]; 
}

export interface Org {
  id: string;
  name: string;
  logo: string;
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
  createdAt: string | Date;
}

export interface OrgLittle {
  id: string;
  name: string;
  logo: string;
  role: string;
  memberCount: string;
}

export interface WorkSpace {
    id: string;
    orgId: string;
    name: string;
    logo: string; // bi | http
    ownerId: String;
    membersId: String[];
    categories: Category[];
    threads: Thread[];
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  user?: User;
  role: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name?: string;
  publicKey?: string;
  avatarUrl?: string;
  data?: any; // { status: 'online' | 'dnd  | 'idle' | 'offline' }
  organizations?: string[];
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface Message {
  id: string;
  threadId: string;
  context: 'home' | 'workspace' | 'dm';
  senderId: string;
  content: string; 
  replyToId?: string;
  nonce: string;
  edited?: boolean;
  createdAt: string | Date;
}