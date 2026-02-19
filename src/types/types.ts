export type ThreadType = 'text' | 'vocal';

export interface Thread {
  id: string;
  categoryId: string;
  index: number;
  name: string;
  type: ThreadType;
}

export interface Category {
  id: string;
  index: number;
  name: string;
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
  id: string,
  name: string,
  logo: string,
  role: string,
  memberCount: string,
}

export interface WorkSpace {
    id: string;
    orgId: string;
    name: string;
    logo: string; // bi | http
    categories: Category[];
    threads: Thread[];
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  user?: User;
  role: 'admin' | 'member' | string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name?: string;
  publicKey?: string;
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
  nonce: string;
  createdAt: string | Date;
}